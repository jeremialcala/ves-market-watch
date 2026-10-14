#!/usr/bin/env bash
# ves-market-respaldo-nas-aviso.sh: avisos por ntfy del respaldo de Criterio al NAS.
#
#   fallo    lo lanza ves-market-respaldo-nas-fallo.service (OnFailure= del
#            respaldo): push inmediato.
#   vigilar  lo lanza ves-market-respaldo-nas-vigia.timer cada mañana: push si
#            el último éxito tiene más de RESPALDO_MAX_HORAS. Cubre lo que
#            OnFailure no ve: un temporizador que no se dispara, o un respaldo
#            que nunca termina.
#   prueba   manda un push de prueba para comprobar el canal.
#
# Mismo esquema que los respaldos de Andvari y Yggdrasil en esta máquina.
#
# El tema de ntfy ES la credencial: quien lo conozca lee los avisos. Vive en
# AVISO_ENV (root, 600), que aquí es un enlace a /etc/smartd-aviso.env para que
# haya una sola copia que rotar.
set -euo pipefail

AVISO_ENV=${AVISO_ENV:-/etc/ves-market-aviso.env}
ESTADO=${RESPALDO_ESTADO:-/var/lib/ves-market-respaldo-nas}
MAX_HORAS=${RESPALDO_MAX_HORAS:-26}
HOST=$(hostname -s)

[ -r "$AVISO_ENV" ] || { echo "aviso: no puedo leer $AVISO_ENV" >&2; exit 1; }
# shellcheck disable=SC1090
. "$AVISO_ENV"
[ -n "${AVISO_URL:-}" ] || { echo "aviso: AVISO_URL vacío en $AVISO_ENV" >&2; exit 1; }

enviar() {   # enviar <título> <prioridad> <etiquetas> <mensaje>
    curl -fsS -m 20 --retry 3 --retry-delay 10 --retry-all-errors \
        -H "Title: $HOST - $1" -H "Priority: $2" -H "Tags: $3" \
        -d "$4" "$AVISO_URL" >/dev/null
    echo "aviso: enviado ($1)"
}

case "${1:-}" in
    fallo)
        # Las últimas líneas del propio respaldo: no llevan secretos, solo rutas y tamaños.
        detalle=$(journalctl -u ves-market-respaldo-nas.service -n 4 --no-pager -o cat 2>/dev/null | tail -n 4 || true)
        enviar "Respaldo Criterio al NAS FALLO" high "warning,floppy_disk" \
            "El respaldo diario de Criterio al NAS ha fallado. journalctl -u ves-market-respaldo-nas
$detalle"
        ;;
    vigilar)
        ahora=$(date -u +%s)
        if [ -r "$ESTADO/ultimo-exito" ]; then
            ultimo=$(cat "$ESTADO/ultimo-exito")
            horas=$(( (ahora - ultimo) / 3600 ))
        else
            horas=-1
        fi
        if [ "$horas" -ge 0 ] && [ "$horas" -lt "$MAX_HORAS" ]; then
            echo "aviso: último respaldo hace $horas h, en plazo"
            exit 0
        fi
        if [ "$horas" -lt 0 ]; then
            msg="No consta ningún respaldo completado ($ESTADO/ultimo-exito no existe)."
        else
            msg="El último respaldo completado fue hace $horas h (límite $MAX_HORAS h)."
        fi
        enviar "Respaldo Criterio al NAS atrasado" high "warning,floppy_disk" \
            "$msg systemctl list-timers ves-market-respaldo-nas.timer"
        ;;
    prueba)
        enviar "Prueba de aviso" default "white_check_mark" \
            "Canal de avisos del respaldo de Criterio al NAS operativo."
        ;;
    *)
        echo "uso: $0 fallo|vigilar|prueba" >&2; exit 2 ;;
esac
