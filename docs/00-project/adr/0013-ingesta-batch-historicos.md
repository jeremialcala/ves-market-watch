# ADR-0013: Ingesta batch idempotente de históricos, con parseo adaptativo y sin publicar al bus

- **Estado:** accepted
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A05 (validación de entradas), A08 (integridad de datos), A04 (diseño seguro)

## Contexto
Existe historia del mercado USDT/VES anterior a la plataforma: exports CSV de un sistema
previo con el promedio ponderado del top-100 de órdenes y el detalle de tres bancos
principales, cada ~10 minutos (PRD ingesta histórica). Se necesita esa serie para la
varianza histórica y como línea base de los umbrales de señales (engine fase 2). Los
exports **no tienen contrato**: columnas, formatos de fecha y el conjunto de bancos
pueden variar entre archivos. Hay que decidir dónde vive el proceso, cómo tolera la
variabilidad y si el histórico entra por el mismo camino que los datos en vivo.

## Decisión
1. **Servicio propio de batch** (`apps/ingestor-historico`): CLI hexagonal
   `cargar`/`stats`, sin scheduler ni daemon. No se extiende el ingestor-binance: su
   dominio es el polling en vivo con contrato formal; mezclar backfill batch le
   agregaría un segundo ciclo de vida y otro modelo de datos.
2. **Sin publicación al bus.** Los históricos NO emiten `p2p.snapshot` ni ningún
   evento: inyectar pasado en el bus dispararía el pipeline reactivo (indicadores,
   futuras señales) como si fuera presente, violando la semántica temporal de
   `market.events` (A08). El histórico se consulta, no se reproduce.
3. **Parseo adaptativo con heurística de columnas**: detección por nombre normalizado
   + contenido de una fila de muestra; mapas por banco `{:Banco valor (anotación)}`
   con bancos dinámicos; columnas no reconocidas se preservan crudas en `extra` JSONB.
   Un archivo sin columna de precio se rechaza completo (`FormatoNoSoportado`); una
   fila ilegible se descarta con motivo sin abortar la carga.
4. **Idempotencia por PK** `(captured_at, source_id)` con `ON CONFLICT DO NOTHING`
   (nunca upsert: el histórico es inmutable). Sin columna ID, el `source_id` es un
   hash determinista del contenido de la fila.
5. **Detalle por banco en JSONB** (`banks`): el conjunto de bancos es dinámico y las
   anotaciones de la fuente (`lower liquidity`, `only N available`) son señales de
   calidad que se preservan (`low_liquidity`, `available`). Trazabilidad por carga:
   `source_file` + `loaded_at`.
6. **Varianza calculada al leer, no al cargar**: funciones puras de dominio (media,
   varianza muestral, desviación, log-retornos; global, por banco, por día de mercado
   en la zona del origen). No se materializan agregados hasta que un consumidor real
   (API/engine) lo exija.

## Alternativas consideradas
- **Extender `ingestor-binance` con un modo backfill**: reutiliza adaptadores, pero
  acopla dos ciclos de vida (daemon vs. batch) y dos modelos (anuncios individuales
  vs. agregados por banco) en un servicio; descartada.
- **Reproducir el histórico como eventos `p2p.snapshot` retro-fechados**: unificaría el
  camino de datos, pero rompe la semántica del bus (consumidores tratarían el pasado
  como presente) y el contrato v1.1 exige campos que el export no tiene
  (`merchant_ref`); descartada.
- **Script ad-hoc de una sola vez (notebook/psql)**: mínimo esfuerzo, pero hay varios
  exports y vendrán más — sin tests ni idempotencia, cada carga sería artesanal;
  descartada.
- **Esquema relacional por banco (tabla `bank_rates`)**: consultas SQL más directas,
  pero fija el conjunto de bancos y complica la adaptabilidad; el JSONB con
  `->>'rate'` cubre las consultas actuales; descartada por ahora (revisable si las
  consultas por banco se vuelven intensivas).

## Consecuencias
- (+) Recargar un export es seguro por construcción; los errores de formato son
  visibles (motivos contados) en lugar de cargas silenciosamente incompletas.
- (+) Exports futuros con columnas o bancos distintos cargan sin cambios de código, o
  fallan completos con mensaje accionable.
- (+) El pipeline en vivo queda aislado del backfill: imposible disparar señales con
  datos del pasado.
- (−) La serie histórica y la serie en vivo viven en tablas distintas
  (`historical_market_snapshots` vs. `p2p_snapshots_raw`): quien las combine (engine
  fase 2) deberá unificarlas explícitamente, decisión consciente y documentada.
- (−) Heurística de columnas puede equivocarse ante exports ambiguos → mitigación:
  log del mapeo detectado + `--dry-run`.
