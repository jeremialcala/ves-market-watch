"""Publicador de `indicators.updated` en RabbitMQ (ADR-0004).

Mismo patrón que el publisher del ingestor-bcv: topic exchange `market.events`,
publisher confirms, mensajes persistentes, sobre estándar.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aio_pika

from indicator_engine.domain.analisis import Analisis, Escala, LecturaIndicador
from indicator_engine.domain.lectura import Lectura
from indicator_engine.domain.models import Indicador
from indicator_engine.domain.reglas import ProximidadRegla, Senal

ROUTING_KEY = "indicators.updated"
ROUTING_KEY_SIGNAL = "signals.emitted"
ROUTING_KEY_ANALISIS = "analysis.updated"
SCHEMA_VERSION = 1


def _dec(valor) -> str:
    """Decimal → string en punto fijo. `str(Decimal)` puede dar notación
    científica y todos los contratos exigen `^-?[0-9]+(\\.[0-9]+)?$`."""
    return format(valor, "f")


def construir_evento_indicadores(
    indicadores: list[Indicador],
    official_stale: bool,
    triggered_by: str,
    as_of: datetime,
) -> dict:
    """Sobre + payload del evento `indicators.updated` (schemas/indicators.v1.json)."""
    calc_version = indicadores[0].calc_version if indicadores else 1
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "as_of": as_of.isoformat(),
            "calc_version": calc_version,
            "official_stale": official_stale,
            "triggered_by": triggered_by,
            "indicators": [
                {
                    "indicator": indicador.nombre,
                    "currency": indicador.moneda,
                    # format(..., "f"): siempre punto fijo — str(Decimal) puede dar
                    # notación científica y el contrato exige ^-?[0-9]+(\.[0-9]+)?$.
                    "value": format(indicador.valor, "f"),
                }
                for indicador in indicadores
            ],
        },
    }


def construir_evento_senal(senal: Senal) -> dict:
    """Sobre + payload del evento `signals.emitted` (schemas/signal.v1.json)."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY_SIGNAL,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "type": senal.tipo,
            "direction": senal.direccion,
            "currency": senal.moneda,
            "as_of": senal.as_of.isoformat(),
            "calc_version": senal.calc_version,
            "triggered_by": senal.triggered_by,
            "evidence": {
                "rule": senal.regla,
                # format(..., "f"): punto fijo — el contrato exige ^-?[0-9]+(\.[0-9]+)?$.
                "inputs": {k: format(v, "f") for k, v in senal.inputs.items()},
            },
        },
    }


def _escala_a_dict(escala: Escala) -> dict:
    return {
        "source": escala.fuente,
        "window_days": escala.ventana_dias,
        "samples": escala.muestras,
        "min_samples": escala.muestras_minimas,
        "computed_at": (
            escala.calculada_en.isoformat() if escala.calculada_en else None
        ),
        "domain": {
            "min": _dec(escala.dominio_min),
            "max": _dec(escala.dominio_max),
        },
        "cuts": [
            {
                "key": corte.clave,
                "value": _dec(corte.valor),
                "position": _dec(corte.posicion),
            }
            for corte in escala.cortes
        ],
    }


def _lectura_a_dict(lectura: LecturaIndicador) -> dict:
    return {
        "indicator": lectura.indicador,
        "value": _dec(lectura.valor),
        "as_of": lectura.as_of.isoformat(),
        "band": lectura.banda,
        "position": _dec(lectura.posicion) if lectura.posicion is not None else None,
        "scale": _escala_a_dict(lectura.escala),
        "rules": [
            {
                "rule": regla.regla,
                "type": regla.tipo,
                "direction": regla.direccion,
                "op": regla.op,
                "threshold": _dec(regla.umbral),
                "met": regla.cumple,
                "distance": _dec(regla.distancia),
                "threshold_position": _dec(regla.posicion_umbral),
            }
            for regla in lectura.reglas
        ],
    }


def _proximidad_a_dict(proximidad: ProximidadRegla) -> dict:
    return {
        "rule": proximidad.regla,
        "type": proximidad.tipo,
        "direction": proximidad.direccion,
        "conditions_total": proximidad.total,
        "conditions_met": proximidad.cumplidas,
        "evaluable": proximidad.evaluable,
        "blocked_by": proximidad.bloqueada_por,
        "conditions": [
            {
                "indicator": cond.condicion.indicador,
                "op": cond.condicion.op,
                "threshold": _dec(cond.condicion.umbral),
                # `null`, nunca el último conocido rancio: un indicador que no
                # está vigente no tiene valor en esta revisión.
                "value": _dec(cond.valor) if cond.valor is not None else None,
                "met": cond.cumple,
                "distance": _dec(cond.distancia) if cond.distancia is not None else None,
            }
            for cond in proximidad.condiciones
        ],
    }


def _lectura_mercado_a_dict(lectura: Lectura) -> dict:
    """Ojo con el nombre: `_lectura_a_dict` es la de un MEDIDOR
    (`LecturaIndicador`); ésta es la del MERCADO. Son cosas distintas."""
    return {
        "version": lectura.lectura_version,
        "window_hours": lectura.ventana_horas,
        "regime": lectura.regimen,
        "axis_movement": lectura.eje_movimiento,
        "axis_gap": lectura.eje_brecha,
        "gauges_near_threshold": lectura.medidores_cerca,
        "claims": [
            {"code": a.codigo, "data": dict(a.datos)} for a in lectura.afirmaciones
        ],
    }


def _dec_o_nulo(valor) -> str | None:
    """`null` es legítimo: una ventana sin filas no tiene media que publicar."""
    return None if valor is None else _dec(valor)


def _historia_a_dict(lectura: Lectura) -> dict | None:
    """`gap_history`: la brecha de cada lado contra su propia historia.

    Se publican TODAS las ventanas configuradas con su `days_covered`, completas
    o no. Filtrar aquí las incompletas escondería el dato que permite al cliente
    rotular el tramo real en vez de mentir con la etiqueta.
    """
    if not lectura.historia:
        return None
    return {
        "sides": [
            {
                "side": lado.lado,
                "current": _dec_o_nulo(lado.actual),
                "references": [
                    {
                        "days_configured": ag.ventana_dias,
                        "days_covered": ag.dias_cubiertos,
                        "samples": ag.muestras,
                        "mean": _dec_o_nulo(ag.media),
                        "max": _dec_o_nulo(ag.maximo),
                        "min": _dec_o_nulo(ag.minimo),
                    }
                    for ag in lado.agregados
                ],
            }
            for lado in lectura.historia
        ]
    }


def construir_evento_analisis(
    analisis: Analisis, lectura: Lectura | None = None
) -> dict:
    """Sobre + payload del evento `analysis.updated` (schemas/analysis.v1.json).

    `reading` es aditivo y opcional: sin config de lectura el motor publica el
    mismo evento sin ese campo, y el panel de medidores no se entera.
    """
    sintesis = analisis.sintesis
    evento = {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY_ANALISIS,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "as_of": analisis.as_of.isoformat(),
            "currency": analisis.moneda,
            "calc_version": analisis.calc_version,
            "analysis_version": analisis.analysis_version,
            "ruleset_version": analisis.ruleset_version,
            "confidence": analisis.confianza,
            "official_stale": analisis.official_stale,
            "triggered_by": analisis.triggered_by,
            "indicators": [_lectura_a_dict(l) for l in analisis.indicadores],
            "rule_proximity": [_proximidad_a_dict(p) for p in analisis.proximidad],
            "summary": {
                "rules_total": sintesis.reglas_total,
                "rules_evaluable": sintesis.reglas_evaluables,
                "closest_rule": sintesis.regla_mas_cercana,
                "conditions_met": sintesis.condiciones_cumplidas,
                "conditions_total": sintesis.condiciones_totales,
                "blocked_by": sintesis.bloqueada_por,
                "rules_met": list(sintesis.reglas_cumplidas),
            },
        },
    }
    if lectura is not None:
        evento["payload"]["reading"] = _lectura_mercado_a_dict(lectura)
        historia = _historia_a_dict(lectura)
        if historia is not None:
            evento["payload"]["gap_history"] = historia
    return evento


class AmqpEventPublisher:
    """Adaptador del puerto `EventPublisher` sobre aio-pika (confirms + persistente)."""

    def __init__(self, amqp_url: str, exchange_name: str = "market.events") -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def _asegurar_canal(self) -> aio_pika.abc.AbstractExchange:
        if self._exchange is None:
            self._connection = await aio_pika.connect_robust(self._amqp_url)
            canal = await self._connection.channel(publisher_confirms=True)
            self._exchange = await canal.declare_exchange(
                self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
            )
        return self._exchange

    async def publish_indicators_updated(
        self,
        indicadores: list[Indicador],
        official_stale: bool,
        triggered_by: str,
        as_of: datetime,
    ) -> None:
        exchange = await self._asegurar_canal()
        evento = construir_evento_indicadores(indicadores, official_stale, triggered_by, as_of)
        mensaje = aio_pika.Message(
            body=json.dumps(evento, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=evento["event_id"],
            timestamp=datetime.now(UTC),
        )
        await exchange.publish(mensaje, routing_key=ROUTING_KEY)

    async def publish_signal_emitted(self, senal: Senal) -> None:
        exchange = await self._asegurar_canal()
        evento = construir_evento_senal(senal)
        mensaje = aio_pika.Message(
            body=json.dumps(evento, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=evento["event_id"],
            timestamp=datetime.now(UTC),
        )
        await exchange.publish(mensaje, routing_key=ROUTING_KEY_SIGNAL)

    async def publish_analysis_updated(self, evento: dict) -> None:
        # Recibe el sobre YA construido: su `payload` es el mismo objeto que se
        # persistió verbatim, así bus y tabla no pueden divergir (ADR-0019).
        exchange = await self._asegurar_canal()
        mensaje = aio_pika.Message(
            body=json.dumps(evento, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=evento["event_id"],
            timestamp=datetime.now(UTC),
        )
        await exchange.publish(mensaje, routing_key=ROUTING_KEY_ANALISIS)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
            self._exchange = None
