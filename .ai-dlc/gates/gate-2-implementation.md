# Gate 2 — Implementación (fase 03-implementation)

**Criterios canónicos AI-DLC:** SAST limpio + dependencias verificadas + 80 % de cobertura.

> **Este archivo nace el 2026-09-06, y nace tarde.** El proyecto venía llamando
> «Gate 2» al de la fase 04-testing, así que el gate de la fase 03 nunca tuvo
> documento propio aunque sus criterios llevaban cumplidos desde el 2026-08-04.
> Lo que sigue no es trabajo nuevo: es evidencia ya existente puesta en su sitio.
> El plan de pruebas conserva las referencias a Gate 2 que **sí** le corresponden
> —la cobertura y los controles SAST/SCA— porque son criterio de esta fase.

| Criterio | Estado | Evidencia |
|---|---|---|
| **SAST limpio** | ✅ | CodeQL en `seguridad.yml` sobre `python` y `javascript-typescript`, con **umbral de severidad sobre el SARIF que rompe el build** (2026-08-04) — no como aviso. En verde en cada PR desde entonces |
| **Dependencias verificadas** | ⚠️ | `pip-audit` por servicio y `npm audit --audit-level=high` en cada push y PR, más pasada semanal. Excepciones **una a una y con motivo** en `scripts/npm-audit-excepciones.json`, y el auditor **falla si una deja de aplicar** (ejercitado de verdad el 2026-09-06 al cerrarse el CVE-2026-59870). Abierto: la deuda de T8 — sin lockfiles en los 5 servicios Python y sin imágenes por digest |
| **Cobertura ≥ 80 %** | ✅ | Los **seis** proyectos, con las dos métricas (2026-08-04). La más baja en ramas puras es 82,71 % (`indicator-engine`). El pipeline impone además un **trinquete** por servicio en su valor actual: el criterio es el 80 %, pero lo que rompe el build es cualquier retroceso |
| Código revisado (IA + humano) | ✅ | Todo el trabajo entra por PR con los tres workflows en verde; revisión humana en el merge |
| Historial del repo como documentación viva | ✅ | `docs/03-implementation/repo-history.md`, derivado de `git log` por `scripts/gitgraph_branches.py` |

## Cobertura por proyecto (2026-08-04, cifras de la propia pipeline)

| Servicio | Combinada (`src/`) | Ramas solas | ≥ 80 % |
|---|---|---|---|
| `ingestor-bcv` | 99,36 % | 96,94 % | ✔ |
| `ingestor-binance` | 99,27 % | 96,77 % | ✔ |
| `ingestor-historico` | 97,22 % | 93,43 % | ✔ |
| `web-spa` | 94,89 % | 88,13 % | ✔ |
| `api-gateway` | 92,65 % | 84,38 % | ✔ |
| `indicator-engine` | 85,88 % | **82,71 %** | ✔ |

Las columnas no medían lo mismo y por eso se separan: en los cinco servicios
Python la cifra que se venía citando es la **combinada** de `coverage`
(sentencias + ramas sobre `src/`); en el SPA, `vitest` reporta ramas aparte y es
esa la que aplica el umbral. **El criterio se cumple con cualquiera de las dos.**

## Pendiente que NO bloquea el veredicto

**Deuda de T8 — lockfiles y digests.** Los cinco servicios Python declaran rangos
de versión y las imágenes van por tag, incluida `timescaledb:latest-pg16`. El SCA
audita entonces *lo que se instala en cada ejecución*, no un árbol reproducible:
dos corridas del mismo commit pueden no auditar lo mismo. Se acepta como deuda
declarada, no como criterio cumplido, y **queda escrito aquí para que no se
pierda al cerrar el gate**. Es cambio de repositorio, no de pipeline.

**Veredicto:** los tres criterios canónicos están cubiertos; la única reserva es
la deuda de T8, que degrada la garantía de «dependencias verificadas» sin
anularla —el SCA corre y rompe el build; lo que falta es reproducibilidad—.

**Pendiente de aprobación HITL.** *(Gate 0 y Gate 1 llevan firma y fecha; esta
fila se rellena al aprobar.)*

**Aprobado por:** `<pendiente>` · **Fecha:** `<pendiente>`
