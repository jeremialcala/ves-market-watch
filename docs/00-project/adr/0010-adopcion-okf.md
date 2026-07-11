# ADR-0010: Adopción del Open Knowledge Format (OKF) para el contexto del proyecto

- **Estado:** accepted (2026-07-11) — implementada de facto desde 2026-07-05; aprobada en el cierre de Gate 1
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** transversal (00-project)
- **Controles OWASP afectados:** A09 (indirecto — trazabilidad del conocimiento)

## Contexto
El proyecto se desarrolla con asistencia de agentes de IA a lo largo de sesiones
independientes. El contexto (qué está implementado, qué eventos existen, qué significa
cada tabla e indicador) está disperso entre PRDs, ADRs, READMEs de servicios y el
CHANGELOG; cada sesión nueva debe redescubrirlo. Google publicó OKF v0.1
(junio 2026), una especificación abierta que formaliza el patrón "LLM-wiki":
conocimiento como directorio de markdown con frontmatter YAML, portable y consumible
por cualquier agente sin SDK.
Referencia: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
(spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf).

## Decisión
Mantener un bundle OKF v0.1 en `knowledge/` como **capa de contexto curado** del repo:

- Un concepto = un archivo con frontmatter (`type` obligatorio; `title`, `description`,
  `resource`, `tags`, `timestamp`). Secciones: `services/`, `events/`, `tables/`, `metrics/`.
- `index.md` por directorio (navegación progresiva) y `log.md` raíz (historia del contexto).
- El bundle **resume y enlaza**, no duplica: la fuente de verdad siguen siendo los
  documentos AI-DLC (`docs/`) y el código. Cada concepto declara su estado
  (implementado/diseñado) y enlaza PRD/ADR/migración que lo fundamenta.
- Regla de mantenimiento: todo cambio que altere servicios, eventos, tablas o indicadores
  actualiza el concepto afectado y añade entrada en `knowledge/log.md` (misma disciplina
  que el CHANGELOG, pero orientada a contexto, no a releases).

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Bundle OKF en el repo (elegida) | Estándar abierto emergente; versionado con el código; consumible por cualquier agente/humano sin tooling | Disciplina de mantenimiento; spec v0.1 puede cambiar | Bajo (markdown en repo) |
| Solo CLAUDE.md / AGENTS.md | Mínimo | Monolítico, sin grafo ni tipos; no interoperable entre herramientas | Bajo |
| Wiki externa (Notion/Confluence) | UI rica | Fuera del repo: se desincroniza, requiere cuenta/integración | Medio (fuga de contexto interno) |
| No hacer nada | Cero esfuerzo | Redescubrimiento de contexto en cada sesión; deriva doc↔código | Bajo pero costoso |

## Consecuencias
- Positivas: onboarding de agentes/personas en un solo punto de entrada (`knowledge/index.md`);
  el grafo de links hace explícitas dependencias entre servicios, eventos, tablas y métricas.
- Negativas / deuda asumida: tercera superficie documental (docs AI-DLC + CHANGELOG + knowledge);
  el bundle miente si no se mantiene — la regla de actualización es obligatoria en cada PR.
- Impacto en threat model: sin cambios (contenido Interno, sin secretos; misma clasificación
  que el resto del repo). No incluir en el bundle datos Confidenciales/Restringidos.
