"""Consumidor de push WSS contra RabbitMQ real: evento válido llega al
suscriptor, evento inválido contra su schema se descarta (A05/A08), y una
caída del bus se sobrevive (alerta, `/health` honesto y consumo reanudado)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta

import aio_pika
import pytest

from api_gateway.adapters.amqp.consumer import ConsumidorPushWss
from api_gateway.application.suscripciones import GestorSuscripciones
from api_gateway.domain.modelos import Usuario
from tests.conftest import SCHEMAS_DIR, evento_senal

pytestmark = pytest.mark.integration


class CanalFake:
    def __init__(self) -> None:
        self.enviados: list[dict] = []

    async def enviar_json(self, mensaje: dict) -> None:
        self.enviados.append(mensaje)

    async def cerrar(self, codigo: int, razon: str) -> None:  # pragma: no cover
        pass


class NotificadorFake:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)


def _suscriptor(gestor: GestorSuscripciones, topicos: list[str]) -> CanalFake:
    canal = CanalFake()
    gestor.conectar(
        Usuario(
            sub="auth0|tester",
            permisos=frozenset({"stream:events"}),
            exp=datetime.now(UTC) + timedelta(minutes=10),
        ),
        canal,
    )
    gestor.suscribir(canal, topicos)
    return canal


async def _publicar(url: str, evento: dict) -> None:
    conexion = await aio_pika.connect(url)
    try:
        canal = await conexion.channel()
        exchange = await canal.declare_exchange(
            "market.events", aio_pika.ExchangeType.TOPIC, durable=True
        )
        await exchange.publish(
            aio_pika.Message(body=json.dumps(evento).encode()),
            routing_key=evento["event_type"],
        )
    finally:
        await conexion.close()


async def _esperar(condicion, timeout: float = 5.0) -> None:
    limite = asyncio.get_event_loop().time() + timeout
    while not condicion():
        if asyncio.get_event_loop().time() > limite:
            raise AssertionError("condición no cumplida dentro del timeout")
        await asyncio.sleep(0.05)


async def test_evento_valido_llega_al_suscriptor_y_el_invalido_se_descarta(
    amqp_listo,
):
    gestor = GestorSuscripciones(max_conexiones=5, max_suscripciones=10)
    canal = _suscriptor(gestor, ["signals"])

    consumidor = ConsumidorPushWss(
        amqp_url=amqp_listo,
        exchange_name="market.events",
        gestor=gestor,
        schemas_dir=str(SCHEMAS_DIR),
    )
    await consumidor.start()
    try:
        assert consumidor.conectado() is True

        evento = evento_senal()
        await _publicar(amqp_listo, evento)
        await _esperar(lambda: canal.enviados)
        mensaje = canal.enviados[0]
        assert mensaje["topic"] == "signals"
        assert mensaje["event_id"] == evento["event_id"]
        assert mensaje["data"]["type"] == "correccion_inminente"

        invalido = evento_senal()
        del invalido["payload"]["evidence"]  # rompe el contrato signal.v1
        await _publicar(amqp_listo, invalido)
        await asyncio.sleep(1.0)
        assert len(canal.enviados) == 1  # el inválido nunca se difundió
    finally:
        await consumidor.close()
    assert consumidor.conectado() is False


async def test_sobrevive_a_una_caida_del_bus_y_reanuda_el_push(amqp_listo):
    """Caída del bus → alerta + `/health` honesto → reconexión → sigue difundiendo.

    La caída se simula cortando el transporte por debajo (lo mismo que hace
    `RobustConnection.reconnect` internamente): el gateway no distingue eso de
    un RabbitMQ reiniciado.
    """
    gestor = GestorSuscripciones(max_conexiones=5, max_suscripciones=10)
    canal = _suscriptor(gestor, ["signals"])
    notificador = NotificadorFake()

    consumidor = ConsumidorPushWss(
        amqp_url=amqp_listo,
        exchange_name="market.events",
        gestor=gestor,
        schemas_dir=str(SCHEMAS_DIR),
        notifier=notificador,
        reconexion_s=0.5,
    )
    await consumidor.start()
    try:
        assert consumidor.conectado() is True
        assert notificador.alertas == []

        await consumidor._conexion.transport.connection.close(
            ConnectionError("caída simulada del bus")
        )

        # Antes del fix, `conectado()` miraba `is_closed` y seguía diciendo que
        # sí: /health reportaba «broker ok» con el push muerto.
        await _esperar(lambda: not consumidor.conectado(), timeout=10)
        assert any("conexión con el bus perdida" in a for a in notificador.alertas)

        await _esperar(consumidor.conectado, timeout=30)
        assert any("restablecido" in a for a in notificador.alertas)

        # Cola efímera, binding y consumidor restaurados: se publica en bucle
        # porque el exchange descarta lo que llegue antes de que el binding
        # esté de vuelta (no hay cola que lo reciba).
        evento = evento_senal()
        recibido = lambda: any(  # noqa: E731
            m["event_id"] == evento["event_id"] for m in canal.enviados
        )
        limite = asyncio.get_event_loop().time() + 15
        while not recibido():
            if asyncio.get_event_loop().time() > limite:
                raise AssertionError("el push no se reanudó tras la reconexión")
            await _publicar(amqp_listo, evento)
            await asyncio.sleep(0.5)
    finally:
        await consumidor.close()
