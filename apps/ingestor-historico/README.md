# ingestor-historico

Carga batch de **históricos de precio del mercado USDT/VES** desde exports CSV de
sistemas previos, y cálculo de la **varianza histórica** (global, por banco, por día).
PRD: `docs/01-requirements/ingesta-historica.md` · Decisión de diseño: ADR-0013.

A diferencia de los demás ingestores, es un proceso **batch por demanda** (CLI, sin
scheduler) y **no publica eventos al bus**: el histórico se consulta, no se reproduce.

## Uso

```bash
# Cargar un export (idempotente: recargar no duplica)
python -m ingestor_historico cargar "ruta/al/query_result_….csv"

# Inspección previa sin tocar la base
python -m ingestor_historico cargar export.csv --dry-run

# Varianza histórica de lo cargado
python -m ingestor_historico stats                 # serie completa
python -m ingestor_historico stats --por-dia       # por día de mercado (UTC-4)
python -m ingestor_historico stats --json --desde 2025-12-05T00:00:00-04:00
```

Configuración por entorno: `DATABASE_URL` (default: compose de la raíz, puerto 5433)
y `TZ_ORIGEN` (zona de las fechas naive del export, default `-04:00`).

## Formato de entrada (adaptativo)

El export de referencia trae `ID, BaseWeightedAverage, AverageRatePerBank,
TotalOrderSize, CreatedAt, VolumePerBank`, pero las columnas se detectan por
heurística (nombres + contenido de una fila de muestra): funciona con cabeceras
renombradas, bancos nuevos en los mapas `{:Banco valor (anotación)}`, números con
separador de miles y fechas en inglés («December 2, 2025, 5:20 PM») o ISO 8601.
Las anotaciones `lower liquidity` / `only N available` se preservan por banco. Un
archivo sin columna de precio se rechaza completo; una fila ilegible se descarta con
motivo sin abortar. El mapeo detectado se loguea en cada carga.

## Arquitectura

Hexagonal, mismas convenciones que los demás servicios:
- `domain/parser.py` — parseo adaptativo (funciones puras, sin I/O).
- `domain/estadisticas.py` — varianza, desviación y log-retornos (puras).
- `application/cargar_historicos.py` — caso de uso: mapear → normalizar → deduplicar
  → persistir idempotente.
- `adapters/` — CSV, memoria (--dry-run/tests) y TimescaleDB
  (`historical_market_snapshots`, migración en `db/migrations/`).

## Tests

```bash
python -m pytest tests/unit -q          # sin infraestructura
docker compose up -d --wait             # (raíz del repo)
python -m pytest tests -q               # incluye integración contra TimescaleDB
```
