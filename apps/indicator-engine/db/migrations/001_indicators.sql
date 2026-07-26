-- 001 — Indicadores como serie de tiempo (PRD motor-indicadores RF-3) y
-- deduplicación de eventos consumidos (escenario negativo 2, A08).
-- Formato largo: una fila por indicador/moneda/instante, con calc_version
-- para reproducibilidad. Nota: sin punto y coma dentro de comentarios — el
-- fixture de tests aplica este archivo sentencia a sentencia con split simple.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS indicators (
    as_of        timestamptz    NOT NULL,
    indicator    text           NOT NULL,
    currency     text           NOT NULL,
    value        numeric(24, 8) NOT NULL,
    calc_version integer        NOT NULL,
    metadata     jsonb,
    PRIMARY KEY (as_of, indicator, currency)
);

SELECT create_hypertable('indicators', 'as_of', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS indicators_name_currency_time_idx
    ON indicators (indicator, currency, as_of DESC);

-- Idempotencia del consumidor: un evento del bus se procesa una sola vez.
CREATE TABLE IF NOT EXISTS processed_events (
    event_id     uuid        PRIMARY KEY,
    event_type   text        NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);
