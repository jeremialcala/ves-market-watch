-- 004 — Compresión de `indicators` (medida el 2026-08-01, ADR-0021).
--
-- Por qué compresión y NO retención: `indicators` es la única tabla derivada sin
-- política de tamaño, y crece ~2,2 GB/año. Pero borrar de aquí reduce lo que la
-- API puede responder — `GET /indicators/history` acota el TAMAÑO de cada
-- petición a 90 días, no su antigüedad, así que no hay ninguna profundidad a
-- partir de la cual el dato deje de ser servible. Retención sería una decisión
-- de producto. Comprimir no quita nada.
--
-- Medido en régimen (1.036.800 filas, 90 días a densidad real de captura):
--   tamaño          256 MB -> 37 MB      (24,9x en los chunks comprimidos)
--   consulta de percentiles  747 ms -> 585 ms   (MÁS rápida: menos I/O que
--                                                descomprimir)
--   histórico del gateway (90 d, bucket 1 h, filtrado)   10 ms
--   INSERT en chunk vivo, INSERT retroactivo en chunk comprimido, y
--   ON CONFLICT DO NOTHING rechazando el duplicado    todos correctos
--
-- Esa última línea es la que importa: la idempotencia at-least-once del motor
-- descansa en la PK, y sigue en pie sobre chunks comprimidos.
--
-- Nota: sin punto y coma dentro de comentarios — el fixture de tests aplica
-- este archivo sentencia a sentencia con split simple.

-- segmentby por (indicator, currency): agrupa exactamente como consultan el
-- motor y el análisis, así que un chunk comprimido se filtra sin descomprimir
-- lo que no toca. orderby as_of DESC: las lecturas siempre van de lo más
-- reciente hacia atrás.
ALTER TABLE indicators SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'indicator, currency',
    timescaledb.compress_orderby = 'as_of DESC'
);

-- 7 días es holgado a propósito: las ventanas móviles del motor miran 3-6 h
-- (más 1 h de holgura), así que nunca leen un chunk comprimido en su camino
-- caliente. Los INSERT retroactivos funcionan igual, pero cuanto menos se
-- dependa de eso, mejor.
SELECT add_compression_policy('indicators', INTERVAL '7 days', if_not_exists => TRUE);
