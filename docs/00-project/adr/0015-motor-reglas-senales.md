# ADR-0015: Motor de reglas de señales — config YAML versionada, nivel + cooldown

- **Estado:** accepted
- **Fecha:** 2026-07-22
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Controles OWASP afectados:** A02 (config sensible), A08 (integridad), A09 (trazabilidad), ASVS V14

## Contexto
La fase 2 dejó la microestructura P2P (spread, ratio oferta/demanda, momentum, drenaje)
como indicadores, con umbrales empíricos del backtest 11–20 jul (aprobados HITL 2026-07-22,
`knowledge/metrics/microestructura-p2p.md`). Falta el motor que los evalúa y **emite**
`signals.emitted` (contrato `signal.v1`, ADR anterior; RF-4/RF-5). Hay que decidir dónde
viven las reglas, cómo se evita re-emitir la misma señal, y qué evidencia acompaña a cada
una.

## Decisión
1. **Reglas en config YAML versionada en el repo** (`apps/indicator-engine/config/senales.v1.yaml`),
   cargada al arrancar y **no editable en runtime** (ASVS V14, A02/A08). Cada regla declara
   `type`, `direction` y una lista `when` de condiciones `{indicator, op, value}` en AND.
   Subir `version` corta un ruleset nuevo; la evidencia de cada señal referencia
   `<type>@v<version>`. Un ruleset mal formado **aborta el arranque** (no produce señales
   silenciosas).
2. **Evaluación por nivel (threshold) + dedup por cooldown**, no edge-triggering con estado
   de la condición previa. Una regla dispara cuando todas sus condiciones se cumplen sobre
   la **vista de indicadores vigentes**; el mismo `type`/`currency` no se re-emite dentro de
   `cooldown_min` (default 60 min), consultado por `as_of` (tiempo de dato) en la tabla
   `signals`. Más simple y robusto que rastrear transiciones; suficiente para el arranque.
3. **Vista vigente = lote actual + histórico fresco.** Como momentum (SELL) y drenaje (BUY)
   nunca están en el mismo snapshot, el motor toma cada indicador referenciado del lote
   recién calculado o, si no está, del último valor conocido siempre que sea fresco
   (≤ `SIGNALS_MAX_AGE_MIN`, default 20 min). Un indicador ausente o rancio ⇒ su regla no
   dispara: nunca se infiere sobre datos que faltan.
4. **Umbrales v1 = backtest, calibración HITL.** Los tres tipos (`arranque_alcista`,
   `techo_inminente`, `correccion_inminente`) y sus umbrales salen del backtest y se
   recalibran subiendo la versión del ruleset, sin redeploy de código.
5. **Persistencia con evidencia en tabla `signals`** (hypertable, migración 002): cada señal
   guarda `type, direction, currency, rule, calc_version, triggered_by, evidence` (JSONB con
   regla + insumos). Es la fuente del futuro `GET /signals` del api-gateway y el estado del
   cooldown. Nunca se emite bajo `confianza_baja` (> 30 % outliers).

## Alternativas consideradas
- **Reglas en código (Python)**: más expresivas, pero cada ajuste de umbral sería un
  redeploy y no cumple "configurable sin redeploy, config versionada" (RF-4). Descartada.
- **Edge-triggering estricto** (emitir solo en la transición no-cumple→cumple): más fiel al
  "cruza de negativo" del backtest, pero exige rastrear y persistir el estado previo de cada
  condición. El cooldown por tipo cubre el objetivo real (no spamear) con mucho menos estado.
  Descartada para v1; revisable si aparecen falsos re-disparos.
- **Sin persistir señales (solo emitir al bus)**: menos infra, pero el dedup por cooldown
  necesitaría reconstruir estado desde `indicators` y el `GET /signals` del gateway quedaría
  sin fuente. Descartada.
- **Umbrales en variables de entorno**: evita un parser YAML, pero no versiona reglas
  compuestas ni deja rastro auditable por commit. Descartada.

## Consecuencias
- (+) Ajustar una señal es un commit auditable al YAML, sin tocar código ni redeploy.
- (+) Cada señal es reproducible: regla versionada + insumos exactos en la evidencia (T10).
- (+) RF-4 y RF-5 satisfechos y verificados; `signals.emitted` fluye al bus y a la tabla
  (verificado e2e en vivo).
- (−) La evaluación por nivel puede, en teoría, re-disparar al expirar el cooldown si la
  condición sigue activa; es intencional (persistencia de la condición) y acotado por el
  cooldown.
- (−) Cada evaluación añade lecturas de `indicators` para la vista vigente; despreciable al
  ritmo actual (2 snapshots/min).
- (−) Los umbrales v1 provienen de una ventana corta (208 h); tratados como punto de partida,
  a recalibrar con más historia subiendo la versión del ruleset.
