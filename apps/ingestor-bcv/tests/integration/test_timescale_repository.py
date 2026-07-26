"""Integración: `TimescaleRateRepository` contra TimescaleDB real (docker compose)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from ingestor_bcv.adapters.timescale.repository import TimescaleRateRepository
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial

pytestmark = pytest.mark.integration

AHORA = datetime(2026, 7, 5, 21, 30, tzinfo=UTC)


def _tasa(
    valor: str = "667.05000000",
    moneda: str = "USD",
    capturada_en: datetime = AHORA,
    estado: EstadoTasa = EstadoTasa.VALID,
) -> TasaOficial:
    return TasaOficial(
        moneda=moneda,
        valor=Decimal(valor),
        fecha_valor=date(2026, 7, 6),
        capturada_en=capturada_en,
        estado=estado,
    )


@pytest.fixture
async def repositorio(pool) -> TimescaleRateRepository:
    return TimescaleRateRepository(pool)


async def test_round_trip_con_fidelidad_de_tipos(repositorio):
    original = _tasa()
    await repositorio.guardar(original)

    leida = await repositorio.ultima_tasa_valida("USD")

    assert leida is not None
    assert leida.valor == Decimal("667.05000000")  # numeric(20,8): sin pérdida
    assert leida.fecha_valor == date(2026, 7, 6)
    assert leida.capturada_en == AHORA  # timestamptz conserva el instante UTC
    assert leida.estado is EstadoTasa.VALID
    assert leida.fuente == "BCV"


async def test_sin_capturas_devuelve_none(repositorio):
    assert await repositorio.ultima_tasa_valida("USD") is None


async def test_suspect_no_contamina_la_referencia_valida(repositorio):
    await repositorio.guardar(_tasa("667.05"))
    await repositorio.guardar(
        _tasa("900.00", capturada_en=AHORA + timedelta(minutes=30), estado=EstadoTasa.SUSPECT)
    )

    ultima = await repositorio.ultima_tasa_valida("USD")

    assert ultima.valor == Decimal("667.05")
    assert ultima.estado is EstadoTasa.VALID


async def test_la_referencia_es_por_moneda(repositorio):
    await repositorio.guardar(_tasa("667.05", moneda="USD"))
    await repositorio.guardar(_tasa("763.19", moneda="EUR"))

    assert (await repositorio.ultima_tasa_valida("USD")).valor == Decimal("667.05")
    assert (await repositorio.ultima_tasa_valida("EUR")).valor == Decimal("763.19")


async def test_captura_duplicada_no_falla(repositorio, pool):
    tasa = _tasa()
    await repositorio.guardar(tasa)
    await repositorio.guardar(tasa)  # mismo (captured_at, currency): ON CONFLICT

    assert await pool.fetchval("SELECT count(*) FROM official_rates") == 1


async def test_contador_de_fallos_incrementa_y_exito_lo_reinicia(repositorio, pool):
    assert await repositorio.registrar_fallo("timeout") == 1
    assert await repositorio.registrar_fallo("timeout") == 2
    await repositorio.marcar_stale()

    await repositorio.registrar_exito()

    fila = await pool.fetchrow(
        "SELECT consecutive_failures, stale_since, last_success_at "
        "FROM official_rate_source_health WHERE source = 'BCV'"
    )
    assert fila["consecutive_failures"] == 0
    assert fila["stale_since"] is None
    assert fila["last_success_at"] is not None
    # El siguiente fallo arranca de cero.
    assert await repositorio.registrar_fallo("timeout") == 1


async def test_resolucion_de_sospecha_con_auditoria(repositorio, pool):
    await repositorio.guardar(_tasa("667.05"))
    sospecha = _tasa(
        "900.00", capturada_en=AHORA + timedelta(minutes=30), estado=EstadoTasa.SUSPECT
    )
    await repositorio.guardar(sospecha)

    pendientes = await repositorio.sospechosas_pendientes("USD")
    assert [t.valor for t in pendientes] == [Decimal("900.00")]

    await repositorio.resolver_sospechosa(
        sospecha, EstadoTasa.VALID, "jeremi", "devaluación confirmada"
    )

    assert await repositorio.sospechosas_pendientes("USD") == []
    fila = await pool.fetchrow(
        "SELECT status, resolved_at, resolved_by, resolution_note FROM official_rates "
        "WHERE currency = 'USD' AND captured_at = $1",
        sospecha.capturada_en,
    )
    assert fila["status"] == "valid"
    assert fila["resolved_at"] is not None
    assert fila["resolved_by"] == "jeremi"
    assert fila["resolution_note"] == "devaluación confirmada"
    # Y ahora es la referencia vigente.
    assert (await repositorio.ultima_tasa_valida("USD")).valor == Decimal("900.00")


async def test_sospechosas_pendientes_sin_filtro_cubre_todas_las_monedas(repositorio):
    await repositorio.guardar(_tasa("900.00", moneda="USD", estado=EstadoTasa.SUSPECT))
    await repositorio.guardar(_tasa("999.00", moneda="EUR", estado=EstadoTasa.SUSPECT))

    todas = await repositorio.sospechosas_pendientes()

    assert [t.moneda for t in todas] == ["EUR", "USD"]  # orden por moneda


async def test_expiracion_por_timeout_solo_afecta_las_vencidas(repositorio, pool):
    vieja = _tasa("900.00", capturada_en=AHORA - timedelta(hours=30), estado=EstadoTasa.SUSPECT)
    fresca = _tasa("910.00", capturada_en=AHORA, estado=EstadoTasa.SUSPECT)
    await repositorio.guardar(vieja)
    await repositorio.guardar(fresca)

    expiradas = await repositorio.expirar_sospechosas_antes_de(AHORA - timedelta(hours=24))

    assert [t.capturada_en for t in expiradas] == [vieja.capturada_en]
    assert [t.estado for t in expiradas] == [EstadoTasa.REJECTED]
    fila = await pool.fetchrow(
        "SELECT status, resolved_by FROM official_rates WHERE captured_at = $1",
        vieja.capturada_en,
    )
    assert fila["status"] == "rejected"
    assert fila["resolved_by"] == "system:timeout"
    assert len(await repositorio.sospechosas_pendientes("USD")) == 1  # la fresca sigue


async def test_marcar_stale_conserva_el_primer_timestamp(repositorio, pool):
    await repositorio.registrar_fallo("caída")
    await repositorio.marcar_stale()
    primero = await pool.fetchval(
        "SELECT stale_since FROM official_rate_source_health WHERE source = 'BCV'"
    )

    await repositorio.marcar_stale()  # no debe re-estampar

    segundo = await pool.fetchval(
        "SELECT stale_since FROM official_rate_source_health WHERE source = 'BCV'"
    )
    assert primero is not None
    assert segundo == primero
