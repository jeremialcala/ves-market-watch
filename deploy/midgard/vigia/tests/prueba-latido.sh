#!/usr/bin/env bash
# Pruebas del latido de `ves-market-vigia.sh`.
#
# Corre el vigía con un `systemctl` de mentira que da docker por parado, así
# que la única sonda real es el disco, y con su umbral se le hace fallar o no.
# Un servidor local hace de ntfy (que puede estar roto) y de Healthchecks
# (apunta cada ping). Sin red y sin tocar nada real. Corre en CI y a mano:
#
#   bash deploy/midgard/vigia/tests/prueba-latido.sh
set -u

VIGIA="$(cd "$(dirname "$0")/.." && pwd)/ves-market-vigia.sh"
D="$(mktemp -d)"
PUERTO=${PRUEBA_PUERTO:-18978}
BASE="http://127.0.0.1:$PUERTO"
SERVIDOR=""
trap '[ -n "$SERVIDOR" ] && kill "$SERVIDOR" 2>/dev/null; rm -rf "$D"' EXIT

cat > "$D/servidor.py" <<'PY'
import http.server, sys

registro, puerto = sys.argv[1], int(sys.argv[2])

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        if self.path.startswith("/roto"):
            self.send_response(500); self.end_headers()
            return
        with open(registro, "a", encoding="utf-8") as f:
            f.write(f"{self.path} | {' / '.join(cuerpo.splitlines())}\n")
        self.send_response(200); self.end_headers()

    def do_GET(self):
        self.send_response(200); self.end_headers()

    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", puerto), H).serve_forever()
PY

python3 "$D/servidor.py" "$D/registro.txt" "$PUERTO" &
SERVIDOR=$!
for _ in $(seq 1 50); do
    curl -s -o /dev/null "$BASE/" 2>/dev/null && break
    sleep 0.1
done

# systemctl de mentira: docker parado, ninguna unidad instalada.
mkdir -p "$D/bin"
cat > "$D/bin/systemctl" <<'SH'
#!/bin/sh
case "$1" in
    is-active) echo inactive; exit 3 ;;
    *) exit 0 ;;
esac
SH
chmod +x "$D/bin/systemctl"

echo "AVISO_URL=$BASE/tema" > "$D/aviso.env"
echo "AVISO_URL=$BASE/roto" > "$D/aviso-roto.env"
echo "LATIDO_URL=$BASE/latido" > "$D/latido.env"
echo "LATIDO_URL=http://127.0.0.1:1/nadie" > "$D/latido-caido.env"
echo "OTRA_COSA=1" > "$D/latido-vacio.env"

FALLOS=0
TOTAL=0
SANO="VIGIA_MAX_DISCO_PCT=101"
ENFERMO="VIGIA_MAX_DISCO_PCT=0"

# correr [VAR=valor ...] [-- argumentos]: deja la salida en $SALIDA, el código
# en $RC y lo que llegó al servidor en esa corrida en $LLEGO.
correr() {
    local vars=() args=()
    while [ $# -gt 0 ]; do
        if [ "$1" = -- ]; then shift; args=("$@"); break; fi
        vars+=("$1"); shift
    done
    : > "$D/registro.txt"
    RC=0
    SALIDA=$(env PATH="$D/bin:$PATH" AVISO_ENV="$D/aviso.env" LATIDO_ENV="$D/latido.env" \
        VIGIA_ESTADO="$D/estado" VIGIA_UPTIME_S=99999 VIGIA_UMBRAL=1 \
        "${vars[@]}" bash "$VIGIA" "${args[@]}" 2>&1) || RC=$?
    LLEGO=$(cat "$D/registro.txt")
}

# comprobar <descripción> <texto que debe estar en lo que llegó, o NADA>
comprobar() {
    TOTAL=$(( TOTAL + 1 ))
    local bien=1
    [ "$RC" -eq 0 ] || bien=0
    if [ "$2" = NADA ]; then
        [ -z "$LLEGO" ] || bien=0
    else
        echo "$LLEGO" | grep -qF -- "$2" || bien=0
    fi
    if [ "$bien" = 1 ]; then
        echo "ok    $1"
    else
        echo "FALLA $1"
        echo "      se esperaba código 0 y «$2»; salió $RC"
        echo "$SALIDA" | sed 's/^/      salida | /'
        echo "$LLEGO" | sed 's/^/      llegó  | /'
        FALLOS=$(( FALLOS + 1 ))
    fi
}

# no_esta <descripción> <texto que NO debe estar en lo que llegó>
no_esta() {
    TOTAL=$(( TOTAL + 1 ))
    if echo "$LLEGO" | grep -qF -- "$2"; then
        echo "FALLA $1"; echo "$LLEGO" | sed 's/^/      llegó  | /'; FALLOS=$(( FALLOS + 1 ))
    else
        echo "ok    $1"
    fi
}

correr "$SANO"
comprobar "una pasada sin fallos late, sin más" "/latido | pasada completa"
no_esta   "y no manda nada a ntfy" "/tema"

correr "$SANO" VIGIA_UPTIME_S=30
comprobar "recién arrancado no comprueba, pero late" "/latido | arranque reciente, sin comprobar"

correr "$ENFERMO"
comprobar "con un fallo avisado por ntfy, avisa..." "/tema | Falla:"
comprobar "...y el latido es bueno: el aviso salió" "/latido | pasada completa"
no_esta   "sin latido de fallo" "/latido/fail"
correr "$SANO"
comprobar "(recuperación)" "/tema | De vuelta:"

correr "$ENFERMO" AVISO_ENV="$D/aviso-roto.env"
comprobar "con ntfy roto, el latido es de FALLO, con lo que no salió" "/latido/fail | El vigia de"
comprobar "y lleva el motivo" "la raíz está al"
correr "$ENFERMO" AVISO_ENV="$D/aviso-roto.env"
comprobar "mientras ntfy siga roto, cada pasada repite el fallo" "/latido/fail"
correr "$ENFERMO"
comprobar "cuando ntfy vuelve, avisa lo pendiente..." "/tema | Falla:"
comprobar "...y el latido vuelve a ser bueno" "/latido | pasada completa"
correr "$SANO" AVISO_ENV="$D/aviso-roto.env"
comprobar "una recuperación que no sale por ntfy también es latido de fallo" "/latido/fail | El vigia de"
comprobar "y dice qué volvió" "De vuelta:"

correr "$SANO" -- prueba-latido
comprobar "el latido de prueba es de fallo y dice que no es real" "/latido/fail | Prueba del latido a mano, no es real"
no_esta   "y no comprueba nada más" "pasada completa"

correr "$SANO" LATIDO_ENV="$D/no-existe.env"
comprobar "sin fichero de latido, el vigía funciona igual" NADA

correr "$SANO" LATIDO_ENV="$D/latido-vacio.env"
comprobar "un fichero sin LATIDO_URL no rompe la pasada" NADA
TOTAL=$(( TOTAL + 1 ))
if echo "$SALIDA" | grep -q "no tiene LATIDO_URL"; then echo "ok    y lo dice"; else echo "FALLA no dice que falta LATIDO_URL"; FALLOS=$(( FALLOS + 1 )); fi

correr "$SANO" LATIDO_ENV="$D/latido-caido.env"
comprobar "con Healthchecks caído, la pasada sale bien" NADA
TOTAL=$(( TOTAL + 1 ))
if echo "$SALIDA" | grep -q "no se pudo dar el latido"; then echo "ok    y lo dice"; else echo "FALLA no dice que no pudo latir"; FALLOS=$(( FALLOS + 1 )); fi

echo
echo "$(( TOTAL - FALLOS )) de $TOTAL pruebas en verde"
[ "$FALLOS" -eq 0 ]
