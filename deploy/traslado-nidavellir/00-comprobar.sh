#!/usr/bin/env bash
# 00-comprobar.sh: comprobaciones previas al traslado. SOLO LECTURA en los dos
# hosts: no crea, no para y no copia nada. Se puede correr las veces que haga
# falta; antes del corte, es obligatorio que salga sin bloqueos.
#
#   bash deploy/traslado-nidavellir/00-comprobar.sh
#
# Sale con 0 si no hay bloqueos (los avisos `!!` no bloquean) y con 1 si los hay.

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"
set +e   # aquí se recogen todos los fallos, no se sale al primero

bloqueos=0
bloquea() { printf '   BLOQUEA  %s\n' "$*"; bloqueos=$((bloqueos + 1)); }

paso "Conexión"
en_midgard true    && bien "ssh a midgard"    || bloquea "sin ssh a midgard ($MIDGARD)"
en_nidavellir true && bien "ssh a nidavellir" || bloquea "sin ssh a nidavellir ($NIDAVELLIR)"
for h in midgard nidavellir; do
    "en_$h" "sudo -n true" 2>/dev/null && bien "sudo sin contraseña en $h" || bloquea "sudo pide contraseña en $h"
done

paso "midgard: lo que se va a mover"
corriendo=$(grep -c '^ves-' <<<"$(en_midgard "docker ps --format '{{.Names}}'")")
[ "$corriendo" -eq 9 ] && bien "9 contenedores ves-* en marcha" || aviso "$corriendo de 9 contenedores ves-* en marcha"
for v in $VOLUMENES; do
    t=$(en_midgard "sudo du -sh /var/lib/docker/volumes/$v/_data 2>/dev/null | cut -f1")
    [ -n "$t" ] && bien "volumen $v: $t" || bloquea "no existe el volumen $v en midgard"
done
n=$(en_midgard "sudo grep -c '^  - name: ves-' /etc/cd-receiver/apps.yml")
[ "$n" = 6 ] && bien "6 apps ves-* en el receptor de midgard" || bloquea "el receptor de midgard tiene $n apps ves-*, se esperaban 6"
for d in $DIRS_SRV; do
    en_midgard "sudo test -f /$d/docker-compose.yml" || bloquea "falta /$d/docker-compose.yml en midgard"
done
bien "compose de infra, 6 apps y túnel presentes"
for f in $ETC_SECRETOS; do
    en_midgard "sudo test -s /$f" && bien "/$f presente" || bloquea "falta /$f en midgard"
done
en_midgard "command -v rsync >/dev/null" && bien "rsync en midgard" || bloquea "falta rsync en midgard"
p=$(en_midgard "sudo smartctl -A /dev/sda 2>/dev/null | awk '\$2==\"Current_Pending_Sector\"{print \$NF}'")
aviso "disco de midgard: ${p:-?} sectores pendientes (el 2026-11-21 eran 16). Si sube, no esperar al corte"

paso "midgard: diferencias entre lo desplegado y el repositorio"
for d in infra api-gateway web-spa ingestor-binance ingestor-bcv indicator-engine respaldo tunel; do
    case $d in infra) remoto=/srv/infra/ves-market ;; *) remoto=/srv/apps/ves-$d ;; esac
    a=$(sha256sum < "$AQUI/../midgard/$d/docker-compose.yml" | cut -c1-64)
    b=$(en_midgard "sudo sha256sum $remoto/docker-compose.yml | cut -c1-64")
    [ "$a" = "$b" ] && bien "$d: igual" || aviso "$d: el compose de midgard difiere del repositorio (se copia el de midgard)"
done

paso "nidavellir: que no haya nada de Criterio todavía"
for c in $CONTENEDORES; do
    en_nidavellir "docker inspect $c >/dev/null 2>&1" && aviso "ya existe el contenedor $c en nidavellir"
done
for v in $VOLUMENES; do
    en_nidavellir "docker volume inspect $v >/dev/null 2>&1" && aviso "ya existe el volumen $v (normal si ya se corrió 10-preparar.sh)"
done
contiene '^ves-(timescaledb|rabbitmq)$' "$(en_nidavellir "docker ps --format '{{.Names}}'")" \
    && bloquea "la base o el bus de Criterio YA CORREN en nidavellir"
for puerto in 8800 8080 15672; do
    en_nidavellir "ss -ltnH | awk '{print \$4}' | grep -q ':$puerto\$'" \
        && bloquea "el puerto $puerto ya está ocupado en nidavellir" || bien "puerto $puerto libre"
done

paso "nidavellir: capacidad"
libre=$(en_nidavellir "df -BG --output=avail /var/lib/docker | tail -1 | tr -dc 0-9")
[ "${libre:-0}" -ge 40 ] && bien "${libre} GB libres en /var/lib/docker (13 GB de base + restauración semanal)" \
    || bloquea "solo ${libre:-?} GB libres en /var/lib/docker; hacen falta 40"
mem=$(en_nidavellir "awk '/MemAvailable/{print int(\$2/1048576)}' /proc/meminfo")
[ "${mem:-0}" -ge 6 ] && bien "${mem} GiB de memoria disponible" || bloquea "solo ${mem:-?} GiB disponibles; el piloto exige 6 tras el traslado"
arr=$(en_nidavellir "journalctl --list-boots --no-pager 2>/dev/null | wc -l")
aviso "nidavellir: $arr arranques en el journal. Ver ADR-0037: la prueba de estrés del piloto sigue pendiente"

paso "nidavellir: lo que el servicio necesita del host"
en_nidavellir "systemctl is-active -q cd-receiver" && bien "receptor activo" || bloquea "cd-receiver no está activo en nidavellir"
en_nidavellir "systemctl is-active -q yggdrasil-baldr.service || systemctl is-enabled -q yggdrasil-baldr.service" \
    && bien "Baldr instalado" || aviso "Baldr no está instalado en nidavellir"
en_nidavellir "sudo test -d /mnt/nas/respaldos/ves-market" && bien "NAS montado, con /mnt/nas/respaldos/ves-market" \
    || bloquea "nidavellir no ve /mnt/nas/respaldos/ves-market"
a=$(en_midgard "sudo sha256sum /etc/smartd-aviso.env | cut -c1-64")
b=$(en_nidavellir "sudo sha256sum /etc/smartd-aviso.env | cut -c1-64")
[ -n "$a" ] && [ "$a" = "$b" ] && bien "mismo tema de ntfy en los dos hosts (por sha256)" \
    || bloquea "/etc/smartd-aviso.env difiere o falta: el vigía avisaría a otro sitio"
for b in rsync gpg python3 curl openssl timeout; do
    en_nidavellir "command -v $b >/dev/null" || bloquea "falta $b en nidavellir"
done
bien "herramientas: rsync, gpg, python3, curl, openssl, timeout"

paso "nidavellir: salida a internet (por PIA, ADR-0009 de Yggdrasil)"
for url in https://p2p.binance.com https://api.backblazeb2.com https://ghcr.io https://hc-ping.com; do
    c=$(en_nidavellir "curl -s -o /dev/null -m 15 -w '%{http_code}' $url" 2>/dev/null)
    case $c in 000|"") bloquea "$url no responde desde nidavellir" ;; *) bien "$url responde ($c)" ;; esac
done
# cloudflared no habla HTTPS en el 443 con su borde: la prueba es que los
# túneles que ya corren en nidavellir estén conectados.
t=deploy-service-tunnel
if en_nidavellir "docker inspect -f '{{.State.Running}}' $t 2>/dev/null | grep -q true" && [ "$(en_nidavellir "docker logs --since 72h $t 2>&1 | grep -c 'Registered tunnel connection'")" -gt 0 ]; then
    bien "Cloudflare alcanzable: el túnel $t está conectado"
else
    bloquea "ningún túnel de Cloudflare conectado en nidavellir"
fi
c=$(en_nidavellir "curl -s -o /dev/null -m 20 -w '%{http_code}' https://www.bcv.org.ve" 2>/dev/null)
aviso "BCV desde nidavellir con las CA del sistema: $c. El ingestor usa su CA anclada (apps/ingestor-bcv/certs) y en midgard falla desde ~2026-11-19: no es del traslado"

paso "Imágenes: que nidavellir pueda bajarlas"
for app in $APPS; do
    tag=$(etiqueta_en_midgard "$app")
    [ -n "$tag" ] || { bloquea "$app: sin etiqueta conocida en midgard"; continue; }
    img="ghcr.io/jeremialcala/ves-market-watch/${app#ves-}:$tag"
    en_nidavellir "docker manifest inspect $img >/dev/null 2>&1" && bien "$img accesible sin credenciales" \
        || bloquea "$img no se puede bajar desde nidavellir (¿paquete privado?)"
done

paso "rsync de host a host, con la clave del PC reenviada"
agente_iniciar
en_midgard_con_agente "sudo --preserve-env=SSH_AUTH_SOCK ssh -o BatchMode=yes -o UserKnownHostsFile=/home/$USUARIO/.ssh/known_hosts $USUARIO@$NIDAVELLIR 'sudo -n rsync --version >/dev/null'" \
    && bien "root en midgard entra en nidavellir y ejecuta sudo rsync" \
    || bloquea "el camino midgard -> nidavellir para rsync no funciona"
en_nidavellir "ssh-keygen -F $MIDGARD >/dev/null 2>&1" \
    && bien "nidavellir conoce la clave de midgard: la vuelta atrás puede traer datos" \
    || aviso "nidavellir no conoce la clave de midgard; la añade 10-preparar.sh, comprobando la huella"

echo
if [ "$bloqueos" -eq 0 ]; then
    echo "Sin bloqueos. Revisa los avisos (!!) antes de seguir."
    exit 0
fi
echo "$bloqueos bloqueo(s): no seguir hasta resolverlos."
exit 1
