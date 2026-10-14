#!/usr/bin/env bash
# Pruebas de `sondeo-externo.sh`.
#
# Levanta en local un servidor que hace de Criterio (sano, degradado, con HTML
# donde debía ir JSON, intermitente) y de ntfy (apunta lo que le llega), y
# comprueba qué avisa el sondeo en cada transición. Sin red y sin tocar nada
# real. Corre en CI y a mano:
#
#   bash scripts/sondeo/tests/prueba-sondeo.sh
set -u

SONDEO="$(cd "$(dirname "$0")/.." && pwd)/sondeo-externo.sh"
D="$(mktemp -d)"
PUERTO=${PRUEBA_PUERTO:-18977}
BASE="http://127.0.0.1:$PUERTO"
SERVIDOR=""
trap '[ -n "$SERVIDOR" ] && kill "$SERVIDOR" 2>/dev/null; rm -rf "$D"' EXIT

cat > "$D/servidor.py" <<'PY'
import http.server, json, sys

avisos, puerto = sys.argv[1], int(sys.argv[2])
intermitente = {"n": 0}

class H(http.server.BaseHTTPRequestHandler):
    def _responder(self, codigo, cuerpo, tipo="application/json"):
        datos = cuerpo.encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        sano = json.dumps({"status": "ok", "components": {"database": "ok", "broker": "ok", "auth": "ok"}})
        if self.path == "/salud":
            self._responder(200, sano)
        elif self.path == "/degradado":
            self._responder(503, json.dumps({"status": "degraded", "components": {"database": "down", "broker": "ok", "auth": "ok"}}))
        elif self.path == "/html":
            self._responder(200, "<html>panel</html>", "text/html")
        elif self.path == "/tunel-caido":
            self._responder(530, "error code: 1033", "text/plain")
        elif self.path == "/intermitente":
            intermitente["n"] += 1
            if intermitente["n"] == 1:
                self._responder(502, "Bad gateway", "text/plain")
            else:
                self._responder(200, sano)
        elif self.path == "/panel":
            self._responder(200, "<html>panel</html>", "text/html")
        else:
            self._responder(404, "no", "text/plain")

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        if self.path != "/tema":
            self._responder(500, "canal roto", "text/plain")
            return
        with open(avisos, "a", encoding="utf-8") as f:
            f.write(f"TITULO={self.headers.get('Title')} PRIORIDAD={self.headers.get('Priority')}\n{cuerpo}\n")
        self._responder(200, "{}")

    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", puerto), H).serve_forever()
PY

python3 "$D/servidor.py" "$D/avisos.txt" "$PUERTO" &
SERVIDOR=$!
for _ in $(seq 1 50); do
    curl -s -o /dev/null "$BASE/salud" 2>/dev/null && break
    sleep 0.1
done

T0=1800000000
FALLOS=0
TOTAL=0

# correr <segundos desde T0> [VAR=valor ...]: deja la salida en $SALIDA, el
# código en $RC y lo que llegó a «ntfy» en esa corrida en $AVISOS.
correr() {
    local t=$1; shift
    : > "$D/avisos.txt"
    RC=0
    SALIDA=$(env AVISO_URL="$BASE/tema" SONDEO_ESTADO_DIR="$D/estado" \
        SONDEO_URL_API="$BASE/salud" SONDEO_URL_PANEL="$BASE/panel" \
        SONDEO_INTENTOS=1 SONDEO_ESPERA_S=0 SONDEO_AHORA=$(( T0 + t )) GITHUB_OUTPUT="$D/salida.txt" \
        "$@" bash "$SONDEO" 2>&1) || RC=$?
    AVISOS=$(cat "$D/avisos.txt")
}

# comprobar <descripción> <código esperado> <texto que debe estar en los avisos, o NADA>
comprobar() {
    TOTAL=$(( TOTAL + 1 ))
    local bien=1
    [ "$RC" -eq "$2" ] || bien=0
    if [ "$3" = NADA ]; then
        [ -z "$AVISOS" ] || bien=0
    else
        echo "$AVISOS" | grep -q "$3" || bien=0
    fi
    if [ "$bien" = 1 ]; then
        echo "ok    $1"
    else
        echo "FALLA $1"
        echo "      se esperaba código $2 y en los avisos «$3»; salió $RC"
        echo "$SALIDA" | sed 's/^/      salida | /'
        echo "$AVISOS" | sed 's/^/      avisos | /'
        FALLOS=$(( FALLOS + 1 ))
    fi
}

estado() { sed -n "s/^$1=//p" "$D/estado/estado"; }
igual() {   # igual <descripción> <valor> <esperado>
    TOTAL=$(( TOTAL + 1 ))
    if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FALLA $1: «$2» y se esperaba «$3»"; FALLOS=$(( FALLOS + 1 )); fi
}

CAIDO="SONDEO_URL_API=http://127.0.0.1:1/nadie"   # puerto cerrado: no responde

correr 0
comprobar "la primera vez, respondiendo, no avisa de nada" 0 NADA
igual     "y deja apuntado que responde" "$(estado estado)" ok
igual     "la primera vez hay cambio de estado que guardar" "$(tail -2 "$D/salida.txt" | head -1)" "cambio=si"

correr 600
comprobar "si sigue respondiendo, calla" 0 NADA
igual     "y no hay nada nuevo que guardar" "$(tail -2 "$D/salida.txt" | head -1)" "cambio=no"

correr 1200 "$CAIDO"
comprobar "al dejar de responder, AVISA" 0 "TITULO=Criterio no responde desde fuera PRIORIDAD=high"
comprobar "y dice qué falla y qué no" 0 "API: no responde"
igual     "apunta desde cuándo" "$(estado desde)" "$(( T0 + 1200 ))"

correr 1800 "$CAIDO"
comprobar "diez minutos después sigue caído: calla" 0 NADA

correr $(( 1200 + 6 * 3600 )) "$CAIDO"
comprobar "a las seis horas, RECUERDA, con lo que lleva" 0 "Lleva 6 h 0 min sin responder"

correr $(( 1200 + 6 * 3600 + 600 )) "$CAIDO"
comprobar "y después del recordatorio vuelve a callar" 0 NADA

correr $(( 1200 + 7 * 3600 ))
comprobar "al volver, AVISA con la duración" 0 "Estuvo sin responder unos 7 h 0 min"
comprobar "y lo hace sin prioridad alta" 0 "TITULO=Criterio vuelve a responder desde fuera PRIORIDAD=default"

correr $(( 1200 + 7 * 3600 + 600 ))
comprobar "ya recuperado, calla" 0 NADA

correr 40000 SONDEO_URL_API="$BASE/degradado"
comprobar "un gateway degradado se dice con el componente" 0 "API: degradado: database=down"
correr 40600
comprobar "(recuperación)" 0 "vuelve a responder"

correr 50000 SONDEO_URL_API="$BASE/html"
comprobar "un HTML donde iba el JSON es un fallo: ingress mal puesto" 0 "no devuelve su JSON (HTTP 200)"
correr 50600

correr 60000 SONDEO_URL_API="$BASE/tunel-caido"
comprobar "el error de Cloudflare con el túnel caído se reconoce" 0 "no devuelve su JSON (HTTP 530)"
correr 60600

correr 70000 SONDEO_URL_PANEL="$BASE/no-existe"
comprobar "si solo cae el panel, lo dice y dice que el API responde" 0 "panel: responde HTTP 404"
comprobar "y que el API sí responde" 0 "API: responde"
correr 70600

correr 80000 SONDEO_URL_API="$BASE/intermitente" SONDEO_INTENTOS=2
comprobar "un parpadeo que pasa al segundo intento no es una caída" 0 NADA

correr 90000 SONDEO_SIMULAR=fallo
comprobar "el fallo simulado avisa, y dice que no es real" 0 "fallo simulado a mano, no es real"
correr 90600
comprobar "y a la corrida siguiente llega la recuperación" 0 "vuelve a responder"

correr 100000 "$CAIDO" AVISO_URL="$BASE/canal-roto"
comprobar "caído y con el canal roto: sale con 1 para que avise GitHub" 1 NADA
igual     "y no lo da por avisado" "$(estado avisado)" 0
correr 100600 "$CAIDO"
comprobar "cuando el canal vuelve, avisa de lo que quedó pendiente" 0 "Criterio sigue sin responder desde fuera"
correr 101200

correr 110000 "$CAIDO" AVISO_URL="$BASE/canal-roto"
correr 110600 AVISO_URL="$BASE/canal-roto"
comprobar "una caída que nunca se llegó a avisar no anuncia su vuelta" 0 NADA

correr 120000 AVISO_URL=
comprobar "sin canal configurado, se niega a correr" 1 NADA

echo
echo "$(( TOTAL - FALLOS )) de $TOTAL pruebas en verde"
[ "$FALLOS" -eq 0 ]
