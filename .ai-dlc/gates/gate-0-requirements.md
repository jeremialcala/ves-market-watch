# Gate 0 — Requisitos (fase 01-requirements)

Aprobación humana requerida antes de pasar a diseño detallado/implementación.

| Criterio | Estado | Evidencia |
|---|---|---|
| Requisitos funcionales documentados por funcionalidad | ✅ | 6 PRDs en `docs/01-requirements/` (incl. `ingesta-historica.md`, aprobado HITL 2026-07-11, ADR-0013; y `web-spa-dashboard.md`, incorporado por la enmienda del charter de 2026-07-27, ADR-0017) |
| Requisitos de seguridad mapeados a OWASP ASVS + Top 10 | ✅ | Tabla ASVS en cada PRD |
| Escenarios negativos / de abuso por funcionalidad | ✅ | Sección dedicada en cada PRD |
| Threat assessment inicial | ✅ | Riesgos en charter + STRIDE en `docs/02-design/threat-model.md` |
| Datos clasificados | ✅ | `docs/00-project/data-classification.md` |
| Charter y glosario (lenguaje ubicuo) | ✅ | `docs/00-project/charter.md`, `glossary.md` |
| Pendientes que NO bloquean pero requieren decisión humana | ⚠️ | ~~Retención de alias de anunciantes~~ → **resuelto 2026-07-06** (ADR-0011). ~~Naturaleza de los consumidores~~ → **resuelto 2026-07-11** (ADR-0012: usuarios humanos autenticados vía Auth0/OIDC); ~~nombrar la app consumidora concreta~~ → **resuelto 2026-07-27** (ADR-0017: el dashboard `apps/web-spa` es la primera app consumidora); identificar a los **usuarios** del piloto sigue `<TODO>` en charter. Aceptado como no-bloqueante en la aprobación, pendiente de ratificación detallada por Jeremi: marco legal cambiario (postura vigente: solo datos públicos, sin ejecución de operaciones; PII de usuarios delegada a Auth0 y minimizada — ADR-0012) |

**Veredicto:** requisitos completos; los pendientes son no-bloqueantes. **Aprobado (HITL).**
**Aprobado por:** Jeremi Alcalá · **Fecha:** 2026-07-11

> Adenda 2026-07-14 (post-aprobación, sin cambio de veredicto): evidencia diagramática del
> gate completada — mindmap de alcance (charter), journey (api-streaming), requirementDiagram
> RF↔ASVS (motor-indicadores), DFD y quadrant DREAD (threat-model). La aprobación original se
> dio sobre la misma sustancia en tablas.

> Nota: la aprobación cubre la versión de requisitos actualizada por ADR-0012 (consumidores
> = usuarios humanos vía Auth0; nuevos escenarios de abuso en `api-streaming.md`).
