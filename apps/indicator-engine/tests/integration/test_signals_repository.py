"""Persistencia de señales contra TimescaleDB real (tabla `signals`, migración 002).

Verifica el par que sostiene el dedup por cooldown: `guardar_senales` +
`senal_reciente`. Requiere infraestructura (docker compose up -d --wait).
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from indicator_engine.adapters.timescale.repository import TimescaleIndicatorRepository
from indicator_engine.domain.reglas import Senal

pytestmark = pytest.mark.integration

AS_OF = datetime(2026, 7, 20, 16, 0, tzinfo=UTC)


def _senal(tipo="techo_inminente", as_of=AS_OF) -> Senal:
    return Senal(
        tipo=tipo,
        direccion="bajista",
        moneda="VES",
        as_of=as_of,
        calc_version=1,
        triggered_by=str(uuid.uuid4()),
        regla=f"{tipo}@v1",
        inputs={"p2p_spread_pct": Decimal("0.41"), "p2p_ratio_oferta_demanda": Decimal("0.18")},
    )


async def test_guardar_persiste_con_evidencia_jsonb(pool):
    repo = TimescaleIndicatorRepository(pool)
    await repo.guardar_senales([_senal()])

    fila = await pool.fetchrow("SELECT type, direction, currency, rule, evidence FROM signals")
    assert fila["type"] == "techo_inminente"
    assert fila["direction"] == "bajista"
    assert fila["rule"] == "techo_inminente@v1"
    # asyncpg devuelve jsonb como texto (sin codec registrado): el consumidor
    # (api-gateway) lo parseará; aquí lo hacemos explícito.
    evidence = json.loads(fila["evidence"])
    assert evidence["rule"] == "techo_inminente@v1"
    assert evidence["inputs"]["p2p_spread_pct"] == "0.41"


async def test_senal_reciente_respeta_la_ventana_y_el_tipo(pool):
    repo = TimescaleIndicatorRepository(pool)
    await repo.guardar_senales([_senal()])

    # as_of (16:00) dentro de la ventana [15:00, ∞) → reciente
    assert await repo.senal_reciente("techo_inminente", "VES", AS_OF - timedelta(minutes=60))
    # ventana que empieza después del as_of → no reciente (cooldown expirado)
    assert not await repo.senal_reciente("techo_inminente", "VES", AS_OF + timedelta(minutes=1))
    # otro tipo no cuenta
    assert not await repo.senal_reciente("arranque_alcista", "VES", AS_OF - timedelta(minutes=60))
    # otra moneda no cuenta
    assert not await repo.senal_reciente("techo_inminente", "USD", AS_OF - timedelta(minutes=60))
