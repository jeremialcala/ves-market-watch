"""Contrato REST: cada respuesta se valida contra su schema del
`docs/openapi.yaml` (OpenAPI 3.1 = JSON Schema 2020-12). El spec es la fuente
de verdad; si la implementación se desvía, falla aquí."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from tests.conftest import (
    OPENAPI,
    fila_indicador,
    fila_senal,
    fila_tasa,
    firmar_token,
    item_crudo,
)

_DOC = yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))
_REGISTRY = Registry().with_resource(
    "urn:openapi", Resource(contents=_DOC, specification=DRAFT202012)
)


def validar_contra(nombre_schema: str, cuerpo: dict) -> None:
    validador = Draft202012Validator(
        {"$ref": f"urn:openapi#/components/schemas/{nombre_schema}"},
        registry=_REGISTRY,
    )
    errores = sorted(validador.iter_errors(cuerpo), key=str)
    assert not errores, f"{nombre_schema}: {[e.message for e in errores]}"


def _hoy() -> str:
    return date.today().isoformat()


def _hace_dias(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


# -- respuestas 200 ----------------------------------------------------------


def test_tasa_oficial_vigente_cumple_schema(cliente, repositorio, auth):
    repositorio.tasas["USD"] = fila_tasa()
    r = cliente.get("/api/v1/rates/official/current", headers=auth)
    assert r.status_code == 200
    assert "X-RateLimit-Limit" in r.headers
    validar_contra("OfficialRateCurrent", r.json())


def test_historial_tasa_oficial_cumple_schema(cliente, repositorio, auth):
    repositorio.historial_tasas = [
        {**fila_tasa(), "value_date": date.today() - timedelta(days=n)}
        for n in range(3)
    ]
    r = cliente.get(
        "/api/v1/rates/official/history",
        headers=auth,
        params={"from": _hace_dias(30), "to": _hoy()},
    )
    assert r.status_code == 200
    cuerpo = r.json()
    validar_contra("OfficialRateHistoryPage", cuerpo)
    assert cuerpo["pagination"]["total_items"] == 3


def test_referencia_p2p_cumple_schema(cliente, repositorio, auth):
    for nombre, valor in (
        ("p2p_mejor_precio_sell", "849.00000000"),
        ("p2p_mediana_sell", "851.00000000"),
        ("p2p_vwap_sell", "850.50000000"),
        ("p2p_liquidez_sell", "90000.00000000"),
        ("p2p_outliers_pct_sell", "4.00000000"),
    ):
        repositorio.vigentes[(nombre, "VES")] = fila_indicador(valor)
    r = cliente.get(
        "/api/v1/rates/p2p/current", headers=auth, params={"side": "sell"}
    )
    assert r.status_code == 200
    validar_contra("P2PQuote", r.json())


def test_indicadores_vigentes_cumplen_schema(cliente, repositorio, auth):
    repositorio.tasas["USD"] = fila_tasa()
    repositorio.vigentes[("official_rate", "USD")] = fila_indicador()
    repositorio.vigentes[("p2p_brecha_abs_buy", "VES")] = fila_indicador("433.0")
    repositorio.vigentes[("p2p_brecha_pct_buy", "VES")] = fila_indicador("103.8")
    repositorio.vigentes[("p2p_spread_pct", "VES")] = fila_indicador("-0.35")
    r = cliente.get("/api/v1/indicators/current", headers=auth)
    assert r.status_code == 200
    validar_contra("Indicators", r.json())


def test_indicadores_con_nulls_cumplen_schema(cliente, repositorio, auth):
    repositorio.tasas["EUR"] = fila_tasa(currency="EUR")
    repositorio.vigentes[("official_rate", "EUR")] = fila_indicador("480.1")
    r = cliente.get(
        "/api/v1/indicators/current", headers=auth, params={"currency": "EUR"}
    )
    assert r.status_code == 200
    validar_contra("Indicators", r.json())


def test_historial_indicadores_cumple_schema(cliente, repositorio, auth):
    ahora = datetime.now(UTC)
    repositorio.historial_ind = [
        {
            "as_of": ahora - timedelta(hours=n),
            "indicator": "official_rate",
            "currency": "USD",
            "value": "417.03000000",
            "calc_version": 1,
        }
        for n in range(2)
    ]
    r = cliente.get(
        "/api/v1/indicators/history",
        headers=auth,
        params={
            "from": (ahora - timedelta(days=1)).isoformat(),
            "to": ahora.isoformat(),
        },
    )
    assert r.status_code == 200
    validar_contra("IndicatorHistoryPage", r.json())


def test_historial_indicadores_filtra_por_indicador_y_moneda(
    cliente, repositorio, auth
):
    ahora = datetime.now(UTC)
    repositorio.historial_ind = [
        {
            "as_of": ahora,
            "indicator": nombre,
            "currency": moneda,
            "value": "1.00000000",
            "calc_version": 1,
        }
        for nombre, moneda in (
            ("p2p_brecha_pct_buy", "VES"),
            ("p2p_spread_pct", "VES"),
            ("official_rate", "USD"),
            ("official_rate", "EUR"),
        )
    ]
    r = cliente.get(
        "/api/v1/indicators/history",
        headers=auth,
        params={
            "from": (ahora - timedelta(days=1)).isoformat(),
            "to": (ahora + timedelta(minutes=1)).isoformat(),
            "indicator": "official_rate",
            "currency": "EUR",
        },
    )
    assert r.status_code == 200
    cuerpo = r.json()
    validar_contra("IndicatorHistoryPage", cuerpo)
    assert cuerpo["pagination"]["total_items"] == 1
    assert cuerpo["data"][0]["currency"] == "EUR"


def test_profundidad_cumple_schema(cliente, repositorio, auth):
    repositorio.snapshots["BUY"] = {
        "captured_at": datetime.now(UTC),
        "items": [item_crudo("850.00", "100"), item_crudo("851.00", "50")],
    }
    r = cliente.get("/api/v1/market/depth", headers=auth, params={"side": "buy"})
    assert r.status_code == 200
    cuerpo = r.json()
    validar_contra("MarketDepth", cuerpo)
    assert cuerpo["levels"]


def test_senales_cumplen_schema(cliente, repositorio, auth):
    repositorio.filas_senales = [fila_senal(), fila_senal("techo_inminente")]
    ahora = datetime.now(UTC)
    r = cliente.get(
        "/api/v1/signals",
        headers=auth,
        params={
            "from": (ahora - timedelta(days=1)).isoformat(),
            "to": (ahora + timedelta(minutes=1)).isoformat(),
        },
    )
    assert r.status_code == 200
    validar_contra("SignalPage", r.json())


def test_senales_filtra_por_tipo(cliente, repositorio, auth):
    repositorio.filas_senales = [fila_senal(), fila_senal("techo_inminente")]
    ahora = datetime.now(UTC)
    r = cliente.get(
        "/api/v1/signals",
        headers=auth,
        params={
            "from": (ahora - timedelta(days=1)).isoformat(),
            "to": (ahora + timedelta(minutes=1)).isoformat(),
            "type": "techo_inminente",
        },
    )
    datos = r.json()["data"]
    assert len(datos) == 1 and datos[0]["type"] == "techo_inminente"


def test_health_cumple_schema_y_es_publico(cliente):
    r = cliente.get("/api/v1/health")
    assert r.status_code == 200  # broker deshabilitado en tests → degraded
    cuerpo = r.json()
    validar_contra("Health", cuerpo)
    assert cuerpo["status"] == "degraded"


# -- errores (RFC 7807) ------------------------------------------------------


@pytest.mark.parametrize(
    "params",
    [{"side": "ambos"}, {}],
)
def test_parametro_invalido_es_400_problem(cliente, auth, params):
    r = cliente.get("/api/v1/rates/p2p/current", headers=auth, params=params)
    assert r.status_code == 400
    assert r.headers["content-type"].startswith("application/problem+json")
    validar_contra("Problem", r.json())


def test_rango_mayor_a_90_dias_es_422_problem(cliente, auth):
    r = cliente.get(
        "/api/v1/rates/official/history",
        headers=auth,
        params={"from": _hace_dias(120), "to": _hoy()},
    )
    assert r.status_code == 422
    validar_contra("Problem", r.json())


def test_sin_token_es_401_problem(cliente):
    r = cliente.get("/api/v1/rates/official/current")
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
    validar_contra("Problem", r.json())


def test_sin_permiso_es_403_problem(cliente, repositorio):
    repositorio.tasas["USD"] = fila_tasa()
    token = firmar_token(permisos=["read:indicators"])
    r = cliente.get(
        "/api/v1/rates/official/current",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
    cuerpo = r.json()
    validar_contra("Problem", cuerpo)
    assert "read:rates" in cuerpo["detail"]


def test_sin_datos_es_404_problem(cliente, auth):
    r = cliente.get("/api/v1/rates/official/current", headers=auth)
    assert r.status_code == 404
    validar_contra("Problem", r.json())


def test_rate_limit_agotado_es_429_con_retry_after(repositorio):
    from fastapi.testclient import TestClient

    from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
    from api_gateway.app import create_app
    from tests.conftest import jwks_de_test, settings_de_test

    settings = settings_de_test(rate_limit_per_min=2)
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    app = create_app(
        settings, validador=validador, repositorio=repositorio, con_amqp=False
    )
    repositorio.tasas["USD"] = fila_tasa()
    headers = {"Authorization": f"Bearer {firmar_token()}"}
    with TestClient(app) as cliente:
        for _ in range(2):
            assert (
                cliente.get(
                    "/api/v1/rates/official/current", headers=headers
                ).status_code
                == 200
            )
        r = cliente.get("/api/v1/rates/official/current", headers=headers)
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    assert r.headers["X-RateLimit-Remaining"] == "0"
    validar_contra("Problem", r.json())
