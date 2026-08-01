"""Supervisión del consumidor de push WSS cuando el bus no está disponible.

Sin infraestructura: se apunta a un puerto muerto de localhost (conexión
rechazada al instante). El escenario «el bus vuelve» se ejercita sustituyendo
el paso de conexión por un doble — así el supervisor y las transiciones de
alerta se prueban de forma determinista, sin depender de RabbitMQ.
"""

from __future__ import annotations

import asyncio

from api_gateway.adapters.amqp.consumer import ConsumidorPushWss
from api_gateway.application.suscripciones import GestorSuscripciones
from tests.conftest import SCHEMAS_DIR

URL_MUERTA = "amqp://guest:guest@127.0.0.1:1/"  # nadie escucha: rechazo inmediato


class NotificadorFake:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)


class ConexionFake:
    """Lo mínimo que `conectado()`/`close()` tocan de una RobustConnection."""

    def __init__(self) -> None:
        self.connected = asyncio.Event()
        self.connected.set()
        self.cerrada = False

    async def close(self) -> None:
        self.cerrada = True
        self.connected.clear()


def _consumidor(notificador: NotificadorFake) -> ConsumidorPushWss:
    return ConsumidorPushWss(
        amqp_url=URL_MUERTA,
        exchange_name="market.events",
        gestor=GestorSuscripciones(max_conexiones=5, max_suscripciones=10),
        schemas_dir=str(SCHEMAS_DIR),
        notifier=notificador,
        timeout_conexion_s=1.0,
        espera_min_s=0.01,
        espera_max_s=0.05,
    )


async def _esperar(condicion, timeout: float = 3.0) -> None:
    limite = asyncio.get_running_loop().time() + timeout
    while not condicion():
        if asyncio.get_running_loop().time() > limite:
            raise AssertionError("condición no cumplida dentro del timeout")
        await asyncio.sleep(0.01)


async def test_sin_broker_start_no_lanza_y_alerta_una_sola_vez():
    notificador = NotificadorFake()
    consumidor = _consumidor(notificador)

    await consumidor.start()  # el REST debe arrancar aunque el bus falte
    try:
        assert consumidor.conectado() is False
        assert len(notificador.alertas) == 1
        assert "broker no disponible al arrancar" in notificador.alertas[0]

        await asyncio.sleep(0.3)  # varios reintentos fallidos entre medio
        assert consumidor.conectado() is False
        assert len(notificador.alertas) == 1  # una alerta por episodio, sin tormenta
    finally:
        await consumidor.close()


async def test_el_supervisor_conecta_cuando_el_bus_vuelve_y_alerta_el_restablecimiento():
    notificador = NotificadorFake()
    consumidor = _consumidor(notificador)
    await consumidor.start()
    try:
        await _esperar(lambda: len(notificador.alertas) == 1)

        # El bus «vuelve»: el siguiente reintento del supervisor tiene éxito.
        conexion = ConexionFake()

        async def _conectar_ok() -> None:  # mismo efecto que `_conectar` real
            consumidor._conexion = conexion
            consumidor._activo = True

        consumidor._conectar = _conectar_ok

        await _esperar(consumidor.conectado)
        assert len(notificador.alertas) == 2
        assert "restablecido" in notificador.alertas[1]
    finally:
        await consumidor.close()

    assert conexion.cerrada is True
    assert consumidor.conectado() is False


def test_el_gateway_arranca_sin_bus_y_health_no_miente(repositorio, monkeypatch):
    """REST arriba aunque el bus falte, `/health` degraded y alerta emitida."""
    from fastapi.testclient import TestClient

    from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
    from api_gateway.app import create_app
    from tests.conftest import jwks_de_test, settings_de_test

    class ConsumidorRapido(ConsumidorPushWss):
        def __init__(self, **kwargs) -> None:  # sin esperar los 5 s por defecto
            super().__init__(**kwargs, timeout_conexion_s=0.5, espera_min_s=0.05)

    monkeypatch.setattr("api_gateway.app.ConsumidorPushWss", ConsumidorRapido)

    notificador = NotificadorFake()
    settings = settings_de_test(amqp_url=URL_MUERTA)
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    app = create_app(
        settings,
        validador=validador,
        repositorio=repositorio,
        notificador=notificador,
        con_amqp=True,
    )

    with TestClient(app) as cliente:  # el lifespan no debe reventar sin bus
        respuesta = cliente.get("/api/v1/health")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "degraded"
    assert cuerpo["components"] == {"database": "ok", "broker": "down", "auth": "ok"}
    assert any("broker no disponible al arrancar" in a for a in notificador.alertas)


async def test_close_cancela_el_supervisor_de_reintentos():
    notificador = NotificadorFake()
    consumidor = _consumidor(notificador)
    await consumidor.start()

    supervisor = consumidor._supervisor
    assert supervisor is not None and not supervisor.done()

    await consumidor.close()
    assert supervisor.cancelled()
    assert consumidor._supervisor is None
