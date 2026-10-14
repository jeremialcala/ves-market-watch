# ADR-0034: El entorno de captura sale de la máquina de desarrollo y pasa a midgard

- **Estado:** accepted
- **Fecha:** 2026-10-13
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 05-deployment
- **Controles OWASP afectados:** A05 (configuración del despliegue) / A08 (procedencia de las imágenes que corren)

## Contexto

Desde julio, todo Criterio corría en la máquina de desarrollo: la base, el bus,
los dos ingestores, el motor, el gateway, el panel, el túnel de Cloudflare y el
respaldo. Era el entorno de desarrollo y, de hecho, el único entorno.

Esa máquina dejó de ser fiable. En tres días tuvo cuatro pantallazos azules, con
cuatro códigos distintos y sin causa diagnosticada:

| cuándo (hora local) | código | qué se perdió |
|---|---|---|
| 2026-10-11 19:28 | `0x4E` | al menos 37 min de captura |
| 2026-10-12 03:30 | `0x1E` | el full de esa noche, que había empezado 24 s antes |
| 2026-10-13 17:39 | `0xD1` | al menos 12 min de captura |
| 2026-10-13 18:31 | `0x0A` | unos 19 min de captura |

Lo que se pierde no vuelve. Un snapshot del libro P2P de Binance es una foto de
un instante: no hay API que devuelva el de hace una hora, y la serie es el
activo del producto.

`midgard` (`hgtech001`) es el appliance de la casa: router, Yggdrasil, Bragi.
Ya corría un despliegue parcial de Criterio desde el 2026-09-07: el gateway,
desplegado por el receptor de despliegue continuo, contra una base **vacía**, sin
ingestores ni motor. La verificación del 2026-10-05
(`docs/02-design/placement-despliegue.md`) midió que le sobra capacidad para
esta carga y que su disponibilidad es mala: disco mecánico con sectores
pendientes, cortes de luz y ninguna UPS.

## Decisión

Todo el entorno de captura pasa a `midgard`. En la máquina de desarrollo no
queda nada corriendo de forma permanente.

1. **La base viajó como réplica física, no como volcado.** `pg_basebackup` de
   los 12 GB sobre un volumen nuevo, replicación por streaming con slot mientras
   se preparaba lo demás, y promoción en el momento del corte. Un volcado
   habría parado la captura durante el `pg_dump`, la copia y el `pg_restore`:
   entre 30 y 60 minutos estimados. La réplica deja el hueco en lo que tarda un
   ciclo.
2. **Misma imagen, por digest, en los dos lados.** Una réplica física es una
   copia byte a byte del directorio de datos, y solo la abre el mismo binario.
   `midgard` usaba el tag móvil `latest-pg16`, que allí había resuelto a
   PG 16.15 con TimescaleDB 2.29.2; los datos son de 16.14 con 2.28.2. El
   compose de `midgard` queda fijado al digest del de desarrollo.
3. **Los servicios sin imagen publicada se copiaron tal cual.** Ingestores,
   motor, panel y respaldo corren las **mismas** imágenes que corrían en
   desarrollo, pasadas con `docker save | docker load`. No se reconstruyeron:
   cambiar de máquina y de versión a la vez habría mezclado dos causas en
   cualquier fallo. El despliegue continuo para las cinco entra después, por PR.
4. **El acceso público no cambia de nombre.** El mismo túnel y los mismos
   hostnames (`criterio-dev`, `criterio-api-dev`) se sirven ahora desde un
   conector en `midgard`. El ingress apunta a nombres de servicio, que existen
   iguales en la red `ves-market`. Auth0, CORS y la CSP no se tocan.
5. **El respaldo se muda con los datos.** Mismo bucket de B2, misma clave sin
   borrado (ADR-0027), mismo `rclone.conf` cifrado. El contenedor de desarrollo
   queda parado: dos respaldos contra el mismo destino se pisarían la poda.
6. **Los compose de `midgard` entran al repositorio,** en `deploy/midgard/`.
   Hasta hoy vivían solo en el disco de la máquina.
7. **Esto no decide D15.** Dónde vive el núcleo en producción sigue abierto.
   Lo que se mueve es el entorno de captura, porque no podía quedarse donde
   estaba; `midgard` como producción tiene condiciones que hoy no cumple.

## Alternativas consideradas

- **Volcado y restauración con ensayo previo.** Es el camino que `verificar`
  prueba cada domingo, y era la recomendación por tener menos piezas. Se
  descartó por el hueco: media hora o más sin captura, a cambio de una
  simplicidad que la réplica no llegó a echar de menos.
- **Arreglar la máquina de desarrollo.** Cuatro códigos distintos apuntan a
  memoria o a un controlador, pero es una hipótesis. Diagnosticarlo lleva días
  y la captura seguiría cayéndose mientras tanto.
- **Ir directo a AWS** (opción (a) de D15). Es la recomendación para
  producción, pero pide decidir D12 a D15, abrir la cuenta y montar el CD. No
  es trabajo de una tarde, y el problema era de esa tarde.
- **Publicar primero las cinco imágenes en GHCR.** Deja el despliegue limpio de
  entrada, pero necesita un workflow nuevo en `main`, o sea un release, con la
  captura varios días más en la máquina que falla.

## Consecuencias

**A favor**

- La captura ya no depende de un equipo de escritorio que se cuelga.
- `midgard` arranca solo y converge: `ves-market-arranque.service` levanta
  base, bus y servicios tras un corte de luz.
- La base queda sin puertos publicados y con credenciales generadas. En
  desarrollo era `postgres/postgres` en el 5433 de la LAN.
- El `postgres` de la réplica quedó **sin contraseña**: solo entra por el
  socket del contenedor. Los servicios usan el rol `ves`.

**En contra, y hay que decirlo**

- **El disco de `midgard` está fallando y va a peor.** El 2026-10-05 tenía 8
  sectores pendientes; el día del traslado, 16. Los 12 GB de la base viven
  ahora en ese disco. La red es el respaldo horario a B2: lo que se puede
  perder es, como mucho, una hora.
- **Sin UPS.** Un corte de luz es un hueco en la serie, igual que antes lo era
  un pantallazo azul. Son menos frecuentes (10 arranques en 19 días, medido
  el 2026-10-05), no inexistentes.
- **Cinco imágenes corren sin procedencia de registro.** Están etiquetadas
  `ghcr.io/…:traslado-20261013` pero solo existen en el disco de `midgard`, y
  son anteriores a 0.5.2: no llevan los parches de dependencias de esa versión.
  Es un retroceso del control T8 hasta que las publique el CI.
- **Cambia la salida a internet.** Desarrollo salía por una VPN; `midgard` sale
  por los dos ISP de la casa, con balanceo. Binance y el BCV respondieron bien
  desde las dos WAN, pero el patrón de origen es otro: si aparecen `429`, se
  mira aquí primero.
- **La máquina es más lenta.** La consulta de distribuciones del motor agotó
  sus 5 s en el primer ciclo, con la caché fría, y pasó en el segundo. Si se
  repite, se sube `ANALYSIS_QUERY_TIMEOUT_S`.
- **`midgard` es también el router.** La base lleva límite de 3 GiB y cada
  servicio el suyo, para que un proceso desbocado no deje la casa sin red.

## Verificación

Medido el 2026-10-13, en UTC.

| qué | resultado |
|---|---|
| Copia base | 12 GB en 4 min 10 s |
| Réplica antes del corte | 1 ms de retraso; 435 chunks y 44 comprimidos en los dos lados; recuentos idénticos en cinco hipertablas, y en `official_rates` 5 filas más en la réplica: el latido del BCV que entró entre una consulta y la otra |
| Cierre de la base de desarrollo | limpio, checkpoint en `11/C22543A8` |
| Réplica al promover | recibido y aplicado hasta `11/C2254420`, por delante del cierre |
| Último ciclo en desarrollo | 23:31:35 |
| Primer ciclo en `midgard` | 23:32:37 |
| **Ciclos de captura perdidos** | **ninguno**: 62 s entre los dos, con un intervalo nominal de 60 |
| Acceso público durante el corte | sin interrupción: los dos conectores convivieron y se paró el de desarrollo |
| Lectura autenticada por el túnel | cinco rutas en 200, con datos de 5 s de antigüedad; sin token, 401 |
| Respaldo desde `midgard` | incremental subido a B2 a las 23:33 |
| Secretos | viajaron por tubería; los seis hashes coinciden en los dos lados |
| Unidad de arranque | probada: no recrea ningún contenedor que ya corre |

## Pendiente

- ~~Despliegue continuo para ingestores, motor, panel y respaldo: workflow de
  build en GHCR y alta en el receptor. Cierra el retroceso de T8.~~ **Hecho el
  2026-10-14** (0.5.3): un workflow y un proyecto compose por servicio, y el
  receptor ampliado para varias apps por repositorio (su ADR-0010). Midgard
  pasó a las imágenes de GHCR sin perder ningún minuto de captura. Lo que
  sigue pendiente de ahí: esos servicios no tienen comprobación de salud ni
  rollback automático.
- Cambiar el disco de `midgard` y ponerle UPS. Sin eso no es producción.
- Que el vigía de servicios de Yggdrasil vigile también los contenedores
  `ves-*`. Hoy solo avisa el respaldo.
- Medir en `midgard` cuánto tarda `verificar`: el domingo restaura 12 GB sobre
  un disco mecánico.
- Borrar el volumen vacío `ves-market-infra_timescale-data` y, cuando haya un
  full verificado hecho desde `midgard`, el volumen de datos de desarrollo, que
  queda como copia de vuelta atrás.
