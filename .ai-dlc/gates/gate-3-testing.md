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
| **Tests pasando** | ✅ | 1.529 tests en los seis proyectos, suite completa (`integration` y `e2e` incluidas) en cada push y PR. **Cero `skip`/`xfail` incondicionales** en el monorepo. E2E autenticado en vivo contra el tenant y el gateway reales, en el pipeline desde el 2026-08-20 |
| **DAST limpio** | ✅ | ZAP guiado por el OpenAPI en `seguridad.yml` (2026-09-06), en dos pasadas. **0 Alto, 0 Medio, 2 Bajo** aceptados con motivo en `scripts/triar_dast.py`. 116 reglas activas en PASS contra respuestas 200 reales |
| **Rendimiento dentro de los SLOs** | ✅ | **Los 5 cumplen.** Medidos el 2026-09-06, no estimados; el de ingesta tras ADR-0026 |

## Los cinco SLO, medidos

| SLO | Origen | Medido | |
|---|---|---|---|
| REST consultas actuales ≤ 300 ms (p95) | `api-streaming.md` | **44 ms** (n=300) | ✅ |
| REST histórico ≤ 2 s | `api-streaming.md` | **757 ms** (n=90) | ✅ |
| Push WSS ≤ 1 s desde publicación interna | `api-streaming.md` | **11 ms** (n=42) | ✅ |
| Ciclos de ingesta completados ≥ 99 % | `ingesta-binance-p2p.md` | **99,72 %** (n=2.174) | ✅ |
| Ingesta consulta→evento ≤ 5 s (p95) | `ingesta-binance-p2p.md` | ~~7,16 s~~ → **1,40 s** (ADR-0026) | ✅ |

Reproducibles con `scripts/medir_slo_rest.py`, `medir_slo_wss.py` y
`medir_slo_ingesta.py`. Hasta el 2026-09-06 estaban **declarados y nunca
contrastados**: el plan decía «herramienta sugerida: `locust`/`k6`» y ahí se
quedó.

## El bloqueo, y cómo se resolvió

El SLO de ingesta se medía en **7,16 s** contra un techo de 5 s, con el **34,6 %**
de las capturas por encima. No era un defecto que se arreglara escribiendo
código: la causa eran las 10 peticiones HTTP secuenciales por lado, y eso **es**
ADR-0005 («polling P2P educado») haciendo lo que decidió hacer. El SLO y la ADR
se habían escrito sin mirarse.

Se resolvió el 2026-09-06 con **ADR-0026**, que enmienda a ADR-0005: las páginas
pasan a pedirse en **lotes concurrentes de 4**. Medido tras desplegarlo,
**p95 de 1,40 s y 0 % de capturas por encima del umbral**, con 300 respuestas
todas 200 y ningún 429.

**Lo admisible del cambio es que las peticiones por minuto no suben** —20 por
ciclo contra 40 de presupuesto, cada una consumiendo su unidad igual que antes—.
Lo que sube es el pico instantáneo, que es el vector de T7, y por eso el lote es
4 y no 10.

**Queda una vigilancia abierta, y este gate no debería firmarse sin ella:** la
muestra que respalda el cumplimiento son 28 capturas en 15 minutos, contra las
4.342 en 41 h del incumplimiento. La mejora es inequívoca, pero **la tasa de 429
y las aperturas del breaker hay que volver a mirarlas pasados unos días**: el
riesgo que ADR-0026 asume no se manifiesta en quince minutos, y su reversión está
escrita (bajar `PAGINAS_EN_PARALELO`).

## Pendientes que NO bloquean

| Pendiente | Nota |
|---|---|
| ~~Deuda de T8: lockfiles + imágenes por digest~~ | **Cerrada el 2026-09-08** (Gate 2). Lo que este gate mide es ya reproducible: los tests corren sobre el árbol del lock |
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

**Veredicto:** los **tres criterios canónicos están cumplidos y verificados**.
Los cinco SLO están medidos —no declarados— y los cinco se cumplen; el último
pasó a cumplirse con ADR-0026 el mismo día en que se midió el incumplimiento.

**Pendiente de aprobación HITL**, con una reserva que conviene resolver antes de
firmar: confirmar el p95 de ingesta sobre una corrida larga y comprobar que la
tasa de 429 no ha subido tras ADR-0026.

> **Esa reserva ya tiene fecha y ejecutor.** `scripts/verificar_slo_ingesta.py`
> contesta las dos preguntas y sale 0 solo si ambas van bien. Queda programado
> para el **2026-09-07 a las 09:00 VET** —unas 15 h de operación paralela, ~900
> ciclos— en una tarea de Windows (`Criterio-VerificarSLO-Ingesta`), que deja el
> informe en `informes/`. **No se hizo como rutina en la nube a propósito**: esas
> corren en infraestructura de Anthropic y no alcanzan el Docker del despliegue,
> así que habrían certificado nada.
>
> Se borra con `Unregister-ScheduledTask -TaskName Criterio-VerificarSLO-Ingesta`.

**Aprobado por:** `<pendiente>` · **Fecha:** `<pendiente>`
