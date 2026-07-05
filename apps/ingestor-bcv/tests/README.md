# Tests — ingestor-bcv (pirámide AI-DLC)

- `unit/` — parser (HTML real y alterado), validación de rango, caso de uso con
  adaptadores en memoria (valid→suspect, contador de fallos→stale), contexto TLS.
- `contract/` — el evento `official.rate.updated` cumple el sobre estándar de ADR-0004.
- `integration/` — adaptadores contra infraestructura real: repositorio en TimescaleDB,
  publisher en RabbitMQ (exchange único por test) y anclaje TLS del cliente contra un
  servidor HTTPS local con CA efímera (trustme).
- `e2e/` — ciclo completo: sitio BCV mock (HTTP local con el fixture real, mutable)
  → caso de uso → RabbitMQ real → TimescaleDB real, con cola consumidora verificando
  los eventos.

## Cómo correr

```sh
# Unit + contract (sin red ni infraestructura): siempre corren.
python -m pytest -m "not integration and not e2e"

# Suite completa — requiere la infra del repo (desde la raíz):
#   docker compose up -d --wait
python -m pytest

# Solo integración / solo e2e:
python -m pytest -m integration
python -m pytest -m e2e
```

Si la infraestructura no está levantada, los tests `integration`/`e2e` hacen **skip**
con instrucciones (nunca fallan por infra ausente); los TLS locales corren siempre.

Configuración: `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@127.0.0.1:5433/ves_market_test`)
y `TEST_AMQP_URL` (default `amqp://guest:guest@127.0.0.1:5672/`). La DB `ves_market_test`
se crea sola y se le aplica la migración real `db/migrations/001_official_rates.sql`;
las tablas se truncan entre tests.

Notas de entorno (Windows): TimescaleDB se publica en el **5433** porque el 5432
suele estar ocupado por un PostgreSQL local o de WSL, y los defaults usan
`127.0.0.1` explícito porque `localhost` puede resolver a `::1` y caer en el
relay de WSL en lugar del contenedor.
