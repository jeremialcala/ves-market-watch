-- 001 — Snapshots históricos del mercado USDT/VES cargados desde exports
-- externos (PRD ingesta histórica, ADR-0002, ADR-0013).
-- El detalle por banco viaja en JSONB porque el conjunto de bancos es
-- dinámico. Sin política de retención: es histórico permanente según la
-- clasificación de datos (agregados >= 12 meses, datos públicos de mercado).
-- Nota: sin punto y coma dentro de comentarios — el fixture de tests aplica
-- este archivo sentencia a sentencia con split simple.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS historical_market_snapshots (
    captured_at        timestamptz NOT NULL,
    source_id          text        NOT NULL,
    asset              text        NOT NULL DEFAULT 'USDT',
    fiat               text        NOT NULL DEFAULT 'VES',
    base_weighted_avg  numeric     NOT NULL CHECK (base_weighted_avg > 0),
    total_order_size   numeric,
    banks              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    extra              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    source_file        text,
    loaded_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (captured_at, source_id)
);

SELECT create_hypertable('historical_market_snapshots', 'captured_at', if_not_exists => TRUE);
