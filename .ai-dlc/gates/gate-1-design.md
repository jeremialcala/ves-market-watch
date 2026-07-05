# Gate 1 — Diseño (fase 02-design)

| Criterio | Estado | Evidencia |
|---|---|---|
| Arquitectura C4 (Context + Container) con trust boundaries | ✅ | `docs/architecture/c4-context.md`, `c4-container.md` |
| Threat model STRIDE del sistema | ✅ | `docs/02-design/threat-model.md` (6 componentes) |
| Amenazas priorizadas con DREAD y trazadas a controles | ✅ | T1–T10 → controles OWASP/ADR + verificación en fase 04 |
| ADRs de decisiones clave (una decisión = una ADR) | ✅ | ADR-0001…0006 en `docs/00-project/adr/` |
| Contratos de API (REST + eventos) | ✅ (esqueleto) | `docs/02-design/api-contracts.md` — OpenAPI/AsyncAPI formal en fase 03 |
| Patrones de seguridad por amenaza priorizada | ✅ | Tabla en `docs/02-design/architecture.md` |
| Pendientes marcados para fase 03 | ⚠️ | Spike endpoint P2P (ADR-0005), bundle TLS BCV (ADR-0006), JSON Schemas de eventos, secret store concreto, umbrales de señales (HITL) |

**Veredicto propuesto:** diseño completo a nivel Gate 1; los `<TODO>` listados son
entradas de la fase 03, no huecos de diseño. Requiere aprobación humana.
**Aprobado por:** `<pendiente — Jeremi>` · **Fecha:** `<pendiente>`
