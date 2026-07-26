# Diseño — ingestor-binance

- **Estado:** approved (implementado y verificado en vivo, 2026-07-06; ADR-0011 incluida)
- **Fecha:** 2026-07-14
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** 0.2.0

## Capas (hexagonal)
- **Dominio** (`src/ingestor_binance/domain/`): `Lado` (perspectiva del taker),
  `Anuncio`, `SnapshotP2P`; `normalizacion.py` con sanitización de textos (A05)
  y `etiquetar_outliers()` — z-score modificado por MAD (k=3.5) con dos defensas:
  fallback de desviación relativa cuando MAD=0 (mayoría de precios idénticos +
  uno manipulado) y piso del 2 % (mercados agrupados: el spike real mostró
  clusters de ±0.3 % donde el MAD puro marcaría anuncios legítimos).
- **Pseudonimización (ADR-0011)**: `Pseudonimizador` — `merchant_ref =
  HMAC-SHA256(MERCHANT_HMAC_KEY, advertiser.userNo)` truncado a 128 bits (32 hex),
  nunca sobre el alias (cambia y rompería la correlación). Va en el evento
  (contrato v1.1, aditivo) y en el crudo persistido; el alias/ID crudo no toca
  disco ni bus. La clave es Restringida, sin rotación programada; sin ella el
  servicio no arranca (fail fast).
- **Aplicación** (`src/ingestor_binance/application/`): caso de uso
  `CapturarSnapshot.ejecutar(lado)` — breaker → fetch → normalizar → etiquetar →
  persistir crudo → publicar. Puertos: `P2PMarketSource` (la fuente es
  sustituible sin tocar dominio, ADR-0005), `EventPublisher`,
  `SnapshotRepository`, `AlertNotifier`.
- **Adaptadores** (`src/ingestor_binance/adapters/`):
  - `binance/client.py` — POST paginado a adv/search: presupuesto de requests,
    backoff+jitter (429/5xx/red), tope de bytes por streaming (zip-bomb),
    TLS estricto, validación por página contra el schema de la fuente.
  - `binance/resilience.py` — `con_backoff`, `CircuitBreaker` (cerrado→abierto→
    half-open, alerta solo al abrir), `PresupuestoDeRequests` (ventana 60 s);
    reloj/sleep inyectables (todo determinista en tests).
  - `amqp/publisher.py` — `p2p.snapshot` con confirms y sobre estándar.
  - `timescale/repository.py` — `p2p_snapshots_raw` (JSONB, retención 90 días).
  - `memory.py` — adaptadores para `--dry-run` y unit tests.

## Manejo de fallos (escenarios del PRD)
- Cambio de esquema de la fuente → `EsquemaFuenteInvalido`: descarte + alerta,
  nunca se publica (1).
- Página fallida tras reintentos → snapshot `partial=true` (2); todas fallidas →
  `FuenteNoDisponible` → cuenta para el breaker; al abrir, alerta única y los
  ciclos se saltan hasta el cooldown (3).
- Respuesta gigante → corte por tope de bytes y aborto del ciclo (4).
- Presupuesto agotado a mitad de ciclo → se publica lo capturado como parcial.

## Resuelto de la fase 03
- ✔ Spike del endpoint (2026-07-05): HTTP 200, forma confirmada, fixtures reales
  versionados; semántica de `tradeType` documentada (perspectiva del taker).
- ✔ JSON Schema `p2p-snapshot.v1` (contrato en `schemas/` raíz) + schema de la
  respuesta de la fuente (local al adaptador).

## Pendiente
- Consumo de `p2p.snapshot` en el indicator-engine (fase 2 del engine): precio de
  referencia, brecha, spreads, coalescing, `low_confidence`.
- Export de métricas operativas (RF-6) a un sistema de métricas (fase 05).
