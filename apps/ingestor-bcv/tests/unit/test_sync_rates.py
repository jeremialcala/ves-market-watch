"""Tests del caso de uso SincronizarTasasOficiales con adaptadores en memoria."""

from datetime import UTC, date, datetime
from decimal import Decimal

from ingestor_bcv.adapters.memory import (
    InMemoryRateRepository,
    LoggingAlertNotifier,
    LoggingEventPublisher,
)
from ingestor_bcv.application.ports import CapturaOficial
from ingestor_bcv.application.sync_rates import SincronizarTasasOficiales
from ingestor_bcv.domain.models import EstadoTasa


class FuenteFake:
    def __init__(self) -> None:
        self.respuesta: CapturaOficial | None = None
        self.excepcion: Exception | None = None

    async def fetch_rates(self) -> CapturaOficial:
        if self.excepcion is not None:
            raise self.excepcion
        assert self.respuesta is not None
        return self.respuesta


def _captura(tasas: dict[str, str], fecha: date = date(2026, 7, 6)) -> CapturaOficial:
    return CapturaOficial(
        fecha_valor=fecha,
        tasas={m: Decimal(v) for m, v in tasas.items()},
        capturada_en=datetime.now(UTC),
    )


def _armar(umbral_fallos: int = 3):
    fuente = FuenteFake()
    repo = InMemoryRateRepository()
    publisher = LoggingEventPublisher()
    notifier = LoggingAlertNotifier()
    caso = SincronizarTasasOficiales(
        fuente, publisher, repo, notifier, umbral_fallos=umbral_fallos
    )
    return fuente, repo, publisher, notifier, caso


async def test_primera_captura_publica_todas_las_monedas():
    fuente, repo, publisher, _, caso = _armar()
    fuente.respuesta = _captura({"USD": "667.05", "EUR": "763.19"})

    resumen = await caso.ejecutar()

    assert resumen.publicadas == ["EUR", "USD"]
    assert len(publisher.eventos) == 2
    assert len(repo.capturas) == 2


async def test_sin_cambio_registra_heartbeat_sin_publicar():
    fuente, repo, publisher, _, caso = _armar()
    fuente.respuesta = _captura({"USD": "667.05"})
    await caso.ejecutar()

    fuente.respuesta = _captura({"USD": "667.05"})  # mismo valor y fecha-valor
    resumen = await caso.ejecutar()

    assert resumen.publicadas == []
    assert resumen.heartbeats == ["USD"]
    assert len(publisher.eventos) == 1  # solo el de la primera captura
    assert len(repo.capturas) == 2  # pero ambas quedan en el histórico (RF-5)


async def test_cambio_de_valor_publica_evento():
    fuente, _, publisher, _, caso = _armar()
    fuente.respuesta = _captura({"USD": "667.05"})
    await caso.ejecutar()

    fuente.respuesta = _captura({"USD": "670.00"}, fecha=date(2026, 7, 7))
    resumen = await caso.ejecutar()

    assert resumen.publicadas == ["USD"]
    assert publisher.eventos[-1]["payload"]["rate"] == "670.00"


async def test_cambio_solo_de_fecha_valor_tambien_publica():
    fuente, _, publisher, _, caso = _armar()
    fuente.respuesta = _captura({"USD": "667.05"}, fecha=date(2026, 7, 6))
    await caso.ejecutar()

    fuente.respuesta = _captura({"USD": "667.05"}, fecha=date(2026, 7, 7))
    resumen = await caso.ejecutar()

    assert resumen.publicadas == ["USD"]
    assert len(publisher.eventos) == 2


async def test_valor_fuera_de_rango_queda_suspect_y_no_se_publica():
    fuente, repo, publisher, notifier, caso = _armar()
    fuente.respuesta = _captura({"USD": "667.05"})
    await caso.ejecutar()

    fuente.respuesta = _captura({"USD": "900.00"}, fecha=date(2026, 7, 7))  # +35 %
    resumen = await caso.ejecutar()

    assert resumen.sospechosas == ["USD"]
    assert len(publisher.eventos) == 1
    assert repo.capturas[-1].estado is EstadoTasa.SUSPECT
    # La última válida sigue siendo la anterior: la suspect no contamina la referencia.
    ultima = await repo.ultima_tasa_valida("USD")
    assert ultima.valor == Decimal("667.05")
    assert any("suspect" in alerta for alerta in notifier.alertas)


async def test_tres_fallos_consecutivos_marcan_stale_y_alertan():
    fuente, repo, _, notifier, caso = _armar(umbral_fallos=3)
    fuente.excepcion = ConnectionError("timeout hacia bcv.org.ve")

    for esperado in (1, 2):
        resumen = await caso.ejecutar()
        assert resumen.fallos_consecutivos == esperado
        assert notifier.alertas == []
        assert repo.stale_since is None

    resumen = await caso.ejecutar()

    assert resumen.fallos_consecutivos == 3
    assert repo.stale_since is not None
    assert any("stale" in alerta for alerta in notifier.alertas)


async def test_exito_despues_de_fallos_reinicia_el_contador():
    fuente, repo, _, _, caso = _armar()
    fuente.excepcion = ConnectionError("caída temporal")
    await caso.ejecutar()
    await caso.ejecutar()

    fuente.excepcion = None
    fuente.respuesta = _captura({"USD": "667.05"})
    resumen = await caso.ejecutar()

    assert resumen.error is None
    assert repo.fallos_consecutivos == 0
    assert repo.stale_since is None
