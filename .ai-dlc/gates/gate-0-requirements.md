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
| Pendientes que NO bloquean pero requieren decisión humana | ⚠️ | ~~Retención de alias de anunciantes~~ → **resuelto 2026-07-06** (ADR-0011: pseudónimo `merchant_ref`, implementado en `ingestor-binance`). Siguen abiertos (charter): identificación de apps consumidoras; validación humana del marco legal cambiario |

**Veredicto propuesto:** listo para aprobación humana (Human-in-the-Loop).
**Aprobado por:** `<pendiente — Jeremi>` · **Fecha:** `<pendiente>`
