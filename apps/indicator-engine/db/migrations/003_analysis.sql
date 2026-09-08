-- 003 — Análisis de la revisión (PRD motor-indicadores RF-6, ADR-0019).
-- Una fila por revisión: la lectura mecánica de los medidores del panel que el
-- motor publica junto a cada lote de indicadores. Es la fuente del
-- GET /api/v1/analysis/current del api-gateway.
--
-- El documento ES el contrato: `payload` guarda verbatim lo publicado en
-- schemas/analysis.v1.json, así el GET devuelve exactamente lo que salió al bus
-- y los decimales siguen siendo strings exactos, sin round-trip por numeric
-- (mismo criterio que signals.evidence, ADR-0017).
--
-- Nota: sin punto y coma dentro de comentarios — el fixture de tests aplica
-- este archivo sentencia a sentencia con split simple.

CREATE TABLE IF NOT EXISTS indicator_analysis (
    as_of            timestamptz NOT NULL,
    currency         text        NOT NULL,
    -- event_id del p2p.snapshot que produjo la revisión. Entra en la PK por dos
    -- razones: idempotencia at-least-once (ON CONFLICT DO NOTHING en la
    -- reentrega) y para que las revisiones de BUY y SELL del mismo instante
    -- convivan en vez de pisarse.
    triggered_by     uuid        NOT NULL,
    calc_version     integer     NOT NULL,
    analysis_version integer     NOT NULL,
    ruleset_version  integer     NOT NULL,
    confidence       text        NOT NULL,
    official_stale   boolean     NOT NULL,
    -- Promovida desde el JSONB para responder «cuánto tiempo estuvimos en
    -- respaldo de ruleset» sin abrir el documento.
    scale_source     text        NOT NULL,
    analyzed_at      timestamptz NOT NULL DEFAULT now(),
    payload          jsonb       NOT NULL,
    PRIMARY KEY (as_of, currency, triggered_by)
);

SELECT create_hypertable('indicator_analysis', 'as_of', if_not_exists => TRUE);

-- Última revisión por moneda: lo único que consulta el gateway.
CREATE INDEX IF NOT EXISTS indicator_analysis_currency_asof_idx
    ON indicator_analysis (currency, as_of DESC);

-- Misma retención que el resto de las series derivadas: 90 días es la ventana
-- de análisis, más allá el documento no explica ninguna lectura vigente.
SELECT add_retention_policy('indicator_analysis', INTERVAL '90 days', if_not_exists => TRUE);
