#!/usr/bin/env bash
# instalar.sh: instala el respaldo de Criterio al NAS en midgard. Idempotente.
#
#   sudo ./instalar.sh
#
# Deja los dos scripts en /usr/local/sbin, las cinco unidades en systemd y los
# dos temporizadores activos. No ejecuta ningún respaldo.
#
# Si no existe, GENERA la frase que cifra el paquete de secretos. Nace en esta
# máquina y no se imprime: quien la guarda fuera es el operador, con
#   sudo cat /etc/ves-market-respaldo.frase
# Si ya existe no la toca: cambiarla dejaría sin abrir los paquetes anteriores
# para quien solo tenga la nueva.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRASE=/etc/ves-market-respaldo.frase
AVISO_ENV=/etc/ves-market-aviso.env

[ "$(id -u)" -eq 0 ] || { echo "instalar: ejecutar como root" >&2; exit 1; }
command -v gpg >/dev/null || { echo "instalar: falta gpg" >&2; exit 1; }

install -m 755 -o root -g root "$AQUI/ves-market-respaldo-nas.sh" /usr/local/sbin/ves-market-respaldo-nas.sh
install -m 755 -o root -g root "$AQUI/ves-market-respaldo-nas-aviso.sh" /usr/local/sbin/ves-market-respaldo-nas-aviso.sh
for u in ves-market-respaldo-nas.service ves-market-respaldo-nas.timer \
         ves-market-respaldo-nas-fallo.service \
         ves-market-respaldo-nas-vigia.service ves-market-respaldo-nas-vigia.timer; do
    install -m 644 -o root -g root "$AQUI/$u" "/etc/systemd/system/$u"
done

# Una sola copia del tema de ntfy que rotar: la del disco.
if [ ! -e "$AVISO_ENV" ]; then
    [ -r /etc/smartd-aviso.env ] || { echo "instalar: falta /etc/smartd-aviso.env con AVISO_URL" >&2; exit 1; }
    ln -s /etc/smartd-aviso.env "$AVISO_ENV"
    echo "instalar: $AVISO_ENV -> /etc/smartd-aviso.env"
fi

if [ ! -s "$FRASE" ]; then
    ( umask 077 && openssl rand -base64 32 > "$FRASE" )
    chown root:root "$FRASE"
    chmod 600 "$FRASE"
    echo "instalar: frase nueva en $FRASE. GUÁRDALA FUERA de esta máquina y del NAS:"
    echo "            sudo cat $FRASE"
else
    echo "instalar: $FRASE ya existe, se conserva"
fi

systemctl daemon-reload
systemctl enable --now ves-market-respaldo-nas.timer ves-market-respaldo-nas-vigia.timer >/dev/null
systemctl list-timers --no-pager ves-market-respaldo-nas.timer ves-market-respaldo-nas-vigia.timer | sed -n 1,3p
