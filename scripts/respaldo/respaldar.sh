#!/bin/sh
#
# Respaldo de `ves_market` a Google Drive: incremental cada hora, full cada 24 h.
#
#   respaldar incremental   ventana de una hora, ~2,5 MB
#   respaldar full          pg_dump completo, ~326 MB
#   respaldar agregados     todo MENOS los snapshots crudos, para retención larga
#
# ---------------------------------------------------------------------------
# La trampa que hace inútil un respaldo de TimescaleDB
# ---------------------------------------------------------------------------
# `COPY una_hipertabla TO STDOUT` **no copia nada**. Emite un NOTICE —«hypertable
# data are in the chunks»—, produce un archivo vacío y **sale con código 0**. Se
# comprobó en vivo al dimensionar esto: `COPY official_rates TO STDOUT` devolvió
# 0,00 MB sobre 28 MB de datos. Un respaldo así se sube, ocupa su sitio, aparece
# en la lista y no contiene nada.
#
# Por eso aquí SIEMPRE se usa `COPY (SELECT ...) TO STDOUT`, y por eso cada
# archivo se mide antes de subirlo. Un respaldo vacío es peor que ninguno:
# ninguno se nota.
# ---------------------------------------------------------------------------

set -eu

MODO="${1:-}"
REMOTO="${RCLONE_REMOTE:?definir RCLONE_REMOTE, p. ej. criterio-cifrado:criterio}"
TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT INT TERM

# Tamaño mínimo creíble por archivo comprimido. Por debajo de esto, algo falló
# aunque el comando saliera en verde (la trampa de arriba).
MINIMO_BYTES="${RESPALDO_MINIMO_BYTES:-256}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') respaldo[$MODO] $*"; }
morir() { log "ERROR: $*"; exit 1; }

# Tablas por ventana de tiempo, con su columna temporal.
POR_VENTANA="indicators:as_of
p2p_snapshots_raw:captured_at
indicator_analysis:as_of
historical_market_snapshots:captured_at"

# Tablas que van ENTERAS en cada incremental.
#
# No es pereza: `official_rates` se ACTUALIZA —la revalidación HITL escribe
# `resolved_at`, `resolved_by` y `resolution_note` sobre filas viejas— y una
# ventana sobre `captured_at` no vería nunca ese cambio. Caben las dos en poco
# más de un mega comprimidas, así que sale más barato copiarlas enteras que
# razonar sobre qué mutó.
ENTERAS="official_rates
signals"

# Vuelca una consulta a un .gz y comprueba que no salió vacío.
volcar() {
  destino="$1"
  consulta="$2"
  psql -v ON_ERROR_STOP=1 --quiet -c "COPY ($consulta) TO STDOUT" > "$TRABAJO/crudo.tsv"
  gzip -6 -c "$TRABAJO/crudo.tsv" > "$destino"
  rm -f "$TRABAJO/crudo.tsv"
}

subir() {
  archivo="$1"
  carpeta="$2"
  bytes=$(stat -c %s "$archivo")
  [ "$bytes" -ge "$MINIMO_BYTES" ] || morir "$(basename "$archivo") pesa $bytes bytes; se esperaban >= $MINIMO_BYTES"

  rclone copyto "$archivo" "$REMOTO/$carpeta/$(basename "$archivo")" --retries 3
  # No basta con que `rclone` salga en verde: se relee el tamaño del destino.
  remoto_bytes=$(rclone size "$REMOTO/$carpeta/$(basename "$archivo")" --json | sed 's/.*"bytes":\([0-9]*\).*/\1/')
  [ "$remoto_bytes" = "$bytes" ] || morir "subido $remoto_bytes bytes, en local hay $bytes"
  log "subido $carpeta/$(basename "$archivo") ($bytes bytes)"
}

podar() {
  carpeta="$1"
  dias="$2"
  rclone delete "$REMOTO/$carpeta" --min-age "${dias}d" --retries 3
  log "podado $carpeta: fuera lo anterior a $dias días"
}

case "$MODO" in
  incremental)
    # La ventana sale del RELOJ, no de un fichero de marca. Así una hora que no
    # se respaldó se ve como un archivo que falta, en vez de quedar tapada por
    # una marca que avanzó igual.
    # Todo se calcula desde el filo de la hora, en epoch, y NO desde «ahora».
    #
    # La primera versión mezclaba las dos cosas: `FIN` al filo de la hora e
    # `INICIO` a «hace 65 minutos». Coinciden solo si el trabajo arranca en
    # punto —que es lo que hace el cron—, así que habría pasado por bueno
    # durante meses; en la primera ejecución a mano, a y 35, la ventana salió de
    # 30 minutos, y a y 55 habría sido de CINCO. Un respaldo que se encoge
    # cuando el cron se retrasa es exactamente el que falla el día que hace
    # falta.
    AHORA_EPOCH="$(date -u +%s)"
    FIN_EPOCH=$(( AHORA_EPOCH / 3600 * 3600 ))
    # 3900 s = 1 h + 5 min de solape, por si una fila entra con el `as_of` justo
    # en el borde. Todas las tablas tienen clave primaria, así que reponer dos
    # veces la misma fila no duplica nada (ver restaurar.sh).
    INICIO_EPOCH=$(( FIN_EPOCH - 3900 ))
    FIN="$(date -u -d "@$FIN_EPOCH" '+%Y-%m-%dT%H:%M:00')"
    INICIO="$(date -u -d "@$INICIO_EPOCH" '+%Y-%m-%dT%H:%M:00')"
    ETIQUETA="$(date -u -d "@$(( FIN_EPOCH - 3600 ))" '+%Y-%m-%dT%H')"
    log "ventana [$INICIO, $FIN)"

    LOTE="$TRABAJO/$ETIQUETA"
    mkdir -p "$LOTE"

    echo "$POR_VENTANA" | while IFS=: read -r tabla columna; do
      [ -n "$tabla" ] || continue
      volcar "$LOTE/$tabla.tsv.gz" \
        "SELECT * FROM $tabla WHERE $columna >= '$INICIO'::timestamptz AND $columna < '$FIN'::timestamptz"
    done

    echo "$ENTERAS" | while read -r tabla; do
      [ -n "$tabla" ] || continue
      volcar "$LOTE/$tabla.tsv.gz" "SELECT * FROM $tabla"
    done

    # El manifiesto es lo que permite a `restaurar` saber qué contiene el lote
    # sin abrirlo, y deja constancia de la ventana exacta.
    {
      echo "ventana_inicio=$INICIO"
      echo "ventana_fin=$FIN"
      echo "generado=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      for f in "$LOTE"/*.tsv.gz; do
        echo "archivo=$(basename "$f") bytes=$(stat -c %s "$f")"
      done
    } > "$LOTE/manifiesto.txt"

    tar -czf "$TRABAJO/$ETIQUETA.tar.gz" -C "$TRABAJO" "$ETIQUETA"
    subir "$TRABAJO/$ETIQUETA.tar.gz" incremental
    podar incremental "${RETENCION_INCREMENTAL_DIAS:-14}"
    ;;

  full)
    ETIQUETA="$(date -u '+%Y-%m-%dT%H%M')"
    ARCHIVO="$TRABAJO/ves_market-$ETIQUETA.dump"
    # `-Fc` (custom) y no SQL plano: permite restaurar tablas sueltas y ya viene
    # comprimido. 326 MB medidos sobre la base real.
    pg_dump -Fc -Z6 --no-tablespaces -f "$ARCHIVO"
    subir "$ARCHIVO" full
    # 90 días y no más: la clasificación de datos fija «snapshots crudos 90
    # días», y un full los lleva dentro. Guardar fulls un año sería guardar los
    # crudos un año.
    podar full "${RETENCION_FULL_DIAS:-90}"
    ;;

  agregados)
    # Lo que SÍ puede vivir más de 90 días: todo menos los snapshots crudos.
    # La clasificación pide «agregados >= 12 meses», y este es el volcado que lo
    # cumple sin arrastrar el crudo.
    ETIQUETA="$(date -u '+%Y-%m')"
    ARCHIVO="$TRABAJO/agregados-$ETIQUETA.dump"
    pg_dump -Fc -Z6 --no-tablespaces \
      --exclude-table-data='public.p2p_snapshots_raw' \
      --exclude-table-data='_timescaledb_internal.*p2p_snapshots_raw*' \
      -f "$ARCHIVO"
    subir "$ARCHIVO" agregados
    podar agregados "${RETENCION_AGREGADOS_DIAS:-760}"
    ;;

  *)
    morir "uso: respaldar {incremental|full|agregados}"
    ;;
esac

log "terminado"
