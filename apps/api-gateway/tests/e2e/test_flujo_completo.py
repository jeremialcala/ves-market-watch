"""E2E del gateway completo contra TimescaleDB y RabbitMQ reales:
REST autenticado sirve lo sembrado en la DB, /health reporta todo ok, y un
evento publicado en el bus llega como push por el WSS suscrito."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
from api_gateway.app import create_app
from tests.conftest import (
    evento_senal,
    firmar_token,
    jwks_de_test,
    settings_de_test,
)
from tests.contract.test_rest_contract import validar_contra

pytestmark = pytest.mark.e2e


def _app(dsn: str, amqp: str):
    settings = settings_de_test(
        database_url=dsn, amqp_url=amqp, wss_ping_segundos=1
    )
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    return create_app(settings, validador=validador, con_amqp=True)


async def _sembrar(dsn: str) -> None:
    import asyncpg

    ahora = datetime.now(UTC)
    conexion = await asyncpg.connect(dsn)
    try:
        await conexion.execute(
            "TRUNCATE official_rates, indicators, signals, p2p_snapshots_raw"
        )
        await conexion.execute(
            "INSERT INTO official_rates (captured_at, currency, rate, value_date, status)"
            " VALUES ($1, 'USD', '417.03', $2, 'valid')",
            ahora - timedelta(hours=1),
            date.today(),
        )
        await conexion.execute(
            "INSERT INTO indicators (as_of, indicator, currency, value, calc_version)"
            " VALUES ($1, 'official_rate', 'USD', '417.03', 1)",
            ahora - timedelta(minutes=5),
        )
        await conexion.execute(
            "INSERT INTO signals (emitted_at, as_of, type, direction, currency,"
            " rule, calc_version, triggered_by, evidence)"
            " VALUES ($1, $2, 'correccion_inminente', 'bajista', 'VES',"
            " 'correccion_inminente@v1', 1, gen_random_uuid(), $3::jsonb)",
            ahora,
            ahora - timedelta(minutes=1),
            json.dumps(
                {"rule": "correccion_inminente@v1", "inputs": {"p2p_spread_pct": "-0.8"}}
            ),
        )
    finally:
        await conexion.close()


async def _publicar_senal(amqp: str) -> dict:
    import aio_pika

    evento = evento_senal("techo_inminente")
    conexion = await aio_pika.connect(amqp)
    try:
        canal = await conexion.channel()
        exchange = await canal.declare_exchange(
            "market.events", aio_pika.ExchangeType.TOPIC, durable=True
        )
        await exchange.publish(
            aio_pika.Message(body=json.dumps(evento).encode()),
            routing_key="signals.emitted",
        )
    finally:
        await conexion.close()
    return evento


def test_rest_y_push_wss_de_punta_a_punta(timescale_listo, amqp_listo):
    asyncio.run(_sembrar(timescale_listo))
    app = _app(timescale_listo, amqp_listo)
    auth = {"Authorization": f"Bearer {firmar_token()}"}
    ahora = datetime.now(UTC)

    with TestClient(app) as cliente:
        # salud: DB, broker y auth arriba
        salud = cliente.get("/api/v1/health")
        assert salud.status_code == 200
        assert salud.json() == {
            "status": "ok",
            "components": {"database": "ok", "broker": "ok", "auth": "ok"},
        }

        # REST sirve lo sembrado, conforme al contrato
        tasa = cliente.get("/api/v1/rates/official/current", headers=auth)
        assert tasa.status_code == 200
        validar_contra("OfficialRateCurrent", tasa.json())
        assert tasa.json()["rate"] == "417.03000000"

        senales = cliente.get(
            "/api/v1/signals",
            headers=auth,
            params={
                "from": (ahora - timedelta(hours=1)).isoformat(),
                "to": (ahora + timedelta(minutes=5)).isoformat(),
            },
        )
        assert senales.status_code == 200
        validar_contra("SignalPage", senales.json())
        assert senales.json()["data"][0]["type"] == "correccion_inminente"

        # push WSS: evento en el bus → frame en el canal suscrito
        token = firmar_token()
        with cliente.websocket_connect(f"/ws/v1?token={token}") as ws:
            ws.send_json({"action": "subscribe", "topics": ["signals"]})
            assert ws.receive_json()["type"] == "subscribed"

            evento = asyncio.run(_publicar_senal(amqp_listo))

            # los pings (1 s) acotan la espera; el push llega entre ellos
            for _ in range(15):
                frame = ws.receive_json()
                if frame.get("topic") == "signals":
                    break
            else:
                raise AssertionError("el push de signals nunca llegó por el WSS")
            assert frame["event_id"] == evento["event_id"]
            assert frame["data"]["type"] == "techo_inminente"
