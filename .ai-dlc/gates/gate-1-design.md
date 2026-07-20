# Gate 1 — Diseño (fase 02-design)

| Criterio | Estado | Evidencia |
|---|---|---|
| Arquitectura C4 (Context + Container) con trust boundaries | ✅ | `docs/architecture/c4-context.md`, `c4-container.md` |
| Threat model STRIDE del sistema | ✅ | `docs/02-design/threat-model.md` (6 componentes) |
| Amenazas priorizadas con DREAD y trazadas a controles | ✅ | T1–T12 → controles OWASP/ADR + verificación en fase 04 (T11/T12 por ADR-0012) |
| ADRs de decisiones clave (una decisión = una ADR) | ✅ | ADR-0001…0012 en `docs/00-project/adr/` (0007–0009 y 0011 *accepted* e implementadas en fase 03; 0010 *accepted* (2026-07-11) — implementada de facto; **ADR-0012** *accepted* — auth OIDC con Auth0, supersede a ADR-0003; el api-gateway pasa a Resource Server, sin implementar aún) |
| Contratos de API (REST + eventos) | ✅ | Eventos: JSON Schema formal en `schemas/` (4 de 4 definidos; 3 verificados por contract tests en productor y consumidor, `signal.v1` con contract test de forma — sin productor aún, 2026-07-20); REST: OpenAPI 3.1 en `apps/api-gateway/docs/openapi.yaml` (2026-07-17); WSS: esqueleto hasta AsyncAPI |
| Patrones de seguridad por amenaza priorizada | ✅ | Tabla en `docs/02-design/architecture.md` |
| Pendientes marcados para fase 03 | ⚠️ | Resueltos en fase 03: spike endpoint P2P ✔ (ADR-0005), bundle TLS BCV ✔ (ADR-0006), JSON Schemas de eventos ✔ (3 de 4 en `schemas/`; `p2p-snapshot` ya en v1.1 con `merchant_ref`, ADR-0011), identidad de anunciantes ✔ (ADR-0011 implementado 2026-07-06). Siguen abiertos: el **motor de reglas de señales** (RF-4) y sus umbrales HITL, y con ellos la **emisión** de `signals.emitted` — su contrato `signal.v1` ya está definido (2026-07-20), pero la fase 2 P2P/microestructura se entregó sin el evento; secret store concreto (fase 05) |

**Veredicto:** diseño completo a nivel Gate 1; los `<TODO>` listados son
entradas de la fase 03, no huecos de diseño. **Aprobado (HITL).**
**Aprobado por:** Jeremi Alcalá · **Fecha:** 2026-07-11

> Adenda 2026-07-14 (post-aprobación, sin cambio de veredicto): evidencia diagramática del
> gate completada — sequenceDiagram del flujo crítico, stateDiagram-v2 de TasaOficial
> (ADR-0007), erDiagram del dominio y classDiagram hexagonal en `architecture.md`; DFD con
> trust boundaries y quadrantChart DREAD en `threat-model.md`.
