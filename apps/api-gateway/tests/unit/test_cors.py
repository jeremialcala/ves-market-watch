"""CORS por allowlist para el SPA (ADR-0017): solo orígenes declarados, solo
GET, exposición de X-RateLimit-* y cabeceras también en errores RFC 7807
(sin ellas el browser oculta el error real al front)."""

import pytest

from tests.conftest import fila_tasa

ORIGEN_SPA = "http://localhost:5173"
ORIGEN_AJENO = "https://evil.example"


def test_preflight_de_origen_permitido(cliente):
    r = cliente.options(
        "/api/v1/rates/official/current",
        headers={
            "Origin": ORIGEN_SPA,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN_SPA
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
    assert "GET" in r.headers["access-control-allow-methods"]


def test_get_permitido_expone_cabeceras_de_cuota(cliente, repositorio, auth):
    repositorio.tasas["USD"] = fila_tasa()
    r = cliente.get(
        "/api/v1/rates/official/current", headers={**auth, "Origin": ORIGEN_SPA}
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN_SPA
    expuestas = r.headers.get("access-control-expose-headers", "").lower()
    for cabecera in (
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
        "retry-after",
    ):
        assert cabecera in expuestas


def test_origen_no_listado_no_recibe_acao(cliente, repositorio, auth):
    repositorio.tasas["USD"] = fila_tasa()
    r = cliente.get(
        "/api/v1/rates/official/current", headers={**auth, "Origin": ORIGEN_AJENO}
    )
    # CORS no es autorización: el endpoint responde, pero sin ACAO el browser
    # de un origen ajeno no puede leer la respuesta.
    assert r.status_code == 200
    assert "access-control-allow-origin" not in r.headers


def test_error_problem_json_tambien_lleva_acao(cliente):
    r = cliente.get(
        "/api/v1/rates/official/current", headers={"Origin": ORIGEN_SPA}
    )
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.headers["access-control-allow-origin"] == ORIGEN_SPA


def test_health_publico_con_origen_permitido(cliente):
    r = cliente.get("/api/v1/health", headers={"Origin": ORIGEN_SPA})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN_SPA


# -- El portal público (plan 2.5, ADR-0028 §4) ----------------------------------
# El portal vive en Workers y lee `/portal/v1` desde otro origen, sin token: un
# GET simple, sin preflight. Lo que tiene que poder leer el navegador es el
# cuerpo y, ante un 429, el `Retry-After` con el que el sondeo retrocede.

ORIGEN_PORTAL = "https://criterio.higerotech.com"


@pytest.fixture
def cliente_portal(repositorio):
    from fastapi.testclient import TestClient

    from api_gateway.app import create_app
    from tests.conftest import settings_de_test

    settings = settings_de_test(
        allowed_origins=(ORIGEN_SPA, ORIGEN_PORTAL), portal_rate_limit_per_min=1
    )
    with TestClient(
        create_app(settings, repositorio=repositorio, con_amqp=False)
    ) as cliente:
        yield cliente


@pytest.mark.parametrize("ruta", ["/portal/v1/snapshot", "/portal/v1/dashboard/series"])
def test_el_portal_lee_su_lectura_publica(cliente_portal, ruta):
    r = cliente_portal.get(ruta, headers={"Origin": ORIGEN_PORTAL})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEN_PORTAL
    # Sin cookies ni token: nunca credenciales.
    assert "access-control-allow-credentials" not in r.headers


def test_el_429_del_portal_deja_leer_retry_after(cliente_portal):
    cliente_portal.get("/portal/v1/snapshot", headers={"Origin": ORIGEN_PORTAL})
    r = cliente_portal.get("/portal/v1/snapshot", headers={"Origin": ORIGEN_PORTAL})
    assert r.status_code == 429
    assert r.headers["access-control-allow-origin"] == ORIGEN_PORTAL
    assert "retry-after" in r.headers["access-control-expose-headers"].lower()
    assert int(r.headers["Retry-After"]) > 0


@pytest.mark.parametrize(
    "origen",
    [
        "https://criterio.higerotech.com.evil.example",
        "http://criterio.higerotech.com",
        "https://otro.higerotech.com",
    ],
)
def test_parecidos_al_portal_no_reciben_acao(cliente_portal, origen):
    r = cliente_portal.get("/portal/v1/snapshot", headers={"Origin": origen})
    assert "access-control-allow-origin" not in r.headers
