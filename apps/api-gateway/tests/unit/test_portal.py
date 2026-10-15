"""Lectura pública `/portal/v1` (plan del portal 2.3 y 2.4, ADR-0028)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from tests.conftest import fila_analisis, fila_indicador, fila_senal, fila_tasa, item_crudo

MONEDAS = ("USD", "EUR", "CNY", "TRY", "RUB")


def sembrar(repositorio) -> None:
    """Todo lo que el snapshot compone, con datos frescos."""
    for moneda in MONEDAS:
        repositorio.tasas[moneda] = fila_tasa(currency=moneda)
    repositorio.vigentes[("official_rate", "USD")] = fila_indicador("871.36890000")
    for nombre, valor in (
        ("p2p_brecha_abs_buy", "104.95000000"),
        ("p2p_brecha_pct_buy", "12.04000000"),
        ("p2p_spread_pct", "0.56000000"),
        ("p2p_liquidez_buy", "90000.00000000"),
        ("p2p_liquidez_sell", "80000.00000000"),
    ):
        repositorio.vigentes[(nombre, "VES")] = fila_indicador(valor)
    for lado in ("buy", "sell"):
        for nombre, valor in (
            ("p2p_mejor_precio", "975.00000000"),
            ("p2p_mediana", "976.00000000"),
            ("p2p_vwap", "976.32000000"),
            ("p2p_liquidez", "90000.00000000"),
            ("p2p_outliers_pct", "0.50000000"),
            ("p2p_merchants_pct", "72.36000000"),
        ):
            repositorio.vigentes[(f"{nombre}_{lado}", "VES")] = fila_indicador(valor)
        repositorio.snapshots[lado.upper()] = {
            "captured_at": datetime.now(UTC) - timedelta(seconds=20),
            "items": [item_crudo("975.00", "1000"), item_crudo("976.00", "500")],
        }
    repositorio.filas_senales = [fila_senal()]
    analisis = fila_analisis()
    # Lo que el motor publica y el portal NO debe reenviar.
    analisis["payload"]["risks"] = {"version": 1, "items": []}
    analisis["payload"]["indicators"][0]["scale"]["samples"] = 4187
    analisis["payload"]["indicators"][0]["merchant_ref"] = "cd" * 16
    analisis["payload"]["reading"] = {
        "version": 1,
        "window_hours": 6,
        "regime": "lateral_estable",
        "axis_movement": "lateral",
        "axis_gap": "estable",
        "gauges_near_threshold": 0,
        "claims": [
            {"code": "regla_cerca", "data": {"regla": "arranque_alcista@v1", "cumplidas": "2", "totales": "3", "secreto": "x"}},
        ],
    }
    analisis["payload"]["gap_legs"] = {
        "hours": 6, "official": "1.22", "parallel": "0.02", "responsible": None, "official_share": "0.98",
    }
    analisis["payload"]["gap_history"] = {
        "sides": [
            {"side": "buy", "current": "15.34", "references": [
                {"days_configured": 7, "days_covered": 7, "samples": 9285, "mean": "15.87", "max": "17.17", "min": "14.31"},
            ]},
        ]
    }
    repositorio.analisis["VES"] = analisis


def test_el_snapshot_es_publico_y_lleva_cache_y_cuota(cliente, repositorio):
    sembrar(repositorio)
    r = cliente.get("/portal/v1/snapshot")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "public, max-age=5, stale-while-revalidate=25"
    assert r.headers["X-RateLimit-Limit"] == "600"


def test_el_snapshot_trae_lo_que_pinta_la_landing(cliente, repositorio):
    sembrar(repositorio)
    s = cliente.get("/portal/v1/snapshot").json()
    assert s["gap"]["pct"] == "12.04000000"
    assert s["gap"]["abs"] == "104.95000000"
    assert {t["currency"] for t in s["official_rates"]} == set(MONEDAS)
    assert s["p2p"]["buy"]["vwap"] == "976.32000000"
    assert s["p2p"]["buy"]["outliers_pct"] == "0.50000000"
    assert s["p2p"]["buy"]["merchants_pct"] == "72.36000000"
    assert s["analysis"]["reading"]["regime"] == "lateral_estable"
    assert s["analysis"]["rule_proximity"][0]["conditions_met"] == 1
    assert s["analysis"]["gap_legs"]["official_share"] == "0.98"
    assert s["calc_version"] == 1 and s["ruleset_version"] == 1
    assert s["depth"]["buy"]["levels"]
    assert len(s["signals"]["items"]) == 1


def test_lista_blanca_nada_interno_sale(cliente, repositorio):
    """T18: ni identificadores de anunciante ni campos internos del motor, aunque
    vengan en lo que se compone."""
    sembrar(repositorio)
    texto = cliente.get("/portal/v1/snapshot").text
    for prohibido in ("merchant_ref", "triggered_by", "risks", "evidence", "samples", "secreto", "advertiser"):
        assert prohibido not in texto, prohibido


def test_sin_datos_responde_200_con_bloques_nulos(cliente):
    r = cliente.get("/portal/v1/snapshot")
    assert r.status_code == 200
    s = r.json()
    assert s["as_of"] is None
    assert s["gap"] is None and s["analysis"] is None
    assert s["p2p"] == {"buy": None, "sell": None}
    assert s["official_rates"] == []


def test_as_of_es_el_dato_mas_nuevo_no_la_peticion(cliente, repositorio):
    sembrar(repositorio)
    viejo = timedelta(minutes=3)
    for (nombre, moneda), fila in list(repositorio.vigentes.items()):
        repositorio.vigentes[(nombre, moneda)] = {**fila, "as_of": datetime.now(UTC) - viejo}
    repositorio.analisis["VES"] = fila_analisis(hace=viejo)
    s = cliente.get("/portal/v1/snapshot").json()
    edad = datetime.now(UTC) - datetime.fromisoformat(s["as_of"])
    assert timedelta(minutes=2) < edad < timedelta(minutes=4)


def test_dentro_del_ttl_se_sirve_de_la_cache(cliente, repositorio, app):
    sembrar(repositorio)
    cliente.get("/portal/v1/snapshot")
    cliente.get("/portal/v1/snapshot")
    assert app.state.cache_portal.calculos == 1


@pytest.mark.parametrize("ruta", ["/portal/v1/snapshot", "/portal/v1/dashboard/series"])
@pytest.mark.parametrize("consulta", ["from=2020-01-01", "currency=USD", "interval=5m", "page=2"])
def test_cualquier_parametro_es_422(cliente, ruta, consulta):
    r = cliente.get(f"{ruta}?{consulta}")
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    # Gastó cuota: el 422 también la dice.
    assert "X-RateLimit-Limit" in r.headers


@pytest.mark.parametrize("ruta", ["/portal/v1/snapshot", "/portal/v1/dashboard/series"])
def test_solo_get(cliente, ruta):
    assert cliente.post(ruta).status_code == 405


def test_las_series_tienen_ventanas_fijas_y_van_en_orden(cliente, repositorio):
    ahora = datetime.now(UTC)
    repositorio.historial_ind = [
        {"as_of": ahora - timedelta(hours=h), "indicator": "p2p_brecha_pct_buy",
         "currency": "VES", "value": f"{12 + h / 100:.8f}", "calc_version": 1}
        for h in (3, 1, 2, 40 * 24)
    ]
    r = cliente.get("/portal/v1/dashboard/series")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "public, max-age=60, stale-while-revalidate=240"
    series = r.json()["series"]
    assert set(series) == {"gap_buy_24h", "gap_sell_14d", "gap_buy_30d"}
    puntos = series["gap_buy_24h"]["points"]
    assert len(puntos) == 3  # el de hace 40 días queda fuera de las 24 h
    assert [p["t"] for p in puntos] == sorted(p["t"] for p in puntos)
    assert series["gap_sell_14d"]["points"] == []


def test_el_snapshot_no_pide_token_pero_api_v1_si(cliente, repositorio):
    sembrar(repositorio)
    assert cliente.get("/portal/v1/snapshot").status_code == 200
    assert cliente.get("/api/v1/indicators/current").status_code == 401


def test_la_respuesta_es_json_valido_sin_floats(cliente, repositorio):
    """Decimales como cadena exacta, también aquí."""
    sembrar(repositorio)
    def sin_floats(x):
        if isinstance(x, float):
            raise AssertionError(f"float en el snapshot: {x}")
        if isinstance(x, dict):
            for v in x.values():
                sin_floats(v)
        if isinstance(x, list):
            for v in x:
                sin_floats(v)
    sin_floats(json.loads(cliente.get("/portal/v1/snapshot").text))
