# Caja de respaldo: cliente de PostgreSQL 16 + rclone + cron.
#
# Alpine y no la imagen de timescaledb porque aquí solo hacen falta `pg_dump`,
# `pg_restore` y `psql`; la extensión no se instala en el cliente.
FROM alpine:3.22

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
COPY scripts/respaldo/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/respaldar /usr/local/bin/restaurar /usr/local/bin/verificar

# `-f` en primer plano y `-d 8` para que los mensajes de cron salgan en
# `docker compose logs`: un cron que falla en silencio es un respaldo que no
# existe, y nadie se entera hasta que hace falta.
CMD ["crond", "-f", "-d", "8"]
