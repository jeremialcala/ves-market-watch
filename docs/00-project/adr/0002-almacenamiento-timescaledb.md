# ADR-0002: PostgreSQL + TimescaleDB para series de tiempo

- **Estado:** accepted
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A01 (roles), A04 (cifrado), A05 (queries parametrizadas)

## Contexto
La plataforma persiste tasas, snapshots P2P, indicadores y señales como series de tiempo,
con consultas históricas agregadas por intervalo (5m/1h/1d) y además datos relacionales
(consumidores OAuth2, bancos, métodos de pago).

## Decisión
PostgreSQL 16 + extensión TimescaleDB: hypertables para series, continuous aggregates
para intradía, políticas de retención nativas (90 días snapshots crudos), y tablas
relacionales normales para clientes/catálogos en la misma instancia.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| PostgreSQL + TimescaleDB | Un solo motor para series + relacional; SQL; retención nativa; maduro | Extensión a operar/actualizar | Bajo (ecosistema PG, roles granulares) |
| MongoDB time-series | Snapshots JSON flexibles | Dos modelos de consulta; agregados menos expresivos para OHLC/ventanas | Medio (config por defecto laxa histórica) |
| InfluxDB | Optimizado para métricas | Mal ajuste para datos relacionales (clientes, bancos); Flux nicho | Medio |

## Consecuencias
- Positivas: una sola base que cubre todos los modelos; roles PG por servicio (mínimo privilegio).
- Negativas / deuda asumida: gestión de la extensión en upgrades.
- Impacto en threat model: T9 (SQLi) mitigado con queries parametrizadas; roles separados reducen elevación.
