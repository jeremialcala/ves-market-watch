-- 001 — Snapshots crudos del mercado P2P de Binance (PRD RF-5, ADR-0002).
-- El crudo completo (JSONB) permite reproceso con nuevas versiones de cálculo.
-- Retención nativa de 90 días según clasificación de datos del proyecto.
-- Nota: sin punto y coma dentro de comentarios — el fixture de tests aplica
-- este archivo sentencia a sentencia con split simple.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS p2p_snapshots_raw (
    captured_at timestamptz NOT NULL,
    side        text        NOT NULL CHECK (side IN ('BUY', 'SELL')),
    asset       text        NOT NULL,
    fiat        text        NOT NULL,
    partial     boolean     NOT NULL DEFAULT false,
    ad_count    integer     NOT NULL,
    raw         jsonb       NOT NULL,
    PRIMARY KEY (captured_at, side)
);

SELECT create_hypertable('p2p_snapshots_raw', 'captured_at', if_not_exists => TRUE);

SELECT add_retention_policy('p2p_snapshots_raw', INTERVAL '90 days', if_not_exists => TRUE);
