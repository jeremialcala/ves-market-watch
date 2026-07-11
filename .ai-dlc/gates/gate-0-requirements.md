# Gate 0 — Requisitos (fase 01-requirements)

Aprobación humana requerida antes de pasar a diseño detallado/implementación.

| Criterio | Estado | Evidencia |
|---|---|---|
| Requisitos funcionales documentados por funcionalidad | ✅ | 4 PRDs en `docs/01-requirements/` |
| Requisitos de seguridad mapeados a OWASP ASVS + Top 10 | ✅ | Tabla ASVS en cada PRD |
| Escenarios negativos / de abuso por funcionalidad | ✅ | Sección dedicada en cada PRD |
| Threat assessment inicial | ✅ | Riesgos en charter + STRIDE en `docs/02-design/threat-model.md` |
| Datos clasificados | ✅ | `docs/00-project/data-classification.md` |
| Charter y glosario (lenguaje ubicuo) | ✅ | `docs/00-project/charter.md`, `glossary.md` |
| Pendientes que NO bloquean pero requieren decisión humana | ⚠️ | ~~Retención de alias de anunciantes~~ → **resuelto 2026-07-06** (ADR-0011). ~~Naturaleza de los consumidores~~ → **resuelto 2026-07-11** (ADR-0012: usuarios humanos autenticados vía Auth0/OIDC); nombrar los consumidores concretos sigue `<TODO>` en charter (por definir en piloto). Aceptado como no-bloqueante en la aprobación, pendiente de ratificación detallada por Jeremi: marco legal cambiario (postura vigente: solo datos públicos, sin ejecución de operaciones; PII de usuarios delegada a Auth0 y minimizada — ADR-0012) |

**Veredicto:** requisitos completos; los pendientes son no-bloqueantes. **Aprobado (HITL).**
**Aprobado por:** Jeremi Alcalá · **Fecha:** 2026-07-11

> Nota: la aprobación cubre la versión de requisitos actualizada por ADR-0012 (consumidores
> = usuarios humanos vía Auth0; nuevos escenarios de abuso en `api-streaming.md`).
