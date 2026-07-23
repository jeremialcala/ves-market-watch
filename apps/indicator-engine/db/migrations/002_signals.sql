-- 002 — Señales emitidas (PRD motor-indicadores RF-4/RF-5, ADR-0014).
-- Serie de tiempo de señales disparadas por el motor de reglas sobre la
-- microestructura P2P, con evidencia (regla + insumos) para trazabilidad y
-- reproducibilidad (amenaza T10, A09). Es la fuente del futuro GET /signals
-- del api-gateway y el estado del dedup por cooldown.
-- Nota: sin punto y coma dentro de comentarios — el fixture de tests aplica
-- este archivo sentencia a sentencia con split simple.

CREATE TABLE IF NOT EXISTS signals (
    emitted_at   timestamptz NOT NULL DEFAULT now(),
    as_of        timestamptz NOT NULL,
    type         text        NOT NULL,
    direction    text        NOT NULL,
    currency     text        NOT NULL,
    rule         text        NOT NULL,
    calc_version integer     NOT NULL,
    triggered_by uuid        NOT NULL,
    evidence     jsonb       NOT NULL,
    PRIMARY KEY (emitted_at, type, currency)
);

SELECT create_hypertable('signals', 'emitted_at', if_not_exists => TRUE);

-- Cooldown anti-duplicados: última señal de un tipo/moneda por tiempo de dato
-- (as_of), no de emisión — robusto ante lag de proceso.
CREATE INDEX IF NOT EXISTS signals_type_currency_asof_idx
    ON signals (type, currency, as_of DESC);
