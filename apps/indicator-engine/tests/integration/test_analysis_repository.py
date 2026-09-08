"""Persistencia del análisis contra TimescaleDB real (tabla `indicator_analysis`,
migración 003).

Lo que se fija: que el payload se guarda VERBATIM —con los decimales como string
exacto, sin round-trip por numeric— y que la PK aguanta la semántica
at-least-once sin que BUY y SELL del mismo instante se pisen.
Requiere infraestructura (docker compose up -d --wait).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from indicator_engine.adapters.timescale.repository import TimescaleIndicatorRepository
from indicator_engine.domain.analisis import (
    Analisis,
    Corte,
    Escala,
    LecturaIndicador,
    Sintesis,
)

pytestmark = pytest.mark.integration

AS_OF = datetime(2026, 7, 31, 20, 54, tzinfo=UTC)


def _analisis(triggered_by: str | None = None, fuente: str = "percentiles") -> Analisis:
    escala = Escala(
        fuente=fuente,
        ventana_dias=90,
        muestras=4187,
        muestras_minimas=200,
        calculada_en=AS_OF,
        dominio_min=Decimal("8.41"),
        dominio_max=Decimal("31.07"),
        cortes=(Corte("p10", Decimal("10.55"), Decimal("0.1000")),),
    )
    return Analisis(
        as_of=AS_OF,
        moneda="VES",
        calc_version=1,
        analysis_version=1,
        ruleset_version=1,
        confianza="normal",
        official_stale=False,
        triggered_by=triggered_by or str(uuid.uuid4()),
        indicadores=(
            LecturaIndicador(
                indicador="p2p_brecha_pct_buy",
                valor=Decimal("13.22"),
                as_of=AS_OF,
                banda="low",
                posicion=Decimal("0.2996"),
                escala=escala,
                reglas=(),
            ),
        ),
        proximidad=(),
        sintesis=Sintesis(3, 1, "techo_inminente@v1", 1, 3, "p2p_spread_pct", ()),
    )


def _payload(analisis: Analisis) -> dict:
    """Documento mínimo con la forma del contrato — lo que importa aquí es que
    vuelva idéntico, no que sea el evento completo."""
    return {
        "as_of": analisis.as_of.isoformat(),
        "currency": analisis.moneda,
        "indicators": [
            {
                "indicator": "p2p_brecha_pct_buy",
                # Decimal con ceros significativos: si pasara por numeric,
                # volvería como 13.22 y la UI mostraría otra precisión.
                "value": "13.220000",
                "position": "0.2996",
            }
        ],
        "summary": {"closest_rule": "techo_inminente@v1"},
    }


async def test_el_payload_vuelve_verbatim(pool):
    repo = TimescaleIndicatorRepository(pool)
    analisis = _analisis()
    payload = _payload(analisis)

    await repo.guardar_analisis(analisis, payload)

    fila = await pool.fetchrow("SELECT payload, scale_source FROM indicator_analysis")
    guardado = json.loads(fila["payload"])
    assert guardado == payload
    # Los decimales siguen siendo strings exactos, con sus ceros.
    assert guardado["indicators"][0]["value"] == "13.220000"
    # scale_source promovida: responde «cuánto estuvimos en respaldo» sin abrir
    # el JSONB.
    assert fila["scale_source"] == "percentiles"


async def test_la_reentrega_no_duplica(pool):
    """Semántica at-least-once: la PK (as_of, currency, triggered_by) es
    determinista y el ON CONFLICT DO NOTHING la respeta."""
    repo = TimescaleIndicatorRepository(pool)
    analisis = _analisis(triggered_by="3b8d5a10-19c7-4e2f-bb64-0c9a71e5d833")

    await repo.guardar_analisis(analisis, _payload(analisis))
    await repo.guardar_analisis(analisis, _payload(analisis))

    assert await pool.fetchval("SELECT count(*) FROM indicator_analysis") == 1


async def test_las_revisiones_de_los_dos_lados_conviven(pool):
    """BUY y SELL del mismo instante son revisiones distintas: `triggered_by` en
    la PK evita que una pise a la otra."""
    repo = TimescaleIndicatorRepository(pool)
    buy = _analisis(triggered_by="11111111-1111-1111-1111-111111111111")
    sell = _analisis(triggered_by="22222222-2222-2222-2222-222222222222")

    await repo.guardar_analisis(buy, _payload(buy))
    await repo.guardar_analisis(sell, _payload(sell))

    assert await pool.fetchval("SELECT count(*) FROM indicator_analysis") == 2


async def test_la_fuente_de_escala_se_promueve_a_columna(pool):
    repo = TimescaleIndicatorRepository(pool)
    respaldo = _analisis(fuente="ruleset")
    await repo.guardar_analisis(respaldo, _payload(respaldo))

    assert (
        await pool.fetchval("SELECT scale_source FROM indicator_analysis") == "ruleset"
    )
