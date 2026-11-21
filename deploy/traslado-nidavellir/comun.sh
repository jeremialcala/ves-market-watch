# comun.sh: variables y funciones de los scripts del traslado a nidavellir.
# No se ejecuta: lo cargan los demás con `source`.
#
# Los scripts corren en el PC (Git Bash) y hablan por ssh con los dos hosts,
# como en el traslado de hive y morocota del 2026-11-02 (ADR-0012 de Yggdrasil).
# Los secretos viajan por tubería entre los dos hosts y se comparan por sha256:
# ningún script imprime un `.env` ni la frase.

set -euo pipefail

MIDGARD=${MIDGARD:-192.168.10.1}
NIDAVELLIR=${NIDAVELLIR:-192.168.10.2}
USUARIO=${USUARIO:-jalcala}
CLAVE=${CLAVE:-$HOME/.ssh/id_ed25519_hgtech001}

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -i "$CLAVE")

# Las seis apps del receptor (proyecto compose = nombre de la app).
APPS="ves-api-gateway ves-web-spa ves-ingestor-binance ves-ingestor-bcv ves-indicator-engine ves-respaldo"

# Lo que se copia de /srv: la infraestructura, las seis apps y el túnel.
DIRS_SRV="srv/infra/ves-market srv/apps/ves-api-gateway srv/apps/ves-web-spa srv/apps/ves-ingestor-binance srv/apps/ves-ingestor-bcv srv/apps/ves-indicator-engine srv/apps/ves-respaldo srv/apps/ves-tunel"

# Volúmenes con datos. `ves-market-infra_timescale-data` NO va: es la base vacía
# del despliegue parcial de septiembre (ADR-0034, pendiente de borrar).
VOLUMENES="ves_market_datos ves-market-infra_rabbitmq-data ves_rclone_config ves_respaldo_estado"

# Los nueve contenedores, en el orden en que se paran: primero los que escriben,
# después los que leen y al final la base y el bus.
PRODUCTORES="ves-ingestor-binance ves-ingestor-bcv"
CONSUMIDORES="ves-indicator-engine ves-respaldo ves-api-gateway ves-web-spa ves-tunel"
INFRA="ves-rabbitmq ves-timescaledb"
CONTENEDORES="$PRODUCTORES $CONSUMIDORES $INFRA"

# Unidades de host del repositorio (deploy/midgard/).
TEMPORIZADORES="ves-market-vigia.timer ves-market-respaldo-nas.timer ves-market-respaldo-nas-vigia.timer"
ARRANQUE=ves-market-arranque.service

# Ficheros de /etc que van con el servicio. El enlace del aviso se recrea
# apuntando al /etc/smartd-aviso.env de nidavellir, que es el mismo tema de ntfy.
ETC_SECRETOS="etc/ves-market-respaldo.frase etc/ves-market-latido.env"

RECEPTOR=http://127.0.0.1:9000

en_midgard()    { ssh "${SSH_OPTS[@]}" "$USUARIO@$MIDGARD" "$@"; }
en_nidavellir() { ssh "${SSH_OPTS[@]}" "$USUARIO@$NIDAVELLIR" "$@"; }

paso()  { printf '\n== %s\n' "$*"; }
bien()  { printf '   ok  %s\n' "$*"; }
aviso() { printf '   !!  %s\n' "$*"; }
falla() {
    printf '   ERROR  %s\n' "$*" >&2
    [ -n "${PASO_ACTUAL:-}" ] && printf '   Detenido en el paso: %s. Ver 90-vuelta-atras.sh\n' "$PASO_ACTUAL" >&2
    exit 1
}

# grep sobre una variable, sin tubería. Con pipefail, `cmd | grep -q` puede dar
# un falso negativo: grep cierra al encontrar, cmd muere por SIGPIPE y la tubería
# entera sale con error. En una guarda (`... | grep -q x && falla`) eso es una
# guarda que no salta justo cuando debe.
contiene() { grep -qE -- "$1" <<<"$2"; }

# Agente ssh temporal: el rsync entre hosts corre en midgard y se autentica en
# nidavellir con la clave del PC, reenviada con `ssh -A`. La clave nunca sale
# del PC. El agente muere al salir el script.
agente_iniciar() {
    eval "$(ssh-agent -s)" >/dev/null
    trap 'ssh-agent -k >/dev/null 2>&1 || true' EXIT
    ssh-add "$CLAVE" >/dev/null 2>&1 || falla "ssh-add no pudo cargar $CLAVE"
}
en_midgard_con_agente() { ssh -A "${SSH_OPTS[@]}" "$USUARIO@$MIDGARD" "$@"; }

# rsync de un volumen de midgard a nidavellir. `--numeric-ids` porque los
# ficheros son de los uid de DENTRO del contenedor (postgres, rabbitmq), que no
# existen con ese nombre en ningún host. Root en midgard usa el agente reenviado
# y el known_hosts de $USUARIO, que ya conoce la clave de nidavellir.
sincronizar_volumen() {
    local v=$1 extra=${2:-}
    local ssh_rsync="ssh -o BatchMode=yes -o UserKnownHostsFile=/home/$USUARIO/.ssh/known_hosts"
    en_midgard_con_agente "sudo --preserve-env=SSH_AUTH_SOCK rsync -aH --numeric-ids --delete $extra \
        -e '$ssh_rsync' --rsync-path='sudo rsync' \
        /var/lib/docker/volumes/$v/_data/ $USUARIO@$NIDAVELLIR:/var/lib/docker/volumes/$v/_data/"
}

# Copia rutas absolutas (sin la / inicial) de midgard a nidavellir conservando
# dueño por NOMBRE y permisos. Pasa por el PC, en tubería: para configuración y
# secretos, que son pocos KB. Los datos van con sincronizar_volumen.
copiar_rutas() {
    en_midgard "sudo tar -C / -cpf - $*" | en_nidavellir "sudo tar -C / -xpf -"
}

# sha256 de cada fichero bajo esas rutas, en un host. Imprime hashes, nunca
# contenido: es la forma de comparar secretos sin verlos.
huellas() {
    local host=$1; shift
    "en_$host" "cd / && sudo find $* -type f -exec sha256sum {} + | sort -k2"
}

comparar_huellas() {
    local a b
    a=$(huellas midgard "$@") || falla "no pude calcular huellas en midgard"
    b=$(huellas nidavellir "$@") || falla "no pude calcular huellas en nidavellir"
    if [ "$a" = "$b" ]; then
        bien "$(printf '%s\n' "$a" | wc -l | tr -d ' ') ficheros idénticos en los dos hosts"
    else
        diff <(printf '%s\n' "$a" | awk '{print $2, substr($1,1,12)}') \
             <(printf '%s\n' "$b" | awk '{print $2, substr($1,1,12)}') || true
        falla "las huellas no coinciden"
    fi
}

# Etiqueta de imagen que corre ahora una app en midgard: la que el receptor tiene
# apuntada y, si falta, la del contenedor. Igual que ves-market-arranque.sh.
etiqueta_en_midgard() {
    en_midgard "sudo python3 - $1" <<'PY'
import json, subprocess, sys
app = sys.argv[1]
try:
    with open(f"/var/lib/cd-receiver/{app}.json", encoding="utf-8") as f:
        tag = json.load(f).get("current_tag") or ""
except (OSError, ValueError):
    tag = ""
if not tag:
    r = subprocess.run(["docker", "inspect", app, "--format", "{{.Config.Image}}"],
                       capture_output=True, text=True)
    img = r.stdout.strip()
    if r.returncode == 0 and ":" in img.rsplit("/", 1)[-1]:
        tag = img.rsplit(":", 1)[-1]
print(tag)
PY
}

# Sello de esta ejecución: nombra las copias de respaldo de lo que se edita.
SELLO=${SELLO:-$(date -u +%Y%m%d-%H%M%S)}

# apps.yml del receptor: extraer, quitar o añadir los bloques `- name: ves-*`.
# Los bloques no llevan secretos (repo, rama, workflow, rutas e imagen).
apps_yml() {
    local host=$1 modo=$2 b64=${3:-}
    "en_$host" "sudo python3 - $modo /etc/cd-receiver/apps.yml $SELLO $b64" <<'PY'
import base64, re, shutil, sys
modo, ruta, sello = sys.argv[1], sys.argv[2], sys.argv[3]
texto = open(ruta, encoding="utf-8").read()
lineas = texto.splitlines(keepends=True)
item = re.compile(r"^  - name: (\S+)")
idx = [i for i, l in enumerate(lineas) if item.match(l)]
cabecera = lineas[: idx[0]] if idx else lineas
segs = []
for k, i in enumerate(idx):
    j = idx[k + 1] if k + 1 < len(idx) else len(lineas)
    segs.append((item.match(lineas[i]).group(1), "".join(lineas[i:j])))
ves = [s for n, s in segs if n.startswith("ves-")]
if modo == "extraer":
    sys.stdout.write("".join(ves))
elif modo == "quitar":
    if not ves:
        print("sin apps ves-*: nada que quitar"); sys.exit(0)
    shutil.copy2(ruta, f"{ruta}.bak-traslado-{sello}")
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write("".join(cabecera) + "".join(s for n, s in segs if not n.startswith("ves-")))
    print(f"quitadas {len(ves)} apps; copia en {ruta}.bak-traslado-{sello}")
elif modo == "anadir":
    if ves:
        print(f"ya hay {len(ves)} apps ves-*: no se añade nada"); sys.exit(0)
    nuevo = base64.b64decode(sys.argv[4]).decode("utf-8")
    shutil.copy2(ruta, f"{ruta}.bak-traslado-{sello}")
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto.rstrip("\n") + "\n\n  # Criterio (ADR-0034 y ADR-0037).\n" + nuevo.rstrip("\n") + "\n")
    print(f"añadidas {nuevo.count('  - name: ves-')} apps; copia en {ruta}.bak-traslado-{sello}")
PY
}

recargar_receptor() {
    local c
    c=$("en_$1" "curl -sS -o /dev/null -w '%{http_code}' -X POST $RECEPTOR/reload" || true)
    contiene '^2' "$c" || falla "el receptor de $1 no aceptó el reload (HTTP $c)"
}

# Hora de Caracas y día de la semana (1 = lunes). Se calcula como UTC-4 fijo:
# Venezuela no tiene horario de verano, y Git Bash puede no traer zoneinfo.
hora_vet() { date -u -d '-4 hours' +%H%M; }
dia_vet()  { date -u -d '-4 hours' +%u; }
