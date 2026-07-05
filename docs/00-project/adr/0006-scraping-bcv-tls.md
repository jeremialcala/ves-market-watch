# ADR-0006: Obtención de la tasa oficial desde el sitio del BCV y manejo de TLS

- **Estado:** accepted
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A04, A08, A10

## Contexto
El BCV publica la tasa oficial VES/USD en su sitio web (bcv.org.ve). No hay API pública.
El certificado TLS del sitio ha presentado problemas históricos (cadenas incompletas /
emisores no confiados por defecto), lo que suele tentar a deshabilitar la verificación —
inaceptable porque abriría la puerta a inyectar una tasa falsa (T1).

## Decisión
Scraping HTML 2×/hora con: (1) verificación TLS contra un bundle explícito que ancla la
CA/certificado esperado del BCV — nunca `verify=False` global; (2) extracción por selector
con fallback regex; (3) validación de plausibilidad (variación máx. 20 % configurable
frente a la última tasa válida) antes de publicar; valores anómalos quedan en estado
`suspect` para revisión humana; (4) estado `stale` visible para consumidores si la fuente
falla de forma prolongada.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Scraping con TLS anclado (elegida) | Fuente primaria oficial; control total | Frágil ante cambios de HTML | Bajo con pinning + validación de rango |
| Deshabilitar verificación TLS | "Funciona" pese al cert roto | MITM trivial → tasa falsa | **Alto — rechazada** |
| Fuentes secundarias (APIs de terceros que replican al BCV) | Estables | Dato no primario; integridad no verificable | Medio (A08) |

## Consecuencias
- Positivas: integridad de la referencia oficial con fuente primaria.
- Negativas / deuda asumida: mantenimiento del bundle de certificados y del parser.
- Impacto en threat model: mitiga T1 directamente; residual documentado en el estado `suspect` (HITL).
