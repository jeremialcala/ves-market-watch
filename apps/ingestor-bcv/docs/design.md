# Diseño — ingestor-bcv

## Capas (hexagonal)
- **Dominio** (`src/ingestor_bcv/domain/`): `TasaOficial` (moneda ISO 4217, valor,
  fecha-valor, estado: valid|suspect|stale) y `validar_plausibilidad()`.
- **Aplicación** (`src/ingestor_bcv/application/`): caso de uso
  `SincronizarTasasOficiales.ejecutar()` — fetch → por moneda: validar → persistir
  siempre → publicar solo si cambió. Puertos: `OfficialRateSource`, `EventPublisher`,
  `RateRepository`, `AlertNotifier`.
- **Adaptadores** (`src/ingestor_bcv/adapters/`):
  - `bcv/client.py` — httpx con contexto SSL anclado al bundle `certs/bcv-ca-bundle.pem`.
  - `bcv/parser.py` — selectores CSS (`div.recuadrotsmc`, fecha en
    `div.pull-right.dinpro.center span[content]`) con fallback regex sobre HTML crudo;
    descubrimiento dinámico de monedas (cualquier bloque con código ISO + valor).
  - `amqp/publisher.py` — aio-pika, exchange topic `market.events`, publisher confirms,
    mensajes persistentes, sobre estándar ADR-0004 (`construir_evento()`).
  - `timescale/repository.py` — asyncpg, queries parametrizadas; esquema en
    `db/migrations/001_official_rates.sql` (hypertable `official_rates` +
    `official_rate_source_health`).
  - `memory.py` — adaptadores en memoria para `--dry-run` y tests.

## Multi-moneda
Una sola consulta HTTP por ciclo trae todas las monedas; la validación, la
persistencia y la publicación son por moneda. La fecha-valor es común a la página.
La brecha P2P solo consume USD; el resto queda disponible para indicadores futuros.

## Validación y salud de la fuente
- Plausibilidad por moneda: valor > 0, fecha-valor no retrocede, |Δ| ≤ 20 %
  (configurable `MAX_DELTA_PCT`) vs. última tasa **válida** de esa moneda.
  Fuera de rango → se persiste como `suspect`, no se publica, alerta (HITL).
- Fallo total de fetch/parseo → contador persistente (`official_rate_source_health`);
  al llegar a `FAILURE_THRESHOLD` (3): alerta + `stale_since`. Un éxito lo reinicia.

## TLS (ADR-0006)
El sitio del BCV envía una cadena TLS incorrecta; el bundle versionado ancla la
cadena real (Sectigo DV R36 + Root R46), verificada con `openssl verify` al
capturarla (2026-07-05). Procedimiento de regeneración: `certs/README.md`.
No existe ruta de código que desactive la verificación.

## Resuelto de la fase 03
- ✔ Bundle de certificados del BCV capturado, verificado y versionado.
- ✔ Fixture de HTML real del sitio para tests de parser
  (`tests/fixtures/bcv_home.html`, capturado 2026-07-05).

## Pendiente
- Tests de integración contra RabbitMQ/TimescaleDB reales (docker compose, fase 05).
- Job de re-validación HITL para tasas `suspect`.
