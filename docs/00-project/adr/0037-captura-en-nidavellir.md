# ADR-0037: El entorno de captura pasa de midgard a nidavellir

- **Estado:** proposed. Pasa a `accepted` con el corte hecho y la tabla de
  verificación rellena.
- **Fecha:** 2026-11-21
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 05-deployment
- **Relacionadas:** ADR-0034 (el traslado anterior, de desarrollo a midgard);
  ADR-0012 de Yggdrasil (reparto entre midgard y nidavellir, y su piloto);
  `docs/02-design/placement-despliegue.md` (D15)
- **Controles OWASP afectados:** A05 (configuración del despliegue: sin puertos
  nuevos en la LAN) / A08 (las imágenes que corren son las mismas, de GHCR)

## Contexto

Desde el 2026-10-13 todo el entorno de captura corre en midgard (`hgtech001`),
ADR-0034. Lo medido el 2026-11-21 (`placement-despliegue.md`, revisión de esa
fecha):

- **Los 12 GB de la base están en un disco mecánico que falla:** 16 sectores
  ilegibles y 1.375 errores sin corregir. Es el mismo disco desde el traslado.
- **El SSD de datos de midgard no es alternativa.** El HP S700 de 1 TB dejó de
  responder el 2026-11-01 bajo carga y se llevó con él a Bifröst y Morocota
  (revisión del 2026-11-02 de la ADR-0012 de Yggdrasil). Apunta al cable o a la
  alimentación, que comparte con la tarjeta USB de las WAN.
- **midgard está al límite:** es el router, el observador (Yggdrasil) y el host
  de Criterio, con la memoria comprometida al 93 % el 2026-10-30. La pila del
  CMOS está agotada: el reloj vuelve a 2026-10-12 en cada corte de luz.

nidavellir (`hgtech002`), medido el mismo día:
- **Ryzen 3 2200G** y 13 GiB, con 10,4 disponibles;
- **SSD sano** de 636 h;
- **483 TPS** en `pgbench`, frente a 148 en midgard;
- ya lleva hive, morocota y su infraestructura desde el 2026-11-02.

La ADR-0012 de Yggdrasil decidió el 2026-10-31 que nidavellir es el host de
aplicaciones y que Criterio va allí, en bloque, como «ola 2» de su piloto.

## Decisión

Todo el entorno de captura pasa a nidavellir, con los scripts de
`deploy/traslado-nidavellir/`.

1. **Copia de los volúmenes, no replicación física.**
   - La presincronización en caliente deja el grueso en nidavellir y sirve
     además de prueba de lectura del disco de midgard.
   - En el corte, la base se apaga limpia y un rsync con `--checksum` deja el
     destino idéntico byte a byte.
   - Recuentos por hipertabla a los dos lados lo confirman antes de arrancar
     nada.
   - **Hueco previsto: unos 5 minutos.**
2. **Sin puertos nuevos en la LAN.** El rsync va por ssh, de host a host, con
   la clave del PC reenviada: no se queda en ningún host. Ni la base ni el bus
   se publican fuera de su red de Docker.
3. **Lo desplegado en midgard viaja tal cual.** Compose, `.env`, scripts y
   unidades se copian de midgard, no del repositorio, y se comparan por
   sha256. Las imágenes son las mismas etiquetas de GHCR, y la base, el mismo
   digest: una copia física solo la abre el mismo binario.
4. **El receptor cambia de host en el mismo corte.** Midgard pierde las apps
   antes de parar nada, porque su reconciliador podría resucitarlas.
   Nidavellir las gana al final; su webhook ya recibe los avisos de GitHub
   desde el 2026-11-03.
5. **Los respaldos y el aviso se mudan con los datos:**
   - mismo bucket de B2 y mismo `rclone.conf`;
   - misma ruta del NAS y **misma frase**, copiada antes de instalar nada;
   - mismo tema de ntfy y misma comprobación de Healthchecks.

   Nunca hay dos respaldos a la vez: los de midgard se desactivan antes de
   que arranquen los de nidavellir.
6. **La vigilancia pasa a Thor y Baldr de nidavellir,** además del vigía
   propio, que se muda.
7. **Esto no decide D15.** Nidavellir sigue sin UPS y sale a internet por
   midgard. La recomendación para producción sigue siendo AWS
   (`placement-despliegue.md`).

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| **Copia de volúmenes con presincronización (elegida)** | Ningún puerto nuevo; datos idénticos y comprobados; vuelta atrás simple | Unos 5 min sin captura |
| Replicación física, como en ADR-0034 | Hueco de un ciclo | Publicar PostgreSQL en la LAN, o un túnel ssh para la réplica: es justo lo que la ADR-0012 de Yggdrasil excluye del piloto. Más piezas para ahorrar 4 ciclos |
| Volcado y restauración | El camino que `verificar` prueba cada semana | 30–60 min sin captura |
| Al SSD de midgard | Sin cambiar de host | Se cayó el 2026-11-01 bajo carga; midgard sigue sobrecargado |
| Quedarse en midgard hasta D15 | Cero trabajo | El disco va a peor, y D15 no es de una tarde |
| AWS ya (D15, opción a) | Es la recomendación para producción | Pide cerrar D12–D15, sacar la cuenta del plan Free y montar el CD. Lo urgente es el disco |

## Consecuencias

**A favor**
- Los datos salen de un disco que falla y pasan a uno sano, con el triple de
  rendimiento.
- midgard recupera unos 1,6 GB de memoria y deja de mezclar router y base de
  datos.
- El despliegue continuo vuelve a ser por webhook, sin los ~7 min del
  reconciliador.

**En contra, y hay que decirlo**
- **El mismo circuito eléctrico.** Los cortes de nidavellir coinciden al
  minuto con los de midgard: 98,3 % de disponibilidad medida desde el
  2026-10-29. El traslado no mejora eso.
- **La salida a internet sigue pasando por midgard y por PIA** (ADR-0009 de
  Yggdrasil). Si midgard cae, Criterio sigue capturando en local, pero sin
  fuentes ni acceso público. Binance, B2, GHCR y Healthchecks responden desde
  nidavellir (comprobado el 2026-11-21). La subida diaria de ~5 GB a B2 pasa
  ahora por la VPN.
- **La prueba de estrés del piloto sigue pendiente.** nidavellir tuvo 8
  cuelgues el 24 y el 25 de octubre. No ha vuelto a colgarse desde
  `processor.max_cstate=1` y el watchdog: todos los arranques posteriores
  coinciden con cortes de luz. Ya lleva hive y morocota.
- **Comparte host con otros productos.** Criterio mantiene sus límites de
  memoria: 3 GiB la base y el suyo cada servicio.
- **El HDD `sda` de nidavellir falla** (23.637 errores). No está montado, pero
  el piloto pide desconectarlo.

## Verificación

A rellenar con la salida de `30-corte.sh` y `50-verificar.sh`.

| Qué | Resultado |
|---|---|
| Presincronización: errores de lectura en midgard | |
| Recuentos por hipertabla, midgard frente a nidavellir | |
| Apagado limpio de la base en midgard | |
| Duración del rsync final | |
| **Hueco de captura** (último ciclo en midgard → primero en nidavellir) | |
| Túnel conectado y acceso público | |
| Primer despliegue por webhook en nidavellir | |
| Incremental a B2 y primer respaldo al NAS | |
| Thor y Baldr con Criterio | |

## Pendiente

- El PR posterior al corte: `deploy/midgard/` pasa a `deploy/nidavellir/`
  (`deploy/traslado-nidavellir/README.md`, «Después del corte»).
- Retirar lo que queda en midgard a los 7 días sin incidentes.
- UPS para las dos máquinas: sin ella, el hueco más probable sigue siendo un
  corte de luz.
