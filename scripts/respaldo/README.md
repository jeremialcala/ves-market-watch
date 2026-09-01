# Respaldo a Google Drive

Incremental cada hora, full cada 24 h, restauración probada cada semana.

Nace de haber perdido la base el 2026-08-23: `timescaledb` no declaraba volumen
en el compose, un `docker compose up` recreó los contenedores y el volumen
anónimo se quedó atrás. Los datos se recuperaron del volumen huérfano, pero solo
por suerte —nadie los había respaldado nunca—.

## Qué se respalda y cuánto pesa

Medido **ejecutando el respaldo**, no estimado:

| Pieza | Cadencia | Tamaño | Duración | Retención |
|---|---|---|---|---|
| `incremental/<hora>.tar.gz` | cada hora | **2,9 MB** | segundos | 14 días |
| `full/ves_market-<sello>.dump` | cada 24 h (03:30 VET) | **2,3 GB** | **~12 min** | **90 días** |
| `agregados/<mes>.dump` | cada mes | *sin medir* | — | 24 meses |

Régimen estable en Drive: **unos 208 GB** —207 de fulls y algo menos de 1 de
incrementales—. Cabe de sobra en un plan de 2 TB, que es donde está.

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
> son **207**. La cadencia se mantiene porque el destino tiene 2 TB, pero la
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

**Con 2 TB el límite no es el espacio, es la subida.** Son 2,3 GB cada noche: a
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
tercero**, y Google Drive es un tercero. En vez de interpretar el silencio, el
esquema sube **cifrado en cliente** con un remoto `crypt` de rclone: Drive
guarda nombres y contenidos que no puede leer. Así la pregunta deja de depender
de cómo se lea la política.

Si el proyecto decide algún día que quiere respaldos legibles desde Drive, es
cambiar el remoto — pero entonces la decisión hay que escribirla en la
clasificación de datos, no darla por hecha.

## Puesta en marcha

Hace falta `rclone` autorizado contra tu Drive **una vez**. El consentimiento de
Google abre el navegador, así que **ese paso lo tienes que hacer tú**.

**Hazlo en el host, no en un contenedor.** rclone escucha el callback del OAuth
en `127.0.0.1:53682`; publicar ese puerto con `-p` no sirve, porque Docker
reenvía a la IP del contenedor y no a su loopback. El consentimiento se
completa, el redirect se pierde y rclone guarda el remoto **con el token
vacío** — sin error visible. Se perdió una tarde así el 2026-08-31.

```powershell
winget install Rclone.Rclone
```

### 1. Antes de tocar rclone: la pantalla de consentimiento

En Google Cloud Console, sobre el proyecto que tenga el cliente OAuth:

- **Publica la app** (*Pantalla de consentimiento → Estado de publicación → Publicar*).
  Dejarla en *Testing* parece funcionar y **caduca el refresh token a los 7 días**:
  el respaldo correría una semana y luego fallaría solo. Publicar **no dispara
  verificación de Google** porque el único scope es `drive.file`, que no es
  sensible ni restringido.
- Habilita la **Google Drive API** en ese proyecto.

### 2. Los dos remotos, por comandos y no por asistente

El asistente interactivo pregunta *«Edit advanced config?»* y ahí vive
`service_account_file`. Contestar que sí y rellenarlo hace que rclone **ni
intente el OAuth**: da por hecho que usas una cuenta de servicio. El remoto
queda creado, sin token, y el fallo aparece mucho después. Con `config create`
y `clave=valor` esa pregunta no existe:

```powershell
$rc = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.75.0-windows-amd64\rclone.exe"

# Drive. Único paso que abre el navegador.
& $rc config create drive drive scope=drive.file client_id=TU_ID client_secret=TU_SECRET

# Comprobar el token ANTES de seguir: si esto falla, el resto no tiene sentido.
& $rc about drive:

# El crypt encima. Sin navegador.
$p = Read-Host "Password del crypt" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
& $rc config create criterio-cifrado crypt remote=drive:criterio-respaldos filename_encryption=standard directory_name_encryption=true password=$plain --obscure
$plain = $null

& $rc listremotes   # tienen que salir DOS
```

`scope=drive.file` es deliberado: limita a rclone a los archivos que él mismo
crea. Efecto lateral que no es un fallo: `rclone lsd drive:` sale vacío, porque
no puede listar lo que no creó. Para ver los respaldos, `rclone lsl
criterio-cifrado:full`.

**La contraseña del `crypt` va a tu gestor.** Sin ella los respaldos son ruido
irrecuperable, y no la tiene nadie más.

### 3. Llevar el config al volumen del compose

El contenedor lee el config de un volumen con nombre, **`ves-market-watch_rclone_config`**
(el `rclone_config` del compose, con el prefijo del proyecto). No es el mismo
sitio donde `rclone` del host escribe:

```powershell
docker run -d --name rclone-copia -v ves-market-watch_rclone_config:/config/rclone alpine:3 sleep 120
docker cp "$env:APPDATA\rclone\rclone.conf" rclone-copia:/config/rclone/rclone.conf
docker exec rclone-copia chmod 600 /config/rclone/rclone.conf
docker rm -f rclone-copia
```

### 4. El `.env` de la raíz

```
RCLONE_REMOTE=criterio-cifrado:
RCLONE_CONFIG_PASS=<contraseña del rclone.conf>
```

`RCLONE_CONFIG_PASS` solo hace falta si cifraste el `rclone.conf` con contraseña
de rclone, que es lo recomendable. El cron corre desatendido: sin esta variable,
cada ejecución se quedaría esperando una contraseña que nadie va a teclear. Ver
el comentario del servicio en el compose sobre qué protege y qué no.

### 5. A correr

```sh
docker compose --profile respaldo up -d --no-deps respaldo
docker compose exec respaldo respaldar incremental   # comprobar de entrada
```

El `--no-deps` no es cosmético: `up` sin él evalúa también `timescaledb`, y una
recreación de ese contenedor es justo lo que borró la base el 2026-08-23.

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
```

## Lo que este esquema NO es

- **No es PITR.** Un fallo a las 10:59 pierde hasta 59 minutos. La reposición
  continua de PostgreSQL exige archivado de WAL, y eso quiere un destino que
  hable S3/GCS; Drive no lo hace. Si esa hora llega a importar, el paso
  siguiente es `pgBackRest` contra almacenamiento de objetos, no ajustar esto.
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
