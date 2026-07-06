"""Tests del caso de uso CapturarSnapshot con adaptadores en memoria."""

from datetime import UTC, datetime

from ingestor_binance.adapters.binance.resilience import CircuitBreaker
from ingestor_binance.adapters.memory import (
    InMemorySnapshotRepository,
    LoggingAlertNotifier,
    LoggingEventPublisher,
)
from ingestor_binance.application.capture_snapshot import CapturarSnapshot
from ingestor_binance.application.ports import (
    CapturaP2P,
    EsquemaFuenteInvalido,
    FuenteNoDisponible,
)
from ingestor_binance.domain.models import Lado

from conftest import cargar_fixture  # type: ignore[import-not-found]


class FuenteFake:
    def __init__(self) -> None:
        self.respuesta: CapturaP2P | None = None
        self.excepcion: Exception | None = None
        self.llamadas = 0

    async def fetch_ads(self, lado: Lado) -> CapturaP2P:
        self.llamadas += 1
        if self.excepcion is not None:
            raise self.excepcion
        assert self.respuesta is not None
        return self.respuesta


def _captura(lado: Lado = Lado.BUY, parcial: bool = False, crudos: list | None = None) -> CapturaP2P:
    return CapturaP2P(
        lado=lado,
        asset="USDT",
        fiat="VES",
        anuncios_crudos=crudos if crudos is not None else cargar_fixture("buy")["data"],
        parcial=parcial,
        capturada_en=datetime.now(UTC),
    )


def _armar(umbral_breaker: int = 3):
    fuente = FuenteFake()
    repo = InMemorySnapshotRepository()
    publisher = LoggingEventPublisher()
    notifier = LoggingAlertNotifier()
    caso = CapturarSnapshot(
        fuente, publisher, repo, notifier,
        breaker=CircuitBreaker(umbral=umbral_breaker, cooldown_segundos=300),
    )
    return fuente, repo, publisher, notifier, caso


async def test_captura_exitosa_persiste_crudo_y_publica():
    fuente, repo, publisher, _, caso = _armar()
    fuente.respuesta = _captura()

    resumen = await caso.ejecutar(Lado.BUY)

    assert resumen.publicado
    assert resumen.total_anuncios == 20
    assert len(repo.snapshots) == 1
    assert len(publisher.eventos) == 1
    payload = publisher.eventos[0]["payload"]
    assert payload["side"] == "BUY"
    assert payload["ads"][0]["price"] == "745.000"
    # El crudo persistido conserva los anuncios completos para reproceso (RF-5)
    # pero con el anunciante minimizado: sin alias (data-classification).
    crudo_persistido = repo.snapshots[0][1]
    assert len(crudo_persistido) == 20
    assert crudo_persistido[0]["adv"] == fuente.respuesta.anuncios_crudos[0]["adv"]
    assert all("nickName" not in item["advertiser"] for item in crudo_persistido)


async def test_outlier_sembrado_queda_etiquetado_en_el_evento():
    fuente, _, publisher, _, caso = _armar()
    crudos = cargar_fixture("buy")["data"]
    crudos[5]["adv"]["price"] = "7450.000"  # 10× el mercado
    fuente.respuesta = _captura(crudos=crudos)

    resumen = await caso.ejecutar(Lado.BUY)

    assert resumen.outliers == 1
    ads = publisher.eventos[0]["payload"]["ads"]
    assert ads[5]["outlier"] is True
    assert sum(a["outlier"] for a in ads) == 1


async def test_snapshot_parcial_se_publica_marcado():
    fuente, _, publisher, _, caso = _armar()
    fuente.respuesta = _captura(parcial=True)

    resumen = await caso.ejecutar(Lado.BUY)

    assert resumen.publicado
    assert resumen.parcial
    assert publisher.eventos[0]["payload"]["partial"] is True


async def test_schema_de_fuente_invalido_descarta_y_alerta_sin_publicar():
    fuente, repo, publisher, notifier, caso = _armar()
    fuente.excepcion = EsquemaFuenteInvalido("falta adv.price")

    resumen = await caso.ejecutar(Lado.BUY)

    assert not resumen.publicado
    assert publisher.eventos == []
    assert repo.snapshots == []
    assert any("schema" in a for a in notifier.alertas)


async def test_contenido_no_normalizable_descarta_y_alerta():
    fuente, _, publisher, notifier, caso = _armar()
    fuente.respuesta = _captura(crudos=[{"sin_adv": True}])

    resumen = await caso.ejecutar(Lado.BUY)

    assert not resumen.publicado
    assert publisher.eventos == []
    assert any("no normalizable" in a for a in notifier.alertas)


async def test_breaker_abre_alerta_una_vez_y_salta_ciclos():
    fuente, _, _, notifier, caso = _armar(umbral_breaker=3)
    fuente.excepcion = FuenteNoDisponible("HTTP 403")

    for _ in range(3):
        await caso.ejecutar(Lado.BUY)

    assert len([a for a in notifier.alertas if "ABIERTO" in a]) == 1
    llamadas_previas = fuente.llamadas

    resumen = await caso.ejecutar(Lado.BUY)

    assert resumen.saltado_por_breaker
    assert fuente.llamadas == llamadas_previas  # con breaker abierto no se consulta


async def test_exito_cierra_el_breaker():
    fuente, _, _, _, caso = _armar(umbral_breaker=2)
    fuente.excepcion = FuenteNoDisponible("timeout")
    await caso.ejecutar(Lado.BUY)

    fuente.excepcion = None
    fuente.respuesta = _captura()
    resumen = await caso.ejecutar(Lado.BUY)

    assert resumen.publicado
    fuente.excepcion = FuenteNoDisponible("timeout")
    resumen = await caso.ejecutar(Lado.BUY)
    assert not resumen.saltado_por_breaker  # el contador se reinició con el éxito
