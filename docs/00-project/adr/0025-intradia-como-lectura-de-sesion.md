# ADR-0025: Intradía deja de ser una parrilla y pasa a leerse como una sesión

- **Estado:** accepted
- **Fecha:** 2026-08-06
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Controles OWASP afectados:** A05 (contrato del gateway ampliado de forma
  compatible); ninguno más de forma directa

## Contexto

Intradía era una parrilla de *small multiples*: todos los indicadores del día
operativo, uno por panel, agrupados por familia. Respondía «cuánto vale cada
cosa» y lo hacía bien, pero no respondía ninguna de las preguntas con las que
alguien abre la vista: qué dice el ruleset ahora, qué se ha movido, en qué se
diferencian los dos lados, qué pasó y cuándo.

Cuatro trabajos sucesivos sobre esa parrilla dejaron además un patrón repetido
que conviene fijar como decisión y no como anécdota: **cada bloque nuevo traía su
propia copia de lo que el anterior ya resolvía**. Cinco formateos distintos de
una Δ, dos definiciones del mismo título, dos tarjetas con el mismo dibujo y
valores que ya divergían. Los tres defectos más caros de la rama salieron de ahí,
no de la lógica.

## Decisión

1. **La vista se lee de arriba abajo, en cinco bloques derivados del dato.**
   Lectura de la sesión (veredicto del ruleset), qué se movió, compra vs. venta,
   microestructura y cronología. De la parrilla original solo queda la tasa
   oficial, que sí es una serie por sí misma. Ninguno cablea lo que afirma: el
   criterio de «qué se movió» se calcula (`z = |Δ| / σ₇d`), la frase sobre el
   resto se cuenta, y los eventos de la cronología se pueden señalar en una serie.

2. **Cada bloque declara qué codifica su color, y ninguno lo deja solo en el
   color.** Lado en la parrilla, dirección de la Δ en el bloque enfrentado, estado
   de la condición en microestructura. El signo va siempre escrito.

3. **Una función, un catálogo, una tarjeta.** Todo formato de Δ pasa por
   `lib/delta.ts`; el par etiqueta ↔ clave vive solo en `presentacionDe`; todos
   los bloques usan `MetricCard`. Es la decisión que este ADR existe para fijar:
   *en esta vista, la segunda copia de algo es un defecto pendiente de aparecer.*

4. **La clave que se muestra es la del contrato.** `p2p_brecha_abs`,
   `p2p_liquidez`, `p2p_drenaje_oferta_6h_pct` — los nombres reales de
   `indicators`, no rótulos legibles. Es lo que se copia a una consulta o a un
   ticket, y RF-9 ya dice que el vocabulario del contrato no se traduce.

5. **El contrato del gateway acepta `15m`.** Ampliación **compatible** del enum de
   `interval` (`5m`/`15m`/`1h`/`1d`), pedida por la barra de control. `time_bucket`
   corre en crudo sobre la hipertabla, sin agregado continuo, así que son tres
   líneas y ningún cliente anterior se entera.

6. **El cero se interpreta donde el proyecto tiene una lectura escrita.** En
   `p2p_outliers_pct` el cero es el resultado deseado del filtro MAD/IQR y se dice
   con esas palabras; en el resto de series, cero es un valor como otro. Y esa
   serie **no entra nunca** en «qué se movió»: mide la calidad del dato, no el
   mercado.

## Alternativas consideradas

- **Mantener la parrilla y añadir bloques alrededor**: era el plan inicial. Se
  descartó al ver que compra y venta enfrentadas responden una pregunta distinta
  —y mejor— que dos parrillas paralelas, y que microestructura no son cifras del
  día sino condiciones de reglas.
- **Rótulos legibles como clave** (`p2p_brecha_ves`, `micro_drenaje_oferta_6h`):
  descartada. Ninguno existe en `indicators`; en snake_case se leen como
  identificadores y fallan en la primera consulta.
- **Un tooltip por bloque**: descartada por la misma razón que el resto de
  duplicaciones. El de Recharts, además, vivía dentro del flujo y empujaba la
  tarjeta al aparecer.

## Consecuencias

- (+) La vista responde preguntas en vez de listar valores, y cada afirmación se
  puede señalar en una serie.
- (+) Cinco puntos de duplicación cerrados, cada uno con su guarda automática:
  formato de Δ, par etiqueta/clave, tarjeta, tooltip y coordenadas del sparkline.
- (+) Tres defectos que solo se ven mirando el conjunto quedaron cazados y con
  prueba: el porcentaje contra base con signo, el string crudo en la cronología y
  los siete `#fff` que rompían el tema claro.
- (−) **El tema claro estuvo roto ocho commits sin que ninguna prueba lo notara**,
  porque todas corren en oscuro. El canario nuevo mide que el color salga de un
  token, no píxeles: es lo único verificable sin renderizar los dos temas, y no
  cubre un token mal elegido.
- (−) El foco de `MetricCard` está escrito y **hoy no se alcanza**: la tarjeta no
  es un control. Es deuda consciente, no un olvido.
- (−) Ampliar el enum de `interval` obliga a desplegar el gateway antes que
  cualquier cliente que use `15m`. En este caso van juntos.

## Verificación

Medido en `https://criterio-dev.higerotech.com`, no inferido: geometría de cada
bloque contra el DOM, `15m` llegando al gateway con 200 y agrupando de verdad
(87 puntos para ~21,5 h), 105 cifras sin un solo guion ASCII ni signo doble, 26
elementos volteando bien entre temas, y la sesión sobreviviendo a la recarga con
`localStorage` sin tokens (T12).

Automática: 494 pruebas del SPA (88,19 % de ramas) y 124 del gateway, con guardas
de fuente para las decisiones que un test de comportamiento no puede sostener
—que nadie componga un porcentaje a mano, que no vuelvan los triángulos de
dirección, que ninguna animación en bucle quede sin excepción de movimiento
reducido y que ningún `color:` sea un literal—.
