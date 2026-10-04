# ADR-0027: Los respaldos se guardan en Backblaze B2, con una clave que no puede borrar

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Controles OWASP afectados:** A05 / A08 (integridad del respaldo frente a una credencial robada)

## Contexto

El respaldo de `ves_market` (`scripts/respaldo/`) sube a Google Drive desde el
2026-08-24, cifrado en cliente con un remoto `crypt` de rclone. Funciona bien
mientras el token OAuth funciona, y en seis semanas ha dejado de hacerlo dos
veces:

| caída | causa | duración | cómo se supo |
|---|---|---|---|
| 2026-09-07 → 09-14 | `invalid_grant`: app OAuth en *Testing*, refresh token de 7 días | 7 días | de rebote, mirando otra cosa |
| 2026-09-23 → 10-04 | `invalid_grant` otra vez | **11 días** | push de ntfy desde la primera hora |

Tras la primera caída se añadieron los avisos (0.5.1), y la segunda sí se
avisó. Pero un aviso no arregla nada: reparar el token pide **un navegador y una
persona**, porque el consentimiento de Google es interactivo. Un respaldo
desatendido cuyo único modo de reparación es atendido falla a la velocidad de
la persona, no de la máquina.

Además, Drive no hablaba S3, así que el siguiente paso natural —PITR con
archivado de WAL— no tenía destino. Y la credencial del contenedor podía borrar
todo lo que había subido, de modo que quien se hiciera con la máquina se
llevaba la base **y** el respaldo.

## Decisión

El destino pasa a ser un bucket privado de **Backblaze B2**, por el backend
`b2` de rclone, bajo el **mismo** remoto `crypt`.

1. **Solo cambia el destino.** Scripts, cadencias, verificación semanal y
   avisos siguen iguales. El `crypt` conserva nombre y contraseñas: se repunta
   con `rclone config update criterio-cifrado remote=b2:...`, y el `.env` no
   cambia.
2. **La clave del contenedor no tiene `deleteFiles`.** Tiene `listBuckets`,
   `listFiles`, `readFiles` y `writeFiles`. La poda sigue funcionando porque,
   con `hard_delete=false`, rclone convierte un borrado en `b2_hide_file`, que
   solo pide `writeFiles`. Lo oculto lo borra una regla de lifecycle del bucket
   **a los 14 días**: dos verificaciones semanales para notar y recuperar.
3. **La retención del full baja de 90 a 76 días** para que, con los 14 ocultos,
   un full no viva más de los 90 que la clasificación de datos fija para los
   snapshots crudos.
4. **El histórico de Drive se copia cifrado**, de bucket a bucket, sin
   descifrar: los nombres cifrados son deterministas con la misma contraseña,
   así que el `crypt` los lee igual desde B2. Su modtime viaja con ellos, y la
   poda los trata por su edad real.

## Alternativas consideradas

- **Reparar el token de Drive y seguir.** Es lo que se hizo la primera vez.
  Resuelve la caída, no el modo de fallo: la reparación sigue necesitando un
  navegador.
- **Cuenta de servicio de Google.** Quita el OAuth interactivo, pero una cuenta
  de servicio no tiene cuota propia en una unidad personal, y seguiría sin S3
  y con una credencial capaz de borrar.
- **Object Lock de B2.** Más fuerte que una clave sin borrado: nadie, ni el
  dueño, borra antes de tiempo. Se descartó por ahora: una subida por error o
  una retención mal puesta se pagan enteras, y el riesgo que se quiere cubrir
  —una clave robada de esta máquina— ya lo cubre la clave sin `deleteFiles`
  más la ventana de 14 días.
- **PITR con pgBackRest en la misma migración.** B2 lo hace posible, pero
  cambia la configuración del servidor Postgres y añade otra restauración que
  probar. Mezclarlo con un cambio de destino hecho con prisa —once días sin
  respaldo— era sumar riesgo a la parte urgente. Queda como paso siguiente.
- **Empezar B2 vacío y dejar caducar Drive.** Más simple, pero ata la
  restauración del histórico a Drive durante 90 días, que es justo el destino
  que falla.

## Consecuencias

- **Positivas:** una clave de aplicación no caduca ni depende de una pantalla
  de consentimiento. Quien robe la credencial del contenedor no puede destruir
  el respaldo antes de 14 días. Se abre la puerta a PITR.
- **Negativas / deuda asumida:** el respaldo pasa a tener coste por GB: unos
  **440 GB** en régimen con el full de 4,9 GB medido el día del corte —se
  escribió 208 con la cifra de agosto, y la base se había duplicado—.
  B2 exige **rclone ≥ 1.75** en la práctica: el 1.69.3 de Alpine autoriza con
  la API v1, que B2 ya rechaza, así que rclone va por digest desde su imagen
  oficial y no del `apk`. Los topes diarios de la cuenta (*Caps & Alerts*)
  pasan a ser configuración del respaldo: la primera verificación agotó el de
  descarga. Un full podado sigue existiendo 14 días, oculto: la
  clasificación se cumple por la suma 76 + 14, y **si alguien toca el lifecycle
  sin tocar `RETENCION_FULL_DIAS`, deja de cumplirse sin aviso**. La clave sin
  borrado no impide ocultarlo todo: la protección es la ventana, no la
  imposibilidad.
- **Vigilancia explícita:** la verificación del domingo es la que detecta un
  vaciado malicioso (falla si no hay último full). Si se espacia, hay que
  ampliar el lifecycle con ella.
- **Impacto en threat model:** la credencial del contenedor de respaldo deja de
  ser capaz de destruir el respaldo; ya no es la de Drive.

## Verificación

- La clave **no puede borrar**: `rclone deletefile ... --b2-hard-delete` tiene
  que fallar, y el `deletefile` sin la bandera tiene que funcionar (ocultar).
  Paso 3 de `scripts/respaldo/README.md`.
- El corte se da por hecho con un `respaldar full` y un `verificar` en `OK`
  contra B2, no con que rclone liste el bucket.
- El histórico copiado se lee **descifrado** desde el contenedor
  (`rclone lsl criterio-cifrado:full`) y al menos un full de la época de Drive
  se restaura con `restaurar`.
