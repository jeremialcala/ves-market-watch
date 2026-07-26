# ADR-0008: Publicación de eventos solo-en-cambio con heartbeat operativo

- **Estado:** accepted (implementado en `apps/ingestor-bcv`, 2026-07-05)
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A09, A10

## Contexto
Origina: PRD `ingesta-bcv.md` RF-4 y escenario positivo 3. La tasa BCV cambia ~1 vez por
día hábil pero se consulta 48 veces/día. Publicar cada captura generaría 47 eventos
redundantes diarios que el motor de indicadores reprocesaría sin efecto, y ocultaría la
diferencia entre "la fuente vive" y "hay dato nuevo".

## Decisión
Separar señal de dominio y señal operativa:

- **Evento de dominio** `official.rate.updated`: solo cuando cambia `rate` o `value_date`
  respecto a la última tasa `valid` persistida (comparación contra DB, no contra memoria,
  para sobrevivir reinicios sin re-publicar).
- **Heartbeat operativo**: cada ciclo exitoso sin cambio emite métrica
  (`bcv_last_successful_check`) hacia observabilidad — no entra al bus de eventos.
  Materializado hoy como `last_success_at` en `official_rate_source_health` más una
  fila por captura en `official_rates`; el export a un sistema de métricas llega en
  fase 05-deployment.
- La ausencia de heartbeat > umbral dispara la alerta y el estado `stale` (ADR-0007);
  la ausencia de eventos de dominio no significa nada por sí sola.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Solo-en-cambio + heartbeat métrico (elegida) | Bus limpio; semántica clara; idempotencia trivial | Requiere comparación contra último estado persistido | Bajo |
| Publicar cada captura | Implementación mínima | 47 eventos/día redundantes; consumidores deben deduplicar; ruido en auditoría | Medio (A09: señal útil enterrada en ruido) |
| Heartbeat como evento en el bus | Un solo canal | Mezcla dominio con operación; consumidores lo ignoran o lo malinterpretan | Bajo pero contamina contratos |

## Consecuencias
- Positivas: el motor de indicadores solo reacciona a cambios reales; los logs de dominio son auditoría directa de variaciones de la tasa.
- Negativas / deuda asumida: dos rutas de salida (bus + métricas) que mantener; el arranque en frío debe leer la última tasa de DB antes del primer ciclo.
- Impacto en threat model: reduce superficie de T5 (menos eventos = menos ventana de inyección/duplicados) y refuerza T10 (trazabilidad limpia).
