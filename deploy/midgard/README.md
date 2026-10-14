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

Fuera de Docker: `/etc/ves-market-respaldo.frase` (la frase que cifra los
secretos en el NAS) y `/var/lib/ves-market-respaldo-nas` (cuándo salió bien la
última copia).

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

**Un despliegue que falla avisa por ntfy,** al mismo tema que el respaldo y el
disco. Llega con el título «Despliegue `<app>` en `hgtech001`» y dice si el
servicio se revirtió a la versión anterior o si pudo quedar caído. Los
despliegues correctos no avisan. La URL vive en `NOTIFY_URL` de
`/etc/cd-receiver/receiver.env`, con la plantilla que ntfy necesita; la receta
está en el runbook de `higerotech/despliegue-continuo`.

Lo que ese aviso **no** cubre: un servicio sin comprobación de salud que
arranca y se cae después. Para el receptor, ese despliegue salió bien.

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

## Respaldos

Dos copias, independientes a propósito: otro volcado, otro destino y otro
camino. Lo que rompa una no arrastra a la otra.

| | A Backblaze B2 | Al NAS |
|---|---|---|
| Quién | contenedor `ves-respaldo` | `ves-market-respaldo-nas.timer`, en el host |
| Qué | incremental cada hora, full diario, agregados mensuales | volcado completo diario, despliegue y secretos |
| Cuándo | full a las 03:30 | 00:30 |
| Cifrado | todo, en cliente | el volcado **no**; los secretos sí |
| Para leerlo hace falta | `rclone.conf` y `RCLONE_CONFIG_PASS` | nada para la base; la frase para los secretos |
| Retención | 76 + 14 días el full | las 7 últimas noches |
| Si falla | push a ntfy y healthcheck `estado` | push a ntfy, y un vigía a las 08:10 |
| Detalle | `scripts/respaldo/README.md` | `respaldo-nas/` |

Horas de Caracas. La copia al NAS sigue el esquema de los respaldos de Andvari y
Yggdrasil en esta misma máquina.

### La copia al NAS

Deja tres piezas por noche en `/mnt/nas/respaldos/ves-market`, con el mismo
sello en el nombre, y un `<sello>.sha256` con las sumas de las tres:

- **`ves_market-<sello>.dump`**: volcado completo, **sin cifrar**. Es para lo
  que está: se restaura sin ninguna clave, aunque se hayan perdido las de B2.
- **`despliegue-<sello>.tar.gz`**: lo no secreto. Los compose, el inventario
  del receptor, los scripts y un manifiesto con versiones y los *nombres* de
  las claves de cada `.env`.
- **`secretos-<sello>.tar.gz.gpg`**: los siete `.env` y el `rclone.conf`,
  cifrados con la frase de `/etc/ves-market-respaldo.frase`.

Antes de dar la noche por buena comprueba que el volcado trae datos de tantos
chunks como tenía la base, **lo lee entero** desde el NAS, y abre el paquete de
secretos con la frase. Solo entonces borra el más antiguo.

Medido el 2026-10-14: 1,9 GiB y 34 min. El volcado a B2, con gzip, pesa 5,4 GB;
el tiempo es el mismo porque el cuello de botella es la base convirtiendo los
snapshots a texto, no la compresión ni la red.

**Mientras corre un volcado, las consultas pesadas del motor agotan su tiempo**
(20 veces en esos 34 min). El motor sirve la escala que tenía en caché y lo
declara en `scale.computed_at`; la captura no se ve afectada. Son dos ventanas
por noche, a las 00:30 y a las 03:30. Si molesta, la copia al NAS puede pasar a
semanal cambiando `OnCalendar` en el temporizador.

```sh
# a mano, sin esperar a la noche
sudo systemctl start ves-market-respaldo-nas.service
journalctl -u ves-market-respaldo-nas -n 20

# qué hay y si está entero
sudo ls -la /mnt/nas/respaldos/ves-market
sudo sh -c 'cd /mnt/nas/respaldos/ves-market && sha256sum -c <sello>.sha256'

# abrir el paquete de secretos (pide la frase)
gpg -d secretos-<sello>.tar.gz.gpg | tar -xzf -
```

### La frase

**Tiene que existir fuera de midgard y fuera del NAS.** Vive en
`/etc/ves-market-respaldo.frase` (root, 600) para que el respaldo corra
desatendido, pero si midgard se pierde, sin ella el paquete de secretos no lo
abre nadie. Se copia una vez, a un gestor de contraseñas:

```sh
sudo cat /etc/ves-market-respaldo.frase
```

El manifiesto de cada noche lleva `frase_sha256`: sirve para comprobar que la
frase guardada es la que cifró ese paquete, con `sha256sum` sobre un archivo
que la contenga igual que el original, salto de línea final incluido.

No se cambia a la ligera: los paquetes ya hechos solo se abren con la que
tenían. `respaldo-nas/instalar.sh` la genera si falta y nunca la sustituye.

### Restaurar desde el NAS

En una base nueva, con la misma imagen de TimescaleDB que la del manifiesto
(`imagen_base`). Es el mismo procedimiento que usa `restaurar` con lo de B2:

```sh
psql -c 'CREATE DATABASE ves_market_restaurada'
psql -d ves_market_restaurada -c 'CREATE EXTENSION IF NOT EXISTS timescaledb'
psql -d ves_market_restaurada -c 'SELECT timescaledb_pre_restore()'
pg_restore --no-owner -d ves_market_restaurada ves_market-<sello>.dump
psql -d ves_market_restaurada -c 'SELECT timescaledb_post_restore()'
```

**Esta restauración completa desde el NAS todavía no se ha hecho.** Lo
comprobado es que el archivo está entero y es legible; el formato es el mismo
que `verificar` restaura cada domingo desde B2.

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
- **Guardar la frase del respaldo fuera de midgard y del NAS** (ver *La
  frase*). Desde el 2026-10-14 los secretos van cada noche al NAS, cifrados:
  el `rclone.conf` y `RCLONE_CONFIG_PASS`, sin los que lo de B2 no se puede
  descifrar, y `MERCHANT_HMAC_KEY`, sin la que la serie de comerciantes se
  parte en dos. Todo eso depende ahora de una sola cosa que no está en ningún
  disco de la casa más que en el de midgard.
- Una restauración completa desde el volcado del NAS, para medirla y darla por
  probada.
- Que el vigía de servicios de Yggdrasil vigile los contenedores `ves-*`.
- Comprobación de salud para ingestores, motor y respaldo: hoy un despliegue
  roto de cualquiera de los tres no se revierte solo.
- Borrar el volumen vacío `ves-market-infra_timescale-data`, el de la base que
  hubo aquí hasta el traslado.
