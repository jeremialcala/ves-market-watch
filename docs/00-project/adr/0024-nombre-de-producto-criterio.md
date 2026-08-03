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

1. **Etiquetas.** El título de la app, la barra de navegación, los encabezados
   de los documentos, el título de las especificaciones OpenAPI/AsyncAPI y los
   **nombres de la aplicación y del Resource Server en el tenant de Auth0**. Es
   texto que alguien lee; nada apunta a ello.
2. **Identificadores de un sistema externo.** El `audience`
   `https://api.vesmarketwatch/`, los `client_id` y el `id` del Resource Server.
   Son claves: algo en producción las compara carácter a carácter.
3. **Identificadores internos.** El nombre del repositorio (`ves-market-watch`),
   los paquetes Python (`api_gateway`, `indicator_engine`), los contenedores, y
   el prefijo `vmw-` de las clases CSS.

La línea que importa no es «dentro o fuera del repositorio»: es **si algo apunta
a ese texto**. Un nombre en el dashboard de Auth0 es tan etiqueta como un `H1`.

## Decisión

**Cambia la clase 1 —entera, tenant incluido—. No cambian la 2 ni la 3.**

- La marca pasa a «Criterio» en todas partes donde se lee: `app.titulo` en los
  dos idiomas, el `<title>` de la página —que además seguía diciendo `web-spa`,
  el valor con el que Vite crea el andamiaje—, el isotipo de la barra, los `H1`
  de los documentos, los diagramas C4 y el bundle de conocimiento.
- **El tenant de Auth0 se renombró el mismo día**, a petición del dueño del
  producto (ver «Enmienda»). Las tres etiquetas siguen al producto: `Criterio
  API`, `Criterio SPA`, `Criterio M2M tests`. Lo que **no** se movió es ningún
  identificador: `client_id`, `id` del Resource Server y `audience` siguen
  exactamente igual. El nombre es etiqueta; el id es identidad.
- **El `audience` no se mueve.** Es inmutable en Auth0 y, aunque no lo fuera,
  viaja dentro de cada access token emitido y está en la configuración del SPA y
  del gateway: cambiarlo invalida todo lo que haya en vuelo y deja el login roto
  hasta que las dos partes se muevan a la vez. Los `client_id` tampoco: renombrar
  no los toca, que es justo por lo que renombrar es barato.
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

- **El `audience` dice `vesmarketwatch` y el producto se llama Criterio.** Es una
  discordancia visible y permanente: el `identifier` de un Resource Server es
  inmutable en Auth0, y aunque no lo fuera viaja dentro de cada access token
  emitido. Alguien que venga a «terminar el trabajo» lo verá como un renombrado a
  medias. Este ADR existe sobre todo para eso: **el audience no es un nombre
  pendiente de actualizar, es una clave**.
- Lo mismo con los identificadores internos (repositorio, paquetes, contenedores,
  prefijo `vmw-`): el nombre viejo sigue ahí y es deliberado.

## Alternativas consideradas

- **Renombrarlo todo, incluidos repositorio y paquetes.** Es un refactor de
  superficie enorme —cada `import`, cada contenedor, cada clase CSS— sin ningún
  beneficio para el usuario, y con un riesgo real de romper el despliegue. El
  nombre del repositorio no se lee en pantalla.
- **No tocar el tenant en absoluto.** Era la decisión original de este ADR: dejar
  las etiquetas viejas para que la documentación de infraestructura siguiera
  describiendo lo que había registrado. El dueño del producto pidió alinearlas, y
  como el cambio es de **etiqueta** —ningún identificador se mueve— el riesgo es
  nulo y la coherencia gana. El `audience` nunca entró en esa conversación.

## Enmienda (2026-08-03): el tenant se renombra

A petición del dueño del producto se renombran las tres etiquetas del tenant
mediante `PATCH` de un solo campo (`{"name": …}`) sobre la Management API, con
snapshot previo y diff posterior de cada objeto completo:

| Recurso | Antes | Ahora |
|---|---|---|
| Resource Server `6a56683fbcee12f7916916ae` | `VES Market Watch API` | `Criterio API` |
| Cliente `8CpfA64FlGTmuyF8w07rDFlrZHEeuRER` | `VES Market Watch SPA` | `Criterio SPA` |
| Cliente `bxxHckFTW9QLXUTCu4xeHO1Mr6EqgAsF` | `VES Market Watch M2M tests` | `Criterio M2M tests` |

**El diff confirmó que `name` fue el único campo modificado en los tres.** Se usó
`PATCH` crudo y no `auth0 apis update --name`: ese subcomando expone
`--enforce-policies` y `--offline-access` como booleanos, y un flag ausente que
viaje en falso apaga el RBAC (`token_dialect: access_token_authz`) o el offline
access sin que nadie lo pida. Verificado en vivo después: la recarga del SPA
vuelve a pedir token contra la API renombrada, WSS conecta y la brecha pinta.

Queda sin tocar la aplicación `ves-market-watch` (`ar7OGg1w7do1yMPs4EEjqG6uzLDDvz6f`,
regular web, sin callbacks ni orígenes): no la referencia nada del repositorio y
su nombre es el del repositorio, que este ADR ya decidió no cambiar.
