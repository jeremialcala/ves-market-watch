"""E2E: ciclo completo con RabbitMQ y TimescaleDB reales (docker compose).

Único doble: el sitio del BCV, servido por un HTTP local con el fixture de la
página real (mutable para simular cambios de tasa entre sincronizaciones).
"""

import asyncio
import json
import uuid
from decimal import Decimal

import aio_pika
import pytest

from ingestor_bcv.adapters.amqp.publisher import ROUTING_KEY, AmqpEventPublisher
from ingestor_bcv.adapters.bcv.client import FuenteBcv
from ingestor_bcv.adapters.memory import LoggingAlertNotifier
from ingestor_bcv.adapters.timescale.repository import TimescaleRateRepository
from ingestor_bcv.application.revalidate_rates import RevalidarTasasSospechosas
from ingestor_bcv.application.sync_rates import SincronizarTasasOficiales
from ingestor_bcv.domain.models import EstadoTasa

pytestmark = pytest.mark.e2e

MONEDAS = ["CNY", "EUR", "RUB", "TRY", "USD"]


@pytest.fixture
async def sitio_bcv_local(bcv_html):
    """HTTP local que sirve la página del BCV; `estado["html"]` permite mutarla."""
    estado = {"html": bcv_html}

    async def manejar(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            await reader.readuntil(b"\r\n\r\n")
            cuerpo = estado["html"].encode("utf-8")
            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/html; charset=utf-8\r\n"
                b"Content-Length: " + str(len(cuerpo)).encode() + b"\r\n"
                b"Connection: close\r\n\r\n" + cuerpo
            )
            await writer.drain()
        finally:
            writer.close()

    servidor = await asyncio.start_server(manejar, "127.0.0.1", 0)
    puerto = servidor.sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{puerto}/", estado
    servidor.close()
    await servidor.wait_closed()


@pytest.fixture
async def consumidor(amqp_listo):
    """Exchange e2e único + cola consumidora, como lo haría el indicator-engine."""
    nombre_exchange = f"market.events.e2e-{uuid.uuid4().hex[:8]}"
    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        nombre_exchange, aio_pika.ExchangeType.TOPIC, durable=True
    )
    cola = await canal.declare_queue(exclusive=True, auto_delete=True)
    await cola.bind(exchange, routing_key=ROUTING_KEY)

    yield nombre_exchange, cola

    await canal.exchange_delete(nombre_exchange)
    await conexion.close()


async def _consumir_todos(cola) -> list[dict]:
    eventos = []
    while True:
        try:
            mensaje = await cola.get(timeout=1)
        except aio_pika.exceptions.QueueEmpty:
            return eventos
        await mensaje.ack()
        eventos.append(json.loads(mensaje.body))


async def test_ciclo_completo_contra_infraestructura_real(
    sitio_bcv_local, consumidor, pool, amqp_listo
):
    url_sitio, estado = sitio_bcv_local
    nombre_exchange, cola = consumidor

    publisher = AmqpEventPublisher(amqp_listo, nombre_exchange)
    caso = SincronizarTasasOficiales(
        source=FuenteBcv(url_sitio, ca_bundle="system"),
        publisher=publisher,
        repository=TimescaleRateRepository(pool),
        notifier=LoggingAlertNotifier(),
    )
    try:
        # 1ª sincronización: todas las monedas son nuevas → 5 eventos + 5 filas valid.
        resumen = await caso.ejecutar()
        assert resumen.error is None
        assert resumen.publicadas == MONEDAS

        eventos = await _consumir_todos(cola)
        assert sorted(e["payload"]["currency"] for e in eventos) == MONEDAS
        assert {e["payload"]["status"] for e in eventos} == {"valid"}
        assert await pool.fetchval(
            "SELECT count(*) FROM official_rates WHERE status = 'valid'"
        ) == 5

        # 2ª sin cambios: heartbeats, 0 eventos, pero el histórico crece (RF-5).
        resumen = await caso.ejecutar()
        assert resumen.publicadas == []
        assert resumen.heartbeats == MONEDAS
        assert await _consumir_todos(cola) == []
        assert await pool.fetchval("SELECT count(*) FROM official_rates") == 10

        # 3ª con USD disparado +35 %: queda suspect, no se publica, la referencia
        # válida no se contamina.
        estado["html"] = estado["html"].replace("667,05000000", "900,00000000")
        resumen = await caso.ejecutar()
        assert resumen.sospechosas == ["USD"]
        assert resumen.publicadas == []
        assert await _consumir_todos(cola) == []

        fila = await pool.fetchrow(
            "SELECT rate, status FROM official_rates "
            "WHERE currency = 'USD' ORDER BY captured_at DESC LIMIT 1"
        )
        assert fila["status"] == EstadoTasa.SUSPECT.value
        assert fila["rate"] == Decimal("900.00")
        repo = TimescaleRateRepository(pool)
        assert (await repo.ultima_tasa_valida("USD")).valor == Decimal("667.05")

        # 4ª fase — HITL: el operador aprueba la sospecha; se publica el evento
        # y la tasa aprobada pasa a ser la referencia (ADR-0007).
        revalidar = RevalidarTasasSospechosas(publisher, repo)
        aprobada = await revalidar.aprobar("USD", "e2e", "devaluación real confirmada")
        assert aprobada.valor == Decimal("900.00")

        eventos = await _consumir_todos(cola)
        assert len(eventos) == 1
        assert eventos[0]["payload"]["currency"] == "USD"
        assert Decimal(eventos[0]["payload"]["rate"]) == Decimal("900.00")
        assert eventos[0]["payload"]["status"] == "valid"
        assert (await repo.ultima_tasa_valida("USD")).valor == Decimal("900.00")
        auditoria = await pool.fetchrow(
            "SELECT resolved_by, resolution_note FROM official_rates "
            "WHERE currency = 'USD' AND status = 'valid' "
            "ORDER BY captured_at DESC LIMIT 1"
        )
        assert auditoria["resolved_by"] == "e2e"

        # 5ª — el sitio sigue en 900: heartbeat contra la nueva referencia, sin evento.
        resumen = await caso.ejecutar()
        assert "USD" in resumen.heartbeats
        assert resumen.publicadas == []
        assert resumen.sospechosas == []
        assert await _consumir_todos(cola) == []
    finally:
        await publisher.close()
