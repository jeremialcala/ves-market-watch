#!/usr/bin/env bash
# sondeo-externo.sh: comprueba DESDE FUERA que Criterio responde, y avisa por
# ntfy cuando deja de hacerlo y cuando vuelve. Lo lanza el workflow
# `sondeo-externo.yml` cada diez minutos, desde un runner de GitHub.
#
# Existe por lo único que el vigía de midgard no puede ver: que midgard esté
# apagado o sin internet. Sin máquina no hay vigía, y con los cortes de luz de
# la casa ese es el fallo más frecuente.
#
# Qué mira: lo mismo que vería un cliente. Que el API dé su JSON de salud con
# todo en `ok`, y que el panel responda. Pasa por Cloudflare y por el túnel,
# así que también ve un túnel caído.
#
# Cómo decide avisar: por TRANSICIONES, no por estado. Guarda en
# SONDEO_ESTADO_DIR si la última vez respondía, y el workflow conserva ese
# directorio entre corridas. Avisa al pasar de bien a mal, lo recuerda cada
# SONDEO_RECORDAR_H horas mientras dure, y avisa al volver. Sin eso, una caída
# de un día serían 144 avisos.
#
# Sale con 0 aunque Criterio no responda: eso es un resultado, no un fallo del
# sondeo, y un workflow en rojo cada diez minutos manda un correo de GitHub
# cada diez minutos. Sale con 1 solo si no pudo avisar de algo que debía —sin
# canal, o con el canal caído—: ahí el correo de GitHub es el segundo canal.
set -euo pipefail

URL_API=${SONDEO_URL_API:-https://criterio-api-dev.higerotech.com/api/v1/health}
URL_PANEL=${SONDEO_URL_PANEL:-https://criterio-dev.higerotech.com/}
ESTADO_DIR=${SONDEO_ESTADO_DIR:-.sondeo}
INTENTOS=${SONDEO_INTENTOS:-3}
ESPERA_S=${SONDEO_ESPERA_S:-20}
RECORDAR_S=$(( ${SONDEO_RECORDAR_H:-6} * 3600 ))
AHORA=${SONDEO_AHORA:-$(date +%s)}
SIMULAR=${SONDEO_SIMULAR:-}

if [ -z "${AVISO_URL:-}" ]; then
    echo "sondeo: falta AVISO_URL (Settings → Secrets → Actions): no podría avisar de nada" >&2
    exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# --- Sondas ------------------------------------------------------------------
# Cada una devuelve vacío si está bien, o el motivo.

motivo_api() {
    local codigo
    codigo=$(curl -sS -m 15 -o "$tmp/api" -w '%{http_code}' "$URL_API" 2>/dev/null) || { echo "no responde"; return; }
    python3 - "$tmp/api" "$codigo" <<'PY'
import json, sys
codigo = sys.argv[2]
try:
    d = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
    if not isinstance(d, dict):
        raise ValueError
except ValueError:
    # Un HTML con 200 es el síntoma de un ingress del túnel mal puesto; un 5xx
    # de Cloudflare, el de un túnel sin nadie detrás.
    print(f"no devuelve su JSON (HTTP {codigo})")
    raise SystemExit
malos = [f"{k}={v}" for k, v in (d.get("components") or {}).items() if v != "ok"]
if d.get("status") != "ok" or malos:
    print("degradado: " + (", ".join(malos) or str(d.get("status"))))
PY
}

motivo_panel() {
    local codigo
    codigo=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$URL_PANEL" 2>/dev/null) || { echo "no responde"; return; }
    case "$codigo" in 2??) ;; *) echo "responde HTTP $codigo" ;; esac
}

# Varios intentos antes de dar algo por caído: un parpadeo de Cloudflare o del
# propio runner no es una caída.
api=""; panel=""
if [ "$SIMULAR" = fallo ]; then
    api="fallo simulado a mano, no es real"; panel="$api"
else
    for i in $(seq 1 "$INTENTOS"); do
        api=$(motivo_api); panel=$(motivo_panel)
        if [ -z "$api" ] && [ -z "$panel" ]; then break; fi
        if [ "$i" -lt "$INTENTOS" ]; then sleep "$ESPERA_S"; fi
    done
fi
if [ -z "$api" ] && [ -z "$panel" ]; then ahora_estado=ok; else ahora_estado=fallo; fi

# --- Estado anterior ---------------------------------------------------------
# Tres líneas clave=valor. Se leen campo a campo, sin `source`: es un fichero
# que viene de una caché.
leer() {
    [ -f "$ESTADO_DIR/estado" ] || return 0
    sed -n "s/^$1=\([0-9a-z]*\)$/\1/p" "$ESTADO_DIR/estado" | head -1
}
antes_estado=$(leer estado); antes_estado=${antes_estado:-desconocido}
desde=$(leer desde); desde=${desde:-$AHORA}
avisado=$(leer avisado); avisado=${avisado:-0}
antes_contenido=$(cat "$ESTADO_DIR/estado" 2>/dev/null || true)

# --- Avisos ------------------------------------------------------------------
enviar() {   # enviar <título> <prioridad> <etiquetas> <mensaje>
    # El título va sin acentos: es una cabecera HTTP.
    curl -fsS -m 20 --retry 2 --retry-delay 5 \
        -H "Title: $1" -H "Priority: $2" -H "Tags: $3" \
        -d "$4" "$AVISO_URL" >/dev/null
}

duracion() {   # duracion <segundos>
    local s=$1
    if [ "$s" -ge 7200 ]; then echo "$(( s / 3600 )) h $(( s % 3600 / 60 )) min"
    else echo "$(( s / 60 )) min"; fi
}

detalle="- API: ${api:-responde}
- panel: ${panel:-responde}"
pie="Sondeo desde GitHub Actions. Si midgard esta apagado o sin internet, su propio vigia no puede avisar."

rc=0
if [ "$ahora_estado" = fallo ]; then
    if [ "$antes_estado" != fallo ]; then
        desde=$AHORA; avisado=0
        if enviar "Criterio no responde desde fuera" high "rotating_light" "$detalle
$pie"; then
            avisado=$AHORA; echo "sondeo: aviso de caida enviado"
        else
            rc=1; echo "sondeo: NO se pudo enviar el aviso de caida" >&2
        fi
    elif [ "$avisado" -eq 0 ] || [ $(( AHORA - avisado )) -ge "$RECORDAR_S" ]; then
        if enviar "Criterio sigue sin responder desde fuera" high "rotating_light" "Lleva $(duracion $(( AHORA - desde ))) sin responder.
$detalle
$pie"; then
            avisado=$AHORA; echo "sondeo: recordatorio enviado"
        else
            rc=1; echo "sondeo: NO se pudo enviar el recordatorio" >&2
        fi
    fi
else
    # Solo se anuncia la vuelta de una caída que se llegó a avisar.
    if [ "$antes_estado" = fallo ] && [ "$avisado" -gt 0 ]; then
        if enviar "Criterio vuelve a responder desde fuera" default "white_check_mark" \
                "Estuvo sin responder unos $(duracion $(( AHORA - desde )))."; then
            echo "sondeo: aviso de recuperacion enviado"
        else
            rc=1; echo "sondeo: NO se pudo enviar el aviso de recuperacion" >&2
        fi
    fi
    if [ "$antes_estado" != ok ]; then desde=$AHORA; fi
    avisado=0
fi

# --- Estado nuevo ------------------------------------------------------------
mkdir -p "$ESTADO_DIR"
printf 'estado=%s\ndesde=%s\navisado=%s\n' "$ahora_estado" "$desde" "$avisado" > "$ESTADO_DIR/.estado.tmp"
mv -f "$ESTADO_DIR/.estado.tmp" "$ESTADO_DIR/estado"
if [ "$(cat "$ESTADO_DIR/estado")" = "$antes_contenido" ]; then cambio=no; else cambio=si; fi

echo "sondeo: $ahora_estado (antes: $antes_estado) | API: ${api:-ok} | panel: ${panel:-ok} | cambio de estado: $cambio"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "cambio=$cambio" >> "$GITHUB_OUTPUT"
    echo "estado=$ahora_estado" >> "$GITHUB_OUTPUT"
fi
exit "$rc"
