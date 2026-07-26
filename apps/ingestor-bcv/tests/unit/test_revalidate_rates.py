"""Tests del caso de uso RevalidarTasasSospechosas (HITL, ADR-0007)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from ingestor_bcv.adapters.memory import InMemoryRateRepository, LoggingEventPublisher
from ingestor_bcv.application.revalidate_rates import (
    ErrorDeRevalidacion,
    RevalidarTasasSospechosas,
)
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial

T0 = datetime(2026, 7, 5, 12, 0, tzinfo=UTC)


def _tasa(
    valor: str,
    estado: EstadoTasa,
    moneda: str = "USD",
    minutos: int = 0,
    fecha: date = date(2026, 7, 6),
) -> TasaOficial:
    return TasaOficial(
        moneda=moneda,
        valor=Decimal(valor),
        fecha_valor=fecha,
        capturada_en=T0 + timedelta(minutes=minutos),
        estado=estado,
    )


def _armar():
    repo = InMemoryRateRepository()
    publisher = LoggingEventPublisher()
    return repo, publisher, RevalidarTasasSospechosas(publisher, repo)


async def test_listar_calcula_delta_frente_a_la_referencia():
    repo, _, caso = _armar()
    await repo.guardar(_tasa("667.05", EstadoTasa.VALID))
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT, minutos=30))

    pendientes = await caso.listar()

    assert len(pendientes) == 1
    assert pendientes[0].tasa.valor == Decimal("900.00")
    assert pendientes[0].ultima_valida.valor == Decimal("667.05")
    assert pendientes[0].delta_pct == pytest.approx(Decimal("34.92"), abs=Decimal("0.01"))


async def test_listar_sin_referencia_devuelve_delta_none():
    repo, _, caso = _armar()
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT))

    pendientes = await caso.listar()

    assert pendientes[0].ultima_valida is None
    assert pendientes[0].delta_pct is None


async def test_aprobar_publica_y_promueve_la_mas_reciente():
    repo, publisher, caso = _armar()
    await repo.guardar(_tasa("667.05", EstadoTasa.VALID))
    await repo.guardar(_tasa("880.00", EstadoTasa.SUSPECT, minutos=30))
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT, minutos=60))

    aprobada = await caso.aprobar("USD", "jeremi", "devaluación real confirmada")

    assert aprobada.valor == Decimal("900.00")
    assert aprobada.estado is EstadoTasa.VALID
    # Se publicó exactamente un evento, con la tasa aprobada como valid.
    assert len(publisher.eventos) == 1
    assert publisher.eventos[0]["payload"]["rate"] == "900.00"
    assert publisher.eventos[0]["payload"]["status"] == "valid"
    # La aprobada es la nueva referencia; la más vieja quedó rejected (reemplazada).
    assert (await repo.ultima_tasa_valida("USD")).valor == Decimal("900.00")
    assert await repo.sospechosas_pendientes("USD") == []
    estados = {t.valor: t.estado for t in repo.capturas}
    assert estados[Decimal("880.00")] is EstadoTasa.REJECTED
    # Auditoría registrada con usuario y nota.
    assert any(r[3] == "jeremi" and "confirmada" in r[4] for r in repo.resoluciones)


async def test_aprobar_no_toca_sospechas_de_otras_monedas():
    repo, _, caso = _armar()
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT, moneda="USD"))
    await repo.guardar(_tasa("999.00", EstadoTasa.SUSPECT, moneda="EUR"))

    await caso.aprobar("USD", "jeremi", "ok")

    assert len(await repo.sospechosas_pendientes("EUR")) == 1


async def test_aprobar_sin_pendientes_falla_con_mensaje_claro():
    _, _, caso = _armar()
    with pytest.raises(ErrorDeRevalidacion, match="no hay sospechas pendientes"):
        await caso.aprobar("USD", "jeremi", "ok")


async def test_aprobar_rechaza_sospecha_obsoleta():
    # El sitio revirtió y hubo una captura válida DESPUÉS de la sospecha:
    # aprobarla publicaría una tasa vieja sin ser la referencia.
    repo, publisher, caso = _armar()
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT, minutos=0))
    await repo.guardar(_tasa("667.05", EstadoTasa.VALID, minutos=30))

    with pytest.raises(ErrorDeRevalidacion, match="más reciente"):
        await caso.aprobar("USD", "jeremi", "ok")
    assert publisher.eventos == []
    assert len(await repo.sospechosas_pendientes("USD")) == 1  # queda intacta


async def test_rechazar_cierra_todas_las_pendientes_sin_publicar():
    repo, publisher, caso = _armar()
    await repo.guardar(_tasa("667.05", EstadoTasa.VALID))
    await repo.guardar(_tasa("880.00", EstadoTasa.SUSPECT, minutos=30))
    await repo.guardar(_tasa("900.00", EstadoTasa.SUSPECT, minutos=60))

    rechazadas = await caso.rechazar("USD", "jeremi", "anuncio manipulado")

    assert len(rechazadas) == 2
    assert publisher.eventos == []
    assert await repo.sospechosas_pendientes("USD") == []
    assert (await repo.ultima_tasa_valida("USD")).valor == Decimal("667.05")


async def test_rechazar_sin_pendientes_falla_con_mensaje_claro():
    _, _, caso = _armar()
    with pytest.raises(ErrorDeRevalidacion, match="no hay sospechas pendientes"):
        await caso.rechazar("USD", "jeremi", "n/a")
