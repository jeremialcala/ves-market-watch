#!/usr/bin/env bash
# 10-preparar.sh: deja nidavellir listo para recibir a Criterio SIN ARRANCAR NADA.
# Escribe solo en nidavellir; en midgard solo lee. Idempotente: se puede repetir,
# y conviene repetirlo justo antes del corte si en midgard cambió un `.env`.
#
#   bash deploy/traslado-nidavellir/10-preparar.sh
#
# Qué hace:
#   1. Crea la red `ves-market` y los cuatro volúmenes, vacíos.
#   2. Copia de midgard los compose y los `.env` de infra, apps y túnel, y los
#      compara por sha256. Los `.env` viajan por tubería, nunca a pantalla.
#   3. Copia los scripts y unidades de host que corren hoy en midgard y los deja
#      INSTALADOS PERO DESACTIVADOS: sus instalar.sh hacen `enable --now`, y aquí
#      encenderían el vigía y el respaldo contra un stack vacío.
#   4. Copia la frase del respaldo al NAS ANTES que nada que pueda generarla:
#      respaldo-nas/instalar.sh crea una nueva si falta, y con otra frase los
#      paquetes de secretos ya hechos no se abrirían.
#   5. Baja las imágenes exactas que corren en midgard.
#
# Qué NO hace: copiar datos (20-presincronizar.sh), tocar los receptores, ni
# arrancar contenedores o unidades. Deshacerlo: ver «Vuelta atrás» en el README.

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"

paso "Guardas"
contiene '^ves-' "$(en_nidavellir "docker ps --format '{{.Names}}'")" \
    && falla "ya hay contenedores ves-* EN MARCHA en nidavellir: esto es para antes del corte"
bien "nada de Criterio corriendo en nidavellir"

paso "0. nidavellir conoce la clave de host de midgard (para volver con datos)"
# La vuelta atrás copia los volúmenes de nidavellir a midgard con rsync, desde
# nidavellir. La clave no se acepta a ciegas: la huella que anuncia midgard por la
# red tiene que ser la de su propio fichero de clave, leído por la conexión ssh
# ya verificada desde el PC.
if en_nidavellir "ssh-keygen -F $MIDGARD >/dev/null 2>&1"; then
    bien "ya la conoce"
else
    real=$(en_midgard "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub" | awk '{print $2}')
    linea=$(en_nidavellir "ssh-keyscan -t ed25519 $MIDGARD 2>/dev/null")
    vista=$(ssh-keygen -lf - <<<"$linea" | awk '{print $2}')
    [ -n "$real" ] && [ "$vista" = "$real" ] || falla "la huella que ve nidavellir ($vista) no es la de midgard ($real)"
    en_nidavellir "umask 077 && mkdir -p ~/.ssh && cat >> ~/.ssh/known_hosts" <<<"$linea"
    bien "añadida, huella $real comprobada en los dos extremos"
fi

paso "1. Red y volúmenes"
en_nidavellir "docker network inspect ves-market >/dev/null 2>&1 || docker network create ves-market >/dev/null"
bien "red ves-market"
for v in $VOLUMENES; do
    etiquetas=""
    # El del bus lo gestiona compose (no es `external`): con sus etiquetas, compose
    # lo reconoce como suyo y no avisa de que «no lo creó él».
    [ "$v" = ves-market-infra_rabbitmq-data ] && \
        etiquetas="--label com.docker.compose.project=ves-market-infra --label com.docker.compose.volume=rabbitmq-data"
    en_nidavellir "docker volume inspect $v >/dev/null 2>&1 || docker volume create $etiquetas $v >/dev/null"
    bien "volumen $v"
done

paso "2. Compose y .env de infra, apps y túnel"
copiar_rutas $DIRS_SRV
comparar_huellas $DIRS_SRV
en_nidavellir "sudo stat -c '%U:%G %a %n' /srv/infra/ves-market/.env /srv/apps/ves-*/.env 2>/dev/null" | sed 's/^/   /'

paso "3. La frase y el latido (antes de instalar nada)"
copiar_rutas $ETC_SECRETOS
comparar_huellas $ETC_SECRETOS
en_nidavellir "sudo sh -c 'test -e /etc/ves-market-aviso.env || ln -s /etc/smartd-aviso.env /etc/ves-market-aviso.env'"
bien "/etc/ves-market-aviso.env -> /etc/smartd-aviso.env (mismo tema de ntfy, comprobado en 00)"

paso "4. Scripts y unidades de host, sin activar"
# Las versiones que corren en midgard, no las del repositorio: es lo probado.
lista=$(en_midgard "cd / && sudo sh -c 'ls -d usr/local/sbin/ves-market-*.sh etc/systemd/system/ves-market-* 2>/dev/null'" | tr '\n' ' ')
[ -n "$lista" ] || falla "no encontré unidades ves-market-* en midgard"
copiar_rutas $lista
comparar_huellas $lista
en_nidavellir "sudo systemctl daemon-reload"
for u in $TEMPORIZADORES $ARRANQUE; do
    e=$(en_nidavellir "systemctl is-enabled $u 2>/dev/null || true")
    case $e in
        enabled) falla "$u quedó ACTIVADA en nidavellir: desactívala antes de seguir" ;;
        *) bien "$u instalada, $e" ;;
    esac
done

paso "5. Imágenes"
en_nidavellir "sudo docker compose --project-directory /srv/infra/ves-market pull -q" && bien "TimescaleDB y RabbitMQ, por digest"
for app in $APPS; do
    tag=$(etiqueta_en_midgard "$app")
    [ -n "$tag" ] || falla "$app: sin etiqueta conocida en midgard"
    en_nidavellir "sudo env IMAGE_TAG=$tag docker compose --project-directory /srv/apps/$app -p $app pull -q"
    bien "$app:$tag"
done
en_nidavellir "sudo docker compose --project-directory /srv/apps/ves-tunel pull -q" && bien "túnel"

paso "6. Que los compose se dejen interpretar en nidavellir"
en_nidavellir "sudo docker compose --project-directory /srv/infra/ves-market config -q" && bien "infra"
for app in $APPS; do
    en_nidavellir "sudo env IMAGE_TAG=x docker compose --project-directory /srv/apps/$app -p $app config -q" && bien "$app"
done

echo
echo "nidavellir preparado. Nada arrancado. Siguiente: 20-presincronizar.sh."
