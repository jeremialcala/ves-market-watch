#!/bin/sh
#
# Reposición: un full + los incrementales posteriores, en orden.
#
#   restaurar <base_destino> [etiqueta_full|ultimo] [hasta_YYYY-MM-DDTHH]
#
#   restaurar ves_market_prueba                     # último full, sin incrementales
#   restaurar ves_market_prueba ultimo todos        # último full + TODOS los posteriores
#   restaurar ves_market ultimo 2026-08-23T19       # reposición a punto en el tiempo (por hora)
#
# ---------------------------------------------------------------------------
# `timescaledb_pre_restore()` no es opcional
# ---------------------------------------------------------------------------
# Un `pg_restore` de una base con TimescaleDB SIN envolverlo entre
# `timescaledb_pre_restore()` y `timescaledb_post_restore()` deja los catálogos
# de la extensión inconsistentes: la restauración «funciona», los datos parecen
# estar y los chunks no quedan registrados. Es otro fallo que sale en verde.
# ---------------------------------------------------------------------------

set -eu

DESTINO="${1:?uso: restaurar <base_destino> [etiqueta_full|ultimo] [hasta|todos]}"
CUAL="${2:-ultimo}"
HASTA="${3:-}"
REMOTO="${RCLONE_REMOTE:?definir RCLONE_REMOTE}"
TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT INT TERM

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') restaurar $*"; }
morir() { log "ERROR: $*"; exit 1; }

# -- 1. el full --------------------------------------------------------------

if [ "$CUAL" = "ultimo" ]; then
  CUAL="$(rclone lsf "$REMOTO/full" --include '*.dump' | sort | tail -1)"
  [ -n "$CUAL" ] || morir "no hay ningún full en $REMOTO/full"
fi
log "full elegido: $CUAL"
rclone copyto "$REMOTO/full/$CUAL" "$TRABAJO/$CUAL" --retries 3
[ -s "$TRABAJO/$CUAL" ] || morir "el full descargado está vacío"

log "creando la base $DESTINO"
psql -v ON_ERROR_STOP=1 --quiet -d postgres -c "DROP DATABASE IF EXISTS \"$DESTINO\";"
psql -v ON_ERROR_STOP=1 --quiet -d postgres -c "CREATE DATABASE \"$DESTINO\";"
psql -v ON_ERROR_STOP=1 --quiet -d "$DESTINO" -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

psql -v ON_ERROR_STOP=1 --quiet -d "$DESTINO" -c "SELECT timescaledb_pre_restore();"
# `--no-owner` porque la base nueva puede pertenecer a otro rol; los datos son
# lo que importa. Sin `-e`: pg_restore avisa de objetos que ya existen (la
# extensión) y eso no es un fallo.
pg_restore --no-owner --dbname "$DESTINO" "$TRABAJO/$CUAL" || log "pg_restore terminó con avisos"
psql -v ON_ERROR_STOP=1 --quiet -d "$DESTINO" -c "SELECT timescaledb_post_restore();"
log "full restaurado"

[ -n "$HASTA" ] || { log "sin incrementales (no se pidieron)"; exit 0; }

# -- 2. los incrementales ----------------------------------------------------

# Momento del full, para saber desde qué hora hay que reponer. La etiqueta del
# full es `ves_market-YYYY-MM-DDTHHMM.dump`.
DESDE="$(echo "$CUAL" | sed 's/^ves_market-//; s/\.dump$//' | cut -c1-13)"
log "reponiendo incrementales desde $DESDE hasta ${HASTA}"

rclone lsf "$REMOTO/incremental" --include '*.tar.gz' | sed 's/\.tar\.gz$//' | sort |
while read -r etiqueta; do
  [ -n "$etiqueta" ] || continue
  # Comparación lexicográfica: el formato ISO lo permite y evita depender de
  # `date -d` para cada nombre.
  [ "$etiqueta" \> "$DESDE" ] || continue
  if [ "$HASTA" != "todos" ] && [ "$etiqueta" \> "$HASTA" ]; then
    continue
  fi

  rclone copyto "$REMOTO/incremental/$etiqueta.tar.gz" "$TRABAJO/$etiqueta.tar.gz" --retries 3
  tar -xzf "$TRABAJO/$etiqueta.tar.gz" -C "$TRABAJO"

  for archivo in "$TRABAJO/$etiqueta"/*.tsv.gz; do
    tabla="$(basename "$archivo" .tsv.gz)"
    gzip -dc "$archivo" > "$TRABAJO/filas.tsv"
    # Se carga en una temporal con la MISMA forma y se inserta con ON CONFLICT:
    # los cinco minutos de solape de cada ventana repiten filas a propósito, y
    # todas las tablas tienen clave primaria, así que reponer dos veces la misma
    # fila no duplica nada.
    psql -v ON_ERROR_STOP=1 --quiet -d "$DESTINO" <<SQL
CREATE TEMP TABLE reponer_$tabla (LIKE public.$tabla INCLUDING DEFAULTS);
\\copy reponer_$tabla FROM '$TRABAJO/filas.tsv'
INSERT INTO public.$tabla SELECT * FROM reponer_$tabla ON CONFLICT DO NOTHING;
DROP TABLE reponer_$tabla;
SQL
    rm -f "$TRABAJO/filas.tsv"
  done
  log "repuesto $etiqueta"
  rm -rf "$TRABAJO/$etiqueta" "$TRABAJO/$etiqueta.tar.gz"
done

log "terminado"
