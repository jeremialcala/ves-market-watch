"""Entrypoint del servicio (`python -m ingestor_binance [--once] [--dry-run]`).

Estaba al 0 %. Decide qué adaptadores se montan y —lo que es fácil de romper sin
notarlo— qué significa exactamente `--dry-run` aquí: sin infraestructura, pero
**consultando a Binance de verdad**.
"""

import asyncio
import logging

import pytest

from ingestor_binance.__main__ import main, run
from ingestor_binance.config import Settings
from ingestor_binance.application.ports import CapturaP2P
from ingestor_binance.domain.models import Lado

CLAVE = "0" * 64


def _ajustes(**extra) -> Settings:
    return Settings.from_env({"MERCHANT_HMAC_KEY": CLAVE, **extra})


class FuenteFalsa:
    """Doble de `FuenteBinanceP2P` con la misma firma de construcción."""

    instancias: list["FuenteFalsa"] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.lados: list[Lado] = []
        FuenteFalsa.instancias.append(self)

    async def fetch_ads(self, lado: Lado) -> CapturaP2P:
        self.lados.append(lado)
        from datetime import UTC, datetime

        return CapturaP2P(
            lado=lado,
            asset="USDT",
            fiat="VES",
            anuncios_crudos=[],
            parcial=False,
            capturada_en=datetime.now(UTC),
        )


class RepoCerrable:
    def __init__(self) -> None:
        self.cerrado = False

    async def guardar(self, *args, **kwargs) -> None:
        pass

    async def close(self) -> None:
        self.cerrado = True


class PublisherCerrable:
    def __init__(self, *args) -> None:
        self.cerrado = False
        self.eventos: list[dict] = []

    async def publish_snapshot(self, *args, **kwargs) -> None:
        self.eventos.append({})

    async def close(self) -> None:
        self.cerrado = True


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    """Ninguna prueba de este módulo toca el endpoint P2P."""
    FuenteFalsa.instancias = []
    monkeypatch.setattr("ingestor_binance.__main__.FuenteBinanceP2P", FuenteFalsa)


@pytest.fixture
def infra(monkeypatch):
    """Adaptadores de infraestructura sustituidos en SU módulo.

    Se parchean ahí y no en `__main__` porque el entrypoint los importa dentro de
    la rama `else`: ese import diferido es lo que permite que `--dry-run` no
    necesite los drivers.
    """
    repo, publisher = RepoCerrable(), PublisherCerrable()

    class RepoClase:
        @staticmethod
        async def connect(dsn: str) -> RepoCerrable:
            return repo

    monkeypatch.setattr(
        "ingestor_binance.adapters.timescale.repository.TimescaleSnapshotRepository",
        RepoClase,
    )
    monkeypatch.setattr(
        "ingestor_binance.adapters.amqp.publisher.AmqpEventPublisher",
        lambda url, exchange: publisher,
    )
    return repo, publisher


async def test_dry_run_no_monta_ningun_adaptador_de_infraestructura(monkeypatch):
    """Si alguien invirtiera la condición, un «ensayo» escribiría en TimescaleDB
    y publicaría al bus real. El test hace explotar los adaptadores: si se tocan,
    falla."""

    def prohibido(*args, **kwargs):
        raise AssertionError("--dry-run montó un adaptador de infraestructura")

    monkeypatch.setattr(
        "ingestor_binance.adapters.timescale.repository.TimescaleSnapshotRepository.connect",
        prohibido,
    )
    monkeypatch.setattr(
        "ingestor_binance.adapters.amqp.publisher.AmqpEventPublisher", prohibido
    )

    await run(_ajustes(), once=True, dry_run=True)


async def test_dry_run_SI_consulta_a_binance_de_verdad():
    """Es lo que promete el docstring del módulo, y no es un detalle.

    `--dry-run` sirve para probar la captura y la normalización contra el mercado
    real sin escribir nada. Si además falseara la fuente, dejaría de comprobar lo
    único que no se puede comprobar de otra forma: que el endpoint sigue
    respondiendo lo que el schema espera.
    """
    await run(_ajustes(), once=True, dry_run=True)

    (fuente,) = FuenteFalsa.instancias
    assert fuente.lados == [Lado.BUY, Lado.SELL]


async def test_la_fuente_se_arma_con_los_limites_del_polling_educado():
    """Los topes de ADR-0005 llegan desde la configuración, no desde defaults del
    adaptador: si el cableado se saltara uno, el servicio sería más agresivo de
    lo declarado y la configuración mentiría."""
    await run(_ajustes(TOP_K="40", MAX_RETRIES="7"), once=True, dry_run=True)

    (fuente,) = FuenteFalsa.instancias
    assert fuente.kwargs["top_k"] == 40
    assert fuente.kwargs["max_retries"] == 7
    assert fuente.kwargs["max_response_bytes"] == 2 * 1024 * 1024
    assert fuente.kwargs["presupuesto"] is not None


async def test_cierra_lo_que_abrio_aunque_el_ciclo_reviente(infra, monkeypatch):
    repo, publisher = infra

    async def revienta(_caso) -> None:
        raise RuntimeError("el bus se cayó a media captura")

    monkeypatch.setattr("ingestor_binance.__main__.ejecutar_ciclo", revienta)

    with pytest.raises(RuntimeError):
        await run(_ajustes(), once=True, dry_run=False)

    assert repo.cerrado and publisher.cerrado


async def test_sin_once_entra_al_bucle_con_el_intervalo_configurado(infra, monkeypatch):
    repo, publisher = infra
    vueltas: list[int] = []

    async def bucle_falso(_caso, interval_seconds: int) -> None:
        vueltas.append(interval_seconds)

    monkeypatch.setattr("ingestor_binance.__main__.run_forever", bucle_falso)

    await run(_ajustes(FETCH_INTERVAL_SECONDS="45"), once=False, dry_run=False)

    assert vueltas == [45]
    assert repo.cerrado and publisher.cerrado


def test_un_ctrl_c_no_es_un_fallo(monkeypatch, caplog):
    """Parar el daemon a mano es la forma normal de pararlo."""
    monkeypatch.setattr("sys.argv", ["ingestor-binance", "--once", "--dry-run"])
    monkeypatch.setenv("MERCHANT_HMAC_KEY", CLAVE)

    async def interrumpe(*args, **kwargs) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr("ingestor_binance.__main__.run", interrumpe)

    with caplog.at_level(logging.INFO, logger="ingestor_binance"):
        main()  # no propaga

    assert any("detenido por el usuario" in r.getMessage() for r in caplog.records)


def test_los_flags_llegan_al_daemon(monkeypatch):
    monkeypatch.setattr("sys.argv", ["ingestor-binance", "--once", "--dry-run"])
    monkeypatch.setenv("MERCHANT_HMAC_KEY", CLAVE)
    recibidos: list[dict] = []

    async def espia(settings, once: bool, dry_run: bool) -> None:
        recibidos.append({"once": once, "dry_run": dry_run})

    monkeypatch.setattr("ingestor_binance.__main__.run", espia)

    main()

    assert recibidos == [{"once": True, "dry_run": True}]


def test_sin_flags_el_daemon_arranca_en_modo_completo(monkeypatch):
    monkeypatch.setattr("sys.argv", ["ingestor-binance"])
    monkeypatch.setenv("MERCHANT_HMAC_KEY", CLAVE)
    recibidos: list[dict] = []

    async def espia(settings, once: bool, dry_run: bool) -> None:
        recibidos.append({"once": once, "dry_run": dry_run})

    monkeypatch.setattr("ingestor_binance.__main__.run", espia)

    main()

    assert recibidos == [{"once": False, "dry_run": False}]


def test_la_clave_ausente_detiene_el_arranque_antes_de_abrir_nada(monkeypatch):
    """El fail-fast de ADR-0011 ocurre en `main`, ANTES de `asyncio.run`: sin
    clave no se llega a abrir ninguna conexión."""
    monkeypatch.setattr("sys.argv", ["ingestor-binance", "--once"])
    monkeypatch.delenv("MERCHANT_HMAC_KEY", raising=False)

    def no_deberia(*args, **kwargs):
        raise AssertionError("arrancó el bucle sin clave de pseudonimización")

    monkeypatch.setattr(asyncio, "run", no_deberia)

    with pytest.raises(ValueError, match="MERCHANT_HMAC_KEY"):
        main()
