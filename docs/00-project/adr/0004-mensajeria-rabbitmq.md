# ADR-0004: RabbitMQ como bus de eventos de mercado

- **Estado:** accepted
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A01, A05, A08

## Contexto
La arquitectura es reactiva: los ingestores producen eventos y el motor de indicadores y
el gateway los consumen. Se necesita entrega confiable, DLQ y desacoplamiento. Alineado
con el servicio de referencia del template (worker AMQP).

## Decisión
RabbitMQ con topic exchange `market.events` (routing keys `p2p.snapshot`,
`official.rate.updated`, `indicators.updated`, `signals.emitted`), publisher confirms,
colas durables por consumidor y DLQ `market.events.dlq`. Usuarios AMQP dedicados por
servicio con permisos mínimos (ingestores: solo publish; engine: consume+publish;
gateway: solo consume). Todos los eventos llevan sobre con `event_id` y `schema_version`.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| RabbitMQ (elegida) | DLQ nativa, routing por tópico, ligero, conocido por el equipo | Un servicio más que operar | Bajo con vhost/usuarios mínimos |
| Redis pub/sub | Mínima infraestructura | Sin persistencia ni DLQ; pérdida de eventos | Medio (pérdida de integridad) |
| Kafka | Replay/histórico de eventos | Sobredimensionado para el volumen esperado | Bajo pero operación costosa |

## Consecuencias
- Positivas: desacoplamiento real; reproceso vía DLQ; backpressure natural.
- Negativas / deuda asumida: operación del broker (TLS interno `<TODO: definir en 05-deployment>`).
- Impacto en threat model: mitiga T5; los permisos mínimos limitan movimiento lateral.
