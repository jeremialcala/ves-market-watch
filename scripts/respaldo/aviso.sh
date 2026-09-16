#!/bin/sh
#
# Aviso de fallo —y de recuperación— de los trabajos de respaldo.
#
#   aviso fallo <trabajo> <motivo>
#   aviso ok    <trabajo>
#
# Existe por lo que pasó del 2026-09-07 al 2026-09-14: el refresh token de Drive
# caducó a los 7 días exactos de autorizarlo —la app OAuth seguía en «Testing»—
# y el respaldo falló **160 veces seguidas** sin que nadie se enterara. Todo
# quedaba escrito en `docker compose logs`, que es donde se mira cuando ya se
# sabe que algo va mal, no para enterarse.
#
# Deja dos rastros, a propósito:
#   - un sello en $ESTADO_DIR, que lee `estado` (el healthcheck): el contenedor
#     pasa a unhealthy aunque no haya red ni AVISO_URL;
#   - un push a ntfy (AVISO_URL=https://ntfy.sh/<tema>) si la variable existe.
#
# Un incremental que falla cada hora serían 24 notificaciones al día y a la
# tercera se silencian. Se avisa el primer fallo, se repite cada
# AVISO_REPETIR_SEGUNDOS mientras dure, y se avisa UNA vez cuando se recupera.
#
# Nunca sale con error: un push que no se pudo mandar no puede tapar el código
# de salida del trabajo que falló.

set -u

ESTADO_DIR="${ESTADO_DIR:-/var/lib/respaldo}"
REPETIR="${AVISO_REPETIR_SEGUNDOS:-21600}"
TIPO="${1:-}"
NOMBRE="${2:-}"
MOTIVO="${3:-sin detalle}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') aviso[$NOMBRE] $*"; }

# Título y etiquetas en ASCII: van en cabeceras HTTP, y una cabecera con UTF-8
# es de las cosas que un servidor puede aceptar hoy y rechazar mañana. El
# cuerpo sí lleva tildes.
enviar() {
  titulo="$1"
  prioridad="$2"
  etiquetas="$3"
  cuerpo="$4"
  if [ -z "${AVISO_URL:-}" ]; then
    log "sin AVISO_URL, no se manda push: $titulo"
    return 1
  fi
  if wget -q -T 15 -O /dev/null \
      --header "Title: $titulo" \
      --header "Priority: $prioridad" \
      --header "Tags: $etiquetas" \
      --post-data "$cuerpo" \
      "$AVISO_URL"; then
    log "push enviado: $titulo"
  else
    log "no se pudo mandar el push: $titulo"
    return 1
  fi
}

[ -n "$NOMBRE" ] || { echo "uso: aviso {fallo|ok} <trabajo> [motivo]" >&2; exit 0; }
mkdir -p "$ESTADO_DIR" 2>/dev/null || { log "no se pudo crear $ESTADO_DIR"; exit 0; }
AHORA="$(date -u +%s)"

case "$TIPO" in
  fallo)
    echo "$AHORA $MOTIVO" > "$ESTADO_DIR/$NOMBRE.fallo"
    ULTIMO="$(cat "$ESTADO_DIR/$NOMBRE.avisado" 2>/dev/null || echo 0)"
    if [ $(( AHORA - ULTIMO )) -lt "$REPETIR" ]; then
      log "fallo ya avisado hace $(( AHORA - ULTIMO )) s, no se repite"
      exit 0
    fi
    # `.avisado` solo se escribe si el push salió: si ntfy no responde, se
    # reintenta en el siguiente fallo en vez de dar el aviso por dado.
    if enviar "ves-market-watch: fallo en $NOMBRE" high "warning,floppy_disk" \
        "$MOTIVO. Detalle: docker compose logs respaldo"; then
      echo "$AHORA" > "$ESTADO_DIR/$NOMBRE.avisado"
    fi
    ;;
  ok)
    echo "$AHORA" > "$ESTADO_DIR/$NOMBRE.ok"
    rm -f "$ESTADO_DIR/$NOMBRE.fallo"
    # Recuperación solo si alguien recibió el fallo: avisar de que algo «vuelve a
    # funcionar» a quien no supo que se rompió es ruido.
    if [ -f "$ESTADO_DIR/$NOMBRE.avisado" ]; then
      rm -f "$ESTADO_DIR/$NOMBRE.avisado"
      enviar "ves-market-watch: $NOMBRE vuelve a funcionar" default "white_check_mark" \
        "$NOMBRE terminó bien." || true
    fi
    ;;
  *)
    echo "uso: aviso {fallo|ok} <trabajo> [motivo]" >&2
    ;;
esac

exit 0
