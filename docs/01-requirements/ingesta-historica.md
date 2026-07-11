# PRD — Ingesta de Data Histórica de Precio (backfill USDT/VES)

- **Estado:** review — implementado en `apps/ingestor-historico` (2026-07-11);
  pendiente de aprobación HITL (Gate 0 incremental)
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Versión:** 0.1.0

## Problema y contexto
Antes de que existiera la plataforma, un sistema previo capturó cada ~10 minutos el
mercado USDT/VES: el **promedio ponderado base** del top-100 de órdenes combinado con el
detalle de **tres bancos principales** (tasa, volumen y señales de liquidez por banco).
Esa historia vive en exports CSV (p. ej. `query_result_2026-07-11T….csv`) y hoy no es
consultable: sin ella no hay **varianza histórica** del mercado contra la cual comparar
lo que capturan los ingestores en vivo, ni línea base para los umbrales de señales del
indicator-engine (fase 2).

Los exports no tienen un contrato formal: las columnas, su orden y hasta el conjunto de
bancos pueden cambiar entre exportaciones. El proceso debe **adaptarse a la información
que recibe**, no asumir un layout fijo.

## Objetivos / No-objetivos
- Objetivos: cargar exports CSV históricos en TimescaleDB de forma **idempotente**
  (recargar un archivo no duplica); parsear de forma **adaptativa** (detección de
  columnas por heurística, bancos dinámicos, anotaciones de liquidez); exponer la
  **varianza histórica** del precio (global, por banco, por día) vía CLI.
- No-objetivos: ingesta continua (eso es de los ingestores en vivo); publicar eventos
  al bus por datos históricos (ADR-0013); formatos binarios (xlsx → exportar a CSV
  primero); imputación de huecos en la serie (los huecos se preservan tal cual).

## Usuarios y escenarios

### Escenarios positivos
1. El operador ejecuta `cargar <export.csv>`: el proceso detecta columnas, normaliza
   1.064 filas, persiste y reporta rango de fechas y bancos detectados.
2. El operador vuelve a ejecutar la misma carga: 0 insertadas, 1.064 duplicadas — la
   base queda igual.
3. El operador pide `stats --por-dia` y obtiene media, varianza y desviación del precio
   base y de cada banco, agrupadas por día de mercado (hora de Venezuela).
4. Llega un export con columnas renombradas o un banco nuevo: el mapeo heurístico las
   detecta y el banco aparece en el detalle sin cambios de código.

### Escenarios negativos / abuso (requerido por Gate 0)
1. **Archivo ajeno** (un export de otra tabla, sin columna de precio): se rechaza
   completo con `FormatoNoSoportado` y un mensaje que lista las cabeceras — nunca se
   cargan datos sin sentido que contaminen las estadísticas.
2. **Filas corruptas** (precio ilegible o ≤ 0, fecha irrecuperable): se descartan y se
   contabilizan por motivo; la carga del resto continúa (una fila mala no aborta el
   backfill).
3. **CSV manipulado con valores extremos**: el histórico se almacena tal cual (crudo
   auditable con `source_file` y `loaded_at`), pero las estadísticas son de solo
   lectura sobre lo cargado — no alimentan señales automáticas ni el bus (ADR-0013),
   así que un histórico envenenado no puede disparar acciones en vivo.
4. **Inyección vía CSV** (fórmulas, SQL): los valores se convierten a tipos
   (`Decimal`, `datetime`) antes de tocar la base; todo INSERT/SELECT es parametrizado
   (A05) y lo no reconocido queda en JSONB como texto inerte.

## Requisitos funcionales
- **RF-1** Cargar un export CSV a la hypertable `historical_market_snapshots` de forma
  idempotente: PK `(captured_at, source_id)` + `ON CONFLICT DO NOTHING`; sin columna
  ID se deriva un hash determinista del contenido de la fila.
- **RF-2** Parseo adaptativo: detección de columnas por heurística sobre nombres y una
  fila de muestra (precio, fecha, volumen total, mapas por banco); mapas
  `{:Banco valor (anotación)}` con conjunto de bancos dinámico; números con separador
  de miles; fechas en formato inglés del export o ISO 8601; fallback de fecha desde el
  timestamp embebido en un ObjectId. Columnas no reconocidas se conservan crudas
  (`extra` JSONB).
- **RF-3** Preservar las señales de calidad de la fuente por banco: `lower liquidity`
  y `only N available` viajan como `low_liquidity` / `available` en el detalle JSONB.
- **RF-4** Varianza histórica vía CLI `stats`: n, media, varianza muestral, desviación,
  min/max del precio base y por banco; desviación de log-retornos entre snapshots
  consecutivos; filtro por rango, agrupación por día de mercado (zona configurable,
  default UTC−4) y salida JSON para consumo programático.
- **RF-5** Resumen de carga auditable: filas totales, insertadas, duplicadas,
  descartadas por motivo, rango de fechas y bancos detectados; `--dry-run` parsea y
  resume sin persistir.

## Requisitos de seguridad (mapeados a OWASP ASVS)
| Riesgo | Control | ASVS |
|---|---|---|
| Inyección vía contenido del CSV | Conversión a tipos + consultas parametrizadas; texto no reconocido inerte en JSONB | V5 (validación), V5.3.4 |
| Datos históricos falsos que contaminan decisiones | Carga manual por el operador, sin publicación al bus (ADR-0013); trazabilidad `source_file`/`loaded_at` para purgar una carga | V8 (protección de datos) |
| Credenciales de DB | `DATABASE_URL` por entorno (secret store en despliegue), nunca hardcodeada | V2.10, A02 |
| Pérdida de integridad al recargar | Idempotencia por PK; la recarga jamás sobreescribe (`DO NOTHING`, no upsert) | V8.1 |
| Datos personales | El export no contiene PII (agregados de mercado por banco) — clasificación: Interno | V8.3 |

## Métricas de éxito
- El export de referencia (1.064 filas, 2025-12-02 → 2025-12-11) carga completo, con
  0 descartes y recarga idempotente verificada.
- `stats` reproduce la varianza del período sin acceso al CSV original.
- Un export con columnas distintas carga sin cambios de código o se rechaza con un
  mensaje accionable (nunca carga a medias en silencio).

## Dependencias y riesgos
- TimescaleDB (ADR-0002); migración `001_historical_snapshots.sql` montada en el
  compose de desarrollo.
- Riesgo: heurística de columnas equivocada ante un export ambiguo → mitigado con el
  log del mapeo detectado en cada carga y `--dry-run` para inspección previa.
- Riesgo: zonas horarias mezcladas entre exports → `TZ_ORIGEN`/`--tz` explícitos;
  fechas naive siempre se interpretan en la zona declarada (default UTC−4).
- Futuro (engine fase 2): usar esta serie como línea base de varianza para calibrar
  umbrales de señales — fuera del alcance de este PRD.
