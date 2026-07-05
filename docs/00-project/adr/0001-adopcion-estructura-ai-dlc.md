# ADR-0001: Adopción de la estructura de repositorio AI-DLC

- **Estado:** accepted
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 00-project
- **Controles OWASP afectados:** transversal (A01–A10 vía gates)

## Contexto
El proyecto arranca desde cero y debe seguir la metodología AI-DLC: seguridad por diseño,
test-first y gates humanos por fase. Nota: el template `project-template` no estaba
accesible en esta sesión; la estructura se reconstruyó desde las plantillas de referencia
del skill. `<TODO: sincronizar con el template canónico cuando esté disponible>`.

## Decisión
Adoptar la estructura estándar AI-DLC: `.ai-dlc/` (gates y plantillas), `docs/` por fase
(00-project → 06-monitoring) y `apps/<servicio>/` con `src/`, pirámide `tests/` y `docs/`.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Estructura AI-DLC | Gates de seguridad, trazabilidad, consistencia entre proyectos | Overhead documental inicial | Bajo |
| Repo ad-hoc | Arranque más rápido | Sin gates, seguridad reactiva | Alto |

## Consecuencias
- Positivas: cada fase deja artefactos verificables; seguridad trazable a OWASP.
- Negativas / deuda asumida: divergencia posible con el template canónico hasta sincronizar.
- Impacto en threat model: los gates fuerzan su existencia y actualización.
