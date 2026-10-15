"""IP real para la cuota de `/portal/v1` (RF-13, ADR-0028 §3 y §Verificación).

Se prueba de punta a punta, con el `TestClient` haciendo de socket: la cuota se
pone en 1 por minuto, así que una segunda petición que cuente contra la misma
IP da 429, y una que cuente contra otra pasa.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api_gateway.adapters.http.ip_cliente import redes_de_confianza
from api_gateway.adapters.http.portal import CuotaPorIp
from tests.conftest import RepositorioEnMemoria, jwks_de_test, settings_de_test

CONECTOR = "172.22.0.6"  # el contenedor de cloudflared en la red `ves-market`
RED_CONECTOR = "172.22.0.0/16"


def _cliente(trusted: tuple[str, ...], socket: str) -> TestClient:
    from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
    from api_gateway.app import create_app

    settings = settings_de_test(trusted_proxies=trusted, portal_rate_limit_per_min=1)
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    app = create_app(
        settings, validador=validador, repositorio=RepositorioEnMemoria(), con_amqp=False
    )

    # Una ruta de prueba con la misma dependencia que usarán las del portal.
    @app.get("/portal/v1/_prueba")
    async def _prueba(_cuota: CuotaPorIp) -> dict:
        return {}

    return TestClient(app, client=(socket, 50000))


def _pedir(cliente: TestClient, ip_cabecera: str | None = None) -> int:
    cabeceras = {} if ip_cabecera is None else {"CF-Connecting-IP": ip_cabecera}
    return cliente.get("/portal/v1/_prueba", headers=cabeceras).status_code


def test_sin_proxies_de_confianza_la_cabecera_falsificada_no_cuenta():
    """Verificación 1: con TRUSTED_PROXIES vacío, cambiar la cabecera no da
    cuota nueva. Cuenta la IP del socket."""
    with _cliente((), socket="203.0.113.7") as cliente:
        assert _pedir(cliente, "198.51.100.1") == 200
        assert _pedir(cliente, "198.51.100.2") == 429


def test_desde_fuera_de_la_red_de_confianza_tampoco():
    with _cliente((RED_CONECTOR,), socket="203.0.113.7") as cliente:
        assert _pedir(cliente, "198.51.100.1") == 200
        assert _pedir(cliente, "198.51.100.2") == 429


def test_dos_visitantes_tras_el_conector_tienen_cuotas_independientes():
    """Verificación 2: agotar la cuota de uno no le da 429 al otro."""
    with _cliente((RED_CONECTOR,), socket=CONECTOR) as cliente:
        assert _pedir(cliente, "198.51.100.1") == 200
        assert _pedir(cliente, "198.51.100.1") == 429
        assert _pedir(cliente, "198.51.100.2") == 200


def test_tras_el_conector_sin_cabecera_cuenta_el_conector():
    with _cliente((RED_CONECTOR,), socket=CONECTOR) as cliente:
        assert _pedir(cliente) == 200
        assert _pedir(cliente) == 429


@pytest.mark.parametrize("basura", ["no-es-una-ip", "198.51.100.1, 10.0.0.1", "", "999.1.1.1"])
def test_una_cabecera_que_no_es_una_ip_se_ignora(basura):
    """Basura en la cabecera no abre un cubo nuevo: cuenta el socket."""
    with _cliente((RED_CONECTOR,), socket=CONECTOR) as cliente:
        assert _pedir(cliente, basura) == 200
        assert _pedir(cliente, basura + " ") == 429


def test_ipv6_se_normaliza():
    """Dos escrituras de la misma IPv6 son el mismo visitante."""
    with _cliente((RED_CONECTOR,), socket=CONECTOR) as cliente:
        assert _pedir(cliente, "2001:db8::1") == 200
        assert _pedir(cliente, "2001:0db8:0000::0001") == 429


def test_el_429_del_portal_lleva_retry_after_y_cuota():
    with _cliente((), socket="203.0.113.7") as cliente:
        cliente.get("/portal/v1/_prueba")
        r = cliente.get("/portal/v1/_prueba")
    assert r.status_code == 429
    assert r.headers["content-type"].startswith("application/problem+json")
    assert int(r.headers["Retry-After"]) >= 1
    assert r.headers["X-RateLimit-Limit"] == "1"


def test_la_respuesta_correcta_lleva_las_cabeceras_de_cuota():
    with _cliente((), socket="203.0.113.7") as cliente:
        r = cliente.get("/portal/v1/_prueba")
    assert r.headers["X-RateLimit-Limit"] == "1"
    assert r.headers["X-RateLimit-Remaining"] == "0"


def test_un_trusted_proxies_mal_escrito_impide_arrancar():
    with pytest.raises(ValueError):
        _cliente(("172.22.0.0/99",), socket=CONECTOR)


def test_redes_de_confianza_acepta_cidr_e_ip_suelta():
    redes = redes_de_confianza(["172.22.0.0/16", " 10.0.0.5 ", ""])
    assert [str(r) for r in redes] == ["172.22.0.0/16", "10.0.0.5/32"]
