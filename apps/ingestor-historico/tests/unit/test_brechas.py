"""Derivación de la brecha histórica del lado venta (ADR-0013 RF-7).

Lo que se fija aquí es lo que separa una serie derivada creíble de una que
corrompe el estado del motor:

- que el backfill **se corte antes** del primer punto que publicó el motor —la
  guarda que el `ON CONFLICT` NO da, porque las marcas de tiempo de las dos
  series no coinciden;
- que las filas salgan marcadas como derivadas (`calc_version` ≠ el del motor) y
  con su procedencia, para que dentro de un año se distingan de las medidas;
- que sin tasa oficial vigente no se invente brecha.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from ingestor_historico.adapters.memory import InMemoryRepositorioBrechas
from ingestor_historico.application.derivar_brechas import DerivarBrechas
from ingestor_historico.application.ports import PuntoDerivable
from ingestor_historico.domain.brechas import (
    CALC_VERSION_DERIVADO,
    INDICADOR_ABS,
    INDICADOR_PCT,
    BrechaNoDerivable,
    derivar,
    metadata_procedencia,
)

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def punto(minutos: int, p2p: str | None = "845.00", oficial: str | None = "748.79"):
    return PuntoDerivable(
        as_of=T0 + timedelta(minutes=minutos),
        precio_p2p=Decimal(p2p) if p2p is not None else None,
        tasa_oficial=Decimal(oficial) if oficial is not None else None,
    )


# -- aritmética --------------------------------------------------------------


def test_la_brecha_sale_de_la_formula_del_motor():
    """Contrastado contra `calcular_brecha` del indicator-engine, no contra una
    equivalente algebraica: el orden de las operaciones cambia el redondeo
    decimal, y el objetivo es que la serie derivada empalme con la viva."""
    from decimal import Decimal as D

    p2p, oficial = D("845.00"), D("748.79")
    b = derivar(T0, p2p, oficial)
    assert b.abs == D("96.21000000")
    assert b.pct == ((p2p - oficial) / oficial * 100).quantize(D("0.00000001"))
    assert b.pct == D("12.84872928")


def test_los_decimales_se_cuantizan_a_lo_que_admite_la_columna():
    """`indicators.value` es numeric(24,8): más decimales los truncaría la base
    en silencio, y el valor guardado dejaría de ser el calculado."""
    b = derivar(T0, Decimal("845.123456789"), Decimal("748.7"))
    assert b.pct.as_tuple().exponent == -8
    assert b.abs.as_tuple().exponent == -8


def test_una_brecha_negativa_es_legitima():
    """El P2P por DEBAJO del oficial ha pasado. No se recorta a cero."""
    assert derivar(T0, Decimal("700"), Decimal("748.79")).abs < 0


@pytest.mark.parametrize(
    ("p2p", "oficial", "motivo"),
    [
        (None, "748.79", "snapshot sin precio"),
        ("845", None, "sin tasa oficial vigente"),
        ("845", "0", "oficial cero"),
        ("845", "-1", "oficial negativa"),
        ("0", "748.79", "p2p cero"),
    ],
)
def test_sin_insumos_creibles_no_se_deriva_brecha(p2p, oficial, motivo):
    """Sobre todo el caso de la tasa: rellenarla con la más cercana en el FUTURO
    sería usar información que en ese instante no existía."""
    with pytest.raises(BrechaNoDerivable):
        derivar(
            T0,
            Decimal(p2p) if p2p is not None else None,
            Decimal(oficial) if oficial is not None else None,
        )


def test_la_procedencia_declara_el_lado_y_el_sesgo_medido():
    meta = metadata_procedencia("-0.0776", 279)
    assert meta["lado"] == "sell"
    assert meta["sesgo_vs_motor_pp"] == "-0.0776"
    assert meta["horas_de_solape_medidas"] == 279
    assert "no calculada por el indicator-engine" in meta["nota"]


def test_el_calc_version_derivado_NO_es_el_del_motor():
    """`calc_version = 1` significa «lo produjo la fórmula versionada del
    motor». Reutilizarlo aquí haría indistinguible lo derivado de lo medido."""
    assert CALC_VERSION_DERIVADO != 1


# -- caso de uso: la guarda contra el interleaving ---------------------------


async def _derivar(puntos, frontera=None):
    repositorio = InMemoryRepositorioBrechas(puntos, frontera)
    resumen = await DerivarBrechas(repositorio).ejecutar(
        sesgo_medido_pp="-0.0776", horas_solape=279
    )
    return resumen, repositorio


async def test_el_backfill_se_corta_ANTES_del_primer_punto_del_motor():
    """La pieza de seguridad del diseño. Sin ella quedarían dos series
    interleavadas para el mismo indicador —difieren 0,08 pp— y
    `ultimo_indicador`, que no filtra por `calc_version`, devolvería cualquiera.
    """
    frontera = T0 + timedelta(minutes=20)
    resumen, repo = await _derivar([punto(0), punto(10), punto(20), punto(30)], frontera)

    assert resumen.puntos == 2  # solo los anteriores a la frontera
    assert resumen.hasta == T0 + timedelta(minutes=10)
    assert resumen.frontera == frontera
    # Nada escrito en el instante de la frontera ni después.
    assert all(as_of < frontera for as_of, _ in repo.brechas)


def test_la_frontera_se_busca_ignorando_lo_ya_derivado():
    """Si la frontera mirase todas las filas, una segunda pasada la calcularía
    sobre lo que escribió la primera y el backfill se iría estrechando solo."""
    from ingestor_historico.adapters.timescale import brechas as adaptador

    assert "calc_version <> $3" in adaptador._FRONTERA


async def test_sin_serie_viva_se_deriva_todo():
    resumen, repo = await _derivar([punto(0), punto(10)], frontera=None)
    assert resumen.puntos == 2
    assert len(repo.brechas) == 4  # 2 puntos x 2 indicadores


async def test_publica_los_dos_indicadores_con_los_nombres_del_motor():
    """Mismos nombres que la serie viva: es lo que hace que
    `/indicators/history` las sirva como una sola."""
    _, repo = await _derivar([punto(0)])
    assert set(nombre for _, nombre in repo.brechas) == {INDICADOR_PCT, INDICADOR_ABS}


async def test_los_puntos_sin_tasa_se_omiten_contando_el_motivo():
    resumen, repo = await _derivar([punto(0), punto(10, oficial=None), punto(20)])
    assert resumen.insertadas == 4  # 2 puntos válidos x 2
    assert sum(resumen.omitidas.values()) == 1
    assert any("tasa oficial" in m for m in resumen.omitidas)


async def test_la_metadata_de_procedencia_llega_al_repositorio():
    _, repo = await _derivar([punto(0)])
    assert repo.metadata is not None
    assert repo.metadata["origen"] == "historical_market_snapshots"


async def test_recargar_no_duplica():
    repositorio = InMemoryRepositorioBrechas([punto(0), punto(10)], None)
    caso = DerivarBrechas(repositorio)
    for _ in range(2):
        resumen = await caso.ejecutar(sesgo_medido_pp="-0.0776", horas_solape=279)
    assert (resumen.insertadas, resumen.duplicadas) == (0, 4)
    assert len(repositorio.brechas) == 4


async def test_sin_puntos_no_es_un_error_silencioso():
    resumen, repo = await _derivar([])
    assert (resumen.puntos, resumen.insertadas) == (0, 0)
    assert (resumen.desde, resumen.hasta) == (None, None)
    assert repo.brechas == {}
