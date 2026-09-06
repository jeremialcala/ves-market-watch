"""Parámetros hostiles en la query: nada debe salir como 5xx (T9, A03/A10).

Lo encontró el **DAST** del 2026-09-06, que es el tipo de defecto que un
`TestClient` in-process no busca por su cuenta: hay que mandarle la sonda.

    GET /api/v1/signals?...&type=%00  ->  500 Internal Server Error

Un byte NUL en `type` llegaba tal cual a PostgreSQL —que no admite NUL en
texto—, la consulta reventaba y el gateway devolvía un **500 en texto plano**,
fuera del contrato `problem+json` y contra el control de «errores uniformes sin
detalles internos» (V10/A10). Al reproducirlo apareció un segundo endpoint que
el escáner no llegó a marcar: `indicator` en `/indicators/history`.

`currency` y `side` nunca estuvieron afectados porque ya validaban con `pattern`
y `Literal`. **La asimetría era el defecto**: dos parámetros de la misma
naturaleza —identificadores internos, no texto libre— sin restricción ninguna.

Estos tests fijan el contrato: entrada hostil es 4xx del cliente, nunca 5xx del
servidor. Un 500 aquí sería, además de un fallo, una vía de negación de servicio
barata (T4).
"""

import pytest

pytestmark = pytest.mark.security

DESDE = "2026-07-10T00:00:00Z"
HASTA = "2026-07-17T00:00:00Z"

# Cargas que un escáner manda de serie. Ninguna es explotable por sí sola aquí
# —no hay concatenación de SQL, el repositorio usa parámetros—, pero todas deben
# rebotar como 4xx antes de tocar la base.
HOSTILES = [
    ("%00", "byte NUL — el que provocó el 500"),
    ("%0a", "salto de línea"),
    ("a%00b", "NUL embebido"),
    ("../../etc/passwd", "path traversal"),
    ("'%20OR%20'1'%3D'1", "inyección SQL clásica"),
    ("<script>alert(1)</script>", "XSS reflejado"),
    ("${jndi:ldap://x/y}", "Log4Shell"),
    ("%7B%7B7*7%7D%7D", "plantilla del lado servidor"),
]


@pytest.mark.parametrize("carga,motivo", HOSTILES)
def test_signals_type_hostil_no_es_5xx(cliente, auth, carga, motivo):
    r = cliente.get(
        f"/api/v1/signals?from={DESDE}&to={HASTA}&type={carga}", headers=auth
    )
    assert r.status_code < 500, f"5xx con {motivo}: {carga!r}"
    assert r.status_code == 422 or r.status_code == 400, (
        f"se esperaba rechazo de validación con {motivo}, salió {r.status_code}"
    )


@pytest.mark.parametrize("carga,motivo", HOSTILES)
def test_indicators_history_indicator_hostil_no_es_5xx(cliente, auth, carga, motivo):
    r = cliente.get(
        f"/api/v1/indicators/history?from={DESDE}&to={HASTA}&indicator={carga}",
        headers=auth,
    )
    assert r.status_code < 500, f"5xx con {motivo}: {carga!r}"
    assert r.status_code == 422 or r.status_code == 400, (
        f"se esperaba rechazo de validación con {motivo}, salió {r.status_code}"
    )


def test_los_nombres_legitimos_siguen_pasando(cliente, auth):
    """El patrón no puede haberse llevado por delante los valores reales.

    Un rechazo demasiado ancho arreglaría el 500 rompiendo el producto, y los
    tests de arriba no lo notarían: solo miran que no haya 5xx.
    """
    for nombre in ("p2p_vwap_sell", "official_rate_change_pct", "p2p_brecha_abs_buy"):
        r = cliente.get(
            f"/api/v1/indicators/history?from={DESDE}&to={HASTA}&indicator={nombre}",
            headers=auth,
        )
        assert r.status_code == 200, f"{nombre} debería ser un indicador válido"

    for tipo in ("arranque_alcista", "correccion_inminente"):
        r = cliente.get(
            f"/api/v1/signals?from={DESDE}&to={HASTA}&type={tipo}", headers=auth
        )
        assert r.status_code == 200, f"{tipo} debería ser un tipo de señal válido"
