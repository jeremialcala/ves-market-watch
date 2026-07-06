-- 002 — Resolución HITL de tasas suspect (ADR-0007): estado terminal 'rejected'
-- («descartada») y auditoría de la transición (quién/cuándo/por qué).
-- Idempotente. Nota: sin punto y coma dentro de comentarios ni bloques DO — el
-- fixture de tests aplica este archivo sentencia a sentencia con un split simple.

ALTER TABLE official_rates DROP CONSTRAINT IF EXISTS official_rates_status_check;

ALTER TABLE official_rates ADD CONSTRAINT official_rates_status_check
    CHECK (status IN ('valid', 'suspect', 'stale', 'rejected'));

ALTER TABLE official_rates ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE official_rates ADD COLUMN IF NOT EXISTS resolved_by text;

ALTER TABLE official_rates ADD COLUMN IF NOT EXISTS resolution_note text;
