"""Casos de uso de lectura: frescura, confianza y armado de la vista REST."""

from datetime import timedelta

import pytest

from api_gateway.application.consultas import (
    ConsultarAnalisisVigente,
    ConsultarIndicadoresVigentes,
    ConsultarReferenciaP2P,
    ConsultarTasaOficialVigente,
)
from tests.conftest import (
    RepositorioEnMemoria,
    fila_analisis,
    fila_indicador,
    fila_tasa,
)

STALE = timedelta(hours=6)
FRESCURA = timedelta(minutes=20)


@pytest.fixture
def repo() -> RepositorioEnMemoria:
    return RepositorioEnMemoria()


# -- tasa oficial ------------------------------------------------------------


async def test_tasa_vigente_fresca_no_es_stale(repo):
    repo.tasas["USD"] = fila_tasa(hace=timedelta(hours=1))
    resultado = await ConsultarTasaOficialVigente(repo, STALE).ejecutar("USD")
    assert resultado["stale"] is False
    assert resultado["rate"] == "417.03000000"


async def test_tasa_vieja_se_sirve_marcada_stale(repo):
    repo.tasas["USD"] = fila_tasa(hace=timedelta(hours=7))
    resultado = await ConsultarTasaOficialVigente(repo, STALE).ejecutar("USD")
    assert resultado["stale"] is True


async def test_sin_tasa_devuelve_none(repo):
    assert await ConsultarTasaOficialVigente(repo, STALE).ejecutar("EUR") is None


# -- referencia P2P ----------------------------------------------------------


def _sembrar_lado_buy(repo, outliers: str = "5.0", hace=timedelta(minutes=1)):
    for nombre, valor in (
        ("p2p_mejor_precio_buy", "850.00000000"),
        ("p2p_mediana_buy", "853.10000000"),
        ("p2p_vwap_buy", "852.40000000"),
        ("p2p_liquidez_buy", "125000.00000000"),
        ("p2p_outliers_pct_buy", outliers),
    ):
        repo.vigentes[(nombre, "VES")] = fila_indicador(valor, hace=hace)


async def test_referencia_p2p_confianza_normal(repo):
    _sembrar_lado_buy(repo)
    resultado = await ConsultarReferenciaP2P(repo, FRESCURA).ejecutar("buy")
    assert resultado["confidence"] == "normal"
    assert resultado["median"] == "853.10000000"
    assert resultado["side"] == "buy"


async def test_referencia_p2p_confianza_low_por_outliers(repo):
    _sembrar_lado_buy(repo, outliers="35.0")
    resultado = await ConsultarReferenciaP2P(repo, FRESCURA).ejecutar("buy")
    assert resultado["confidence"] == "low"


async def test_referencia_p2p_rancia_no_se_sirve_como_vigente(repo):
    _sembrar_lado_buy(repo, hace=timedelta(minutes=45))
    assert await ConsultarReferenciaP2P(repo, FRESCURA).ejecutar("buy") is None


async def test_referencia_p2p_incompleta_devuelve_none(repo):
    repo.vigentes[("p2p_mediana_buy", "VES")] = fila_indicador("853.1")
    assert await ConsultarReferenciaP2P(repo, FRESCURA).ejecutar("buy") is None


# -- indicadores vigentes ----------------------------------------------------


async def test_indicadores_usd_con_p2p_fresco(repo):
    repo.tasas["USD"] = fila_tasa()
    repo.vigentes[("official_rate", "USD")] = fila_indicador("417.03000000")
    repo.vigentes[("p2p_brecha_abs_buy", "VES")] = fila_indicador("433.00000000")
    repo.vigentes[("p2p_brecha_pct_buy", "VES")] = fila_indicador("103.83000000")
    repo.vigentes[("p2p_spread_pct", "VES")] = fila_indicador("-0.35000000")
    repo.vigentes[("p2p_liquidez_buy", "VES")] = fila_indicador("125000.0")
    repo.vigentes[("p2p_liquidez_sell", "VES")] = fila_indicador("98000.0")
    resultado = await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar(
        "USD"
    )
    assert resultado["official_stale"] is False
    assert resultado["gap_abs"] == "433.00000000"
    assert resultado["spread_pct"] == "-0.35000000"
    assert resultado["volumes"] == {"buy": "125000.0", "sell": "98000.0"}


async def test_indicadores_p2p_rancios_van_en_null(repo):
    repo.tasas["USD"] = fila_tasa()
    repo.vigentes[("official_rate", "USD")] = fila_indicador("417.03")
    repo.vigentes[("p2p_brecha_abs_buy", "VES")] = fila_indicador(
        "433.0", hace=timedelta(hours=2)
    )
    resultado = await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar(
        "USD"
    )
    assert resultado["gap_abs"] is None
    assert resultado["volumes"] is None


async def test_indicadores_de_moneda_sin_par_p2p_van_en_null(repo):
    repo.tasas["EUR"] = fila_tasa(currency="EUR", rate="480.10000000")
    repo.vigentes[("official_rate", "EUR")] = fila_indicador("480.10000000")
    resultado = await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar(
        "EUR"
    )
    assert resultado["gap_abs"] is None and resultado["spread_pct"] is None


async def test_indicadores_sin_official_rate_devuelve_none(repo):
    assert (
        await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar("USD")
        is None
    )


async def test_official_stale_si_no_hay_tasa_o_es_vieja(repo):
    repo.vigentes[("official_rate", "USD")] = fila_indicador("417.03")
    resultado = await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar(
        "USD"
    )
    assert resultado["official_stale"] is True
    repo.tasas["USD"] = fila_tasa(hace=timedelta(hours=8))
    resultado = await ConsultarIndicadoresVigentes(repo, STALE, FRESCURA).ejecutar(
        "USD"
    )
    assert resultado["official_stale"] is True


# -- análisis de la revisión (RF-6) ------------------------------------------


async def test_analisis_vigente_devuelve_el_payload_tal_como_se_publico(repo):
    """El gateway NO reclasifica bandas ni recalcula escalas: hacerlo abriría
    una segunda fuente de verdad sobre la lectura del panel."""
    fila = fila_analisis(hace=timedelta(minutes=1))
    repo.analisis["VES"] = fila

    resultado = await ConsultarAnalisisVigente(repo, FRESCURA).ejecutar("VES")

    assert resultado is fila["payload"]
    # Decimales como string exacto, sin round-trip por float.
    assert resultado["indicators"][0]["position"] == "0.1966"


async def test_un_analisis_rancio_no_se_sirve_como_vigente(repo):
    """Mismo criterio que /rates/p2p/current (A10): nunca se presenta dato
    rancio como actual — el panel prefiere decir que no hay lectura."""
    repo.analisis["VES"] = fila_analisis(hace=timedelta(minutes=25))
    assert await ConsultarAnalisisVigente(repo, FRESCURA).ejecutar("VES") is None


async def test_sin_fila_devuelve_none(repo):
    assert await ConsultarAnalisisVigente(repo, FRESCURA).ejecutar("VES") is None


async def test_la_moneda_no_se_confunde(repo):
    repo.analisis["VES"] = fila_analisis(hace=timedelta(minutes=1))
    assert await ConsultarAnalisisVigente(repo, FRESCURA).ejecutar("COP") is None
