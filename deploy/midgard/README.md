# Criterio en midgard

Cómo está desplegado el entorno de captura en `midgard` (`hgtech001`) desde el
2026-10-13. El porqué y las medidas del traslado están en
[ADR-0034](../../docs/00-project/adr/0034-captura-continua-en-midgard.md).

**No es producción.** Es el entorno `criterio-dev`, con sus secretos y sus
hostnames, corriendo en otra máquina. Dónde vive producción es D15 y sigue
abierta.

## Qué hay y dónde

Un proyecto compose por pieza, unidos por la red externa `ves-market`. Cada
directorio de aquí es el de la máquina con el prefijo `ves-`:

| En la máquina | Aquí | Qué lleva | Quién lo despliega |
|---|---|---|---|
| `/srv/infra/ves-market` | `infra/` | TimescaleDB y RabbitMQ | a mano; nunca el receptor |
| `/srv/apps/ves-api-gateway` | `api-gateway/` | el gateway | el receptor, tras `build-api-gateway` |
| `/srv/apps/ves-ingestor-binance` | `ingestor-binance/` | captura P2P | el receptor, tras `build-ingestor-binance` |
| `/srv/apps/ves-ingestor-bcv` | `ingestor-bcv/` | tasas oficiales | el receptor, tras `build-ingestor-bcv` |
| `/srv/apps/ves-indicator-engine` | `indicator-engine/` | el motor | el receptor, tras `build-indicator-engine` |
| `/srv/apps/ves-web-spa` | `web-spa/` | el panel | el receptor, tras `build-web-spa` |
| `/srv/apps/ves-respaldo` | `respaldo/` | respaldo a B2 | el receptor, tras `build-respaldo` |
| `/srv/apps/ves-tunel` | `tunel/` | conector de Cloudflare | a mano: imagen de terceros, por digest |

Cada directorio tiene su `.env`, que no está en el repositorio, con solo las
claves que ese servicio usa. Los nombres están en el `env.ejemplo` de cada uno.
El panel no tiene: todo lo suyo va horneado en la imagen.

| Volumen | Contenido |
|---|---|
| `ves_market_datos` | la base. **Externo:** ningún compose lo crea ni lo borra |
| `ves-market-infra_rabbitmq-data` | el bus |
| `ves_rclone_config` | `rclone.conf`, cifrado, con la clave de B2. Externo |
| `ves_respaldo_estado` | último respaldo bueno, último fallo y aviso enviado. Externo |

El acceso público entra por el túnel de Cloudflare, cuyo ingress vive en el
panel de Cloudflare y apunta a `http://web-spa:80` y `http://api-gateway:8000`.
Ningún servicio publica puertos hacia la LAN: el gateway y el panel solo en
`127.0.0.1` (8800 y 8080), que es donde el receptor comprueba su salud.

## Cómo llega un cambio

1. Un release fusiona a `main`.
2. Cada `build-<servicio>` corre **solo si el release tocó su código**, y
   publica `ghcr.io/jeremialcala/ves-market-watch/<servicio>:sha-xxxxxxx`.
3. GitHub avisa al receptor de midgard, que elige la app por el nombre del
   workflow, hace `pull` y `up -d` de ese servicio con ese tag, y apunta la
   versión en `/var/lib/cd-receiver/ves-<servicio>.json`.

Un release que solo toca documentación no despliega nada. Uno que toca el
ingestor de Binance no reinicia el motor ni el panel.

**El gateway y el panel tienen comprobación de salud y rollback automático.**
Ingestores, motor y respaldo no exponen HTTP: el receptor da su despliegue por
bueno en cuanto el contenedor arranca. Tras un release que los toque, hay que
mirar sus logs.

### Dar de alta un servicio nuevo

1. Su `build-<servicio>.yml`, que llama a `publicar-imagen.yml`.
2. Su directorio aquí y en `/srv/apps/ves-<servicio>`, con el `.env`
   `root:deploy` y 640: el receptor corre como `deploy` y tiene que leerlo.
3. Su entrada en `/etc/cd-receiver/apps.yml` y `curl -X POST
   http://127.0.0.1:9000/reload`:
   ```yaml
   - name: ves-<servicio>          # = nombre del proyecto compose
     repo: jeremialcala/ves-market-watch
     workflow: build-<servicio>    # obligatorio: el repo declara varias apps
     project_dir: /srv/apps/ves-<servicio>
     image: ghcr.io/jeremialcala/ves-market-watch/<servicio>
     health_url: http://127.0.0.1:<puerto>/…   # solo si expone HTTP
   ```
4. **Poner el paquete en público** en GitHub tras el primer build: los paquetes
   de GHCR nacen privados aunque el repositorio sea público, y midgard hace
   `pull` anónimo. No hay API para cambiarlo: es en la web del paquete,
   *Package settings → Change visibility*.
5. Añadirlo a `arranque/ves-market-arranque.sh`.

## Operación

Los `.env` no son legibles para `jalcala`, así que `docker compose` va con
`sudo` y `--project-directory`. Para mirar contenedores y logs basta `docker`.

```sh
# qué corre y con qué versión
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep '^ves-'
curl -s http://127.0.0.1:9000/status | python3 -m json.tool

# logs
docker logs --tail 50 -f ves-ingestor-binance

# histórico de despliegues de un servicio
sudo tail -3 /var/log/cd-receiver/ves-web-spa.jsonl

# volver un servicio a una versión concreta, a mano
sudo env IMAGE_TAG=sha-xxxxxxx docker compose \
  --project-directory /srv/apps/ves-web-spa -p ves-web-spa up -d

# la base, como administrador (por el socket; `postgres` no tiene contraseña)
docker exec -it ves-timescaledb psql -U postgres -d ves_market

# el respaldo: mismas órdenes que en scripts/respaldo/README.md
docker exec ves-respaldo estado
docker exec ves-respaldo respaldar incremental
```

Tras un reinicio, `ves-market-arranque.service` levanta todo en orden, cada
servicio con la versión que el receptor tiene apuntada. Está en `arranque/`; se
instala en `/usr/local/sbin` y `/etc/systemd/system`.

### Lo que no hay que hacer

- **Cambiar la imagen de TimescaleDB por una más nueva.** Los datos son una
  copia física de PG 16.14 con TimescaleDB 2.28.2. Subir de versión es
  `ALTER EXTENSION timescaledb UPDATE` con un respaldo recién verificado.
- **Editar un `.env` con un editor que reemplace el archivo y deje la última
  línea sin salto.** La siguiente clave que se añada se fusiona con ella.
- **Renombrar los servicios `web-spa` o `api-gateway`.** El túnel los busca por
  ese nombre.
- **Renombrar un workflow `build-*` o un proyecto compose.** Son el contrato
  con el receptor, y lo que falla es que deja de desplegar, sin error.
- **Fusionar a `main` cambios de `scripts/respaldo/` de madrugada.** El
  despliegue recrea el contenedor y corta el full de las 03:30 o la
  verificación del domingo a las 05:00, hora de Caracas.
- **Levantar los perfiles `tunel` o `respaldo` en la máquina de desarrollo.**

## Instalar desde cero

Para rehacer el entorno en una máquina vacía, o en esta tras cambiar el disco.

1. Red y volúmenes externos:
   ```sh
   docker network create ves-market
   docker volume create ves_market_datos
   docker volume create ves_rclone_config
   docker volume create ves_respaldo_estado
   ```
2. `/srv/infra/ves-market` con `infra/docker-compose.yml` y un `.env` (600) con
   `POSTGRES_PASSWORD` y `RABBITMQ_PASSWORD` **generadas en la máquina**. Con
   el volumen vacío, la imagen crea el rol `ves` y la base `ves_market`.
3. El receptor (`higerotech/despliegue-continuo`), con las entradas de
   `apps.yml`, y el webhook del repositorio.
4. Cada `/srv/apps/ves-<servicio>` con su compose y su `.env`. Levantar solo
   `ves-respaldo`, copiar `rclone.conf` a su volumen y restaurar el último full:
   ```sh
   docker exec ves-respaldo restaurar ves_market_restaurada
   ```
   `restaurar` hace `DROP DATABASE` del destino: **nunca** se le pasa
   `ves_market`. Se restaura a otro nombre, se comprueba y se renombra.
5. El resto de servicios, con `IMAGE_TAG=sha-xxxxxxx docker compose up -d` en
   cada directorio, o relanzando sus workflows para que los ponga el receptor.
6. El túnel y la unidad de arranque.

## Vuelta atrás del traslado

La base de la máquina de desarrollo quedó parada y entera, en el volumen
`ves-market-watch_ves_market_datos`, con los datos hasta el corte
(2026-10-13 23:31 UTC). Volver es parar los servicios de midgard y, en la
máquina de desarrollo, `docker compose --profile tunel --profile respaldo up -d`,
sabiendo que **lo capturado en midgard desde el corte no está en esa base**:
habría que traerlo con el mismo método, al revés.

Ese volumen se puede borrar cuando haya un full hecho desde midgard y
verificado con `verificar`.

## Pendiente

- Disco nuevo y UPS. El disco actual tiene sectores pendientes y va a peor.
- Que el vigía de servicios de Yggdrasil vigile los contenedores `ves-*`.
- Comprobación de salud para ingestores, motor y respaldo: hoy un despliegue
  roto de cualquiera de los tres no se revierte solo.
- Borrar el volumen vacío `ves-market-infra_timescale-data`, el de la base que
  hubo aquí hasta el traslado.
