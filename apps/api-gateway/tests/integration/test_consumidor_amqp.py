"""Consumidor de push WSS contra RabbitMQ real: evento válido llega al
suscriptor; evento inválido contra su schema se descarta (A05/A08)."""

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
    canal = CanalFake()
    gestor.conectar(
        Usuario(
            sub="auth0|tester",
            permisos=frozenset({"stream:events"}),
            exp=datetime.now(UTC) + timedelta(minutes=10),
        ),
        canal,
    )
    gestor.suscribir(canal, ["signals"])

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
