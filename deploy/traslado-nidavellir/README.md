# Traslado de Criterio de midgard a nidavellir

**Estado:** preparado, **no ejecutado**. La decisión y su porqué están en
[ADR-0037](../../docs/00-project/adr/0037-captura-en-nidavellir.md). Es la «ola
2» del piloto de nidavellir que fija la ADR-0012 de Yggdrasil.

Criterio sale de midgard (`hgtech001`) **entero**:
- los nueve contenedores y sus datos;
- el despliegue continuo;
- los respaldos a B2 y al NAS;
- el vigía y el latido;
- su vigilancia en Yggdrasil.

Pasa a nidavellir (`hgtech002`), con el mismo método que hive y morocota el
2026-11-02. Los scripts corren en el PC (Git Bash) y hablan por ssh con los dos
hosts.

## Qué se mueve

| Pieza | En midgard | En nidavellir | Cómo |
|---|---|---|---|
| Base (`ves_market_datos`, 13 GB), bus, `rclone.conf` y estado del respaldo | 4 volúmenes | los mismos 4, con el mismo nombre | rsync de host a host; el corte, con `--checksum` |
| Compose y `.env` de infra, 6 apps y túnel | `/srv/infra/ves-market`, `/srv/apps/ves-*` | las mismas rutas | tar por tubería, comparado por sha256 |
| Frase del respaldo al NAS y URL del latido | `/etc/ves-market-respaldo.frase`, `/etc/ves-market-latido.env` | las mismas | ídem. **La frase se copia antes de instalar nada**, porque `respaldo-nas/instalar.sh` crea otra si falta |
| Aviso por ntfy | `/etc/ves-market-aviso.env` → `smartd-aviso.env` | el mismo enlace | el tema es el mismo en los dos hosts (comprobado por sha256) |
| Vigía, respaldo al NAS y arranque | unidades `ves-market-*` | las mismas, copiadas de midgard | instaladas desactivadas; se activan en el corte |
| Despliegue continuo | 6 apps en `/etc/cd-receiver/apps.yml` | las 6, en el apps.yml de nidavellir | los bloques se mueven tal cual; las etiquetas de `/var/lib/cd-receiver/ves-*.json` también |
| Vigilancia de Yggdrasil | Baldr relanza el respaldo al NAS | Thor vigila unidades, contenedores y la marca del respaldo; Baldr, el respaldo | `40-monitoreo.sh` |

**Lo que no cambia:**
- **Los hostnames públicos** (`criterio-dev`, `criterio-api-dev`). El conector
  del túnel arranca en nidavellir con el mismo token, y el ingress apunta a
  nombres de servicio, que existen iguales en la red `ves-market`. Auth0, CORS
  y la CSP no se tocan.
- **El webhook de GitHub.** Ya llega a nidavellir desde el 2026-11-03 (revisión
  de la ADR-0012 de Yggdrasil), y hasta ahora su receptor lo ignoraba porque no
  tenía las apps de Criterio.
- **El bucket de B2, la ruta del NAS, la comprobación de Healthchecks y el
  sondeo externo.**

**Lo que no se copia:** `ves-market-infra_timescale-data`, la base del
despliegue parcial de septiembre, que nunca se usó (ADR-0034).

## Los pasos

| Script | Qué hace | Escribe en | Captura | Tiempo |
|---|---|---|---|---|
| `00-comprobar.sh` | Comprobaciones previas | nada | sigue | 1 min |
| `10-preparar.sh` | Red, volúmenes vacíos, configuración, secretos, unidades desactivadas e imágenes | solo nidavellir | sigue | 3–5 min |
| `20-presincronizar.sh` | Copia en caliente de los volúmenes. Es también la prueba de lectura del disco de midgard | solo nidavellir | sigue | 3 min |
| `30-corte.sh` | El corte (abajo). Llama a 40 y 50 | los dos | **parada ~5 min** | 6–8 min |
| `40-monitoreo.sh` | Listas de Thor y Baldr. Con `--deshacer`, al revés | `/etc/default/yggdrasil-*` | — | segundos |
| `50-verificar.sh` | Contenedores, captura, gateway, acceso público, B2, vigía y midgard vacío | lanza un incremental y una pasada del vigía | — | 1 min |
| `90-vuelta-atras.sh` | Devuelve Criterio a midgard, con o sin datos | los dos | parada | 5–10 min |

**Del día anterior al corte:**

```sh
bash deploy/traslado-nidavellir/00-comprobar.sh   # sin bloqueos
bash deploy/traslado-nidavellir/10-preparar.sh
bash deploy/traslado-nidavellir/20-presincronizar.sh
```

**El día del corte:**

```sh
bash deploy/traslado-nidavellir/00-comprobar.sh
bash deploy/traslado-nidavellir/10-preparar.sh        # otra vez: recoge cualquier .env cambiado
bash deploy/traslado-nidavellir/20-presincronizar.sh  # otra vez: deja menos para el corte
bash deploy/traslado-nidavellir/30-corte.sh 2>&1 | tee traslado-$(date +%Y%m%d-%H%M).log
```

El log que deja `tee` no lleva secretos: los scripts solo imprimen nombres,
recuentos y huellas.

## El corte

1. **Guardas.** El corte se niega a empezar en cualquiera de estos casos:
   - en las ventanas de los respaldos (00:20–01:15 y 03:20–04:30 de Caracas,
     y el domingo de 04:50 a 06:00);
   - con un respaldo en curso;
   - si nidavellir no está preparado.

   Pide escribir `CORTE`.
2. **Receptor de midgard sin las apps de Criterio,** y recargado. Su
   reconciliador despliega cada 5 min lo que tenga en `apps.yml`: si las apps
   siguieran ahí, podría resucitar en midgard un servicio recién parado. El
   resultado serían dos capturas en dos bases y dos respaldos podando el mismo
   bucket.
3. **Unidades de host de midgard desactivadas:** el vigía, el respaldo al NAS
   y el arranque, para que un corte de luz no levante Criterio en midgard.
4. **Parada, de fuera hacia dentro:**
   - los ingestores;
   - una espera a que el motor vacíe el bus (hasta 60 s);
   - motor, respaldo, gateway, panel y túnel;
   - **recuentos de control** por hipertabla en las últimas 48 h;
   - el bus, y por último la base, con apagado limpio comprobado en su log.

   Los nueve quedan con `restart=no`.
5. **rsync final con `--checksum`.** La presincronización copió ficheros vivos,
   y solo comparar contenidos garantiza que el destino es idéntico. Con la
   presincronización hecha, el tiempo es el de leer 13 GB del disco de midgard.
6. **Arranque en nidavellir:**
   - primero la base y el bus;
   - **los mismos recuentos, que tienen que coincidir exactamente.** Si no
     coinciden, el script se detiene sin arrancar nada más;
   - después `ves-market-arranque.service`, que levanta cada app con la
     etiqueta que tenía el receptor de midgard, y el túnel.
7. **Alta de las 6 apps en el receptor de nidavellir** y activación de sus
   unidades de host.
8. **`40-monitoreo.sh` y `50-verificar.sh`.**

**Hueco previsto: unos 5 minutos sin captura ni acceso público.** El piloto
admite 30.

El traslado anterior (ADR-0034) no perdió ningún ciclo porque usó replicación
física. Aquí no se repite, porque exigiría publicar PostgreSQL en la LAN y la
ADR-0012 de Yggdrasil fija que el piloto no abre puertos nuevos (ver
ADR-0037).

**Durante el corte, Healthchecks puede avisar «caído».** El vigía de midgard se
desactiva al principio y el de nidavellir arranca al final. Si pasan más de los
6 min de gracia, llega un aviso de caída y, en la siguiente pasada, el de
recuperación. Es esperado.

## Si algo falla

**El script se detiene y dice en qué paso.** Según dónde:

| Se detuvo en | Qué hacer |
|---|---|
| Guardas, pasos 1–3 | Nada se ha parado aún, o solo el receptor y las unidades. `90-vuelta-atras.sh --sin-datos` lo deja como estaba |
| Pasos 4–5 (parada o copia) | Midgard está parado pero intacto. `90-vuelta-atras.sh --sin-datos` |
| Paso 6, recuentos distintos | **No seguir.** `90-vuelta-atras.sh --sin-datos`: los datos de nidavellir no son de fiar y los de midgard están enteros |
| Pasos 6–8, con Criterio ya capturando en nidavellir | Si el fallo es de la verificación, mirar primero si es grave. Para volver: `90-vuelta-atras.sh`, que **trae** lo capturado en nidavellir |

`90-vuelta-atras.sh` también pide confirmación (`VOLVER`). Deja nidavellir
parado, pero con sus volúmenes y ficheros, para reintentar.

### Si el disco de midgard no se deja leer

Si `20-presincronizar.sh` o el corte dan un error de E/S, **el traslado no
sigue**. Ese error significa que hay ficheros de la base que el disco ya no
devuelve. Con la base en marcha en midgard, lo prudente es:
1. Comprobar si la base sigue sana: `docker logs ves-timescaledb` en busca de
   errores de lectura, y el último `verificar` del respaldo.
2. Decidir entre dos caminos:
   - **traslado por volcado:** `pg_dump` desde midgard y `pg_restore` en
     nidavellir, con 30–60 min de hueco;
   - **reconstrucción desde el último full de B2 o del NAS**, perdiendo lo
     posterior.

Ninguno está automatizado: se decide con lo que diga el error.

## Después del corte

Un PR aparte, cuando el corte esté hecho y verificado:
- `deploy/midgard/` pasa a `deploy/nidavellir/`, con sus referencias:
  `.gitattributes`, `ci.yml`, los comentarios de los `build-*.yml`, el
  `docker-compose.yml` raíz y la documentación.
- **ADR-0037 a `accepted`,** con la tabla de verificación rellena: el hueco y
  los recuentos que imprime el corte.
- En el repo de Yggdrasil: la ola 2 del piloto hecha, en la ADR-0012 y en
  `piloto-nidavellir.md`.
- **Logs de Criterio a Loki:** Alloy, en nidavellir, solo envía los de hive
  (`yggdrasil-gna/gna/config.alloy`).
- **A los 7 días sin incidentes, retirar de midgard lo que quedó:**
  - los nueve contenedores parados y los volúmenes, incluido
    `ves-market-infra_timescale-data`;
  - `/srv/infra/ves-market` y `/srv/apps/ves-*`;
  - las unidades `ves-market-*`;
  - `/etc/ves-market-latido.env`.

  La frase del respaldo se queda donde esté guardada fuera de las máquinas;
  la copia de midgard se borra con lo demás.

## Lo que ya fallaba (no es del traslado)

**El ingestor del BCV no captura desde ~2026-11-19:** `CERTIFICATE_VERIFY_FAILED`,
y más de 100 fallos seguidos el 2026-11-21. Es la alerta `s-bcv` del vigía.
- **La causa:** el BCV renovó su certificado (válido hasta el 2027-05-30), que
  ahora emite *Sectigo Public Server Authentication CA OV R36*, una intermedia
  que su servidor no envía. Con las CA del sistema falla igual desde los dos
  hosts.
- **El arreglo:** añadir esa intermedia a la CA anclada de
  `apps/ingestor-bcv/certs`. Va en su propio PR. Tras el traslado el fallo
  sigue igual, porque no depende del host.
