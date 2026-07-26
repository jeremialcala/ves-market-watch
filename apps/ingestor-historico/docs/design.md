# Diseño — ingestor-historico

- **Estado:** approved (implementado y verificado en vivo 2026-07-11; ADR-0013)
- **Fecha:** 2026-07-26
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** 0.3.1

Quinto servicio de la plataforma: carga **batch por demanda** de históricos de precio
USDT/VES desde exports CSV del sistema previo de captura, y cálculo de la varianza
histórica. PRD: `docs/01-requirements/ingesta-historica.md` · Decisión: ADR-0013.

A diferencia de los demás ingestores **no publica al bus**: inyectar pasado en
`market.events` dispararía el pipeline reactivo como si fuera presente (ADR-0013).
El histórico se consulta, no se reproduce. Amenaza asociada: T14 del threat model
(export malicioso), mitigada por el parseo con rechazo/descarte y la inmutabilidad.

## Capas (hexagonal)
- **Dominio** (`src/ingestor_historico/domain/`):
  - `parser.py` — parseo **adaptativo** (RF-2), funciones puras sin I/O: detección de
    columnas por heurística (nombres + fila de muestra, `MapeoColumnas`), mapas por
    banco `{:Banco valor (anotación)}` con bancos dinámicos (`EntradaBanco`), números
    con separador de miles, fechas inglesas o ISO y fallback de fecha desde el
    ObjectId. Archivo sin columna de precio ⇒ `FormatoNoSoportado` (rechazo completo,
    mensaje accionable); fila corrupta ⇒ `FilaInvalida` (descarte contado por motivo,
    sin abortar). Columnas no reconocidas se preservan crudas (JSONB).
  - `models.py` — `SnapshotHistorico` (precio base ponderado + detalle por banco) y
    `DatoBanco` (valor + anotaciones de la fuente: `low_liquidity`, `available`).
  - `estadisticas.py` — `VarianzaHistorica` (RF-4 del PRD): media, varianza muestral,
    desviación, min/max y log-retornos del precio base y por banco; filtro por rango y
    agrupación por día de mercado (zona configurable, default UTC−4). Funciones puras.
- **Aplicación** (`src/ingestor_historico/application/`): caso de uso
  `cargar_historicos.py` — mapear → normalizar → deduplicar → persistir idempotente;
  puertos en `ports.py` (lector de filas, repositorio).
- **Adaptadores** (`src/ingestor_historico/adapters/`): `csv_reader.py`, `memory.py`
  (dry-run/tests) y `timescale/` — hypertable `historical_market_snapshots`
  (migración `db/migrations/001_historical_snapshots.sql`, montada en el init del
  compose raíz).
- **CLI** (`__main__.py`): `python -m ingestor_historico cargar <export.csv>
  [--dry-run]` y `stats [--por-dia] [--json] [--desde …]`. Config por entorno:
  `DATABASE_URL` (default: compose raíz, puerto 5433) y `TZ_ORIGEN`.

## Propiedades clave
- **Idempotencia** ✔ — PK `(captured_at, source_id)` + `ON CONFLICT DO NOTHING`
  (histórico inmutable); sin columna ID en el export, `source_id` es un hash
  determinista del contenido. Recarga verificada en vivo: 0/1.064 duplicados.
- **Sin bus** ✔ — cero dependencias AMQP (`pyproject.toml` solo requiere `asyncpg`);
  el pipeline reactivo no ve el pasado (ADR-0013).
- **Entrada no confiable validada** ✔ — el export es un archivo externo (trust
  boundary 2 del C4): rechazo completo sin precio, descartes contados por motivo,
  anotaciones preservadas sin interpretar (T14, A05/A08).
- **Reproducibilidad** ✔ — la varianza se calcula siempre desde la tabla, nunca de
  estado en memoria; el mapeo de columnas detectado se loguea en cada carga.

## Verificación
- **39 tests** (unit del parser/estadísticas + integración contra TimescaleDB real).
- Verificación en vivo con el export real (1.064 filas, 2025-12-02 → 2025-12-11):
  carga completa sin descartes, recarga idempotente y varianza calculada (precio
  base: media 417.03, σ² 65.32, σ 8.08; por banco incluida).

## Pendiente
- Exponer el histórico vía api-gateway (cuando exista el servicio) si el análisis
  lo pide; hoy se consulta con `stats` o SQL directo.
- Decisión HITL sobre retención (hoy: permanente, ver tabla de persistencia en
  `docs/02-design/architecture.md`).
