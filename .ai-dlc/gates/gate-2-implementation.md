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
| **Dependencias verificadas** | ✅ | `pip-audit` por servicio y `npm audit --audit-level=high` en cada push y PR, más pasada semanal. Excepciones **una a una y con motivo** en `scripts/npm-audit-excepciones.json`, y el auditor **falla si una deja de aplicar** (ejercitado de verdad el 2026-09-06 al cerrarse el CVE-2026-59870). **Deuda de T8 cerrada el 2026-09-08**: `requirements.lock` con hashes en los cinco servicios Python —de los que instalan CI, las imágenes y el propio auditor— y **todas** las imágenes fijadas por digest (las 4 de build, las 3 de infraestructura del compose y las 2 de servicios de CI). Detalle abajo |
| **Cobertura ≥ 80 %** | ✅ | Los **seis** proyectos, con las dos métricas (remedidas 2026-09-07). La más baja en ramas puras es 82,71 % (`indicator-engine`). El pipeline impone además un **trinquete** por servicio en su valor actual: el criterio es el 80 %, pero lo que rompe el build es cualquier retroceso |
| Código revisado (IA + humano) | ✅ | Todo el trabajo entra por PR con los tres workflows en verde; revisión humana en el merge |
| Historial del repo como documentación viva | ✅ | `docs/03-implementation/repo-history.md`, derivado de `git log` por `scripts/gitgraph_branches.py` |

## Cobertura por proyecto (2026-09-07, cifras de la propia pipeline)

| Servicio | Combinada (`src/`) | Ramas solas | ≥ 80 % |
|---|---|---|---|
| `ingestor-bcv` | 99,36 % | 96,94 % | ✔ |
| `ingestor-binance` | 99,30 % | 97,30 % | ✔ |
| `ingestor-historico` | 97,22 % | 93,43 % | ✔ |
| `api-gateway` | 92,86 % | 84,38 % | ✔ |
| `web-spa` | 92,87 % | 89,26 % | ✔ |
| `indicator-engine` | 85,89 % | **82,71 %** | ✔ |

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

## Cómo se cerró la deuda de T8 (2026-09-08)

Era la única reserva del gate: el SCA corría y rompía el build, pero auditaba lo
que se hubiera resuelto en esa ejecución. Dos corridas del mismo commit podían
instalar árboles distintos, y entonces «dependencias verificadas» no decía sobre
qué.

**Lockfiles.** `requirements.lock` en los cinco servicios, con versiones fijas y
**hashes**. Sin hashes un lock fija números pero no contenidos: un paquete
republicado con la misma versión pasaría sin que nadie se entere. Se generan
dentro de `python:3.12-slim` —la misma imagen que luego instala— con
`scripts/regenerar-locks.sh`: resolver en Windows o macOS produce otro árbol y el
`--require-hashes` de CI fallaría sin decir por qué.

Los instalan **los tres sitios que importan**: CI, las imágenes y el propio
`pip-audit`. Ese último es el que convierte el lock en garantía: el árbol
auditado es exactamente el que se despliega.

**Imágenes por digest.** Las 4 de build (`python:3.12-slim`, `node:24-alpine`,
`nginx:alpine`), las 3 de infraestructura del compose y las 2 de servicios de CI.

> **Lección, y cuesta poco escribirla.** Fijar el digest *más nuevo* del tag es
> lo primero que uno hace, y en `timescaledb` dejó la base en `FATAL: incorrect
> checksum in control file` con el contenedor en bucle. En una imagen **con
> estado**, el digest bueno es el que ya funciona contra ese directorio de datos,
> no el último publicado: actualizarlo es una migración, no un pin. Queda
> anotado en el propio `docker-compose.yml`.

**Verificación**: los cinco locks instalan con `--require-hashes` en un venv
limpio y sus suites pasan; las imágenes construyen; la pila levanta con los
digests fijados y el pipeline sigue produciendo revisiones.

**Veredicto:** los tres criterios canónicos están cubiertos y **sin reservas**
desde el 2026-09-08.

**Aprobado por:** Jeremi Alcalá · **Fecha:** 2026-09-08
