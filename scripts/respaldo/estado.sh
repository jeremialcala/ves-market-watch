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
#   - hubo un full bueno y es más viejo que ESTADO_MAX_FULL_S, o
#   - hubo una verificación buena y es más vieja que ESTADO_MAX_VERIFICAR_S, o
#   - hubo un volcado de agregados bueno y es más viejo que
#     ESTADO_MAX_AGREGADOS_S.
#
# El full, la verificación y los agregados solo se exigen si ya hubo uno: un
# volumen de estado nuevo no puede esperar un día, una semana o un mes para dar
# verde. Del incremental se ocupa el `start_period` del compose.
#
# Los dos últimos existen porque un `.fallo` solo aparece si el trabajo CORRE y
# falla. Si a su hora el contenedor no está en pie, el cron no lo lanza y no
# queda rastro: así faltó el volcado de agregados de octubre de 2026, y lo dijo
# una persona mirando el listado, no esto.

set -eu

DIR="${ESTADO_DIR:-/var/lib/respaldo}"
MAX_INCREMENTAL="${ESTADO_MAX_INCREMENTAL_S:-9000}"  # 2 h 30 min
MAX_FULL="${ESTADO_MAX_FULL_S:-100800}"              # 28 h
# Semanal, los domingos a las 05:00: 7 días más lo que tarda en restaurar, con
# un día de margen.
MAX_VERIFICAR="${ESTADO_MAX_VERIFICAR_S:-691200}"    # 8 días
# Mensual, el día 1 a las 04:00: el mes más largo son 31 días.
MAX_AGREGADOS="${ESTADO_MAX_AGREGADOS_S:-2851200}"   # 33 días
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

VERIFICAR="$(edad verificar)"
if [ "$VERIFICAR" -gt "$MAX_VERIFICAR" ]; then
  echo "FALLO: la última verificación buena es de hace $(( VERIFICAR / 86400 )) días"
  MAL=1
fi

AGREGADOS="$(edad respaldo-agregados)"
if [ "$AGREGADOS" -gt "$MAX_AGREGADOS" ]; then
  echo "FALLO: el último volcado de agregados bueno es de hace $(( AGREGADOS / 86400 )) días"
  MAL=1
fi

[ "$MAL" -eq 0 ] && echo "OK: incremental hace $INCREMENTAL s, full hace $FULL s, verificación hace $VERIFICAR s, agregados hace $AGREGADOS s (-1 = aún ninguno)"
exit "$MAL"
