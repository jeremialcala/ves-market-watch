# Respaldo a Backblaze B2

Incremental cada hora, full cada 24 h, restauración probada cada semana. Cifrado
en cliente y con una clave que no puede borrar.

Hasta octubre de 2026 el destino fue Google Drive. Por qué se dejó está en
*Puesta en marcha* y en ADR-0027.

Nace de haber perdido la base el 2026-08-23: `timescaledb` no declaraba volumen
en el compose, un `docker compose up` recreó los contenedores y el volumen
anónimo se quedó atrás. Los datos se recuperaron del volumen huérfano, pero solo
por suerte —nadie los había respaldado nunca—.

## Qué se respalda y cuánto pesa

Medido **ejecutando el respaldo**, no estimado:

| Pieza | Cadencia | Tamaño | Duración | Retención |
|---|---|---|---|---|
| `incremental/<hora>.tar.gz` | cada hora | **2,9 MB** | segundos | 14 días |
| `full/ves_market-<sello>.dump` | cada 24 h (03:30 VET) | **2,3 GB** | **~12 min** | **76 + 14 días** |
| `agregados/<mes>.dump` | cada mes | *sin medir* | — | 24 meses |

Régimen estable: **unos 208 GB** —207 de fulls, contando los 14 días que pasa
oculto cada full podado (ver *Inmutabilidad*), y algo menos de 1 de
incrementales—. En B2 se paga por GB almacenado, y la descarga es gratis hasta
el triple de lo almacenado al mes según la política de B2 al escribir esto: la
verificación semanal baja 2,3 GB.

El incremental es diminuto porque casi todo el volumen son los snapshots crudos
—4.631 MB de 5.126— y en una hora solo entran 64.

> **Aquí hubo una cifra mal dada, y conviene que quede escrita.** La primera
> versión de este documento decía **326 MB** para el full y «unos 4 GB» de
> régimen estable. Salió de medir así:
>
> ```sh
> pg_dump ... -f /tmp/full.dump 2>/dev/null; ls -lh /tmp/full.dump
> ```
>
> Con `stderr` a `/dev/null` y encadenado con `;`, un fallo del `pg_dump` no se
> ve y el código de salida es el del `ls`. La cifra buena —2,3 GB— salió de la
> primera ejecución de verdad, con el tamaño releído en destino. *Una medición
> que no comprueba el código de salida de lo que midió no es una medición.*
>
> No es cosmético: con 326 MB, 90 días de retención parecían 30 GB; con 2,3 GB
> son **207**. La cadencia se mantuvo porque Drive tenía 2 TB, pero la
> decisión se tomó con el número correcto.

**La verificación semanal tarda ~18 min** y crea una base desechable de unos
5 GB en el mismo servidor, que borra al terminar. No es gratis: si el domingo a
las 05:00 hubiera algo más corriendo, se notaría. Medido de punta a punta el
2026-08-24, con este resultado:

```
timescaledb_post_restore → t
indicators=1038498  official_rates=41214  p2p_snapshots_raw=107040
chunks registrados=402
antigüedad del dato más nuevo: 0 días
OK: el respaldo restaura y contiene lo que dice
```

Los **402 chunks registrados** son el dato que de verdad cierra el círculo: es lo
que distingue una restauración buena de una hecha sin `timescaledb_pre_restore()`,
donde las filas se cuentan igual y las hipertablas quedan descolgadas.

**El límite práctico no es el espacio, es la subida.** Son 2,3 GB cada noche: a
20 Mbps de subida, unos 16 minutos; a 5 Mbps, cerca de una hora. Si eso llegara a
estorbar, la salida no es recortar la retención sino **espaciar los fulls**: los
incrementales cubren *cada hora*, así que un full semanal más los incrementales
posteriores ya es una cadena de recuperación completa. Los fulls diarios solo
compran velocidad de restauración.

## Por qué la retención del full es 90 días y existe «agregados»

No es una cifra redonda: la sale de `docs/00-project/data-classification.md`,
que fija **«snapshots crudos 90 días»** y **«agregados ≥ 12 meses»**. Un full
lleva los crudos dentro, así que guardar fulls un año sería guardar los crudos un
año — incumpliendo la propia política del proyecto por la puerta de atrás.

De ahí el tercer volcado: `agregados` es el mismo `pg_dump` **excluyendo los
datos de `p2p_snapshots_raw`**, y ese sí puede vivir dos años.

## Cifrado, y una decisión que no estaba tomada

La base contiene datos **Público** e **Interno** (indicadores, señales,
`merchant_ref` pseudónimo). No contiene datos **Confidenciales**: los alias de
anunciantes no se persisten desde ADR-0011 y la identidad de usuarios vive en
Auth0.

Aun así, **la clasificación de datos no dice nada sobre sacar «Interno» a un
tercero**, y Backblaze es un tercero —como lo era Google Drive—. En vez de
interpretar el silencio, el esquema sube **cifrado en cliente** con un remoto
`crypt` de rclone: B2 guarda nombres y contenidos que no puede leer. Así la
pregunta deja de depender de cómo se lea la política.

Si el proyecto decide algún día que quiere respaldos legibles desde B2, es
cambiar el remoto — pero entonces la decisión hay que escribirla en la
clasificación de datos, no darla por hecha.

## Inmutabilidad: una clave que no puede borrar

El contenedor es el que más valor concentra —`pg_dump` sobre toda la base— y por
eso es también la credencial que más vale robar. Con una clave que puede
borrar, quien se haga con la máquina se lleva la base **y** el respaldo de una
vez.

Así que la clave de aplicación del contenedor tiene `listBuckets`, `listFiles`,
`readFiles` y `writeFiles`, **y no `deleteFiles`**. La poda sigue funcionando
porque en B2 un borrado de rclone (`hard_delete=false`, el valor por defecto) no
borra: **oculta** el archivo con `b2_hide_file`, que solo pide `writeFiles`. Lo
oculto lo borra de verdad la regla de lifecycle del bucket, **14 días después**.

Lo que esto compra, dicho con precisión: no es que nadie pueda tocar el
respaldo. Quien tenga la clave puede ocultarlo todo. Lo que **no** puede es
hacerlo desaparecer antes de 14 días, y la verificación del domingo falla en
cuanto falta el último full —con push a ntfy—. Los 14 días son dos domingos:
margen para enterarse y recuperar.

Dos consecuencias que hay que tener presentes:

- **La retención del full es 76 días, no 90.** Un full podado vive otros 14
  días oculto, y la clasificación de datos fija «snapshots crudos 90 días».
  76 + 14 = 90. Si se cambia el lifecycle, se cambia `RETENCION_FULL_DIAS` con
  él.
- **La antigüedad se mide por el modtime que rclone guarda en el objeto**, no
  por la fecha de subida. Por eso los fulls copiados desde Drive se podan por
  su edad real y no viven 76 días más desde el día de la copia.

Recuperar lo ocultado: la misma clave lee versiones viejas, así que se restaura
**tal como estaba el bucket en una fecha**, sin tocar nada:

```sh
docker compose exec -e RCLONE_B2_VERSION_AT=2026-10-01 respaldo restaurar ves_market_prueba
```

## Puesta en marcha

Destino: un bucket **privado** de Backblaze B2. B2 llega en octubre de 2026
porque Drive falló **dos veces** por lo mismo, el token OAuth: `invalid_grant`
del 2026-09-07 al 09-14 y otra vez desde el 2026-09-23. Once días sin
respaldo la segunda. Una clave de aplicación de B2 no caduca ni depende de una
pantalla de consentimiento (ver ADR-0027).

### 1. El bucket, en la web de B2

- **Create a Bucket**: privado (`allPrivate`), sin Object Lock.
- **Lifecycle Settings** → *Keep prior versions for this number of days* →
  **14**. Es la regla que borra de verdad lo que la poda oculta (ver
  *Inmutabilidad*). Sin ella, lo oculto se guarda —y se paga— para siempre.

### 2. La clave, por la CLI y no por la web

La web solo ofrece *Read and Write*, que **incluye `deleteFiles`**. Una clave
sin borrado solo se crea por la CLI o la API:

```powershell
pip install b2
b2 account authorize        # con la master key; pide los datos por teclado
b2 key create --bucket TU_BUCKET respaldo-ves listBuckets,listFiles,readFiles,writeFiles
b2 account clear            # borra la master key que authorize dejó en disco
```

Saca el `keyID` y la `applicationKey`. La segunda **solo se muestra esa vez**:
va directo al paso 3 y a tu gestor.

**El `b2 account clear` no es opcional.** `authorize` guarda la master key en
`~/.b2_account_info` y ahí se queda: sin el `clear`, la credencial que sí puede
borrar el bucket acaba viviendo en la misma máquina que la que no puede, y la
*Inmutabilidad* de arriba deja de proteger nada.

### 3. El remoto `b2` en el volumen del contenedor

Interactivo y no con `config create ... key=...`: un argumento se ve en `ps`.
El `rclone.conf` del volumen está cifrado y el contenedor ya tiene
`RCLONE_CONFIG_PASS`, así que rclone lo abre y lo vuelve a guardar cifrado:

```sh
docker compose exec -it respaldo rclone config
#   n → nombre: b2 → tipo: b2 → account: <keyID> → key: <applicationKey>
#   hard_delete: false (Enter) → Edit advanced config: n
```

**Comprobar la clave antes de seguir**, las dos mitades:

```sh
docker compose exec respaldo sh -c '
  echo prueba | rclone rcat b2:TU_BUCKET/prueba.txt &&
  rclone deletefile b2:TU_BUCKET/prueba.txt &&
  echo "OK: ocultar funciona"
  echo prueba | rclone rcat b2:TU_BUCKET/prueba2.txt
  rclone deletefile b2:TU_BUCKET/prueba2.txt --b2-hard-delete \
    && echo "MAL: la clave PUEDE borrar" || echo "OK: la clave no puede borrar"'
```

Si sale `MAL`, la clave tiene `deleteFiles` y todo lo de *Inmutabilidad* es
falso: se borra y se crea otra.

### 4. El corte: apuntar el `crypt` a B2

El remoto cifrado conserva **nombre y contraseñas**; solo cambia lo que tiene
debajo. Por eso el `.env` no se toca (`RCLONE_REMOTE=criterio-cifrado:` sigue
valiendo) y los nombres cifrados en B2 son idénticos a los de Drive, que es lo
que permite copiar el histórico sin descifrarlo (paso 6):

```sh
docker compose exec respaldo rclone config update criterio-cifrado remote=b2:TU_BUCKET/criterio-respaldos
docker compose --profile respaldo build respaldo
docker compose --profile respaldo up -d --no-deps respaldo
```

El `--no-deps` no es cosmético: `up` sin él evalúa también `timescaledb`, y una
recreación de ese contenedor es justo lo que borró la base el 2026-08-23.

### 5. Comprobar con un respaldo y una restauración de verdad

```sh
docker compose exec respaldo respaldar incremental
docker compose exec respaldo respaldar full        # ~12 min + la subida
docker compose exec respaldo verificar             # ~18 min
docker compose exec respaldo estado
```

Hasta que `verificar` no salga en `OK`, el corte no está hecho.

### 6. El histórico de Drive: copiar los blobs cifrados

Se copian **sin descifrar**: de `drive:criterio-respaldos` a
`b2:TU_BUCKET/criterio-respaldos`, ciphertext a ciphertext. Va **en el host**,
que es donde se puede reautorizar Drive —el OAuth necesita el navegador, y
`127.0.0.1:53682` no se publica desde un contenedor: se perdió una tarde así el
2026-08-31—.

1. Reautorizar Drive en el host: `rclone config reconnect drive:` y luego
   `rclone about drive:`. Si el token vuelve a caducar en días, es que la app
   OAuth volvió a *Testing*: hay que publicarla (*Pantalla de consentimiento →
   Publicar*); con el scope `drive.file` no dispara verificación de Google.
2. Crear el mismo remoto `b2` en el host, también con `rclone config`
   interactivo.
3. Copiar, primero en seco:

   ```powershell
   rclone copy drive:criterio-respaldos b2:TU_BUCKET/criterio-respaldos --dry-run
   rclone copy drive:criterio-respaldos b2:TU_BUCKET/criterio-respaldos --transfers 4 --progress
   rclone check drive:criterio-respaldos b2:TU_BUCKET/criterio-respaldos --one-way
   ```

   `check` compara tamaños: Drive da MD5 y B2 SHA-1, no hay hash común. La
   prueba de contenido es el paso siguiente.
4. Desde el contenedor, ver el histórico **descifrado** y con sus fechas:
   `docker compose exec respaldo rclone lsl criterio-cifrado:full`. Que salgan
   los nombres en claro es la prueba de que la contraseña del `crypt` casa. Y
   para restaurar uno de los copiados, no solo el último:
   `docker compose exec respaldo restaurar ves_market_prueba ves_market-<sello>.dump`.

La copia nunca borra nada en B2 —la clave no puede— y en Drive solo lee.

### 7. Retirar Drive

Cuando el paso 6 esté verificado: borrar `criterio-respaldos` de Drive, quitar
el remoto (`rclone config delete drive`, en el host y en el contenedor) y
revocar el acceso de la app en la cuenta de Google. Hasta entonces Drive es una
segunda copia del histórico, no un destino: nadie escribe ahí.

**La contraseña del `crypt` sigue en tu gestor, y sigue siendo la única llave**:
B2 tampoco puede leer lo que guarda.

### Desde cero, sin histórico que traer

Pasos 1 a 3 igual. En vez del 4, el `crypt` se crea en vez de actualizarse, otra
vez interactivo para que la contraseña no pase por `ps`:

```sh
docker compose exec -it respaldo rclone config
#   n → nombre: criterio-cifrado → tipo: crypt
#   remote: b2:TU_BUCKET/criterio-respaldos
#   filename_encryption: standard → directory_name_encryption: true
#   password: y (la tecleas) → password2: g (genera la sal) → guárdala también
```

**Las dos contraseñas van a tu gestor.** Sin ellas los respaldos son ruido
irrecuperable, y no las tiene nadie más. Y el `rclone.conf` se cifra con
`rclone config` → `s` (*Set configuration password*), que es la que va a
`RCLONE_CONFIG_PASS`.

### El `.env` de la raíz

```
RCLONE_REMOTE=criterio-cifrado:
RCLONE_CONFIG_PASS=<contraseña del rclone.conf>
AVISO_URL=https://ntfy.sh/<tema-largo-y-aleatorio>
```

`AVISO_URL` es a dónde llegan los avisos de fallo (ver *Avisos* abajo). En
ntfy.sh el tema **es** la credencial: quien lo adivine lee los avisos, así que
nada de `ves-respaldo`.

`RCLONE_CONFIG_PASS` solo hace falta si cifraste el `rclone.conf` con contraseña
de rclone, que es lo recomendable. El cron corre desatendido: sin esta variable,
cada ejecución se quedaría esperando una contraseña que nadie va a teclear. Ver
el comentario del servicio en el compose sobre qué protege y qué no.

## Operación

```sh
# a mano, sin esperar al cron
docker compose exec respaldo respaldar incremental
docker compose exec respaldo respaldar full

# ver qué hay guardado
docker compose exec respaldo rclone lsl criterio-cifrado:full

# restaurar el último full a una base de pruebas
docker compose exec respaldo restaurar ves_market_prueba

# reposición a punto en el tiempo: full + incrementales hasta esa hora
docker compose exec respaldo restaurar ves_market_prueba ultimo 2026-08-23T19

# la verificación semanal, a demanda
docker compose exec respaldo verificar

# ¿hay un respaldo bueno reciente? (es el healthcheck)
docker compose exec respaldo estado
```

### Avisos

Del 2026-09-07 al 2026-09-14 el respaldo falló cada hora y nadie se enteró en
una semana: todo quedaba en `docker compose logs`, y ahí se mira cuando ya se
sabe que algo va mal. Desde entonces un fallo se **empuja**:

- **Push a ntfy.** Cada trabajo (`respaldar`, `verificar`) llama a `aviso` al
  terminar. El primer fallo manda un push a `AVISO_URL`; si sigue fallando, se
  repite cada 6 h (`AVISO_REPETIR_SEGUNDOS`) y no cada hora; cuando vuelve a
  salir bien, llega un único «vuelve a funcionar». Para recibirlos, suscríbete
  al tema en la app de ntfy.
- **Healthcheck.** `estado` pone el contenedor en `unhealthy` si el último
  intento de cualquier trabajo falló, si no hay un incremental bueno en 2 h 30
  min, o si el último full bueno pasa de 28 h. Se ve en `docker compose ps` y
  no depende de la red ni de ntfy.

Probar el aviso sin romper nada:

```sh
docker compose exec respaldo aviso fallo prueba "esto es una prueba"
docker compose exec respaldo aviso ok prueba   # manda el «vuelve a funcionar» y limpia
```

## Lo que este esquema NO es

- **No es PITR.** Un fallo a las 10:59 pierde hasta 59 minutos. La reposición
  continua de PostgreSQL exige archivado de WAL, y eso quiere un destino que
  hable S3. Drive no lo hablaba; **B2 sí**, por su endpoint compatible. Si esa
  hora llega a importar, el paso siguiente es `pgBackRest` contra ese endpoint,
  no ajustar esto. Quedó fuera de la migración a propósito (ADR-0027).
- **No captura borrados** entre horas. Los incrementales son filas nuevas por
  ventana; una fila borrada sigue apareciendo hasta el siguiente full. Para
  estas tablas —series temporales que solo crecen— es correcto, y por eso
  `official_rates` y `signals`, que sí se actualizan, van **enteras** en cada
  incremental.
- **No sustituye a tener un volumen con nombre.** El respaldo es la segunda
  línea; la primera es que un `docker compose up` no pueda llevarse la base.

## Las dos trampas que hacen inútil un respaldo de TimescaleDB

Ambas están tratadas en los scripts, y ambas **salen en verde** si no se
tratan. Merecen leerse antes de tocar nada:

1. **`COPY una_hipertabla TO STDOUT` no copia nada.** Emite un NOTICE, produce
   un archivo vacío y sale con código 0. Se vio en vivo al dimensionar esto:
   `COPY official_rates TO STDOUT` devolvió 0,00 MB sobre 28 MB de datos. Hay
   que usar `COPY (SELECT ...) TO STDOUT`, y aun así `respaldar.sh` mide cada
   archivo antes de subirlo y **relee el tamaño en el destino**.
2. **`pg_restore` sin `timescaledb_pre_restore()`** deja los catálogos de la
   extensión inconsistentes: las filas se cuentan y los chunks quedan
   descolgados. Por eso `verificar.sh` no se conforma con contar filas y
   comprueba también `timescaledb_information.chunks`.

Y una tercera, de las que no son de TimescaleDB: `verificar.sh` mira además la
**antigüedad del dato más nuevo**. Un full que restaura perfecto pero es de hace
tres semanas —porque el cron llevaba tres semanas fallando— también es un fallo,
y de los silenciosos.
