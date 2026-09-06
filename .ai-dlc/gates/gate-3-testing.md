# Gate 3 — Pruebas (fase 04-testing)

**Criterios canónicos AI-DLC:** tests pasando + DAST limpio + rendimiento dentro de los SLOs.

> **Este gate se llamaba «Gate 2» en el repo hasta el 2026-09-06.** Era un error
> de numeración: la fase 04-testing cierra el Gate 3, y el Gate 2 es el de la
> fase 03-implementation. Lo que el plan de pruebas listaba bajo «Gate 2»
> mezclaba criterios de ambos; al renumerar se repartieron por criterio y no por
> renombrado. Detalle en `docs/04-testing/plan-de-pruebas.md`, y el gate vecino
> en `.ai-dlc/gates/gate-2-implementation.md`.

## Criterios canónicos

| Criterio | Estado | Evidencia |
|---|---|---|
| **Tests pasando** | ✅ | 1.263 tests en los seis proyectos, suite completa (`integration` y `e2e` incluidas) en cada push y PR. **Cero `skip`/`xfail` incondicionales** en el monorepo. E2E autenticado en vivo contra el tenant y el gateway reales, en el pipeline desde el 2026-08-20 |
| **DAST limpio** | ✅ | ZAP guiado por el OpenAPI en `seguridad.yml` (2026-09-06), en dos pasadas. **0 Alto, 0 Medio, 2 Bajo** aceptados con motivo en `scripts/triar_dast.py`. 116 reglas activas en PASS contra respuestas 200 reales |
| **Rendimiento dentro de los SLOs** | ⚠️ | **4 de 5 cumplen; 1 no.** Medidos el 2026-09-06, no estimados |

## Los cinco SLO, medidos

| SLO | Origen | Medido | |
|---|---|---|---|
| REST consultas actuales ≤ 300 ms (p95) | `api-streaming.md` | **44 ms** (n=300) | ✅ |
| REST histórico ≤ 2 s | `api-streaming.md` | **757 ms** (n=90) | ✅ |
| Push WSS ≤ 1 s desde publicación interna | `api-streaming.md` | **11 ms** (n=42) | ✅ |
| Ciclos de ingesta completados ≥ 99 % | `ingesta-binance-p2p.md` | **99,72 %** (n=2.174) | ✅ |
| **Ingesta consulta→evento ≤ 5 s (p95)** | `ingesta-binance-p2p.md` | **7,16 s** (n=4.342) | ❌ |

Reproducibles con `scripts/medir_slo_rest.py`, `medir_slo_wss.py` y
`medir_slo_ingesta.py`. Hasta el 2026-09-06 estaban **declarados y nunca
contrastados**: el plan decía «herramienta sugerida: `locust`/`k6`» y ahí se
quedó.

## El bloqueo: un SLO contra una ADR

El de ingesta no es un defecto que se arregle escribiendo código. **El 34,6 % de
las capturas supera los 5 s**, y la causa son las 10 peticiones HTTP secuenciales
por lado (`ROWS_PER_PAGE=20`, top-200): la latencia de Binance multiplicada por
diez.

Eso **choca con ADR-0005** («polling P2P educado»). El SLO se escribió antes que
la decisión de paginar con cortesía y hoy son incompatibles. Las salidas son
tres y ninguna es técnica:

1. **Relajar el SLO** a lo que la cortesía permite, con enmienda al PRD.
2. **Subir `ROWS_PER_PAGE`**, menos peticiones por lado — revisar contra los
   límites de Binance y la intención de ADR-0005.
3. **Paralelizar páginas**, que es justo lo que la ADR quiso evitar.

**Es una decisión de producto con una ADR de por medio, y no se cierra ajustando
el número que peor quede.** Mientras no se tome, este criterio queda en ⚠️.

## Pendientes que NO bloquean

| Pendiente | Nota |
|---|---|
| Deuda de T8: lockfiles + imágenes por digest | Pertenece al **Gate 2**, y allí está anotada. Se repite aquí porque degrada la reproducibilidad de todo lo que este gate mide |
| Recalibración HITL de umbrales del ruleset | Requiere datos de producción |
| Rampa teal del mapa de calor por el validador de dataviz | Medida a mano, no validada; el script del skill no está en la máquina donde se hizo el cambio |
| Escenario de **saturación** (T4) bajo carga | Lo medido es latencia en régimen normal. Cómo se degrada bajo carga es otra pregunta y sigue sin respuesta |
| Repetir los SLO REST contra el hostname público | Lo medido es el gateway en `localhost:8800`; nginx y el túnel quedan fuera |

## Cerrados durante la preparación de este gate

- ~~Marcador `security` en `api-gateway`~~ — 17 tests (2026-09-06), nacidos de un
  defecto real que encontró el DAST.
- ~~CVE-2026-59870 (`js-yaml`)~~ — el parche llegó a la línea 4.x; excepción
  retirada el 2026-09-06.
- ~~Llevar el e2e en vivo al pipeline~~ — 2026-08-20, con sus secretos dados de
  alta el 2026-08-23.
- ~~DAST~~ — 2026-09-06. Era el hueco real del gate.

**Veredicto:** dos de los tres criterios canónicos están cumplidos y verificados.
El tercero está **medido**, que es un salto respecto a estar declarado, y arroja
un incumplimiento cuya resolución es una decisión de producto pendiente.

**NO aprobado todavía.** Requiere la decisión sobre el SLO de ingesta y la
aprobación HITL.

**Aprobado por:** `<pendiente>` · **Fecha:** `<pendiente>`
