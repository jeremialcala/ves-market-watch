#!/bin/sh
#
# Healthcheck del contenedor de respaldo: ¿hay un respaldo BUENO reciente?
#
# No pregunta si `crond` está vivo. Eso estuvo en verde toda la semana en que el
# respaldo falló 160 veces seguidas (ver aviso.sh): el proceso corría, lo que
# corría fallaba. Aquí se leen los sellos que deja `aviso` al terminar cada
# trabajo, y el contenedor sale unhealthy si:
#
#   - el último intento de CUALQUIER trabajo falló (hay un `.fallo`), o
#   - no hay un incremental bueno en ESTADO_MAX_INCREMENTAL_S (el cron lo corre
#     cada hora; si no hay sello, o no corre o no termina), o
#   - hubo un full bueno y es más viejo que ESTADO_MAX_FULL_S.
#
# El full solo se exige si ya hubo uno: los sellos viven dentro del contenedor y
# un arranque nuevo no puede esperar 24 h para dar verde. Del incremental se
# ocupa el `start_period` del compose.

set -eu

DIR="${ESTADO_DIR:-/var/lib/respaldo}"
MAX_INCREMENTAL="${ESTADO_MAX_INCREMENTAL_S:-9000}"  # 2 h 30 min
MAX_FULL="${ESTADO_MAX_FULL_S:-100800}"              # 28 h
AHORA="$(date -u +%s)"
MAL=0

for f in "$DIR"/*.fallo; do
  [ -f "$f" ] || continue
  echo "FALLO $(basename "$f" .fallo): $(cut -d' ' -f2- "$f")"
  MAL=1
done

edad() {
  if [ -f "$DIR/$1.ok" ]; then
    echo $(( AHORA - $(cat "$DIR/$1.ok") ))
  else
    echo -1
  fi
}

INCREMENTAL="$(edad respaldo-incremental)"
if [ "$INCREMENTAL" -lt 0 ]; then
  echo "FALLO: ningún incremental bueno desde que arrancó el contenedor"
  MAL=1
elif [ "$INCREMENTAL" -gt "$MAX_INCREMENTAL" ]; then
  echo "FALLO: el último incremental bueno es de hace $INCREMENTAL s"
  MAL=1
fi

FULL="$(edad respaldo-full)"
if [ "$FULL" -gt "$MAX_FULL" ]; then
  echo "FALLO: el último full bueno es de hace $FULL s"
  MAL=1
fi

[ "$MAL" -eq 0 ] && echo "OK: incremental hace $INCREMENTAL s, full hace $FULL s (-1 = aún ninguno)"
exit "$MAL"
