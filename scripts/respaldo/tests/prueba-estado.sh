#!/bin/sh
# Pruebas de `estado.sh`, el healthcheck del contenedor de respaldo.
#
# Sin dependencias: monta un directorio de sellos falso y comprueba qué dice
# `estado` y con qué código sale. Corre en CI y a mano:
#
#   sh scripts/respaldo/tests/prueba-estado.sh
set -eu

ESTADO_SH="$(cd "$(dirname "$0")/.." && pwd)/estado.sh"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
AHORA="$(date -u +%s)"
FALLOS=0
TOTAL=0

limpiar() { rm -f "$DIR"/*.ok "$DIR"/*.fallo; }
# sello <trabajo> <segundos de antigüedad>
sello() { echo $(( AHORA - $2 )) > "$DIR/$1.ok"; }

# espera <código> <texto que debe aparecer> <descripción>
espera() {
  TOTAL=$(( TOTAL + 1 ))
  rc=0
  salida="$(ESTADO_DIR="$DIR" sh "$ESTADO_SH" 2>&1)" || rc=$?
  if [ "$rc" -eq "$1" ] && echo "$salida" | grep -q "$2"; then
    echo "ok    $3"
  else
    echo "FALLA $3"
    echo "      se esperaba código $1 y el texto «$2»; salió $rc:"
    echo "$salida" | sed 's/^/      | /'
    FALLOS=$(( FALLOS + 1 ))
  fi
}

DIA=86400

limpiar
espera 1 "ningún incremental" "sin ningún sello no está sano"

limpiar; sello respaldo-incremental 600
espera 0 "^OK" "con solo un incremental reciente está sano: lo demás aún no ha tocado"

limpiar; sello respaldo-incremental 9600
espera 1 "último incremental" "un incremental de hace 2 h 40 min no vale"

limpiar; sello respaldo-incremental 600; sello respaldo-full $(( 20 * 3600 ))
espera 0 "^OK" "un full de hace 20 h está en plazo"

limpiar; sello respaldo-incremental 600; sello respaldo-full $(( 29 * 3600 ))
espera 1 "último full" "un full de hace 29 h no vale"

# La verificación corre los domingos y tarda: 7 días y pico tiene que pasar.
limpiar; sello respaldo-incremental 600; sello verificar $(( 7 * DIA + 3600 ))
espera 0 "^OK" "una verificación de hace 7 días y 1 h está en plazo"

limpiar; sello respaldo-incremental 600; sello verificar $(( 9 * DIA ))
espera 1 "última verificación buena es de hace 9 días" "una verificación de hace 9 días no vale"

# Los agregados son mensuales: un mes de 31 días tiene que pasar.
limpiar; sello respaldo-incremental 600; sello respaldo-agregados $(( 31 * DIA + 3600 ))
espera 0 "^OK" "unos agregados de hace 31 días están en plazo"

limpiar; sello respaldo-incremental 600; sello respaldo-agregados $(( 34 * DIA ))
espera 1 "agregados bueno es de hace 34 días" "unos agregados de hace 34 días no valen"

# Un `.fallo` manda aunque los sellos estén al día.
limpiar; sello respaldo-incremental 600; sello respaldo-full 3600
echo "$AHORA respaldar full: pg_dump salió con código 1" > "$DIR/respaldo-full.fallo"
espera 1 "FALLO respaldo-full: respaldar full" "un trabajo que falló se dice con su motivo"

# Y varios problemas se dicen todos, no solo el primero.
limpiar; sello respaldo-incremental 9600; sello respaldo-full $(( 40 * 3600 )); sello verificar $(( 10 * DIA ))
espera 1 "última verificación" "con tres atrasos, se dice también el tercero"

echo
echo "$(( TOTAL - FALLOS )) de $TOTAL pruebas en verde"
[ "$FALLOS" -eq 0 ]
