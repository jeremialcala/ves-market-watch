# Gate 1 — Diseño (fase 02-design)

| Criterio | Estado | Evidencia |
|---|---|---|
| Arquitectura C4 (Context + Container) con trust boundaries | ✅ | `docs/architecture/c4-context.md`, `c4-container.md` |
| Threat model STRIDE del sistema | ✅ | `docs/02-design/threat-model.md` (6 componentes) |
| Amenazas priorizadas con DREAD y trazadas a controles | ✅ | T1–T10 → controles OWASP/ADR + verificación en fase 04 |
| ADRs de decisiones clave (una decisión = una ADR) | ✅ | ADR-0001…0011 en `docs/00-project/adr/` (0007–0009 y 0011 *accepted* e implementadas en fase 03; 0010 *proposed* — implementada de facto, pendiente aprobación) |
| Contratos de API (REST + eventos) | ✅ | Eventos: JSON Schema formal en `schemas/` (3 de 4, verificados por contract tests en productor y consumidor); REST/WSS: esqueleto en `docs/02-design/api-contracts.md` — OpenAPI formal con el api-gateway |
| Patrones de seguridad por amenaza priorizada | ✅ | Tabla en `docs/02-design/architecture.md` |
| Pendientes marcados para fase 03 | ⚠️ | Resueltos en fase 03: spike endpoint P2P ✔ (ADR-0005), bundle TLS BCV ✔ (ADR-0006), JSON Schemas de eventos ✔ (3 de 4 en `schemas/`; `p2p-snapshot` ya en v1.1 con `merchant_ref`, ADR-0011), identidad de anunciantes ✔ (ADR-0011 implementado 2026-07-06). Siguen abiertos: `signal.v1` y umbrales de señales (engine fase 2, HITL), secret store concreto (fase 05) |

**Veredicto propuesto:** diseño completo a nivel Gate 1; los `<TODO>` listados son
entradas de la fase 03, no huecos de diseño. Requiere aprobación humana.
**Aprobado por:** `<pendiente — Jeremi>` · **Fecha:** `<pendiente>`
