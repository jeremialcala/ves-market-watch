# ADR-0011: Pseudonimización HMAC del identificador de anunciantes P2P

- **Estado:** accepted
- **Fecha:** 2026-07-06
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A04 (protección de datos), A01 (acceso a la clave), A08

## Contexto
Los anuncios P2P incluyen alias e identificadores del anunciante. `data-classification.md`
los marcó "no persistir salvo necesidad analítica" (`<TODO: confirmar>`), y la
implementación actual los descarta por completo (`minimizar_crudo`). Pero sin identidad
persistente se pierden capacidades analíticas valiosas: deduplicación de profundidad
(un merchant con N anuncios la infla), concentración de mercado, recurrencia de actores
manipuladores entre snapshots (amenaza T2) y auditoría forense de señales (T10).
Decisión humana tomada el 2026-07-06: conservar historia **sin** exponer identidad.

## Decisión
Persistir el identificador del anunciante únicamente como pseudónimo no reversible:

- `merchant_ref = HMAC-SHA256(clave_dedicada, advertiser_id_estable)` — truncado a
  128 bits, codificado hex. Se usa el identificador estable de la fuente, no el alias
  (los alias pueden cambiar y romperían la correlación).
- El **alias legible y el identificador crudo nunca tocan disco ni el bus** — la
  minimización actual se mantiene; solo se añade `merchant_ref`.
- La clave HMAC es dedicada (no reutiliza claves JWT/DB), vive en el secret store,
  clasificación Restringido. **Sin rotación programada**: rotarla rompe la correlación
  histórica a propósito; solo se rota ante compromiso, aceptando esa pérdida.
- `merchant_ref` viaja en `p2p.snapshot` (campo del objeto `merchant`) y se persiste en
  el crudo; hereda la retención de 90 días. Agregados derivados (concentración,
  recurrencia) pueden retener el hash ≥ 12 meses por ser ya de bajo riesgo.
- Re-identificación puntual solo hacia adelante: calcular el HMAC de un sospechoso
  conocido y comparar. No existe tabla inversa.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| HMAC con clave secreta (elegida) | Correlación histórica completa; no reversible sin clave; re-identificación dirigida posible | Gestión de una clave más; correlación se pierde si se rota | Bajo |
| Alias en claro | Máxima utilidad, legible | Dato pseudónimo de terceros en disco; riesgo de exposición ante fuga | Medio-alto |
| Hash sin clave (SHA-256 simple) | Sin gestión de clave | Reversible por fuerza bruta/diccionario sobre alias públicos del portal | Medio |
| Descarte total (estado actual) | Cero riesgo | Sin dedup, concentración, recurrencia ni forense; T2/T10 debilitadas | Bajo pero costoso |

## Consecuencias
- Positivas: habilita indicadores de concentración y profundidad deduplicada (fase 2 del
  engine) y defensa contra manipulación recurrente, con riesgo de exposición mínimo.
- Negativas / deuda asumida: cambio de contrato `p2p-snapshot` (v1 → v1.1, aditivo);
  implementación pendiente en `ingestor-binance` (`minimizar_crudo` pasa de descartar a
  pseudonimizar); nueva clave que aprovisionar (`MERCHANT_HMAC_KEY`).
- Impacto en threat model: refuerza T2 y T10; añade activo Restringido (la clave) cubierto
  por los controles de T6 (secret store, scanning).
