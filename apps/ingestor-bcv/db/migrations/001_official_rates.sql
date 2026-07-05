-- 001 — Tasas oficiales BCV: hypertable + salud de la fuente (ADR-0002, PRD RF-5).
-- Aplicar con un rol administrador; el rol del servicio (ingestor_bcv) solo
-- necesita INSERT/SELECT en official_rates e INSERT/UPDATE/SELECT en
-- official_rate_source_health (mínimo privilegio, A01).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Histórico completo de capturas: toda consulta al BCV deja fila (auditoría V16).
-- status: valid  → publicada al bus si cambió
--         suspect→ retenida, fuera de rango de plausibilidad (HITL)
--         stale  → marca administrativa (la señal operativa vive en *_source_health)
CREATE TABLE IF NOT EXISTS official_rates (
    captured_at  timestamptz    NOT NULL,
    currency     text           NOT NULL,
    rate         numeric(20, 8) NOT NULL CHECK (rate > 0),
    value_date   date           NOT NULL,
    status       text           NOT NULL DEFAULT 'valid'
                 CHECK (status IN ('valid', 'suspect', 'stale')),
    source       text           NOT NULL DEFAULT 'BCV',
    PRIMARY KEY (captured_at, currency)
);

SELECT create_hypertable('official_rates', 'captured_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS official_rates_currency_time_idx
    ON official_rates (currency, captured_at DESC);

-- Salud de la fuente: contador de fallos consecutivos y marca stale
-- (PRD escenario negativo 1 y 5: alerta tras 3 fallos, última tasa con stale_since).
CREATE TABLE IF NOT EXISTS official_rate_source_health (
    source               text        PRIMARY KEY,
    consecutive_failures integer     NOT NULL DEFAULT 0,
    last_success_at      timestamptz,
    last_failure_at      timestamptz,
    last_error           text,
    stale_since          timestamptz
);
