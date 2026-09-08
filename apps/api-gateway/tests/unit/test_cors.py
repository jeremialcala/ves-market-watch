"""CORS por allowlist para el SPA (ADR-0017): solo orígenes declarados, solo
GET, exposición de X-RateLimit-* y cabeceras también en errores RFC 7807
(sin ellas el browser oculta el error real al front)."""

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
