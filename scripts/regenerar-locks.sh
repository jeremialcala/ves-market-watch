#!/usr/bin/env sh
# Regenera los `requirements.lock` de los cinco servicios Python (T8).
#
# ### Por qué dentro de un contenedor y no en la máquina de quien lo corre
#
# El lock lo consume Ubuntu (CI) y `python:3.12-slim` (las imágenes). Resolver en
# Windows o macOS produce un árbol distinto —marcadores de entorno, ruedas por
# plataforma— y el `--require-hashes` de CI fallaría con un mensaje que no dice
# la causa. Se resuelve en la MISMA imagen que luego instala.
#
# ### Por qué con hashes
#
# Sin `--generate-hashes`, un lock fija versiones pero no contenidos: un paquete
# republicado con el mismo número pasa sin que nadie se entere. Con hashes, pip
# rechaza cualquier artefacto que no sea el auditado (T8, A03).
#
# Uso, desde la raíz del repo:
#
#     sh scripts/regenerar-locks.sh
#
# Después: revisar el diff, correr las suites y commitear los locks junto al
# cambio de dependencias que los motivó.
#
# La imagen va FIJADA POR DIGEST, igual que en los Dockerfiles: si se resolviera
# con un `python:3.12-slim` distinto del que construye las imágenes, el lock
# podría no ser instalable ahí.
set -eu

IMAGEN="python:3.12-slim@sha256:2fe5997d249a808b8eeea52c58a1dbffbba28754dc11699ef5c029f2d818ce79"
SERVICIOS="api-gateway indicator-engine ingestor-bcv ingestor-binance ingestor-historico"

# `MSYS_NO_PATHCONV=1` es para Git Bash en Windows: sin él convierte `/repo` a
# una ruta de Windows y `docker run` rechaza el `-w`.
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd):/repo" -w /repo "$IMAGEN" sh -c '
    set -eu
    pip install --quiet --root-user-action=ignore pip-tools
    for s in '"$SERVICIOS"'; do
      cd "/repo/apps/$s"
      pip-compile --quiet --strip-extras --extra dev --generate-hashes \
        --output-file requirements.lock pyproject.toml
      printf "  %-20s %3s paquetes\n" "$s" "$(grep -c "^[a-z0-9]" requirements.lock)"
    done
  '

echo
echo "Locks regenerados. Antes de commitear:"
echo "  1. git diff --stat apps/*/requirements.lock"
echo "  2. correr las suites de los servicios tocados"
