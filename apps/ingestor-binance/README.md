# ingestor-binance

Servicio de ingesta del mercado P2P de Binance (USDT/VES): polling educado del
endpoint público de búsqueda de anuncios y publicación de `p2p.snapshot` al bus.

## Qué hace
- Cada 60 s (± jitter) consulta ambos lados (BUY/SELL, perspectiva del taker) del par
  USDT/VES, top-100 paginado, con User-Agent identificable (ADR-0005).
- Polling educado: presupuesto de requests/min, backoff exponencial con jitter ante
  429/5xx y circuit breaker con cooldown — nunca rotación de IPs (respeto ToS).
- Valida cada página contra el schema de la fuente (`schemas/binance-adv-search.response.json`):
  cambio de esquema → descarte + alerta, jamás se publica un snapshot corrupto (A10).
- Normaliza (Decimal exacto, textos de bancos/métodos sanitizados — A05) y **etiqueta**
  outliers de precio por MAD con piso de desviación relativa del 2 % (el filtrado final
  es del indicator-engine).
- Defensas de red: TLS verificado estricto, timeout y tope de bytes por respuesta.
- Persiste el snapshot crudo en `p2p_snapshots_raw` (retención 90 días, RF-5) y publica
  `p2p.snapshot` (contrato `../../schemas/p2p-snapshot.v1.json`) con publisher confirms.
- Páginas incompletas tras reintentos → snapshot marcado `partial=true`.

## Ejecutar

```sh
pip install -e .[dev]

# Sin infraestructura (consulta real a Binance, eventos por log):
python -m ingestor_binance --once --dry-run

# Producción (requiere docker compose up -d --wait en la raíz):
python -m ingestor_binance
```

Configuración por entorno: `BINANCE_P2P_URL`, `ASSET` (USDT), `FIAT` (VES),
`FETCH_INTERVAL_SECONDS` (60), `TOP_K` (100), `ROWS_PER_PAGE` (20), `MAX_RETRIES` (3),
`REQUEST_BUDGET_PER_MIN` (20), `BREAKER_THRESHOLD` (5), `BREAKER_COOLDOWN_SECONDS` (300),
`MAX_RESPONSE_BYTES` (2 MiB), `OUTLIER_MAD_K` (3.5), `AMQP_URL`, `AMQP_EXCHANGE`,
`DATABASE_URL`. Secretos por entorno (A02).

## Tests

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait                          # desde la raíz del repo
python -m pytest                                     # suite completa
```

Los fixtures de `tests/fixtures/` son respuestas **reales** del endpoint capturadas
en el spike del 2026-07-05 (ADR-0005 resuelto).

## Requisitos y diseño
- PRD: `../../docs/01-requirements/ingesta-binance-p2p.md`
- Estrategia de fuente: ADR-0005 · Amenazas T2, T7 en `../../docs/02-design/threat-model.md`
- Diseño: `docs/design.md`
