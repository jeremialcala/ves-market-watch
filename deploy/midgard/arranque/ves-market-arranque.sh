#!/bin/sh
# Converge los stacks de Criterio tras el arranque de midgard. Se instala en
# /usr/local/sbin y lo llama `ves-market-arranque.service`.
#
# `restart: unless-stopped` debería bastar y no basta: tras un apagado sucio
# Docker no reaplica la política a un contenedor que sale durante la
# restauración (visto en Yggdrasil el 2026-09-08), y aquí los cortes de luz son
# frecuentes y no hay UPS. Un `up -d` sobre lo que ya corre no hace nada.
set -u

fallos=0

# Primero la base y el bus, y esperando a que estén sanos: los servicios no
# declaran `depends_on` sobre ellos porque viven en otro proyecto compose.
docker compose --project-directory /srv/infra/ves-market up -d --wait || fallos=1

# Qué etiqueta le toca a cada app lo sabe el receptor, que la apunta en su
# fichero de estado tras cada despliegue. Si una app todavía no tiene estado
# —recién dada de alta, sin ningún release por medio—, vale la del contenedor
# que ya existe. Sin ninguna de las dos no se adivina: se salta y se avisa.
etiqueta() {
    python3 - "$1" <<'PY'
import json, subprocess, sys

app = sys.argv[1]
try:
    with open(f"/var/lib/cd-receiver/{app}.json", encoding="utf-8") as f:
        tag = json.load(f).get("current_tag") or ""
except (OSError, ValueError):
    tag = ""
if not tag:
    r = subprocess.run(
        ["docker", "inspect", app, "--format", "{{.Config.Image}}"],
        capture_output=True, text=True,
    )
    imagen = r.stdout.strip() if r.returncode == 0 else ""
    # El tag va tras el último `:`, pero solo si ese `:` está después de la
    # última `/`: el de `registro:puerto/imagen` no es un tag.
    if ":" in imagen.rsplit("/", 1)[-1]:
        tag = imagen.rsplit(":", 1)[-1]
print(tag)
PY
}

# El gateway antes que el panel; el respaldo al final, que no sirve a nadie.
for app in ves-indicator-engine ves-ingestor-bcv ves-ingestor-binance \
           ves-api-gateway ves-web-spa ves-respaldo; do
    tag=$(etiqueta "$app")
    if [ -z "$tag" ]; then
        echo "ves-market-arranque: $app sin etiqueta conocida, no se levanta" >&2
        fallos=1
        continue
    fi
    IMAGE_TAG="$tag" docker compose --project-directory "/srv/apps/$app" -p "$app" up -d || fallos=1
done

# El túnel al final: no tiene sentido publicar lo que aún no está en pie.
docker compose --project-directory /srv/apps/ves-tunel up -d || fallos=1

exit "$fallos"
