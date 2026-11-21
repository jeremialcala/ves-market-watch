#!/usr/bin/env bash
# 50-verificar.sh: comprueba que Criterio funciona en nidavellir y que en midgard
# no queda nada en marcha. Lo llama 30-corte.sh; se puede repetir cuando se quiera.
#
#   bash deploy/traslado-nidavellir/50-verificar.sh
#
# Escribe dos cosas, a propósito: lanza un respaldo incremental a B2 y una pasada
# del vigía. Son las pruebas de que el respaldo y el aviso funcionan desde aquí.
# El respaldo al NAS (34 min) no se lanza: corre esta noche a las 00:30 de
# Caracas, y su vigía de las 08:10 dirá si salió.

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"
set +e
fallos=0
mal() { printf '   MAL  %s\n' "$*"; fallos=$((fallos + 1)); }

paso "nidavellir: contenedores"
estado=$(en_nidavellir "docker ps -a --filter name=ves- --format '{{.Names}} {{.Status}}'")
for c in $CONTENEDORES; do
    linea=$(grep -E "^$c " <<<"$estado")
    case $linea in
        *unhealthy*|*Restarting*|"") mal "$c: ${linea:-no existe}" ;;
        *" Up "*) bien "$linea" ;;
        *) mal "$linea" ;;
    esac
done

paso "nidavellir: que el servicio haga su trabajo"
edad=$(en_nidavellir "docker exec ves-timescaledb psql -U ves -d ves_market -Atc \"select extract(epoch from now() - max(captured_at))::int from p2p_snapshots_raw\"")
[ "${edad:-9999}" -le 180 ] && bien "último snapshot P2P hace ${edad} s" || mal "último snapshot P2P hace ${edad:-?} s (ciclo de 60 s)"
salud=$(en_nidavellir "curl -s -m 10 -w ' HTTP%{http_code}' http://127.0.0.1:8800/api/v1/health")
contiene 'HTTP200$' "$salud" && bien "gateway: $salud" || mal "gateway: $salud"
st=$(en_nidavellir "curl -s -m 10 $RECEPTOR/status")
n=$(grep -oE '"ves-[a-z-]+"' <<<"$st" | sort -u | wc -l)
[ "$n" -ge 6 ] && bien "el receptor de nidavellir conoce $n apps ves-*" || mal "el receptor de nidavellir conoce $n apps ves-* (6 esperadas)"

paso "Desde fuera, por Cloudflare y el túnel"
for url in https://criterio-api-dev.higerotech.com/api/v1/health https://criterio-dev.higerotech.com/; do
    c=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$url")
    [ "$c" = 200 ] && bien "$url: 200" || mal "$url: $c"
done

paso "Respaldo a B2 desde nidavellir"
if en_nidavellir "docker exec ves-respaldo respaldar incremental >/dev/null 2>&1"; then
    bien "incremental subido"
else
    mal "el incremental falló: docker logs --tail 30 ves-respaldo"
fi
en_nidavellir "docker exec ves-respaldo estado >/dev/null 2>&1" && bien "estado del respaldo: OK" || mal "estado del respaldo: no OK"

paso "Unidades de host en nidavellir"
for u in $TEMPORIZADORES; do
    en_nidavellir "systemctl is-active -q $u" && bien "$u activo" || mal "$u no está activo"
done
en_nidavellir "systemctl is-enabled -q $ARRANQUE" && bien "$ARRANQUE activada para el próximo arranque" || mal "$ARRANQUE no está activada"
en_nidavellir "sudo systemctl start ves-market-vigia.service" >/dev/null 2>&1
fallando=$(en_nidavellir "sudo ls /var/lib/ves-market-vigia 2>/dev/null" | tr '\n' ' ')
if [ -z "$fallando" ]; then
    bien "vigía: nada fallando"
else
    # s-bcv es previo al traslado: el ingestor del BCV no valida el certificado
    # nuevo del BCV desde ~2026-11-19 (README, «Lo que ya fallaba»).
    aviso "vigía: fallando ahora $fallando (s-bcv es previo al traslado)"
fi

paso "midgard: que no quede nada en marcha"
c=$(grep -c '^ves-' <<<"$(en_midgard "docker ps --format '{{.Names}}'")")
[ "$c" -eq 0 ] && bien "ningún contenedor ves-* en marcha" || mal "$c contenedores ves-* en marcha en midgard"
n=$(en_midgard "sudo grep -c '^  - name: ves-' /etc/cd-receiver/apps.yml" || true)
[ "${n:-1}" -eq 0 ] && bien "el receptor de midgard no tiene apps ves-*" || mal "el receptor de midgard aún tiene ${n} apps ves-*"
for u in $TEMPORIZADORES $ARRANQUE; do
    e=$(en_midgard "systemctl is-enabled $u 2>/dev/null || true")
    [ "$e" = enabled ] && mal "$u sigue activada en midgard" || bien "$u: $e en midgard"
done

echo
[ "$fallos" -eq 0 ] && { echo "Verificación sin fallos."; exit 0; }
echo "$fallos fallo(s). Si alguno afecta a la captura o a los datos: 90-vuelta-atras.sh"
exit 1
