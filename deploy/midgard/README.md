# Criterio en midgard

Cómo está desplegado el entorno de captura en `midgard` (`hgtech001`) desde el
2026-10-13. El porqué y las medidas del traslado están en
[ADR-0034](../../docs/00-project/adr/0034-captura-continua-en-midgard.md).

**No es producción.** Es el entorno `criterio-dev`, con sus secretos y sus
hostnames, corriendo en otra máquina. Dónde vive producción es D15 y sigue
abierta.

## Qué hay y dónde

Tres proyectos compose, unidos por la red externa `ves-market`:

| En la máquina | Aquí | Qué lleva | Quién lo despliega |
|---|---|---|---|
| `/srv/infra/ves-market` | `infra/` | TimescaleDB y RabbitMQ | a mano; nunca el receptor |
| `/srv/apps/ves-api-gateway` | `api-gateway/` | el gateway | el receptor, en cada release a `main` |
| `/srv/apps/ves-market` | `servicios/` | ingestores, motor, panel, túnel y respaldo | a mano, hasta que tengan imagen en GHCR |

Cada directorio tiene su `.env`, que no está en el repositorio. Las claves del
de servicios están en `servicios/env.ejemplo`.

| Volumen | Contenido |
|---|---|
| `ves_market_datos` | la base. **Externo:** ningún compose lo crea ni lo borra |
| `ves-market-infra_rabbitmq-data` | el bus |
| `ves_rclone_config` | `rclone.conf`, cifrado, con la clave de B2 |
| `ves_respaldo_estado` | último respaldo bueno, último fallo y aviso enviado |

El acceso público entra por el túnel de Cloudflare, cuyo ingress vive en el
panel de Cloudflare y apunta a `http://web-spa:80` y `http://api-gateway:8000`.
Ningún servicio publica puertos hacia la LAN: el gateway y el panel solo en
`127.0.0.1` (8800 y 8080), para comprobar desde la propia máquina.

## Operación

Los `.env` son de `root` (600), así que `docker compose` va con `sudo` y
`--project-directory`. Para mirar contenedores y logs basta `docker`.

```sh
# qué corre
docker ps --format '{{.Names}}\t{{.Status}}' | grep '^ves-'

# aplicar un cambio de compose de servicios
sudo install -m 644 -o root -g root docker-compose.yml /srv/apps/ves-market/docker-compose.yml
sudo docker compose --project-directory /srv/apps/ves-market up -d

# logs
docker logs --tail 50 -f ves-ingestor-binance

# la base, como administrador (por el socket; `postgres` no tiene contraseña)
docker exec -it ves-timescaledb psql -U postgres -d ves_market

# el respaldo: mismas órdenes que en scripts/respaldo/README.md
docker exec ves-respaldo estado
docker exec ves-respaldo respaldar incremental
```

Tras un reinicio, `ves-market-arranque.service` levanta los tres proyectos en
orden. Está en `arranque/`; se instala en `/usr/local/sbin` y
`/etc/systemd/system`.

### Lo que no hay que hacer

- **`docker compose pull` en servicios.** Las cinco imágenes propias no están
  en ningún registro: se copiaron de desarrollo. El `pull` falla, y es lo
  esperado.
- **Cambiar la imagen de TimescaleDB por una más nueva.** Los datos son una
  copia física de PG 16.14 con TimescaleDB 2.28.2. Subir de versión es
  `ALTER EXTENSION timescaledb UPDATE` con un respaldo recién verificado.
- **Editar un `.env` con un editor que reemplace el archivo y deje la última
  línea sin salto.** La siguiente clave que se añada se fusiona con ella.
- **Renombrar los servicios `web-spa` o `api-gateway`.** El túnel los busca por
  ese nombre.
- **Levantar los perfiles `tunel` o `respaldo` en la máquina de desarrollo.**

## Instalar desde cero

Para rehacer el entorno en una máquina vacía, o en esta tras cambiar el disco.

1. Red y volumen de datos:
   ```sh
   docker network create ves-market
   docker volume create ves_market_datos
   ```
2. `/srv/infra/ves-market` con `infra/docker-compose.yml` y un `.env` (600) con
   `POSTGRES_PASSWORD` y `RABBITMQ_PASSWORD` **generadas en la máquina**. Con
   el volumen vacío, la imagen crea el rol `ves` y la base `ves_market`.
3. `/srv/apps/ves-market` con `servicios/docker-compose.yml` y su `.env`.
   Levantar solo `respaldo`, copiar `rclone.conf` a su volumen y restaurar el
   último full:
   ```sh
   docker exec ves-respaldo restaurar ves_market_restaurada
   ```
   `restaurar` hace `DROP DATABASE` del destino: **nunca** se le pasa
   `ves_market`. Se restaura a otro nombre, se comprueba y se renombra.
4. Las imágenes: de GHCR cuando existan allí. Hasta entonces hay que
   construirlas en otra máquina y pasarlas con `docker save | docker load`.
5. El gateway lo pone el receptor en el siguiente release; a mano, con
   `IMAGE_TAG=sha-xxxxxxx docker compose up -d` en su directorio.
6. La unidad de arranque, de `arranque/`.

## Vuelta atrás

La base de la máquina de desarrollo quedó parada y entera, en el volumen
`ves-market-watch_ves_market_datos`, con los datos hasta el corte
(2026-10-13 23:31 UTC). Volver es parar los servicios de midgard y, en la
máquina de desarrollo, `docker compose --profile tunel --profile respaldo up -d`,
sabiendo que **lo capturado en midgard desde el corte no está en esa base**:
habría que traerlo con el mismo método, al revés.

Ese volumen se puede borrar cuando haya un full hecho desde midgard y
verificado con `verificar`.

## Pendiente

- Imágenes de ingestores, motor, panel y respaldo publicadas por el CI, y su
  alta en el receptor.
- Disco nuevo y UPS. El disco actual tiene sectores pendientes y va a peor.
- Que el vigía de servicios de Yggdrasil vigile los contenedores `ves-*`.
- Borrar el volumen vacío `ves-market-infra_timescale-data`, el de la base que
  hubo aquí hasta el traslado.
