# ingestor-bcv

Servicio de ingesta de las tasas oficiales de cambio publicadas por el BCV —
todas las monedas de la sección «tipo de cambio de referencia» de bcv.org.ve
(hoy: USD, EUR, CNY, TRY, RUB), con descubrimiento dinámico de monedas nuevas.

## Qué hace
- Consulta el sitio del BCV 2×/hora con TLS anclado a `certs/bcv-ca-bundle.pem`
  (nunca `verify=False` — ADR-0006; ver `certs/README.md` para regenerar el bundle).
- Extrae todas las tasas y la fecha-valor: selectores CSS con fallback regex (RF-2).
- Valida plausibilidad por moneda (|Δ| ≤ 20 % configurable); anomalías → `suspect` (HITL).
- Publica `official.rate.updated` por moneda solo cuando el valor o la fecha-valor cambian.
- Persiste el histórico completo de capturas en TimescaleDB (RF-5, auditoría).
- 3 fallos consecutivos de la fuente → alerta + marca `stale` en la salud de la fuente.
- Re-validación HITL (ADR-0007): una `suspect` solo se aprueba o rechaza por decisión
  humana auditada; sin revisión dentro de `SUSPECT_TTL_HOURS` (24) expira a `rejected`.

## Re-validación de sospechas (operador)

```sh
python -m ingestor_bcv revalidar listar                # pendientes con Δ % vs referencia
python -m ingestor_bcv revalidar aprobar USD --nota "devaluación confirmada en fuentes"
python -m ingestor_bcv revalidar rechazar USD --nota "anuncio manipulado"
```

Aprobar promueve la sospecha más reciente a `valid` y la publica al bus (pasa a ser
la referencia); rechazar descarta todas las pendientes de la moneda. Ambas exigen
`--nota` y registran quién decidió (`--usuario`, default el usuario del sistema).

## Ejecutar

```sh
pip install -e .[dev]

# Sin infraestructura (consulta real al BCV, eventos por log):
python -m ingestor_bcv --once --dry-run

# Producción (requiere RabbitMQ y TimescaleDB; aplicar antes db/migrations/):
python -m ingestor_bcv
```

Configuración por entorno: `BCV_URL`, `BCV_CA_BUNDLE` (ruta o `system`),
`FETCH_INTERVAL_SECONDS` (1800), `MAX_DELTA_PCT` (20), `FAILURE_THRESHOLD` (3),
`SUSPECT_TTL_HOURS` (24), `AMQP_URL`, `AMQP_EXCHANGE` (`market.events`), `DATABASE_URL`.
Los secretos llegan por entorno desde el secret store del despliegue (A02).

## Tests

```sh
# Unit + contract: sin red ni infraestructura.
python -m pytest -m "not integration and not e2e"

# Suite completa (integration + e2e contra RabbitMQ/TimescaleDB reales):
docker compose up -d --wait   # desde la raíz del repo
python -m pytest
```

Unit + contract usan el fixture `tests/fixtures/bcv_home.html` (página real
capturada el 2026-07-05). Integration/e2e hacen skip con instrucciones si la
infraestructura no está levantada. Detalle en `tests/README.md`.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/ingesta-bcv.md`
- ADR-0006 · Amenaza T1 en `../../docs/02-design/threat-model.md`
- Diseño: `docs/design.md`
