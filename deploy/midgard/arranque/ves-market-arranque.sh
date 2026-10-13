#!/bin/sh
# Converge los tres stacks de Criterio tras el arranque de midgard. Se instala
# en /usr/local/sbin y lo llama `ves-market-arranque.service`.
#
# `restart: unless-stopped` debería bastar y no basta: tras un apagado sucio
# Docker no reaplica la política a un contenedor que sale durante la
# restauración (visto en Yggdrasil el 2026-09-08), y aquí los cortes de luz son
# frecuentes y no hay UPS. Un `up -d` sobre lo que ya corre no hace nada.
set -eu

# Primero la base y el bus, y esperando a que estén sanos: los servicios no
# declaran `depends_on` sobre ellos porque viven en otro proyecto compose.
docker compose --project-directory /srv/infra/ves-market up -d --wait

docker compose --project-directory /srv/apps/ves-market up -d

# El gateway lo despliega el receptor, que es quien sabe qué etiqueta toca.
tag=$(python3 -c 'import json; print(json.load(open("/var/lib/cd-receiver/ves-api-gateway.json"))["current_tag"])')
IMAGE_TAG="$tag" docker compose --project-directory /srv/apps/ves-api-gateway up -d
