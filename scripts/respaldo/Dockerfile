# Caja de respaldo: cliente de PostgreSQL 16 + rclone + cron.
#
# Alpine y no la imagen de timescaledb porque aquí solo hacen falta `pg_dump`,
# `pg_restore` y `psql`; la extensión no se instala en el cliente.
#
# Imagen FIJADA POR DIGEST, no por tag (T8), como el resto de servicios. Esta
# caja se quedó fuera del pinneo del 2026-09-08 porque no tiene dependencias
# Python ni npm y no encajaba en ninguna de las dos categorías del control
# —siendo el contenedor que más valor concentra: `pg_dump` sobre toda la base
# y las credenciales de Drive—. El digest congela además el índice de paquetes
# del `apk` de abajo, que no se pueden fijar uno a uno: Alpine no guarda las
# versiones viejas y el build se rompería solo en unas semanas.
# Para actualizarlo:
#   docker manifest inspect -v alpine:3.22 | jq -r '.[0].Descriptor.digest'
FROM alpine:3.22@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6

# `postgresql16-client` fija la MISMA mayor que el servidor: un `pg_dump` de
# versión menor que el servidor se niega a correr, y uno mayor produce volcados
# que el servidor no restaura.
RUN apk add --no-cache \
      postgresql16-client \
      rclone \
      tzdata \
      gzip \
      tar \
      coreutils

ENV TZ=America/Caracas

COPY scripts/respaldo/respaldar.sh /usr/local/bin/respaldar
COPY scripts/respaldo/restaurar.sh /usr/local/bin/restaurar
COPY scripts/respaldo/verificar.sh /usr/local/bin/verificar
COPY scripts/respaldo/aviso.sh /usr/local/bin/aviso
COPY scripts/respaldo/estado.sh /usr/local/bin/estado
COPY scripts/respaldo/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/respaldar /usr/local/bin/restaurar /usr/local/bin/verificar \
      /usr/local/bin/aviso /usr/local/bin/estado \
 && mkdir -p /var/lib/respaldo

# `-f` en primer plano y `-d 8` para que los mensajes de cron salgan en
# `docker compose logs`: un cron que falla en silencio es un respaldo que no
# existe, y nadie se entera hasta que hace falta.
CMD ["crond", "-f", "-d", "8"]
