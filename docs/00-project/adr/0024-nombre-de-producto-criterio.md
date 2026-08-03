# ADR-0024: El producto se llama Criterio; los identificadores no se renombran

- **Estado:** accepted
- **Fecha:** 2026-08-03
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 00-project
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** ninguno directo; toca A05 solo por lo que se
  decide **no** renombrar (ver «Consecuencias»)

## Contexto

«VES Market Watch» era un nombre descriptivo de lo que el sistema hace: *watch*
sobre el par VES. Sirvió mientras el producto era un tracker. Hoy la app no
enseña una tasa: enseña una **lectura** —régimen de mercado, distancia al
disparo, atribución del movimiento, calidad del dato— y todo lo que se ha
construido en las últimas entregas fue en esa dirección.

El dueño del producto fija el nombre de cara al usuario final: **Criterio**.

El nombre viejo aparecía en 27 sitios, y no todos son la misma clase de cosa.
Hay tres:

1. **Marca.** El título de la app, la barra de navegación, los encabezados de
   los documentos, el título de las especificaciones OpenAPI/AsyncAPI. Es texto
   que alguien lee.
2. **Identificadores registrados en un sistema externo.** El nombre de la
   aplicación y del Resource Server en el tenant de Auth0, y el `audience`
   `https://api.vesmarketwatch/`.
3. **Identificadores internos.** El nombre del repositorio (`ves-market-watch`),
   los paquetes Python (`api_gateway`, `indicator_engine`), los contenedores, y
   el prefijo `vmw-` de las clases CSS.

## Decisión

**Cambia la clase 1. No cambian la 2 ni la 3.**

- La marca pasa a «Criterio» en todas partes donde se lee: `app.titulo` en los
  dos idiomas, el `<title>` de la página —que además seguía diciendo `web-spa`,
  el valor con el que Vite crea el andamiaje—, el isotipo de la barra, los `H1`
  de los documentos, los diagramas C4 y el bundle de conocimiento.
- **El tenant de Auth0 conserva «VES Market Watch»**, y la documentación lo dice
  con esas palabras. Esa tabla describe lo que hay registrado, no cómo se llama
  el producto: alinearla con la marca sin tocar el tenant la convertiría en
  ficción, que es exactamente el modo de fallo que ADR-0020 documentó cuando
  `design.md` describía un tenant que no era el real.
- **El `audience` no se mueve**, ni siquiera si algún día se renombra la app en
  el tenant. Viaja dentro de cada access token emitido y está en la
  configuración del SPA y del gateway; cambiarlo invalida todo lo que haya en
  vuelo y deja el login roto hasta que las dos partes se muevan a la vez.
- Las **referencias históricas se dejan como están**: el archivo de diseño
  importado se llamaba `VES Market Watch.dc.html` cuando se importó (ADR-0018),
  y las entradas del `CHANGELOG` y de `repo-history.md` describen lo que pasó
  cuando pasó. Reescribir un registro histórico para que case con el presente es
  perder el registro.

## Consecuencias

**A favor**

- Un nombre solo, y corto, en pantalla. De paso desaparece la variante compacta
  de la barra, que hacía `compacta ? "VES Market Watch" : t("app.titulo")` —
  las dos ramas pintaban el mismo texto y una se saltaba la traducción.
- El `<title>` deja de decir `web-spa` en la pestaña del navegador.

**En contra, y asumido**

- **Queda una discordancia deliberada** entre lo que el usuario ve (Criterio) y
  lo que dice el tenant (VES Market Watch). Es el precio de no mentir en la
  documentación de infraestructura. Si algún día se renombra en Auth0, se
  renombra la tabla **después** de comprobarlo, no antes.
- Alguien que venga a «terminar el trabajo» encontrará el nombre viejo en los
  identificadores internos y en el tenant. Este ADR existe sobre todo para eso:
  el `audience` no es un nombre pendiente de actualizar, es una clave.

## Alternativas consideradas

- **Renombrarlo todo, incluidos repositorio y paquetes.** Es un refactor de
  superficie enorme —cada `import`, cada contenedor, cada clase CSS— sin ningún
  beneficio para el usuario, y con un riesgo real de romper el despliegue. El
  nombre del repositorio no se lee en pantalla.
- **Renombrar también en Auth0 en la misma entrega.** Cambiar ajustes del tenant
  es una acción sobre un sistema externo y de producción: se hace aparte, con su
  verificación, y con la tabla actualizada *después*. El `audience`, además, no
  entra en esa conversación.
