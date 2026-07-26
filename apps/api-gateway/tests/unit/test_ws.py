"""Handshake y protocolo del canal WSS `/ws/v1` (in-process, sin AMQP)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
from api_gateway.app import create_app
from tests.conftest import (
    RepositorioEnMemoria,
    firmar_token,
    jwks_de_test,
    settings_de_test,
)


def _app(**cambios_settings):
    settings = settings_de_test(**cambios_settings)
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    return create_app(
        settings,
        validador=validador,
        repositorio=RepositorioEnMemoria(),
        con_amqp=False,
    )


def _conectar(cliente: TestClient, token: str):
    return cliente.websocket_connect(f"/ws/v1?token={token}")


def test_sin_token_cierra_4401(cliente):
    with pytest.raises(WebSocketDisconnect) as exc:
        with cliente.websocket_connect("/ws/v1"):
            pass
    assert exc.value.code == 4401


def test_token_invalido_cierra_4401(cliente):
    with pytest.raises(WebSocketDisconnect) as exc:
        with _conectar(cliente, firmar_token(exp_en=timedelta(minutes=-1))):
            pass
    assert exc.value.code == 4401


def test_sin_permiso_stream_cierra_4403(cliente):
    with pytest.raises(WebSocketDisconnect) as exc:
        with _conectar(cliente, firmar_token(permisos=["read:rates"])):
            pass
    assert exc.value.code == 4403


def test_suscripcion_valida_confirma(cliente):
    with _conectar(cliente, firmar_token()) as ws:
        ws.send_json({"action": "subscribe", "topics": ["signals", "indicators"]})
        respuesta = ws.receive_json()
        assert respuesta == {
            "type": "subscribed",
            "topics": ["indicators", "signals"],
        }


def test_topico_fuera_de_whitelist_produce_error_sin_cerrar(cliente):
    with _conectar(cliente, firmar_token()) as ws:
        ws.send_json({"action": "subscribe", "topics": ["interno.privado"]})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"action": "subscribe", "topics": ["signals"]})
        assert ws.receive_json()["type"] == "subscribed"


def test_mensaje_ilegible_produce_error(cliente):
    with _conectar(cliente, firmar_token()) as ws:
        ws.send_text("esto no es json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"action": "otra-cosa", "topics": []})
        assert ws.receive_json()["type"] == "error"


def test_limite_de_conexiones_cierra_1008():
    app = _app(wss_max_conexiones=1)
    with TestClient(app) as cliente:
        token = firmar_token()
        with _conectar(cliente, token):
            # la 2ª conexión del mismo sub se acepta y se cierra con 1008
            with _conectar(cliente, token) as segunda:
                with pytest.raises(WebSocketDisconnect) as exc:
                    segunda.receive_json()
                assert exc.value.code == 1008


def test_token_que_expira_cierra_4401():
    app = _app()
    with TestClient(app) as cliente:
        # 3 s de vida: margen holgado para el handshake/subscribe bajo carga,
        # y el cierre por expiración llega igual dentro del test.
        with _conectar(cliente, firmar_token(exp_en=timedelta(seconds=3))) as ws:
            ws.send_json({"action": "subscribe", "topics": ["signals"]})
            assert ws.receive_json()["type"] == "subscribed"
            with pytest.raises(WebSocketDisconnect) as exc:
                # el siguiente frame es el cierre por expiración
                while True:
                    ws.receive_json()
            assert exc.value.code == 4401
