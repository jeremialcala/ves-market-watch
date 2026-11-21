#!/usr/bin/env bash
# 90-vuelta-atras.sh: devuelve Criterio a midgard. Sirve desde cualquier punto
# del corte: cada paso mira cómo está antes de tocar nada.
#
#   bash deploy/traslado-nidavellir/90-vuelta-atras.sh             # con los datos
#   bash deploy/traslado-nidavellir/90-vuelta-atras.sh --sin-datos # sin traerlos
#
# Con los datos (por defecto): lo que nidavellir capturó desde el corte vuelve a
# midgard con rsync --checksum. Es lo correcto si Criterio llegó a correr en
# nidavellir.
#
# --sin-datos: midgard arranca con sus volúmenes tal como quedaron al pararlo.
# Es lo correcto si el corte se detuvo antes de arrancar los servicios en
# nidavellir (paso 6), o si los recuentos no coincidieron: en ese caso los datos
# de nidavellir no son de fiar y los de midgard están intactos. Lo capturado en
# nidavellir, si lo hubo, se pierde.
#
# Lo que deja: Criterio en marcha en midgard, con su receptor, sus unidades de
# host y su vigilancia de Yggdrasil; nidavellir con todo parado y desactivado,
# pero con sus volúmenes y ficheros, para reintentar.

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"

CON_DATOS=1
[ "${1:-}" = --sin-datos ] && CON_DATOS=0

echo "   Va a PARAR Criterio en nidavellir y arrancarlo en midgard."
[ "$CON_DATOS" -eq 1 ] && echo "   Los datos de nidavellir vuelven a midgard (rsync --checksum)." \
                       || echo "   SIN traer datos: midgard arranca con lo que tenía al pararse."
if [ "${CONFIRMAR:-}" != VOLVER ]; then
    read -r -p "   Escribe VOLVER para seguir: " r
    [ "$r" = VOLVER ] || falla "cancelado, no se tocó nada"
fi
T0=$(date +%s)

PASO_ACTUAL="1. guardar los bloques del receptor"
paso "$PASO_ACTUAL"
BLOQUES=$(apps_yml nidavellir extraer || true)
if [ "$(grep -c '^  - name: ves-' <<<"$BLOQUES")" -ne 6 ]; then
    # El corte se detuvo antes del alta en nidavellir: los bloques que guardó.
    f=$(ls -t "${TMPDIR:-/tmp}"/apps-ves-*.yml 2>/dev/null | head -1 || true)
    [ -n "$f" ] && BLOQUES=$(cat "$f")
fi
if [ "$(grep -c '^  - name: ves-' <<<"$BLOQUES")" -ne 6 ]; then
    n=$(en_midgard "sudo grep -c '^  - name: ves-' /etc/cd-receiver/apps.yml" || true)
    [ "${n:-0}" -eq 6 ] || falla "no encuentro los 6 bloques ves-*: restaurar a mano el último /etc/cd-receiver/apps.yml.bak-traslado-* de midgard"
    BLOQUES=""   # midgard aún los tiene: el corte no llegó a quitarlos
fi
bien "bloques del receptor localizados"

PASO_ACTUAL="2. parar nidavellir"
paso "$PASO_ACTUAL"
en_nidavellir "sudo systemctl disable --now $TEMPORIZADORES >/dev/null 2>&1; sudo systemctl disable $ARRANQUE >/dev/null 2>&1; true"
apps_yml nidavellir quitar | sed 's/^/   /'
recargar_receptor nidavellir
en_nidavellir "for c in $CONTENEDORES; do docker inspect \$c >/dev/null 2>&1 && docker update --restart=no \$c >/dev/null; done; true"
en_nidavellir "docker stop -t 30 $PRODUCTORES $CONSUMIDORES >/dev/null 2>&1; docker stop -t 30 ves-rabbitmq >/dev/null 2>&1; docker stop -t 180 ves-timescaledb >/dev/null 2>&1; true"
c=$(grep -c '^ves-' <<<"$(en_nidavellir "docker ps --format '{{.Names}}'")" || true)
[ "$c" -eq 0 ] || falla "quedan $c contenedores ves-* en marcha en nidavellir"
bien "nidavellir parado, sin receptor ni unidades"

if [ "$CON_DATOS" -eq 1 ]; then
    PASO_ACTUAL="3. datos de vuelta a midgard"
    paso "$PASO_ACTUAL"
    contiene 'database system is shut down' "$(en_nidavellir "docker logs --tail 20 ves-timescaledb 2>&1" || true)" \
        || falla "la base de nidavellir no consta apagada limpia: no se copia. Revisar, o --sin-datos"
    en_nidavellir "ssh-keygen -F $MIDGARD >/dev/null" \
        || falla "nidavellir no conoce la clave de host de midgard: ssh $USUARIO@$NIDAVELLIR y luego ssh $MIDGARD una vez"
    agente_iniciar
    ssh_rsync="ssh -o BatchMode=yes -o UserKnownHostsFile=/home/$USUARIO/.ssh/known_hosts"
    for v in $VOLUMENES; do
        ssh -A "${SSH_OPTS[@]}" "$USUARIO@$NIDAVELLIR" "sudo --preserve-env=SSH_AUTH_SOCK rsync -aH --numeric-ids --delete --checksum \
            -e '$ssh_rsync' --rsync-path='sudo rsync' \
            /var/lib/docker/volumes/$v/_data/ $USUARIO@$MIDGARD:/var/lib/docker/volumes/$v/_data/"
        bien "$v de vuelta en midgard"
    done
    estado=$(en_nidavellir "cd / && sudo sh -c 'ls var/lib/cd-receiver/ves-*.json var/lib/ves-market-respaldo-nas/ultimo-exito 2>/dev/null'" | tr '\n' ' ')
    [ -n "$estado" ] && en_nidavellir "sudo tar -C / -cpf - $estado" | en_midgard "sudo tar -C / -xpf -"
    bien "etiquetas del receptor y último respaldo al NAS de vuelta"
else
    paso "3. datos: se quedan los de midgard (--sin-datos)"
fi

PASO_ACTUAL="4. arrancar midgard"
paso "$PASO_ACTUAL"
if [ -n "$BLOQUES" ]; then
    apps_yml midgard anadir "$(printf '%s' "$BLOQUES" | base64 -w0)" | sed 's/^/   /'
fi
recargar_receptor midgard
en_midgard "docker update --restart=unless-stopped $CONTENEDORES >/dev/null"
en_midgard "sudo systemctl enable $ARRANQUE >/dev/null 2>&1"
# restart, no start: la unidad es oneshot con RemainAfterExit y puede constar
# «active» desde el último arranque de midgard; start no haría nada.
en_midgard "sudo systemctl restart $ARRANQUE"
en_midgard "systemctl is-active -q $ARRANQUE" || falla "la unidad de arranque falló en midgard: journalctl -u $ARRANQUE"
en_midgard "sudo systemctl enable --now $TEMPORIZADORES >/dev/null 2>&1"
bien "Criterio levantado en midgard; receptor, vigía, respaldo al NAS y arranque de vuelta"

PASO_ACTUAL="5. vigilancia de Yggdrasil"
bash "$AQUI/40-monitoreo.sh" --deshacer

paso "6. comprobación rápida"
sleep 90
edad=$(en_midgard "docker exec ves-timescaledb psql -U ves -d ves_market -Atc \"select extract(epoch from now() - max(captured_at))::int from p2p_snapshots_raw\"")
[ "${edad:-9999}" -le 180 ] && bien "midgard captura: último snapshot hace ${edad} s" || aviso "último snapshot hace ${edad:-?} s: revisar docker logs ves-ingestor-binance"
c=$(grep -c '^ves-' <<<"$(en_midgard "docker ps --format '{{.Names}}'")" || true)
bien "$c de 9 contenedores en marcha en midgard"

echo
echo "Vuelta atrás terminada en $(( $(date +%s) - T0 )) s. nidavellir conserva volúmenes y ficheros para reintentar."
