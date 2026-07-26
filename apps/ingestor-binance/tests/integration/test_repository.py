"""Integración: repositorio de snapshots crudos contra TimescaleDB real."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ingestor_binance.adapters.timescale.repository import TimescaleSnapshotRepository
from ingestor_binance.domain.models import Anuncio, Lado, SnapshotP2P

from conftest import cargar_fixture  # type: ignore[import-not-found]

pytestmark = pytest.mark.integration


async def test_round_trip_del_crudo_jsonb(pool):
    repo = TimescaleSnapshotRepository(pool)
    crudo = cargar_fixture("buy")["data"]
    snapshot = SnapshotP2P(
        lado=Lado.BUY,
        asset="USDT",
        fiat="VES",
        capturado_en=datetime(2026, 7, 6, 12, 0, tzinfo=UTC),
        parcial=True,
        anuncios=(
            Anuncio(
                adv_no="1",
                precio=Decimal("745"),
                cantidad_disponible=Decimal("1"),
                limite_min=Decimal("1"),
                limite_max=Decimal("2"),
                metodos_pago=(),
                es_merchant=False,
            ),
        ),
    )

    await repo.guardar_crudo(snapshot, crudo)

    fila = await pool.fetchrow(
        "SELECT side, asset, fiat, partial, ad_count, raw FROM p2p_snapshots_raw"
    )
    assert fila["side"] == "BUY"
    assert fila["partial"] is True
    assert fila["ad_count"] == 1
    # El crudo sobrevive el viaje por JSONB intacto (reproceso RF-5).
    assert json.loads(fila["raw"]) == crudo


async def test_snapshot_duplicado_no_falla(pool):
    repo = TimescaleSnapshotRepository(pool)
    snapshot = SnapshotP2P(
        lado=Lado.SELL,
        asset="USDT",
        fiat="VES",
        capturado_en=datetime(2026, 7, 6, 12, 0, tzinfo=UTC),
        parcial=False,
        anuncios=(),
    )

    await repo.guardar_crudo(snapshot, [])
    await repo.guardar_crudo(snapshot, [])  # mismo (captured_at, side)

    assert await pool.fetchval("SELECT count(*) FROM p2p_snapshots_raw") == 1


async def test_politica_de_retencion_de_90_dias_activa(pool):
    politica = await pool.fetchrow(
        """
        SELECT config ->> 'drop_after' AS drop_after
        FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention' AND hypertable_name = 'p2p_snapshots_raw'
        """
    )
    assert politica is not None, "falta la política de retención (RF-5)"
    assert "90 days" in politica["drop_after"]
