#!/usr/bin/env bash
# ves-market-vigia.sh: avisa por ntfy cuando la operación de Criterio falla, y
# cuando vuelve. Lo lanza ves-market-vigia.timer cada minuto.
#
# Mira dos cosas distintas, porque un contenedor en pie no es un servicio que
# funciona:
#
#   QUE ESTÉ EN PIE
#     - cada contenedor de VIGIA_CONTENEDORES: caído = no existe, no está en
#       marcha o su healthcheck dice unhealthy. El de `ves-respaldo` es `estado`,
#       así que por aquí llega también un respaldo atrasado, con su motivo.
#     - las unidades del host de VIGIA_UNIDADES.
#
#   QUE HAGA SU TRABAJO
#     - captura: hay un snapshot P2P de hace menos de VIGIA_MAX_CAPTURA_S;
#     - motor: los indicadores no van más de VIGIA_MAX_MOTOR_S por detrás de la
#       captura;
#     - tasas oficiales: el ingestor del BCV dejó constancia hace menos de
#       VIGIA_MAX_BCV_S;
#     - bus: la cola del motor tiene consumidor y no acumula, y la de descartes
#       está vacía;
#     - gateway: `/api/v1/health` da `ok` en sus tres componentes;
#     - acceso público: el API y el panel responden por el túnel;
#     - disco: la raíz no pasa de VIGIA_MAX_DISCO_PCT.
#
# Por qué en el host: si lo que falla es el bus, la base o el gateway, un aviso
# que dependiera de ellos no lo entregaría nadie. Va directo a ntfy.
#
# Lo que NO ve: que midgard entero esté apagado o sin red. Sin máquina no hay
# vigía, y sin internet no hay push.
#
# Contra el ruido, como el vigía de Yggdrasil:
#   - VIGIA_UMBRAL comprobaciones seguidas en fallo antes de avisar;
#   - nada en los primeros VIGIA_GRACIA_S segundos tras arrancar;
#   - un fallo no se cuenta dos veces: con docker caído no se mira ningún
#     contenedor, y con la base o el gateway caídos no se sondea lo que depende
#     de ellos;
#   - un push por pasada con la lista, recordatorio cada VIGIA_RECORDAR_H horas
#     y otro al volver.
# Si el push falla, no se marca como avisado y se reintenta en la siguiente.
#
# El tema de ntfy ES la credencial: se lee de AVISO_ENV (en midgard, un enlace
# a /etc/smartd-aviso.env).
set -euo pipefail

AVISO_ENV=${AVISO_ENV:-/etc/ves-market-aviso.env}
ESTADO=${VIGIA_ESTADO:-/var/lib/ves-market-vigia}
CONTENEDORES=${VIGIA_CONTENEDORES:-ves-timescaledb ves-rabbitmq ves-api-gateway ves-ingestor-binance ves-ingestor-bcv ves-indicator-engine ves-web-spa ves-respaldo ves-tunel}
UNIDADES=${VIGIA_UNIDADES:-ves-market-respaldo-nas.timer ves-market-respaldo-nas-vigia.timer}
URL_API=${VIGIA_URL_API:-https://criterio-api-dev.higerotech.com/api/v1/health}
URL_PANEL=${VIGIA_URL_PANEL:-https://criterio-dev.higerotech.com/}
URL_GATEWAY=${VIGIA_URL_GATEWAY:-http://127.0.0.1:8800/api/v1/health}
MAX_CAPTURA_S=${VIGIA_MAX_CAPTURA_S:-300}      # el ciclo es de 60 s
MAX_MOTOR_S=${VIGIA_MAX_MOTOR_S:-300}
MAX_BCV_S=${VIGIA_MAX_BCV_S:-7200}             # el ciclo es de 30 min
MAX_COLA=${VIGIA_MAX_COLA:-50}                 # entran 2 eventos por minuto
MAX_DISCO_PCT=${VIGIA_MAX_DISCO_PCT:-90}
UMBRAL=${VIGIA_UMBRAL:-3}
GRACIA_S=${VIGIA_GRACIA_S:-600}
RECORDAR_S=$(( ${VIGIA_RECORDAR_H:-6} * 3600 ))
UPTIME_S=${VIGIA_UPTIME_S:-$(cut -d. -f1 /proc/uptime)}
AHORA=${VIGIA_AHORA:-$(date +%s)}
HOST=$(hostname -s)

if [ "$UPTIME_S" -lt "$GRACIA_S" ]; then
    echo "vigia: arranque reciente (${UPTIME_S} s < ${GRACIA_S} s), no se comprueba"
    exit 0
fi
[ -r "$AVISO_ENV" ] || { echo "vigia: no puedo leer $AVISO_ENV"; exit 1; }
# shellcheck disable=SC1090
. "$AVISO_ENV"
[ -n "${AVISO_URL:-}" ] || { echo "vigia: AVISO_URL vacío en $AVISO_ENV"; exit 1; }
mkdir -p "$ESTADO"

enviar() {   # enviar <título> <prioridad> <etiquetas> <mensaje>
    curl -fsS -m 20 --retry 2 --retry-delay 5 \
        -H "Title: $HOST - $1" -H "Priority: $2" -H "Tags: $3" \
        -d "$4" "$AVISO_URL" >/dev/null
}

if [ "${1:-}" = prueba ]; then
    enviar "Prueba de aviso" default "white_check_mark" \
        "Canal de avisos del vigia de operacion de Criterio operativo."
    echo "vigia: prueba enviada"
    exit 0
fi

# --- Qué está en pie ---------------------------------------------------------

# Devuelve vacío si está bien, o el motivo del fallo. De un unhealthy se añade
# lo último que dijo su healthcheck: «unhealthy» a secas no dice qué mirar.
fallo_contenedor() {
    local s detalle
    s=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$1" 2>/dev/null) \
        || { echo "no existe"; return; }
    case "$s" in
        running\ unhealthy|paused\ unhealthy)
            detalle=$(docker inspect -f '{{json .State.Health.Log}}' "$1" 2>/dev/null | python3 -c '
import json, sys
registro = json.load(sys.stdin) or []
print(" ".join((registro[-1].get("Output") or "").split())[:160] if registro else "")
' 2>/dev/null) || detalle=""
            echo "unhealthy${detalle:+ ($detalle)}" ;;
        running\ *|paused\ *) ;;
        *) echo "${s%% *}" ;;
    esac
}

fallo_unidad() {
    local s
    s=$(systemctl is-active "$1" 2>/dev/null || true)
    [ "$s" = active ] || echo "${s:-desconocido}"
}

existe_unidad() { [ -n "$(systemctl list-unit-files --no-legend "$1" 2>/dev/null)" ]; }

en_marcha() {   # ¿corre este contenedor? Para no sondear lo que depende de uno caído.
    [ "$(docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || true)" = running ]
}

# --- Qué hace su trabajo -----------------------------------------------------
# Cada sonda devuelve vacío si está bien, o el motivo. Ninguna puede colgar la
# pasada: todas llevan su tiempo máximo, y sumados caben en un minuto
# (15 + 15 + 5 + 10 + 10 s).

minutos() { echo "$(( $1 / 60 )) min"; }

consulta() {   # una línea de la base, o nada si no responde a tiempo
    timeout 15 docker exec ves-timescaledb psql -U postgres -d ves_market -At -F ' ' \
        -c "set statement_timeout = '10s'" -c "$1" 2>/dev/null | tail -1
}

# Las tres edades de una vez: una consulta, no tres.
sondear_base() {
    local fila captura motor bcv
    fila=$(consulta "select coalesce(extract(epoch from now() - (select max(captured_at) from p2p_snapshots_raw))::int, -1),
                            coalesce(extract(epoch from (select max(captured_at) from p2p_snapshots_raw)
                                                      - (select max(as_of) from indicators))::int, -1),
                            coalesce(extract(epoch from now() - (select max(captured_at) from official_rates))::int, -1)") || fila=""
    read -r captura motor bcv <<<"${fila:-x x x}"
    if ! [[ "$captura" =~ ^-?[0-9]+$ && "$motor" =~ ^-?[0-9]+$ && "$bcv" =~ ^-?[0-9]+$ ]]; then
        registrar "s-base" "consultas a la base" "la base no responde a una consulta de 10 s"
        return
    fi
    registrar "s-base" "consultas a la base" ""

    if [ "$captura" -lt 0 ]; then
        registrar "s-captura" "captura P2P" "no hay ningún snapshot"
    elif [ "$captura" -gt "$MAX_CAPTURA_S" ]; then
        registrar "s-captura" "captura P2P" "sin snapshots desde hace $(minutos "$captura")"
    else
        registrar "s-captura" "captura P2P" ""
        # El motor solo se juzga si hay captura: si no entra nada, que él no
        # produzca nada es consecuencia, no otro fallo.
        if [ "$motor" -gt "$MAX_MOTOR_S" ]; then
            registrar "s-motor" "motor de indicadores" "va $(minutos "$motor") por detrás de la captura"
        else
            registrar "s-motor" "motor de indicadores" ""
        fi
    fi

    if [ "$bcv" -lt 0 ]; then
        registrar "s-bcv" "tasas oficiales (BCV)" "no hay ninguna captura"
    elif [ "$bcv" -gt "$MAX_BCV_S" ]; then
        registrar "s-bcv" "tasas oficiales (BCV)" "sin capturas desde hace $(minutos "$bcv")"
    else
        registrar "s-bcv" "tasas oficiales (BCV)" ""
    fi
}

sondear_bus() {
    local colas motor descartes
    colas=$(timeout 15 docker exec ves-rabbitmq rabbitmqctl -q list_queues name messages consumers 2>/dev/null) || colas=""
    if [ -z "$colas" ]; then
        registrar "s-bus" "bus de eventos" "rabbitmqctl no responde"
        return
    fi
    registrar "s-bus" "bus de eventos" ""
    motor=$(awk '$1 == "indicator-engine.market.events" {print $2, $3}' <<<"$colas")
    descartes=$(awk '$1 == "market.events.dlq" {print $2}' <<<"$colas")
    if [ -z "$motor" ]; then
        registrar "s-cola" "cola del motor" "no existe"
    elif [ "${motor#* }" = 0 ]; then
        registrar "s-cola" "cola del motor" "sin consumidor (${motor% *} eventos esperando)"
    elif [ "${motor% *}" -gt "$MAX_COLA" ]; then
        registrar "s-cola" "cola del motor" "${motor% *} eventos acumulados"
    else
        registrar "s-cola" "cola del motor" ""
    fi
    if [ -n "$descartes" ] && [ "$descartes" -gt 0 ]; then
        registrar "s-descartes" "cola de descartes" "$descartes evento(s) que el motor no pudo procesar"
    else
        registrar "s-descartes" "cola de descartes" ""
    fi
}

# Salud del gateway, por dentro o por el túnel. Mismo criterio en los dos:
# tiene que ser JSON con `status: ok`. Por el túnel, un HTML con 200 es
# justo el síntoma de un ingress mal puesto.
motivo_salud() {   # motivo_salud <url> <segundos>
    local cuerpo
    cuerpo=$(curl -sS -m "$2" "$1" 2>/dev/null) || { echo "no responde"; return; }
    python3 -c '
import json, sys
try:
    d = json.loads(sys.argv[1])
except ValueError:
    print("no devuelve JSON"); raise SystemExit
malos = [f"{k}={v}" for k, v in (d.get("components") or {}).items() if v != "ok"]
if d.get("status") != "ok" or malos:
    print("degradado: " + (", ".join(malos) or str(d.get("status"))))
' "$cuerpo"
}

motivo_http() {   # motivo_http <url>: vacío si responde 2xx
    local codigo
    codigo=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null) || { echo "no responde"; return; }
    case "$codigo" in 2??) ;; *) echo "responde HTTP $codigo" ;; esac
}

motivo_disco() {
    local pct
    pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
    [ "${pct:-0}" -lt "$MAX_DISCO_PCT" ] || echo "la raíz está al ${pct} %"
}

# --- Registro ----------------------------------------------------------------
caidos=(); recuerdos=(); recuperados=()
claves_avisadas=()

# registrar <clave> <nombre visible> <motivo o vacío>
registrar() {
    local clave="$1" nombre="$2" motivo="$3" f="$ESTADO/$1" fallos=0 avisado=0
    [ -f "$f" ] && read -r fallos avisado < "$f"
    if [ -z "$motivo" ]; then
        if [ "$avisado" -gt 0 ]; then recuperados+=("$nombre"); fi
        rm -f "$f"
        return
    fi
    fallos=$((fallos + 1))
    if [ "$fallos" -ge "$UMBRAL" ]; then
        if [ "$avisado" -eq 0 ]; then
            caidos+=("$nombre: $motivo"); claves_avisadas+=("$clave")
        elif [ $((AHORA - avisado)) -ge "$RECORDAR_S" ]; then
            recuerdos+=("$nombre: $motivo"); claves_avisadas+=("$clave")
        fi
    fi
    echo "$fallos $avisado" > "$f"
}

# Lo que NO se pudo sondear porque depende de algo caído: ni cuenta como fallo
# ni como recuperación. Se queda como estaba.
omitir() { :; }

# --- Pasada ------------------------------------------------------------------
# Lo que se quitó de las listas deja de vigilarse, y su estado se borra: si no,
# un contenedor retirado estando caído se quedaría «avisado» para siempre.
for f in "$ESTADO"/c-* "$ESTADO"/u-*; do
    [ -f "$f" ] || continue
    k=$(basename "$f")
    case " $(printf 'c-%s ' $CONTENEDORES)$(printf 'u-%s ' $UNIDADES)" in
        *" $k "*) ;;
        *) rm -f "$f" ;;
    esac
done

for u in $UNIDADES; do
    existe_unidad "$u" || continue
    registrar "u-$u" "$u" "$(fallo_unidad "$u")"
done

registrar "s-disco" "disco" "$(motivo_disco)"

# Con docker caído solo avisa quien lo vigila (el vigía de Yggdrasil): repetir
# aquí nueve «no existe» no añade nada.
if [ "$(systemctl is-active docker.service 2>/dev/null || true)" = active ]; then
    for c in $CONTENEDORES; do
        registrar "c-$c" "$c" "$(fallo_contenedor "$c")"
    done

    if en_marcha ves-timescaledb; then sondear_base; else omitir; fi
    if en_marcha ves-rabbitmq; then sondear_bus; else omitir; fi
    if en_marcha ves-api-gateway; then
        registrar "s-gateway" "gateway" "$(motivo_salud "$URL_GATEWAY" 5)"
        # Por fuera solo tiene sentido si por dentro hay algo que publicar.
        if en_marcha ves-tunel; then
            registrar "s-publico-api" "acceso público al API" "$(motivo_salud "$URL_API" 10)"
        fi
    fi
    if en_marcha ves-web-spa && en_marcha ves-tunel; then
        registrar "s-publico-panel" "acceso público al panel" "$(motivo_http "$URL_PANEL")"
    fi
fi

# --- Avisos ------------------------------------------------------------------
marcar_avisados() {
    local k f fallos avisado
    for k in "${claves_avisadas[@]}"; do
        f="$ESTADO/$k"; read -r fallos avisado < "$f"
        echo "$fallos $AHORA" > "$f"
    done
}

lista() { printf -- '- %s\n' "$@"; }

if [ ${#caidos[@]} -gt 0 ] || [ ${#recuerdos[@]} -gt 0 ]; then
    msg=""
    if [ ${#caidos[@]} -gt 0 ]; then msg+="Falla:"$'\n'"$(lista "${caidos[@]}")"$'\n'; fi
    if [ ${#recuerdos[@]} -gt 0 ]; then msg+="Sigue fallando:"$'\n'"$(lista "${recuerdos[@]}")"$'\n'; fi
    # El título va sin acentos: es una cabecera HTTP, y no todo lo que hay por
    # el camino las deja pasar enteras. El cuerpo sí los lleva.
    if enviar "Criterio: fallo de servicio" high "rotating_light" "${msg%$'\n'}"; then
        marcar_avisados
        echo "vigia: aviso enviado: ${caidos[*]} ${recuerdos[*]}"
    else
        echo "vigia: no se pudo enviar el aviso; se reintenta en la siguiente pasada"
    fi
fi

if [ ${#recuperados[@]} -gt 0 ]; then
    if enviar "Criterio: recuperado" default "white_check_mark" "De vuelta:"$'\n'"$(lista "${recuperados[@]}")"; then
        echo "vigia: recuperados: ${recuperados[*]}"
    else
        echo "vigia: no se pudo enviar el aviso de recuperación"
    fi
fi
exit 0
