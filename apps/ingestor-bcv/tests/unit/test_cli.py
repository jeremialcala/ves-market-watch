"""Tests del entrypoint y del CLI de operador (`python -m ingestor_bcv`).

Estaba al 0 % por parecer cableado, y no lo es: decide qué adaptadores se montan
—en `--dry-run`, ninguno real—, devuelve códigos de salida que un operador puede
encadenar, y exige la nota auditable que ADR-0007 pide para cada decisión HITL.
"""

import asyncio
import logging
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from ingestor_bcv.__main__ import _construir_parser, main, revalidar, run
from ingestor_bcv.adapters.memory import InMemoryRateRepository, LoggingEventPublisher
from ingestor_bcv.application.ports import CapturaOficial
from ingestor_bcv.config import Settings
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial


# -- dobles ------------------------------------------------------------------


class RepoCerrable(InMemoryRateRepository):
    """El repositorio en memoria, más el `close()` que el entrypoint invoca."""

    def __init__(self) -> None:
        super().__init__()
        self.cerrado = False

    @classmethod
    async def connect(cls, dsn: str) -> "RepoCerrable":
        instancia = cls()
        instancia.dsn = dsn
        return instancia

    async def close(self) -> None:
        self.cerrado = True


class PublisherCerrable(LoggingEventPublisher):
    def __init__(self, url: str = "", exchange: str = "") -> None:
        super().__init__()
        self.cerrado = False

    async def close(self) -> None:
        self.cerrado = True


class FuenteFake:
    def __init__(self, *args, **kwargs) -> None:
        self.consultas = 0

    async def fetch_rates(self) -> CapturaOficial:
        self.consultas += 1
        return CapturaOficial(
            fecha_valor=date(2026, 8, 4),
            tasas={"USD": Decimal("748.7864")},
            capturada_en=datetime.now(UTC),
        )


def _ajustes() -> Settings:
    # Con env vacío se ejercitan además los valores por defecto de `from_env`.
    return Settings.from_env({})


def _sospechosa(moneda: str = "USD", valor: str = "999.99") -> TasaOficial:
    return TasaOficial(
        moneda=moneda,
        valor=Decimal(valor),
        fecha_valor=date(2026, 8, 4),
        capturada_en=datetime(2026, 8, 4, 12, 0, tzinfo=UTC),
        estado=EstadoTasa.SUSPECT,
    )


@pytest.fixture
def infra(monkeypatch):
    """Sustituye los adaptadores reales por los de memoria, con `close()`.

    Se parchean en SU módulo y no en `__main__` porque el entrypoint los importa
    dentro de la función: el import diferido es justo lo que permite que
    `--dry-run` no necesite los drivers de infraestructura.
    """
    repo = RepoCerrable()
    publisher = PublisherCerrable()

    class RepoClase:
        @staticmethod
        async def connect(dsn: str) -> RepoCerrable:
            return repo

    monkeypatch.setattr(
        "ingestor_bcv.adapters.timescale.repository.TimescaleRateRepository", RepoClase
    )
    monkeypatch.setattr(
        "ingestor_bcv.adapters.amqp.publisher.AmqpEventPublisher",
        lambda url, exchange: publisher,
    )
    return repo, publisher


# -- parser ------------------------------------------------------------------


def test_aprobar_y_rechazar_exigen_la_nota_auditable():
    """ADR-0007: cada decisión HITL deja constancia de POR QUÉ se tomó.

    Si `--nota` fuera opcional, el registro de auditoría tendría filas sin
    justificación y la re-validación humana dejaría de ser trazable.
    """
    parser = _construir_parser()
    for accion in ("aprobar", "rechazar"):
        with pytest.raises(SystemExit):
            parser.parse_args(["revalidar", accion, "USD"])

        args = parser.parse_args(["revalidar", accion, "USD", "--nota", "confirmado"])
        assert args.nota == "confirmado"
        assert args.usuario  # siempre hay alguien a quien atribuirlo


def test_listar_admite_no_filtrar_por_moneda():
    args = _construir_parser().parse_args(["revalidar", "listar"])
    assert args.accion == "listar"
    assert args.moneda is None
    assert _construir_parser().parse_args(["revalidar", "listar", "EUR"]).moneda == "EUR"


def test_el_daemon_sigue_siendo_el_comando_por_defecto():
    """Los flags del daemon no viven bajo ningún subcomando: `python -m
    ingestor_bcv --once` tiene que seguir funcionando como antes de que existiera
    el CLI de re-validación."""
    args = _construir_parser().parse_args(["--once", "--dry-run"])
    assert args.comando is None
    assert args.once and args.dry_run


# -- revalidar ---------------------------------------------------------------


async def test_listar_sin_pendientes_sale_con_codigo_1(infra, capsys):
    """El código de salida es la interfaz con quien lo encadene en un script:
    «no hay nada» no es un éxito silencioso."""
    args = _construir_parser().parse_args(["revalidar", "listar"])

    codigo = await revalidar(_ajustes(), args)

    assert codigo == 1
    assert "Sin sospechas pendientes." in capsys.readouterr().out


async def test_listar_muestra_la_sospecha_con_su_delta(infra, capsys):
    repo, _ = infra
    await repo.guardar(
        TasaOficial(
            moneda="USD",
            valor=Decimal("700.00"),
            fecha_valor=date(2026, 8, 3),
            capturada_en=datetime(2026, 8, 3, 12, 0, tzinfo=UTC),
            estado=EstadoTasa.VALID,
        )
    )
    await repo.guardar(_sospechosa(valor="1400.00"))
    args = _construir_parser().parse_args(["revalidar", "listar"])

    codigo = await revalidar(_ajustes(), args)

    salida = capsys.readouterr().out
    assert codigo == 0
    assert "USD" in salida and "1400.00" in salida
    # La referencia y el salto que la hizo sospechosa, para poder decidir sin
    # consultar la base a mano.
    assert "700.00" in salida and "+100.00" in salida


async def test_aprobar_publica_y_sale_con_codigo_0(infra, capsys):
    repo, publisher = infra
    await repo.guardar(_sospechosa())
    args = _construir_parser().parse_args(
        ["revalidar", "aprobar", "USD", "--nota", "verificado en la web del BCV"]
    )

    codigo = await revalidar(_ajustes(), args)

    assert codigo == 0
    assert "Aprobada y publicada: USD" in capsys.readouterr().out
    assert [e["payload"]["currency"] for e in publisher.eventos] == ["USD"]


async def test_rechazar_dice_cuantas_y_no_publica(infra, capsys):
    repo, publisher = infra
    await repo.guardar(_sospechosa())
    await repo.guardar(_sospechosa(valor="1200.00"))
    args = _construir_parser().parse_args(
        ["revalidar", "rechazar", "USD", "--nota", "error de captura"]
    )

    codigo = await revalidar(_ajustes(), args)

    assert codigo == 0
    assert "Rechazadas 2 sospecha(s) de USD." in capsys.readouterr().out
    # Rechazar no emite nada al bus: lo que no se aprueba, no se publica.
    assert publisher.eventos == []


async def test_un_error_de_revalidacion_sale_con_1_y_cierra_las_conexiones(
    infra, capsys
):
    """El `finally` no es decorativo: sin él, un operador que se equivoca de
    moneda deja abiertas una conexión a TimescaleDB y un canal AMQP."""
    repo, publisher = infra
    args = _construir_parser().parse_args(
        ["revalidar", "aprobar", "XXX", "--nota", "no existe"]
    )

    codigo = await revalidar(_ajustes(), args)

    assert codigo == 1
    assert "Error:" in capsys.readouterr().out
    assert repo.cerrado and publisher.cerrado


async def test_el_camino_feliz_tambien_cierra(infra):
    repo, publisher = infra
    await repo.guardar(_sospechosa())
    args = _construir_parser().parse_args(
        ["revalidar", "aprobar", "USD", "--nota", "ok"]
    )

    await revalidar(_ajustes(), args)

    assert repo.cerrado and publisher.cerrado


# -- run ---------------------------------------------------------------------


async def test_dry_run_no_toca_la_infraestructura(monkeypatch):
    """La garantía de `--dry-run`, y la razón de que los imports sean diferidos.

    Si alguien invirtiera la condición, un «ensayo» escribiría en la base real y
    publicaría al bus real. El test lo impide haciendo explotar los adaptadores
    de infraestructura: si se tocan, falla.
    """

    def prohibido(*args, **kwargs):
        raise AssertionError("--dry-run montó un adaptador de infraestructura")

    monkeypatch.setattr("ingestor_bcv.__main__.FuenteBcv", FuenteFake)
    monkeypatch.setattr(
        "ingestor_bcv.adapters.timescale.repository.TimescaleRateRepository.connect",
        prohibido,
    )
    monkeypatch.setattr(
        "ingestor_bcv.adapters.amqp.publisher.AmqpEventPublisher", prohibido
    )

    await run(_ajustes(), once=True, dry_run=True)


async def test_el_daemon_cierra_lo_que_abrio_aunque_la_sincronizacion_falle(
    infra, monkeypatch
):
    repo, publisher = infra
    monkeypatch.setattr("ingestor_bcv.__main__.FuenteBcv", FuenteFake)

    async def revienta(_caso) -> None:
        raise RuntimeError("el bus se cayó a media pasada")

    monkeypatch.setattr("ingestor_bcv.__main__.ejecutar_una_vez", revienta)

    with pytest.raises(RuntimeError):
        await run(_ajustes(), once=True, dry_run=False)

    assert repo.cerrado and publisher.cerrado


async def test_sin_once_el_daemon_entra_al_bucle(infra, monkeypatch):
    repo, publisher = infra
    monkeypatch.setattr("ingestor_bcv.__main__.FuenteBcv", FuenteFake)
    vueltas = []

    async def bucle_falso(_caso, interval_seconds: int) -> None:
        vueltas.append(interval_seconds)

    monkeypatch.setattr("ingestor_bcv.__main__.run_forever", bucle_falso)

    await run(_ajustes(), once=False, dry_run=False)

    # El intervalo sale de la configuración, no de una constante del bucle.
    assert vueltas == [_ajustes().fetch_interval_seconds]
    assert repo.cerrado and publisher.cerrado


# -- main --------------------------------------------------------------------


def test_un_ctrl_c_no_es_un_fallo(monkeypatch, caplog):
    """Parar el daemon a mano es la forma normal de pararlo: no debe salir con
    traza ni con código de error."""
    monkeypatch.setattr("sys.argv", ["ingestor-bcv", "--once", "--dry-run"])

    async def interrumpe(*args, **kwargs) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr("ingestor_bcv.__main__.run", interrumpe)

    with caplog.at_level(logging.INFO, logger="ingestor_bcv"):
        main()  # no propaga

    assert any("detenido por el usuario" in r.getMessage() for r in caplog.records)


def test_revalidar_propaga_su_codigo_de_salida(monkeypatch):
    """`main` traduce el código de `revalidar` a `SystemExit`, que es lo que ve
    la shell del operador."""
    monkeypatch.setattr("sys.argv", ["ingestor-bcv", "revalidar", "listar"])

    async def sin_pendientes(*args, **kwargs) -> int:
        return 1

    monkeypatch.setattr("ingestor_bcv.__main__.revalidar", sin_pendientes)

    with pytest.raises(SystemExit) as salida:
        main()

    assert salida.value.code == 1


def test_asyncio_run_es_quien_ejecuta_el_daemon(monkeypatch):
    """Guarda contra un refactor que deje una corrutina sin await: `main` es
    síncrono y el bucle de eventos lo abre él."""
    monkeypatch.setattr("sys.argv", ["ingestor-bcv", "--once", "--dry-run"])
    ejecutadas = []

    def run_espia(corrutina):
        ejecutadas.append(corrutina)
        corrutina.close()

    monkeypatch.setattr(asyncio, "run", run_espia)

    main()

    assert len(ejecutadas) == 1
