#!/usr/bin/env bash
# instalar.sh: instala el vigía de operación de Criterio en midgard. Idempotente.
#
#   sudo ./instalar.sh
#
# Deja el script en /usr/local/sbin, la unidad y el temporizador en systemd, y
# el temporizador activo. Usa el mismo tema de ntfy que el resto de avisos de
# la máquina.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AVISO_ENV=/etc/ves-market-aviso.env

[ "$(id -u)" -eq 0 ] || { echo "instalar: ejecutar como root" >&2; exit 1; }
for c in docker curl python3 timeout; do
    command -v "$c" >/dev/null || { echo "instalar: falta $c" >&2; exit 1; }
done

install -m 755 -o root -g root "$AQUI/ves-market-vigia.sh" /usr/local/sbin/ves-market-vigia.sh
install -m 644 -o root -g root "$AQUI/ves-market-vigia.service" /etc/systemd/system/ves-market-vigia.service
install -m 644 -o root -g root "$AQUI/ves-market-vigia.timer" /etc/systemd/system/ves-market-vigia.timer

# Una sola copia del tema de ntfy que rotar: la del disco.
if [ ! -e "$AVISO_ENV" ]; then
    [ -r /etc/smartd-aviso.env ] || { echo "instalar: falta /etc/smartd-aviso.env con AVISO_URL" >&2; exit 1; }
    ln -s /etc/smartd-aviso.env "$AVISO_ENV"
    echo "instalar: $AVISO_ENV -> /etc/smartd-aviso.env"
fi

systemctl daemon-reload
systemctl enable --now ves-market-vigia.timer >/dev/null
systemctl list-timers --no-pager ves-market-vigia.timer | sed -n 1,2p
