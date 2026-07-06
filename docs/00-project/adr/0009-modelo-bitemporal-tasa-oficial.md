# ADR-0009: Modelo bitemporal para la tasa oficial (value_date + captured_at)

- **Estado:** accepted (implementado en `apps/ingestor-bcv`, 2026-07-05)
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A08, A09

## Contexto
Origina: PRD `ingesta-bcv.md` RF-2 y RF-5. El BCV publica la tasa con **fecha-valor**
que suele ser el día hábil *siguiente* a la publicación (la tasa de mañana se conoce hoy).
Dos preguntas distintas necesitan respuesta: "¿qué tasa regía el día X?" (dimensión de
validez) y "¿cuándo lo supo el sistema?" (dimensión de conocimiento — clave para auditar
la brecha calculada en un instante dado y para reproducir indicadores históricos).

## Decisión
Persistir la tasa oficial de forma bitemporal y append-only en `official_rates`:

- `value_date` — fecha-valor declarada por el BCV (dimensión de validez).
- `captured_at` — timestamp de captura por el ingestor (dimensión de conocimiento).
- Nunca UPDATE: correcciones o re-publicaciones del BCV insertan una fila nueva; la
  vigente para un `value_date` es la de mayor `captured_at` con estado `valid`.
  Única excepción, auditada: la resolución HITL (ADR-0007) actualiza `status` y las
  columnas de auditoría de una sospecha — valor y dimensiones temporales permanecen
  inmutables.
- La API sirve por `value_date` e incluye `captured_at` en metadatos; el motor de
  indicadores usa la tasa *conocida en el momento del cálculo* (as-of `captured_at`),
  garantizando que un indicador recalculado reproduce el valor original.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Bitemporal append-only (elegida) | Auditoría completa; indicadores reproducibles; correcciones sin pérdida | Consultas algo más complejas (última versión por value_date) | Bajo |
| Solo captured_at | Simple | No responde "tasa vigente el día X"; brecha mal calculada en fines de semana/feriados | Medio (A08: cálculo incorrecto) |
| Solo value_date con sobrescritura | Tabla mínima | Correcciones del BCV destruyen historia; señales pasadas no reproducibles | Alto (A09: sin auditoría) |

## Consecuencias
- Positivas: cumple RF-3 del motor (reproducibilidad con `calc_version` + as-of); auditoría regulatoria-grade de la referencia oficial.
- Negativas / deuda asumida: vista o función `current_official_rate(value_date)` a mantener; feriados bancarios venezolanos afectan qué `value_date` está vigente — `<TODO: definir fuente del calendario de feriados (HITL)>`.
- Impacto en threat model: refuerza T1 (una tasa falsa detectada después es corregible sin borrar evidencia) y T10 (trazabilidad).
