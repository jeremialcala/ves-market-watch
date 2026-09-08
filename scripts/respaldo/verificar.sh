#!/bin/sh
#
# Restauración REAL del último full a una base desechable, con conteos.
#
# Es la pieza que convierte esto en un respaldo y no en una carpeta con
# archivos. Todo lo demás de este directorio puede salir en verde con datos
# vacíos —`COPY` sobre una hipertabla lo hace, y `pg_restore` sin
# `timescaledb_pre_restore()` también—; lo único que no se puede fingir es
# levantar los datos y contarlos.
#
# Corre sola los domingos (ver crontab). Sale distinto de cero si el respaldo no
# sirve, y ese código de salida es el que hay que vigilar.

set -eu

BASE_PRUEBA="${BASE_VERIFICACION:-ves_market_verificacion}"
# Por debajo de esto, el respaldo no contiene una base de trabajo: contiene el
# esquema y poco más. Los valores salen de la base real medida el 2026-08-23
# (1.017.655 indicadores, 41.049 tasas), rebajados para que un fin de semana
# flojo no dé un falso rojo.
MINIMO_INDICADORES="${MINIMO_INDICADORES:-100000}"
MINIMO_TASAS="${MINIMO_TASAS:-10000}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') verificar $*"; }
morir() { log "FALLO: $*"; exit 1; }

log "restaurando el último full en $BASE_PRUEBA"
restaurar "$BASE_PRUEBA" ultimo

contar() {
  psql -v ON_ERROR_STOP=1 -t -A -d "$BASE_PRUEBA" -c "SELECT count(*) FROM $1"
}

INDICADORES="$(contar indicators)"
TASAS="$(contar official_rates)"
SNAPSHOTS="$(contar p2p_snapshots_raw)"
ANALISIS="$(contar indicator_analysis)"

log "indicators=$INDICADORES official_rates=$TASAS p2p_snapshots_raw=$SNAPSHOTS indicator_analysis=$ANALISIS"

[ "$INDICADORES" -ge "$MINIMO_INDICADORES" ] || morir "indicators=$INDICADORES < $MINIMO_INDICADORES"
[ "$TASAS" -ge "$MINIMO_TASAS" ] || morir "official_rates=$TASAS < $MINIMO_TASAS"

# Que los chunks estén REGISTRADOS, no solo que las filas se cuenten. Es lo que
# distingue una restauración buena de una hecha sin `timescaledb_pre_restore()`:
# ahí las filas aparecen y la hipertabla queda descolgada.
CHUNKS="$(psql -v ON_ERROR_STOP=1 -t -A -d "$BASE_PRUEBA" \
  -c "SELECT count(*) FROM timescaledb_information.chunks")"
log "chunks registrados=$CHUNKS"
[ "$CHUNKS" -gt 0 ] || morir "cero chunks: la restauración dejó las hipertablas descolgadas"

# Y que el dato más nuevo sea de ayer o de hoy: un full que restaura perfecto
# pero es de hace tres semanas también es un fallo, y de los silenciosos.
DIAS="$(psql -v ON_ERROR_STOP=1 -t -A -d "$BASE_PRUEBA" \
  -c "SELECT floor(extract(epoch FROM now() - max(as_of)) / 86400)::int FROM indicators")"
log "antigüedad del dato más nuevo: $DIAS días"
[ "$DIAS" -le "${MAX_ANTIGUEDAD_DIAS:-2}" ] || morir "el full más reciente trae dato de hace $DIAS días"

psql -v ON_ERROR_STOP=1 --quiet -d postgres -c "DROP DATABASE IF EXISTS \"$BASE_PRUEBA\";"
log "OK: el respaldo restaura y contiene lo que dice"
