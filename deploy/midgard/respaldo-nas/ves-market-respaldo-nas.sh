#!/usr/bin/env bash
# ves-market-respaldo-nas.sh: respaldo diario de Criterio al NAS.
#
# Es la SEGUNDA copia, independiente de la de Backblaze B2 (scripts/respaldo/):
# otro volcado, otro destino y otro camino. Si el contenedor `ves-respaldo` se
# rompe, o B2 no deja bajar, o se pierden las claves que descifran lo de B2,
# esto sigue en pie. Por eso no reutiliza el volcado de aquel: lo hace de nuevo.
#
# Deja tres piezas por ejecución, con el mismo sello en el nombre:
#
#   ves_market-<sello>.dump          volcado completo, SIN cifrar. Se restaura
#                                    sin ninguna clave: es para lo que está.
#   despliegue-<sello>.tar.gz        lo no secreto: compose, inventario del
#                                    receptor, versiones y un manifiesto.
#   secretos-<sello>.tar.gz.gpg      los .env y el rclone.conf, CIFRADOS con la
#                                    frase de /etc/ves-market-respaldo.frase.
#
# La frase vive en esta máquina (root, 600) para que el respaldo corra
# desatendido, y tiene que existir además FUERA de ella y fuera del NAS: sin la
# frase, el paquete de secretos no lo abre nadie. El manifiesto lleva su huella
# para comprobar, al restaurar, que la frase que se tiene es la que lo cifró.
#
# Lo lanza ves-market-respaldo-nas.timer. A mano:
#   sudo systemctl start ves-market-respaldo-nas.service
set -euo pipefail
umask 077

DESTINO=${RESPALDO_DESTINO:-/mnt/nas/respaldos/ves-market}
RETENER=${RESPALDO_RETENER:-7}
ESTADO=${RESPALDO_ESTADO:-/var/lib/ves-market-respaldo-nas}
FRASE=${RESPALDO_FRASE:-/etc/ves-market-respaldo.frase}
MINIMO_BYTES=${RESPALDO_MINIMO_BYTES:-1073741824}   # 1 GiB: por debajo, algo falló
CONTENEDOR=ves-timescaledb
BASE=ves_market
INFRA=/srv/infra/ves-market
VOL_RCLONE=/var/lib/docker/volumes/ves_rclone_config/_data

[ "$(id -u)" -eq 0 ] || { echo "respaldo: ejecutar como root" >&2; exit 1; }
[ -s "$FRASE" ] || { echo "respaldo: falta $FRASE; ejecuta respaldo-nas/instalar.sh" >&2; exit 1; }

# El trap va antes de crear nada.
tmp=""
limpiar() {
    docker rm -f ves-respaldo-nas >/dev/null 2>&1 || true
    if [ -n "$tmp" ]; then
        gpgconf --homedir "$tmp/gnupg" --kill gpg-agent >/dev/null 2>&1 || true
        rm -rf "$tmp"
    fi
    # Un volcado a medias no se queda en el NAS con pinta de respaldo.
    rm -f "$DESTINO"/.*.parcial 2>/dev/null || true
}
trap limpiar EXIT

# Tras un apagón el temporizador puede dispararse antes de que la base esté en pie.
salud=desconocido
for _ in $(seq 1 60); do
    salud="$(docker inspect "$CONTENEDOR" --format '{{.State.Health.Status}}' 2>/dev/null || true)"
    [ "$salud" = healthy ] && break
    sleep 5
done
[ "$salud" = healthy ] || { echo "respaldo: la base no está sana ($salud)" >&2; exit 1; }

# Tras un apagón el NAS arranca más despacio que midgard: el 2026-10-28 el
# temporizador (Persistent=true) lanzó esto a los 10 min del arranque y el `ls`
# murió con «No such device». Se espera al montaje igual que a la base. El `ls`
# dispara el automount; findmnt confirma que hay algo montado que no es el autofs.
montado() {
    timeout 20 ls "$1" >/dev/null 2>&1 && findmnt -rn -o FSTYPE --target "$1" 2>/dev/null | grep -qvx autofs
}
for _ in $(seq 1 "$(( ${RESPALDO_ESPERA_NAS_S:-900} / 15 ))"); do
    montado "$(dirname "$DESTINO")" && break
    sleep 15
done
# Si el NAS no responde, falla aquí.
ls "$(dirname "$DESTINO")" >/dev/null
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

sello=$(date -u +%Y%m%dT%H%MZ)   # UTC explícito: el host va en UTC y la casa no
tmp=$(mktemp -d /var/tmp/ves-market-respaldo-nas.XXXXXX)   # disco local, no /tmp en RAM
volcado="ves_market-$sello.dump"
despliegue="despliegue-$sello.tar.gz"
secretos="secretos-$sello.tar.gz.gpg"
sumas="$sello.sha256"

psql_base() { docker exec "$CONTENEDOR" psql -U postgres -d "$BASE" -At -v ON_ERROR_STOP=1 -c "$1"; }

# --- 1. el volcado ------------------------------------------------------------
# Con la MISMA imagen que la base: mismo `pg_dump` que el servidor. Escribe
# directo en el NAS, sin pasar por el disco local, y a un archivo y no a una
# tubería: así el volcado lleva los desplazamientos de cada tabla y se puede
# restaurar una sola sin leerlo entero.
#
# `zstd` y no el gzip del respaldo a B2: en este i3 gzip -6 saca 2,4 MB/s y un
# volcado dura más de media hora, durante la cual las consultas pesadas del
# motor agotan su tiempo. La contraseña viaja por el entorno, no como argumento.
imagen=$(docker inspect "$CONTENEDOR" --format '{{.Config.Image}}')
chunks_antes=$(psql_base "select count(*) from timescaledb_information.chunks")
inicio=$(date +%s)
echo "respaldo: volcando $BASE al NAS ($DESTINO)"
PGPASSWORD=$(grep '^POSTGRES_PASSWORD=' "$INFRA/.env" | cut -d= -f2-)
export PGPASSWORD
docker run --rm --name ves-respaldo-nas --network ves-market \
    --memory 512m --cpu-shares 256 \
    -e PGPASSWORD --entrypoint pg_dump -v "$DESTINO":/destino "$imagen" \
    -h "$CONTENEDOR" -U ves -d "$BASE" -Fc -Z zstd:3 --no-tablespaces \
    -f "/destino/.$volcado.parcial"
unset PGPASSWORD
seg_volcado=$(( $(date +%s) - inicio ))

bytes=$(stat -c %s "$DESTINO/.$volcado.parcial")
[ "$bytes" -ge "$MINIMO_BYTES" ] \
    || { echo "respaldo: el volcado pesa $bytes bytes, menos del mínimo creíble" >&2; exit 1; }

# Se comprueba ANTES de darlo por bueno, leyendo el índice del propio archivo
# desde el NAS: tiene que traer datos de, al menos, tantos chunks como había al
# empezar. Un volcado en verde y vacío de datos ya pasó una vez en este proyecto.
docker run --rm --entrypoint pg_restore -v "$DESTINO":/destino:ro "$imagen" \
    -l "/destino/.$volcado.parcial" > "$tmp/indice.txt"
chunks_volcado=$(grep -c 'TABLE DATA _timescaledb_internal _hyper_' "$tmp/indice.txt" || true)
[ "$chunks_volcado" -ge "$chunks_antes" ] \
    || { echo "respaldo: el volcado trae datos de $chunks_volcado chunks y la base tenía $chunks_antes" >&2; exit 1; }
# El índice está al principio del archivo y no dice nada del resto. Esto lo lee
# ENTERO desde el NAS y lo descomprime a ninguna parte: no toca la base, tarda
# menos de un minuto y falla si un solo bloque no se puede leer.
docker run --rm --memory 512m --entrypoint pg_restore -v "$DESTINO":/destino:ro "$imagen" \
    -f /dev/null "/destino/.$volcado.parcial"
echo "respaldo: volcado de $(( bytes / 1048576 )) MiB en ${seg_volcado}s, $chunks_volcado chunks con datos (había $chunks_antes), leído entero"

# --- 2. lo no secreto ---------------------------------------------------------
mkdir -p "$tmp/d"
{
    echo "sello_utc=$sello"
    echo "host=$(hostname -s)"
    echo "base=$BASE"
    echo "servidor=$(psql_base 'show server_version')"
    echo "timescaledb=$(psql_base "select extversion from pg_extension where extname = 'timescaledb'")"
    echo "imagen_base=$imagen"
    echo "chunks=$chunks_volcado"
    echo "volcado_bytes=$bytes"
    echo "volcado_segundos=$seg_volcado"
    echo "frase_sha256=$(sha256sum "$FRASE" | cut -d' ' -f1)"
    echo "# contenedores y la imagen que corre cada uno"
    docker ps --format '{{.Names}}={{.Image}}' | grep '^ves-' | sort
    echo "# claves de cada .env (solo los nombres; los valores van en el paquete cifrado)"
    for f in "$INFRA/.env" /srv/apps/ves-*/.env; do
        if [ -f "$f" ]; then echo "$f: $(cut -d= -f1 "$f" | tr '\n' ' ')"; fi
    done
} > "$tmp/d/manifiesto.txt"
(
    cd /
    ls srv/infra/ves-market/docker-compose.yml srv/apps/ves-*/docker-compose.yml \
       etc/cd-receiver/apps.yml usr/local/sbin/ves-market-*.sh \
       etc/systemd/system/ves-market-*.service etc/systemd/system/ves-market-*.timer \
       2>/dev/null > "$tmp/lista-despliegue.txt" || true
    [ -s "$tmp/lista-despliegue.txt" ] || { echo "respaldo: no encuentro los ficheros del despliegue" >&2; exit 1; }
    tar --numeric-owner -cpf "$tmp/d/despliegue.tar" -T "$tmp/lista-despliegue.txt"
)
tar -C "$tmp" -czf "$tmp/$despliegue" d
tar -tzf "$tmp/$despliegue" >/dev/null

# --- 3. los secretos, cifrados ------------------------------------------------
# El tar en claro no toca el disco: va por tubería a gpg. Cifrado simétrico con
# la frase; lo abre `gpg -d` en cualquier máquina que la tenga.
mkdir -p "$tmp/gnupg"
chmod 700 "$tmp/gnupg"
(
    cd /
    ls srv/infra/ves-market/.env srv/apps/ves-*/.env 2>/dev/null > "$tmp/lista-secretos.txt" || true
    [ -s "$tmp/lista-secretos.txt" ] || { echo "respaldo: no encuentro ningún .env" >&2; exit 1; }
    echo "${VOL_RCLONE#/}" >> "$tmp/lista-secretos.txt"
    tar --numeric-owner -cpzf - -T "$tmp/lista-secretos.txt"
) | gpg --homedir "$tmp/gnupg" --batch --yes --quiet --pinentry-mode loopback \
        --passphrase-file "$FRASE" --symmetric --cipher-algo AES256 \
        -o "$tmp/$secretos"
# Y se comprueba que se abre con esa misma frase y trae lo que se metió.
dentro=$(gpg --homedir "$tmp/gnupg" --batch --quiet --pinentry-mode loopback \
             --passphrase-file "$FRASE" -d "$tmp/$secretos" | tar -tzf - | grep -c '\.env$\|rclone\.conf$' || true)
esperados=$(( $(grep -c '\.env$' "$tmp/lista-secretos.txt") + 1 ))
[ "$dentro" -eq "$esperados" ] \
    || { echo "respaldo: el paquete de secretos trae $dentro ficheros y se esperaban $esperados" >&2; exit 1; }
echo "respaldo: secretos cifrados y comprobados ($dentro ficheros)"

# --- 4. al NAS, con sumas -----------------------------------------------------
cp "$tmp/$despliegue" "$DESTINO/.$despliegue.parcial"
cp "$tmp/$secretos" "$DESTINO/.$secretos.parcial"
mv -f "$DESTINO/.$despliegue.parcial" "$DESTINO/$despliegue"
mv -f "$DESTINO/.$secretos.parcial" "$DESTINO/$secretos"
mv -f "$DESTINO/.$volcado.parcial" "$DESTINO/$volcado"
# Las dos piezas pequeñas se suman en local y se comprueban en el NAS. La del
# volcado se calcula leyéndolo del NAS: sirve para detectar que cambie después.
( cd "$tmp" && sha256sum "$despliegue" "$secretos" > "$tmp/$sumas" )
( cd "$DESTINO" && sha256sum -c --quiet "$tmp/$sumas" ) \
    || { echo "respaldo: la copia en el NAS no coincide con la suma" >&2; exit 1; }
( cd "$DESTINO" && sha256sum "$volcado" >> "$tmp/$sumas" )
cp "$tmp/$sumas" "$DESTINO/$sumas"
chmod 600 "$DESTINO/$volcado" "$DESTINO/$despliegue" "$DESTINO/$secretos" "$DESTINO/$sumas"

# --- 5. retención -------------------------------------------------------------
# Los RETENER más recientes, por el NOMBRE (lleva la fecha UTC del servidor) y
# no por mtime: la pone el reloj del NAS, que va desfasado. Nunca borra si lo
# de hoy no quedó verificado: `set -e` ya habría salido antes.
volcados=("$DESTINO"/ves_market-*.dump)   # el glob sale ordenado, del más antiguo al más nuevo
viejos=()
if [ "${#volcados[@]}" -gt "$RETENER" ]; then
    viejos=("${volcados[@]:0:${#volcados[@]}-RETENER}")
fi
for f in "${viejos[@]}"; do
    s=$(basename "$f" .dump); s=${s#ves_market-}
    rm -f "$f" "$DESTINO/despliegue-$s.tar.gz" "$DESTINO/secretos-$s.tar.gz.gpg" "$DESTINO/$s.sha256"
done

# Marca del último éxito: solo tras una copia verificada. La lee el vigía.
mkdir -p "$ESTADO"
chmod 755 "$ESTADO"
date -u +%s > "$ESTADO/.ultimo-exito.tmp"
chmod 644 "$ESTADO/.ultimo-exito.tmp"
mv -f "$ESTADO/.ultimo-exito.tmp" "$ESTADO/ultimo-exito"

echo "respaldo: $sello verificado ($(du -sh "$DESTINO" | cut -f1) en el NAS); ${#viejos[@]} antiguo(s) borrado(s)"
