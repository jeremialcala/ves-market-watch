---
type: Log
title: Historia del knowledge bundle
description: Registro cronológico de cambios en el contexto del proyecto (más reciente primero).
timestamp: 2026-08-03T12:00:00Z
---

# Log

## 2026-08-06 — Barrido de coherencia: dos cifras mías estaban mal
- **El `api-gateway` no subía a 93 %: bajó a 92,65.** Leí el «93%» redondeado de
  la terminal y lo escribí como «93,00». Añadir el `15m` añadió código y las dos
  pruebas nuevas no lo cubrieron en proporción. *Redondear hacia arriba una cifra
  propia es la forma más fácil de documentar una mejora que no ocurrió.*
- **La columna decía «Ramas» y no eran ramas.** Los cinco servicios Python
  citaban `percent_covered` de `coverage` —sentencias + ramas— y el SPA sí citaba
  ramas puras: seis filas de la misma tabla comparando cosas distintas. Ahora van
  las dos columnas. El criterio de salida se cumple con cualquiera de ellas; la
  más baja en ramas solas es 82,71 %.
- Y la enumeración del plan de pruebas había perdido las comas de tanto editarla
  seguido: seis añadidos, cada uno pegado al anterior.
- ADR-0025 recoge lo que la rama decidió, que era lo único que faltaba del
  registro: la vista, los cinco puntos de duplicación cerrados, la clave del
  contrato y la ampliación a `15m`.


## 2026-08-06 — El Intradía reordenado, y los criterios que hubo que medir
- Rama `feat-intraday`. De la parrilla original **solo queda la tasa oficial**:
  cada familia acabó en el bloque que responde a su pregunta —lectura del
  ruleset, qué se movió, compra vs. venta, microestructura y cronología—.
- **Lo que más pensé fue el criterio de «qué se movió».** Ordenar por |Δ| a secas
  hacía ganar siempre a la liquidez, que se mide en cientos de miles frente a un
  ratio en centésimas. Normalizando por σ de 7 días lo que ordena es cuánto se
  salió cada serie de SU normalidad. Dos límites con respuesta explícita: σ = 0
  con movimiento va arriba del todo —no se movía en una semana y hoy sí, que es
  lo más inusual que le puede pasar— y sin historia queda fuera, porque un cero
  la haría parecer tranquila y eso es una afirmación.
- **La histéresis clásica no servía, y lo dijo el dato.** Probé la banda de
  amplitud sobre σ de 7 días: en `p2p_ratio_oferta_demanda` esa σ es 0,58 contra
  un umbral de 0,3, así que la banda se comía el umbral entero. La σ larga mide
  cambios de régimen, no el temblor local. Lo que separa un cruce de un temblor
  es que **aguante**: 15 minutos, elegidos simulando sobre la sesión real —de 21
  cruces crudos quedan 8, y se estabiliza entre 3 y 6 buckets—. *Antes de elegir
  una constante, mídela contra el dato que va a filtrar.*
- **Dos frases que estuve a punto de cablear y habrían mentido el primer día.**
  «El resto se mantuvo dentro de su rango normal» se cuenta: había 10 series
  fuera. Y la cronología parecía repetir líneas hasta que vi que
  `p2p_ratio_oferta_demanda` tiene TRES condiciones en tres reglas (`lt 0.2`,
  `lt 0.3`, `gt 2`): no era un fallo de deduplicación, faltaba nombrar la regla.
- Un error propio caro de ver: pedía la ventana de referencia con el intervalo
  del selector, así que a 5 min eran >40 000 filas y el navegador iba por la
  página 33 con la sección sin pintarse. Va fija a 1 h.
- **Compra y venta dejan de ser dos parrillas.** Enfrentarlas cambia la pregunta
  que responde la vista: de «cómo va la liquidez de venta» a «en qué se
  diferencian los lados». Y obligó a mover el color: dentro del bloque el lado lo
  dice la columna, así que el tono queda libre para la dirección — pero teal y
  coral encabezan las columnas Y colorean las Δ, dos significados para el mismo
  par. Se sostiene porque el signo va escrito; sin eso habría sido un doble
  encoding de los que este proyecto evita.
- **Microestructura no eran cuatro cifras más: eran cuatro condiciones.** En
  cuanto se ve así, la pregunta deja de ser «cuánto vale el spread» y pasa a ser
  «cuánto le falta para disparar», y entonces el color del lado sobra —no lo
  tienen— y el que hace falta es el del estado. Aquí el coral es el que cumple:
  suena al revés hasta que recuerdas que en este proyecto el coral es del
  ruleset, no del «va mal».
- **La línea de umbral fuera del lienzo es peor que no dibujarla.** Con el
  dominio ajustado a la serie, un umbral lejano se recorta **en silencio**: la
  chispa queda igual de bonita y se lee como si el disparo estuviera al lado. Al
  meter el umbral en el dominio, la serie se aplana contra un borde —y eso ES la
  lectura—. *Cuando una referencia no cabe, el problema es la escala, no la
  referencia.*
- **Un porcentaje aritméticamente correcto y factualmente falso.** El momentum
  abrió en −0,24 y estaba en +0,31, y la tarjeta escribía «+0,55 (−232,25 %)».
  El cociente está bien; la frase «variación desde la apertura» no, porque contra
  una base con signo el porcentaje no dice la dirección. Lo arreglé en el resumen
  del día y no en la función de aritmética: la división no tenía ningún defecto,
  el defecto era lo que yo estaba afirmando con ella. *Lo vi porque lo miré en el
  navegador con dato real; ninguna prueba lo habría cazado, porque yo mismo no
  había pensado en el caso.*
- **Las dos tarjetas ya habían empezado a divergir antes de unificarlas**: gap
  10 contra 12, trazo 1,6 contra 1,8, la misma cifra con dos clases. Es el mismo
  patrón que el de los títulos, cazado antes de que costara nada.
- **Todo el «estilo fijo» que se pidió ya existía en tokens con ese valor**:
  `--border` era el 8 %, `--border-2` el 14 %, `--lift` los −4 px y `--dur-card`
  los 0,25 s. Escribirlos a mano habría creado una segunda fuente para los
  mismos números. *Antes de escribir una constante, busca si el sistema ya la
  tiene con nombre.*
- **El foco visible es correcto y hoy inalcanzable.** La tarjeta no es un
  control; añadirle `tabIndex` habría metido ~28 paradas de tabulación sin nada
  que activar, que empeora la vida justo a quien la regla protege. Está escrita,
  con `:focus-within`, para el día que la tarjeta gane una acción.
- **`PainCard` y `SlaCard` no existen en este repo** —son del proyecto de
  diseño—, así que la premisa «los únicos degradados del sistema» no describe
  este código: aquí hay seis, y uno es el panel de sesión pedido en esta misma
  rama. La prohibición se aplicó a la tarjeta; la premisa se anotó.
- **Toda la vista de Intradía estaba rota en tema claro y llevaba así ocho
  commits.** Los prompts decían «blanco» y yo escribí `#fff` siete veces en vez
  de `var(--white)`, que es el token de máximo contraste y vale tinta oscura en
  claro. Resultado: veredicto, cuatro títulos, cifras y valores en blanco sobre
  fondo blanco. *Un literal que casualmente coincide con el token en el tema en
  que trabajas no es un color: es una bomba de relojería.*
- **Ninguna prueba lo vio porque todas corren en oscuro**, que es el tema por
  defecto del producto. El canario nuevo no comprueba píxeles: comprueba que el
  color venga de un token, que es lo único verificable sin renderizar los dos
  temas.
- **Lo destapó unificar los títulos, no buscarlo.** Había dos definiciones del
  mismo elemento —`.vmw-movio__titulo` y `.vmw-seccion__titulo`— con la misma
  tipografía y distinto color; al ir a borrar la duplicada saltó la diferencia.
  Duplicar una regla de estilo es duplicar el sitio donde puede divergir.
- **La nota del «snapshot limpio» habría sido falsa el día que la escribí.**
  Antes de implementarla miré el dato: el día operativo llevaba 17 lecturas de
  outliers no nulas en compra y 128 en venta. Cablearla a la métrica —que es lo
  que pedía la letra— habría puesto «el filtro no descartó nada hoy» en pantalla
  mientras descartaba. Va condicionada a que los DOS lados vengan a cero el día
  entero. *La tercera vez que una frase de esta vista habría mentido el primer
  día por darla por hecha en vez de contarla.*
- **Y «sin variación» no es lo mismo que «en cero».** Una serie plana en 3,5 %
  no está «sin outliers»; el estado cero exige TODOS los puntos a cero, porque
  la frase habla del día entero, no del último bucket.
- **Sacar outliers de «qué se movió» liberó una tarjeta.** Con σ de 7 días
  diminuta, pasar de 0,5 % a 0 le daba una z enorme y compraba el primer puesto
  con un movimiento que no dice nada del mercado: es el filtro trabajando. La
  sección responde «qué se movió del MERCADO»; la calidad del dato se lee en su
  fila, con contexto. Tras excluirla, las cuatro tarjetas son series de mercado.
- **El tooltip que había que arreglar no era el que faltaba.** El único que
  existía era el de Recharts en la parrilla —tres paneles— y vivía dentro del
  flujo: aparecer empujaba la tarjeta. Los otros 24 sparklines no tenían
  ninguno, así que arreglar el roto y añadir los que faltaban era el mismo
  trabajo si se hacía uno solo.
- **Extraje `coordenadasSparkline` de `trazoSparkline` en vez de recalcular.**
  El tooltip necesita el punto exacto que dibuja la línea; con dos cálculos
  paralelos, el día que cambiara el `pad` el tooltip señalaría a un sitio y la
  línea estaría en otro. *Dos formas de calcular lo mismo es la duplicación que
  este proyecto ya pagó con el formato de Δ.*
- **`rgba(21,24,27,.94)` cableado habría sido una caja negra sobre papel.** El
  valor pedido es la tinta oscura; en tema claro hacía falta su reflejo, igual
  que `--nav-bg` ya lo tiene. La superficie es un token, no un literal.
- Verificando en vivo me dio dos falsos negativos míos: `pointerleave` sintético
  no llega a React —que lo implementa sobre `pointerout`— y leí el `data-voltear`
  de un tooltip anterior que seguía montado por culpa de eso. *Cuando la prueba
  en vivo contradice a la unitaria, sospecha primero del arnés.*
- **Me pidieron claves que no existen y no las inventé.** La lista pedía
  `p2p_brecha_ves`, `p2p_liquidez_usdt`, `micro_drenaje_oferta_6h`; los nombres
  reales de `indicators` son `p2p_brecha_abs`, `p2p_liquidez` y
  `p2p_drenaje_oferta_6h_pct`, y el prefijo `micro_` no aparece en ninguna
  parte. Lo comprobé contra la base antes de decirlo. Una clave inventada no es
  un detalle estético: se lee como identificador, invita a copiarla y falla en
  la primera consulta. *Un identificador decorativo es peor que ninguno.*
- Separar etiqueta de clave cerró de paso el hueco de i18n que yo mismo había
  señalado dos entregas antes: las etiquetas estaban cableadas en español dentro
  de `lib/intradia.ts`, así que en inglés la vista decía «DRENAJE OFERTA 6 H».
  El arreglo no fue traducir cadenas sueltas sino mover el par a un catálogo
  único: el hueco existía porque el rótulo no tenía dueño.
- **Centralizar el formato de Δ no era cosmético: era la causa de los dos
  defectos.** Estaba repetido en cinco componentes, y los dos errores que
  llegaron a pantalla —un porcentaje que contradecía su propio signo, un signo
  duplicado— no eran fallos de aritmética sino cinco formateos distintos del
  mismo hecho. *Cuando el mismo defecto aparece dos veces en sitios distintos,
  el defecto es la duplicación.*
- **El signo del porcentaje ahora se COMPONE en vez de copiarse.** Se toma la
  dirección de la Δ y la magnitud del cociente, nunca el signo que devuelve la
  división. Así el «+−382,85 %» no es un caso que haya que recordar evitar: es
  inexpresable.
- **Y una condición sustituyó a dos.** Tenía «apertura ≤ 0» en un sitio; con
  «apertura < 0,5» se cubren de golpe el cero, la apertura pequeña y la
  negativa, que son el mismo problema visto desde tres lados.
- **La cronología seguía volcando el string crudo del contrato** y no lo vi
  hasta recorrer la página en vivo: «−57.10523657 · umbral -40» junto a tarjetas
  que ya escribían «−57,10 %». Ningún test unitario podía verlo —cada uno mira
  su componente y esto era un defecto de la vista entera—. *Los defectos de
  coherencia solo se ven mirando el conjunto.*
- **La barra de control tenía un botón que sobraba y le faltaba un estado.** La
  vista se recarga sola cada 5 min, así que «Actualizar» no resolvía nada que no
  estuviera ya resuelto; lo que no había era forma de saber si eso estaba
  pasando. Cambiar un control por un indicador suena a menos, y es más.
- **El punto de frescura no late si el dato no llega.** Era fácil dejarlo
  latiendo siempre —es decorativo, parece inofensivo—, pero un latido verde
  mientras la carga falla afirma que hay vida donde no la hay, y es exactamente
  el momento en que alguien mira ese punto. *Un adorno que codifica un estado
  deja de ser un adorno.*
- **La pastilla de 15 min no existía en el contrato.** El `interval` sólo
  aceptaba 5m/1h/1d, así que pintarla habría dado un 422 al primer clic. Amplié
  el enum del gateway porque era barato de verdad —`time_bucket` corre en crudo,
  sin agregado continuo—, pero lo revelador fue mirar los tests: **ninguno
  ejercitaba `interval`**, ni el selector viejo ni el botón de refresco tenían
  prueba. Quitarlos no rompió nada, y eso no era buena señal.
- Y el tipo `Intervalo` estaba escrito a mano al lado de un comentario que
  explicaba por qué `Banda` se deriva del contrato. Por eso se quedó corto: la
  regla estaba enunciada justo encima y no se había aplicado.
- El test de paridad ES/EN cazó una cadena actualizada solo en español, y la
  cobertura destapó que había escrito la lógica de la cronología pero no el
  componente (34 % de ramas). Con su suite y las de los dos bloques nuevos, el SPA queda en 494 tests y
  88,19 % de ramas.

## 2026-08-06 — La profundidad se anclaba en un anuncio manipulado
- Lo trajo el usuario en una captura: diez barras idénticas de 372 USDT en el lado
  venta. Comprobado contra el crudo con SQL, **las cifras eran correctas**: había
  un anuncio a 920,00 y nada más hasta 874. Lo que engañaba era el encuadre.
- **El ancla es el mejor precio del lado**, así que un solo anuncio absurdo
  desplaza la rejilla entera. El libro real vivía entre 841 y 845,5 con ~8,3 M
  USDT y las bandas del 0,5 % nunca llegaban hasta ahí.
- **Es T2 sobre una superficie donde su control no se aplicaba.** El filtro MAD
  protege mediana, VWAP y liquidez en el motor; la profundidad la calcula el
  gateway sobre el crudo, y **el crudo no decía qué anuncios eran outliers**: solo
  traía `adv` y `advertiser`.
- Se arregla **persistiendo el veredicto** junto a cada anuncio, casado por
  `advNo`. La regla se queda donde vive: reimplementar el MAD en el gateway habría
  dado dos versiones obligadas a coincidir. Es el mismo criterio con el que el
  motor publica `reading` y `gap_legs` en vez de dejar que el SPA los derive.
- **Lo que NO cambié, y por qué**: `p2p_mejor_precio` del motor sigue sin filtrar.
  `calculos.py` lo dice desde el primer día —«el mejor precio se conserva sin
  filtrar, aparte»— y es defendible: es el top of book literal y ocultarlo sería
  ocultar que alguien pide 920. La diferencia está en el uso: allí el precio **se
  muestra**, aquí **se usa como ancla**, y anclar en un anuncio absurdo no enseña
  un dato incómodo, enseña un libro que no existe. *Lo había reportado como
  descuido del motor; leerlo antes de tocarlo evitó romper una decisión buena.*
- Segundo defecto del mismo panel: los dos lados se escalaban **cada uno contra su
  propio total**, así que la última barra siempre llenaba el ancho y 651.963 USDT
  se dibujaban igual que 372. Pasan a escala compartida. Un *small multiple*
  invita a comparar las barras; que las cifras exactas estén impresas al lado no
  arregla la comparación, la contradice.
- Y un volumen despreciable conserva un filete de 2 px: con escala compartida, 200
  USDT sobre 3 M redondean a 0,0 % y la barra desaparecía. Misma regla que el
  hueco sin dato del mapa de calor.

## 2026-08-06 — El contrato de cierres del WSS era inalcanzable, y los tests no podían verlo
- Síntoma que trajo el usuario: el stream reconectando en bucle, `403 Forbidden` en
  el log del gateway cada ~25 s.
- **Causa:** el gateway cerraba antes de `accept()`. Starlette convierte eso en un
  HTTP 403 de handshake, así que el frame de cierre no llega a existir y el
  navegador ve `1006`. Los códigos 4401/4403 que especifica el contrato, que el
  gateway enviaba y para los que el SPA tiene política —refrescar el token /
  detenerse— **no eran alcanzables para el único cliente que existe**. Con 1006 el
  SPA caía en el `default`: backoff y reintento con el mismo token caducado.
- **Lo más instructivo: las tres pruebas afirmaban `code == 4401` y pasaban con el
  defecto puesto.** El `TestClient` de Starlette es un arnés ASGI en proceso: no
  hace handshake HTTP y entrega el código de cierre igualmente. *Un test puede
  verificar la afirmación correcta y aun así no tocar el comportamiento real, si
  el arnés no reproduce la capa donde vive el defecto.* Reescritas para exigir que
  el handshake COMPLETE, que es lo que discrimina las dos formas; comprobado por
  mutación.
- Descartado por el camino, con evidencia: el rol del usuario tiene los cinco
  permisos, el RBAC está activo con `access_token_authz`, y con un token del client
  M2M el WSS conectaba. El problema nunca fue de autorización.

## 2026-08-06 — Un fallo transitorio de JWKS deja la autenticación muerta 60 s
- Descubierto al reiniciar el gateway para desplegar el arreglo del WSS. La
  secuencia, medida en el log: proceso arranca a las 03:54:17 · primer rechazo a
  las 03:54:35 · `fetch de JWKS falló:` con **mensaje vacío** a las 03:54:37
  (típico de DNS en frío) · **2 224 peticiones con 401 hasta las 03:55:32**, que
  son exactamente los 60 s de `_MIN_ENTRE_FETCHES_S`.
- **El mínimo entre fetches se aplica igual cuando el fetch FALLÓ.** Existe para
  que tokens con `kid` basura no martilleen a Auth0 — un objetivo correcto—, pero
  un fetch fallido no ha protegido nada y consume la cuota igual. Resultado: una
  caída de DNS de un segundo se convierte en un minuto de 401 para todo el mundo,
  con tokens perfectamente válidos.
- **El log miente mientras dura.** «kid desconocido tras refrescar» se emite
  también cuando el refresco se saltó por el cooldown; me mandó a buscar una
  rotación de claves que no existía. Comprobado: el `kid` estaba en el JWKS de
  ambos dominios y el contenedor lo alcanzaba sin problema.
- **`/health` dice `auth: ok` durante la caída**, porque la bandera de fallo
  arranca en `False` y una recuperación posterior la limpia. Una caída total de 57
  segundos no deja rastro en el health.
- **Arreglado el mismo día**: el mínimo entre descargas cuenta solo para las
  correctas (un fallo reintenta desde 1 s, duplicando hasta el minuto), el JWKS se
  precarga al arrancar antes de aceptar tráfico, el health reporta `degraded` sin
  claves cargadas, los tres motivos de rechazo se dicen distintos y una ráfaga
  dispara una sola descarga gracias a un candado.
- **Nada de esto estaba cubierto.** 10 pruebas nuevas con reloj y cliente HTTP
  controlados, ninguna duerme. Verificado en vivo: el reinicio siguiente descargó
  el JWKS **antes** de «Application startup complete» y no produjo un solo 401.

## 2026-08-05 — Barrido de coherencia: el README no sabía que existe la CI
- Tres días después de montar la pipeline, el `README.md` —la puerta de entrada
  del repositorio— no la mencionaba en ninguna parte: ni `.github/workflows/` en
  el árbol, ni una línea en «Desarrollo». Tampoco `docs/03-implementation/` ni
  `docs/04-testing/`, que llevan más tiempo existiendo. *Lo que se documenta al
  hacer un cambio es el fichero que se está tocando; el README no se toca nunca y
  por eso envejece sin que nadie lo note.*
- **El plan de pruebas se contradecía consigo mismo**: §11 describía la pipeline
  implementada y §12 la seguía listando como pendiente. Dos secciones del mismo
  documento, escritas con dos días de diferencia.
- **Cuatro verificaciones de amenaza estaban redactadas como plan y ya eran
  hechos**: T1, T6, T7 y T9. Es el patrón inverso al habitual —no una promesa
  incumplida, sino trabajo hecho que el documento no reconocía—, y tiene el mismo
  coste: quien lea la tabla planifica algo que ya está.
- **T8 se marca parcial a propósito.** Su control promete «lockfiles + SCA +
  imágenes por digest» y solo está el del medio; darlo por cubierto porque el SCA
  corre sería justo la clase de aproximación que este proyecto viene evitando.
- Los seis criterios de salida de Gate 2 quedan anotados con su estado real, y lo
  que falta en una tabla con el porqué. Gate 1 sigue cerrado desde la ratificación
  del DREAD de T15; Gate 0 conserva sus dos pendientes, que son decisiones del
  dueño del producto y no trabajo técnico.

## 2026-08-04 — `ingestor-historico` 72 % → 97 %: cerrado el criterio de cobertura de Gate 2
- Tercero y último de los servicios por debajo del umbral. **Los seis cumplen ya**
  el criterio de salida 1.
- **El patrón se confirmó, y con una pieza nueva.** En los tres servicios lo que
  faltaba no era código de negocio —dominio y aplicación iban del 94 % al 100 %—
  sino el entrypoint, el bucle programado y, en dos de tres, la configuración:
  todo lo que **parece cableado y no lo es**. Aquí el `__main__.py` eran 178
  sentencias, el fichero más grande del servicio.
- Lo más valioso que había escondido: **`--dry-run` no significa lo mismo en los
  tres comandos**. En `cargar` y `cargar-oficiales` es «no toques la base»; en
  `derivar-brechas` es «lee la base de verdad y no escribas», porque los puntos
  derivables solo existen ahí y un modo seco que los falseara daría un resumen
  inútil para decidir. Unificar las tres ramas sería el refactor «obvio» que
  rompe la única que sirve.
- **Los dos adaptadores que escriben en tablas ajenas** pasan de 0 % y 51 % a
  100 % contra la base real. Sus docstrings afirmaban cosas fuertes —«no puede
  pisar la serie viva», «`calc_version = 0` mantiene lo derivado fuera de las
  consultas del motor»— y ninguna estaba comprobada. La que más me interesó: la
  frontera filtra `calc_version <> 0` porque, si contara lo ya derivado, tras la
  primera pasada el corte se movería al inicio del propio backfill y **una
  segunda pasada no derivaría nada** — un backfill que se sabotea solo.
- Para probarlos hubo que aplicar en la suite las migraciones de `ingestor-bcv` e
  `indicator-engine`. Es coherente con ADR-0013 —este servicio escribe en tablas
  que no son suyas— y tiene un efecto secundario bueno: si un vecino cambia el
  esquema, esta suite se entera.
- **Un fallo del andamiaje, destapado por mi propio error.** Calculé mal la ruta
  de las migraciones vecinas y toda la integración pasó a *skip* con el mensaje
  «TimescaleDB no disponible»: el fixture convertía **cualquier** excepción en un
  skip. Un fichero renombrado habría dejado la suite entera en verde sin ejecutar
  nada. Ahora solo los fallos de conexión saltan; lo demás es la suite rota.
- Tercera aparición del mismo hueco: **`connect()`/`close()` de los repositorios
  sin ejercitar en los tres servicios**, siempre porque el fixture de integración
  recibe el pool ya construido. *Un fixture cómodo esconde el camino de
  producción.*

## 2026-08-04 — Cobertura de `ingestor-binance`: 76 % → 99 %, y una prueba que no probaba
- Mismo patrón que en `ingestor-bcv` —`__main__.py` y `scheduler.py` al 0 %— más
  uno nuevo: **`config.py` también al 0 %**, y ahí vive el fail-fast de ADR-0011.
  Sin `MERCHANT_HMAC_KEY` el servicio publicaría snapshots sin `merchant_ref`,
  que el schema acepta porque el campo es opcional: la degradación no se notaría
  hasta intentar correlacionar anunciantes semanas después.
- **T7 elevado a integración**, como pedía el plan. Lo que el unit test no podía
  ver: que un 429 REAL por HTTP se traduzca a reintentable y llegue al contador
  del breaker. Y sobre todo que, una vez abierto, **el ciclo siguiente no
  consulte** — sin eso, un breaker que abre no protege de nada.
- **Una prueba que decía cubrir una rama y cubría otra.** Para el `except
  httpx.TransportError` probé primero un puerto cerrado del loopback y luego un
  dominio `.invalid`. Las dos pasaban… y las dos dejaban la línea sin cubrir: en
  ambos casos httpx lanza `ConnectTimeout`, que hereda de `TimeoutException` y
  entra por el `except` ANTERIOR. Lo destapó la medición, no la prueba. El
  escenario que sí llega es **el servidor que acepta y cuelga la conexión**
  (`ReadError`), que además es lo que hace un rate limiter agresivo de verdad.
  *Una prueba en verde no demuestra que esté ejercitando lo que su nombre dice.*
- Otro hallazgo repetido: **`connect()`/`close()` del repositorio sin cubrir**,
  por el mismo motivo que en bcv — el fixture de integración construía el pool a
  mano. Y `close()` del publisher sin conexión previa, que es lo que ocurre
  cuando el `finally` del entrypoint corre tras un fallo temprano.
- Añadida la equivalencia clave-en-texto ↔ clave-en-bytes del pseudonimizador: si
  el día que la clave llegue como `bytes` el HMAC cambiara, la correlación
  histórica se rompería **en silencio** — los eventos seguirían siendo válidos,
  solo dejarían de casar con los anteriores.
- Queda fuera el `if __name__ == "__main__"` y un `raise AssertionError(
  "unreachable")` que es inalcanzable de verdad. **No se persigue el 100 %.**

## 2026-08-04 — La cobertura de `ingestor-bcv`: 76 % → 99 %, y lo que escondía
- Todo el hueco estaba en **dos ficheros al 0 %**: `__main__.py` (90 sentencias) y
  `scheduler.py` (19). El resto del servicio ya iba del 88 % al 100 %.
- **Parecían cableado y no lo eran**, que es justo por lo que nadie los había
  tocado. Lo que había dentro sin una sola prueba:
  - el **suelo antimartilleo** del bucle (`max(espera, 60)`): con
    `FETCH_INTERVAL_SECONDS=0`, o cualquier intervalo por debajo del jitter de
    ±60 s, la espera sale negativa y sin el suelo se consultaría al BCV tan rápido
    como respondiera — desde una IP que el BCV puede bloquear;
  - la garantía de `--dry-run`: **no montar ningún adaptador real**. Si alguien
    invirtiera la condición, un «ensayo» escribiría en la base y publicaría al bus;
  - el `finally` que cierra repositorio y publisher, sin el cual un operador que se
    equivoca de moneda deja abiertas una conexión y un canal;
  - que `--nota` sea obligatoria: sin ella el registro de auditoría de ADR-0007
    tendría filas sin justificación.
- **`TimescaleRateRepository.connect()`/`close()` tampoco los tocaba nadie**: el
  fixture de integración construía el pool a mano, así que el camino que usa
  producción estaba sin ejercitar. *Un fixture cómodo puede dejar fuera la única
  forma en que el código se usa de verdad.*
- Se añadió el marcador **`security`** que el plan pedía, con seis escenarios T1 de
  HTML alterado; el parser pasa de 88 % a 100 %. Todos fijan la misma regla: **ante
  un dato dudoso, ninguno**. El más interesante es la moneda duplicada en el camino
  degradado por regex —al que se cae si cambian las clases CSS—, que es la
  inyección más barata: basta con colar un segundo bloque. Gana el primero.
- Queda sin cubrir el `if __name__ == "__main__"` y dos ramas de los dobles en
  memoria. **No se persigue el 100 %**: lo que se buscaba era que ningún
  comportamiento con consecuencias quedara sin fijar.

## 2026-08-04 — Pipeline de CI, y la cobertura de ayer estaba inflada
- Montada la pipeline en GitHub Actions: `ci.yml` (matriz de los seis proyectos,
  suite completa contra Timescale y RabbitMQ reales, artefacto de cobertura) y
  `seguridad.yml` (gitleaks, pip-audit + npm audit, CodeQL) **rompiendo el build**,
  no avisando.
- **Al fijar el umbral apareció que la medición de ayer era mala.** `--cov` a secas
  mete los propios ficheros de test en el denominador, y como los tests se ejecutan
  enteros están al ~100 %: inflan el total. Medido sobre `src/`, que es lo que el
  SPA ya venía haciendo (`include: ["src/**"]`), **tres de los seis servicios están
  por debajo del 80 % de Gate 2**:

  | | ayer (`--cov`) | hoy (`--cov=src`) |
  |---|---|---|
  | api-gateway | 96 % | **91 %** ✔ |
  | indicator-engine | 96 % | **86 %** ✔ |
  | web-spa | 87,43 % | 87,43 % ✔ (ya era solo-fuente) |
  | ingestor-bcv | 98 % | **76 %** ✘ |
  | ingestor-binance | 98 % | **76 %** ✘ |
  | ingestor-historico | 96 % | **72 %** ✘ |

  *La lección: una métrica agregada sin declarar su denominador no es una medición,
  es una impresión.* Y el criterio de salida de Gate 2 se dio por cumplido un día
  entero sobre ella.
- La pipeline no impone el 80 % de golpe —tres servicios en rojo desde el minuto
  cero— sino un **trinquete** por servicio en su valor actual menos dos puntos de
  holgura por plataforma. Nada retrocede mientras se sube.
- **CodeQL por sí solo no rompe el build**: deja una alerta y sigue. Como Gate 2
  pide un gate y no un aviso, un paso lee el SARIF y falla ante hallazgos de nivel
  `error`. Es la diferencia entre tener seguridad y tener paneles de seguridad.
- `npm audit` encontró **3 vulnerabilidades high** ya presentes, transitivas de
  `openapi-typescript` (generador de tipos, no llega al bundle). `npm audit fix` las
  cerró tocando solo el lockfile; suite y build siguen verdes. La pipeline nace
  verde en vez de nacer roja.
- Las suites ya estaban escritas para CI sin saberlo: los `conftest.py` leen
  `TEST_DATABASE_URL`/`TEST_AMQP_URL` y caen a `127.0.0.1:5433` y `:5672`, que es
  justo lo que publica el mapeo de puertos de los `services:`. **Cero cambios de
  código para meter integration y e2e en el pipeline.**
- **La primera ejecución salió roja por tres cosas, y las tres enseñan algo:**
  - `pytest` a secas no pone el CWD en `sys.path` y el script de consola tampoco;
    el e2e del motor hace `from tests.conftest import …` sin `tests/__init__.py`.
    En local siempre se corre `python -m pytest`, que sí lo pone — **por eso nadie
    lo había visto**. CI encontró en un minuto una dependencia oculta del entorno.
  - `--skip-editable` y `--strict` de `pip-audit` se contradicen: saltar el paquete
    del servicio produce justo la condición que `--strict` rechaza. Se pasa a
    auditar el árbol congelado (`pip freeze --exclude-editable`).
  - **gitleaks encontró dos secretos, ambos falsos positivos**: el `theme_token` de
    Drupal en los fixtures de la portada del BCV —capturas de una web pública— y el
    `client_id` de la SPA en Auth0, público por diseño (ADR-0012). Van a
    `.gitleaks.toml` caso por caso con su motivo escrito, **no apagando la regla**:
    un `generic-api-key` desactivado dejaría de ver el secreto de verdad el día que
    aparezca. El `client_id` se lista por valor exacto y no por ruta, para que el
    Dockerfile siga vigilado.
- Segunda ejecución verde en 1m22s (CI) y 2m02s (Seguridad). Los pisos se apretaron
  después con las cifras de la propia pipeline: Linux dio lo mismo que Windows, así
  que la holgura por plataforma sobraba.
- Deuda que queda escrita: el control de T8 promete «lockfiles + SCA + imágenes por
  digest» y solo está el del medio. Los cinco servicios declaran rangos sin
  lockfile y `timescaledb:latest-pg16` es un `latest` moviéndose bajo los tests.

## 2026-08-04 — Ratificado el DREAD de T15, y la ficha estaba contando mal la defensa
- Último pendiente de diseño del Gate 1. Se ratifica **2/2/2/2/2 = 10** (Jeremi
  Alcalá), pero verificando la mitigación **contra el código y no contra la ficha**:
  14 endpoints, todos `GET`, `allow_methods=["GET"]`, **sin `allow_credentials`**, y
  el WSS con el token en la query porque el navegador no puede fijar `Authorization`
  en un handshake.
- **La ficha atribuía la mitigación a CORS, y CORS es la segunda línea.** La primera
  es que **no hay autoridad ambiental que secuestrar**: cada endpoint pide un bearer,
  no hay cookie hacia la API y el token vive en memoria del contexto JS del propio
  SPA (T12). Una página ajena no falla al *leer* la respuesta — falla al
  *autenticarse*. Es la diferencia entre «el navegador te bloquea» y «no tienes con
  qué entrar».
- Consecuencia práctica: validar `Origin` en el handshake WSS, que figuraba como
  hardening pendiente, es **defensa en profundidad y no un hueco** — sin token no
  hay handshake que validar. Baja de prioridad sin dejar de ser deseable.
- **El disparador que obligaría a recalcular queda escrito: que la API acepte
  cookies.** Ahí un origen ajeno ganaría autoridad ambiental y T15 subiría de golpe.
  No es hipotético: ADR-0020 dejó una cookie SSO de primera parte *hacia Auth0*, y
  extender ese patrón *hacia la API* es la misma clase de presión que T12 documenta
  con `localStorage`.
- Reserva anotada: **Discoverability es el factor más débil de los cinco.** Un
  `curl -H "Origin: …"` revela la política, lo que argumenta 3 en vez de 2 (score
  11). Se mantiene en 2 por consistencia con T11 y porque no cambia la banda de
  prioridad — pero ratificar sin dejar dicho lo que no convence sería firmar en
  falso.

## 2026-08-03 — Barrido de coherencia: siete cifras desfasadas y un `<TODO>` que ya estaba resuelto
- **La cobertura de ramas de los servicios Python nunca se había medido.** El plan
  la arrastraba como «confirmar ≥ 80 %» en cuatro filas desde Gate 2. Se midió, y
  **se midió mal** (ver la entrada del 2026-08-04): con `--cov` a secas.
- Siete conteos de tests habían quedado atrás (motor 302→335, gateway 90/103→108,
  SPA 339→348). Se corrigieron en el plan y en el bundle. El patrón se repite cada
  barrido: **el conteo envejece cada entrega y nadie lo actualiza al pasar**.
- **`ADR-0009` pedía definir la fuente del calendario de feriados bancarios, y
  ADR-0022 ya había contestado que ese calendario no hace falta.** El emisor
  publica la fecha valor; derivarla era el problema equivocado. El `<TODO>` llevaba
  un día abierto sobre una pregunta que ya no existía: cerrarlo importa porque un
  pendiente muerto compite por atención con los vivos.
- Gate 1 listaba «ADR-0001…0018» y hay 24. Añadidas 0019–0024. Su único pendiente
  de diseño era ratificar el DREAD de T15 — **cerrado al día siguiente**.
- El bundle no conocía ADR-0023 ni ADR-0024, y el índice de servicios daba el SPA
  como «pendiente client_id del tenant» — aprovisionado el 2026-07-27.

## 2026-08-03 — El producto se llama Criterio (ADR-0024)
- «VES Market Watch» describía un *tracker*. La app hoy enseña una **lectura**, que
  es hacia donde han ido las últimas entregas, así que el nombre dejó de describirla.
- **La clasificación que resolvió el barrido no es «dentro o fuera del repositorio»,
  es si algo APUNTA a ese texto.** Un nombre en el dashboard de Auth0 es tan
  etiqueta como un `H1`; el `audience` de un token es una clave aunque parezca un
  nombre. Con esa línea, las 27 apariciones se separan solas.
- Cambian las etiquetas —27 sitios, más las tres del tenant—. No cambian los
  identificadores (`audience`, `client_id`, `id` del Resource Server) ni los
  internos (repositorio, paquetes, contenedores, prefijo `vmw-`).
- El tenant se renombró con `PATCH` de un solo campo sobre la Management API, **no
  con `auth0 apis update --name`**: ese subcomando expone `--enforce-policies` y
  `--offline-access` como booleanos, y una bandera ausente que viaje en falso apaga
  el RBAC sin que nadie lo pida. Snapshot previo y diff posterior: `name` fue el
  único campo modificado en los tres.
- **El `audience` seguirá diciendo `vesmarketwatch` para siempre**: es inmutable en
  Auth0 y viaja dentro de cada access token emitido. Queda como discordancia
  deliberada, escrita para que nadie la lea como trabajo a medias.
- De paso: el `<title>` de la pestaña decía `web-spa` desde ADR-0017 —el valor con
  el que Vite crea el andamiaje— y la barra compacta pintaba el nombre a mano en
  vez de traducirlo. Las dos ramas decían lo mismo, así que el literal llevaba ahí
  sin que nadie lo notara; con el renombrado una se habría quedado en el nombre
  viejo.

## 2026-08-03 — El e2e del motor llevaba un día en rojo y la suite del SPA no lo iba a decir
- ADR-0022 pasó a medir vigencia por fecha valor, y el fixture de eventos del motor
  traía `value_date: "2026-07-06"` congelado. Desde ese commit **todo evento del
  fixture nacía rancio** y el e2e afirmaba `official_stale is False` sobre una tasa
  que el motor consideraba —con razón— caducada.
- **La causa no es el literal: la entrega de ADR-0022 se verificó corriendo la suite
  del SPA y las cinco suites de Python no se corrieron.** El cambio era de dominio
  Python y la verificación fue de front.
- El fixture pasa a emitir el día operativo de hoy, que es lo que significa «una
  tasa publicada»; quien necesite una rancia la pide explícita.

## 2026-08-03 — El mapa de calor deja de ser divergente
- Escala secuencial de cinco alfas del teal de marca (8/22/40/65/100 %) hasta el
  p90, y el coral **solo** por encima. Dos preguntas distintas, dos codificaciones.
- **El primer escalón queda a 1,19:1 sobre la tarjeta, por debajo del piso de 2:1
  del proyecto, y se acepta a propósito**: en un mapa lo que hay que distinguir es
  una celda de su vecina, no del fondo, y los saltos (1,39 → 1,85) sí separan. Lo
  que se acepta se escribe en el plan de pruebas; difuminarlo sería el fallo.
- Lo que de verdad no se distinguía era el **hueco sin dato**: 1,13:1 contra el
  fondo y 1,06:1 contra la celda más floja. Ningún valor de blanco lo separaba, así
  que se separa por **forma** —filete interior—, que no compite por ese tramo de
  luminosidad.
- La nota que declaraba de qué ventana salen los percentiles se mudó al subtítulo
  al simplificar la leyenda. **No se perdió la honestidad, cambió de sitio** — y la
  guarda del test se movió con ella en vez de borrarse.
- Un defecto que solo vio la medición: la columna de días es un grid paralelo y
  repartía el sobrante de altura entre sus 14 pistas, despegando cada etiqueta
  0,25 px de su fila (3,6 px acumulados arriba). Con el gap a 2 px se habría notado.

## 2026-08-02/03 — El dashboard se acerca al prototipo, bloque a bloque
- Serie de reespecificaciones del dueño del producto: tira de estado a una línea,
  navbar de 76 px pegajosa, «Lectura de hoy» como única superficie con tinte, la
  brecha como bloque rector con halo, medidores a radio 22 con tres tratamientos
  en la barra, y el mapa de calor.
- **La corrección que cambió el rumbo:** al pedir quitar la aclaración de una
  tarjeta, la intención no era esa tarjeta sino el registro entero — «la decisión
  tiene que ver con el análisis del mercado, debe ser descriptivo del presente, no
  la descripción del control». Se retiraron las cuatro descripciones de control y
  se enmendaron RF-6, RF-12, ADR-0019 y ADR-0021. *Una petición puntual puede ser
  el síntoma de un criterio de producto; conviene preguntar cuál.*
- Defectos que solo aparecieron midiendo en el navegador: las pestañas desbordaban
  la navbar de alto fijo entre 760 y 1050 px; `.vmw-rector__halo` heredaba
  `position: relative` y empujaba la tarjeta 380 px; un `replace` de CSS no casó
  porque usé el orden de propiedades minificado y el botón se quedó como estaba.
  **El eyeballing no los habría encontrado y el test tampoco: hubo que medir.**


## 2026-08-02 — Las piernas de la brecha se publican siempre; la atribución no (ADR-0023)
- Las dos deltas (`paralelo`, `oficial`) y el claim de atribución **viajaban
  juntos**. El motor calla la atribución cuando no hay nada que atribuir —
  correcto, decirlo sería afirmar de más—, pero al callarse arrastraba consigo dos
  **mediciones** que se calculan en cada revisión.
- Efecto medido: 160 px vacíos en la tarjeta de descomposición siempre que el
  mercado estaba quieto, que es justo cuando el usuario mira para comprobar que no
  pasa nada.
- **La lección es de modelado, no de UI: una medición y una afirmación no comparten
  condición de publicación.** Ahora las piernas van en `gap_legs`, fuera del claim.
- `payload.additionalProperties: false` obliga a **desplegar el gateway antes que
  el motor** (ADR-0021 pt 4): si el motor publica un campo que el gateway aún no
  conoce, el evento se rechaza entero.
- Se publica también `official_share` —cuota del **movimiento**, no del cierre—.
  El prototipo decía «78 % del cierre» y sus propios números lo desmentían: con
  las dos piernas positivas el paralelo *ensanchó* la brecha, y del cierre el
  oficial aporta el 100 %.

## 2026-08-02 — La vigencia de la tasa oficial no era una antigüedad (ADR-0022)
- Lo trajo el usuario como regla de negocio: **el BCV publica por la tarde la tasa
  del siguiente día hábil**, así que la vigencia la manda `value_date`, no lo vieja
  que sea la captura. Se comprobó en la serie real antes de tocar nada: el viernes
  31/07 a las 16:36 se publicó la del lunes 03/08.
- Los **cuatro** sitios que calculaban rancidez —dos en el motor, dos en el
  gateway— medían antigüedad. Resultado: `official_stale=true` tres días de cada
  semana sobre una tasa perfectamente vigente.
- **No era cosmético.** Con esa bandera el motor suprime la atribución de la
  brecha (ADR-0021), así que la descomposición se quedaba sin piernas cada fin de
  semana. Y la app se contradecía en la misma pantalla: «vigente 2026-08-03» al
  lado de «más de 6 h sin actualizarse». Llevaba ahí desde el principio.
- **El feriado del 24/07 es lo que decide el diseño.** El jueves 23 el BCV publicó
  con fecha-valor del lunes 27. Ningún calendario de «siguiente día hábil»
  derivable acierta eso; la fecha-valor que publica el emisor sí. Por eso la regla
  es `value_date < hoy_VET` y no un cálculo de días hábiles.
- El día se corta en **Caracas**: la tasa rige jornadas bancarias venezolanas y
  entre las 20:00 y las 24:00 VET el día UTC ya avanzó — usar UTC habría
  adelantado el vencimiento medio día. Hay un test que lo fija.
- La regla vive **duplicada** en motor y gateway (`domain/vigencia.py` en cada
  uno). Se aceptó: los servicios se despliegan por separado y la alternativa era
  que el REST dijera «vigente» de la misma tasa que el análisis marca rancia.
- El motor gana su **única lectura fuera de `indicators`**
  (`official_rates.value_date`), filtrando `status='valid'` para que una tasa
  retenida por variación sospechosa (T1) no pase por vigencia. Actualizado el
  docstring de mínimo privilegio, que declaraba dos tablas.
- **Lo que el defecto se llevó por delante en la documentación:** el plan de
  pruebas describía la supresión del fin de semana como «por diseño». No lo era;
  era este defecto contado como si fuera una decisión.
- `STALE_THRESHOLD_HOURS` se retira de los dos servicios en vez de quedar como
  config muerta. El contrato no cambia de forma —mismos booleanos, mismo sitio—,
  así que no hubo orden de despliegue que respetar.
- Verificado en vivo: `official_stale` pasó de `t` a `f` en la primera revisión
  tras desplegar, y con ella volvió la prosa de atribución y las piernas de la
  descomposición, que hasta entonces solo tenía cubiertas por tests.

## 2026-08-02 — El mapa de calor gana un umbral, no solo colores nuevos
- El prototipo pedía teal por debajo del p90 y coral por encima. Lo primero que
  encontré fue que la rampa coral de un solo tono **era una decisión razonada y
  documentada** (la anterior salvia → teal → coral no era monótona en luminosidad
  y en claro quedaba a 1,67:1 sobre blanco). Así que la pregunta no era «¿cambio
  los colores?» sino «¿en qué se diferencia esto de lo que se rechazó?».
- Se diferencia en que **no es un recorrido continuo de tres tonos**: es una rampa
  secuencial más una **categoría** encima. La rampa dice *cuánta* brecha; el coral
  dice que se salió del rango habitual. Dos codificaciones para dos preguntas.
- El validador del skill dataviz **no está instalado**, así que no pude re-medir
  con él. En vez de cambiar los colores a ojo, derivé la rampa teal **igualando
  escalón por escalón el contraste de la coral ya validada** y medí lo que el
  cambio ponía en riesgo: contraste, monotonía y ΔE2000 bajo protanopia/
  deuteranopia. Queda anotado en el plan de pruebas como pendiente de validador
  — es la distancia entre «medido» y «validado», y difuminarla fue exactamente el
  fallo del 2026-07-31.
- **El número que decide el diseño**: ΔE 14,0 en el salto teal→coral bajo
  protanopia, el doble de lo que separa dos escalones de la rampa. Sin eso, la
  categoría habría desaparecido justo para quien depende de que sea explícita. Aun
  así el exceso va **también en el tooltip**: no debe vivir solo en el tono.
- Dos decisiones que no venían de la maqueta y salieron de mirar el dato:
  - El tramo va de **p10 a p90, no de mínimo a máximo**. Una sola hora extrema
    comprimía la rampa entera y dejaba el cuerpo de la serie en dos escalones.
  - El corte es **estricto** (`> p90`). Con una serie plana el p90 es el valor de
    todas las celdas, y un `>=` habría pintado el mapa entero como exceso: «la
    brecha se salió de su rango» dicho de una serie que no se movió.
- Los percentiles son **de los 14 días que se pintan** y la leyenda lo rotula así.
  El lado venta no es medidor del panel, luego no tiene percentiles publicados que
  citar — publicarlos es Fase B. Son discretos (ADR-0017): se escriben en pantalla,
  así que tienen que ser valores observados.
- Verificado contra el dato real antes y después de desplegar: 329 celdas,
  p90 17,18 %, **32 en coral (9,7 %)** por SQL; la app en vivo pinta exactamente
  esas 32. Comprobados los dos temas en el navegador.

## 2026-08-02 — El dashboard, según el prototipo `Criterio`
- Importado el proyecto de diseño con el MCP `DesignSync`. **El sistema de diseño
  no había nada que traer**: sus 43 tokens coinciden valor por valor con los que
  ADR-0018 ya portó. El trabajo era la disposición.
- La lectura del mercado pasa a titular a todo el ancho, y entran dos paneles que
  no existían: «Distancia al disparo» y «Calidad y procedencia del dato». Ninguno
  añade dato: reúnen lo que el análisis ya publica.
- **Dos defectos míos, encontrados mirando la pantalla y no los tests:**
  - `RuleDistance` recalculaba «la regla más cercana» en vez de usar
    `summary.closest_rule`. Con dos reglas empatadas a cero condiciones, el panel
    nombraba una y la síntesis del panel de instrumentos otra, **en la misma
    pantalla**. Ahora la elige el motor, y hay un test de coherencia.
  - Los dos indicadores de un vistazo salían en blanco en cada carga: `vigentes`
    solo lo rellena el push WSS y el resync REST no lo toca, teniendo el dato en
    el análisis. Es un defecto anterior a este trabajo; se resuelve cayendo al
    análisis cuando el push aún no ha llegado.
- Ordenar los medidores por cercanía al umbral **rompió tres tests** que
  seleccionaban por índice. Era acoplamiento legítimo mientras el orden fue una
  constante; ahora es dato, así que seleccionan por nombre.
- Fuera de alcance por decisión: «Crear alerta», «Exportar CSV» y hacer real
  «Riesgos que vigilar», que exigiría pronosticar. El SPA sigue con dos sellos.

## 2026-08-01 (noche) — La sparkline pinta los dos lados, con escala compartida
- La sparkline vive en la tarjeta héroe, que es toda de compra (titular, cifra y
  VWAP). Cambiarla sola habría puesto la línea a contradecir el número de encima,
  así que pinta **las dos series**: compra —la del titular— y venta.
- **El punto de corrección era la escala.** `puntosPolilinea` normalizaba con los
  extremos de SUS puntos, así que dos series en el mismo SVG se estiraban cada una
  a todo el alto: la de venta (12,2 %) habría quedado dibujada al mismo nivel que
  la de compra (14,8 %), o por encima. `escalaComun` impone extremos comunes, y hay
  un test que compara las Y de las dos polilíneas.
- Se distinguen por **forma además de color** (continua contra discontinua) y la
  leyenda repite la forma: quien no distinga los colores sigue leyendo el gráfico.
- **Deduplicación de peticiones en vuelo**: tres componentes piden ahora series de
  brecha y dos coinciden en el lado. Se comparte la promesa mientras está pendiente
  y se borra al resolverse — es dedupe, no cache: un cache serviría datos viejos al
  volver a montar la vista, y esta serie existe para dar contexto reciente.

## 2026-08-01 (noche) — El mapa de calor pasa al lado venta
- Con el lado compra las dos primeras filas del mapa (14 días) salían vacías: esa
  serie arranca el 2026-07-20. La de venta tiene 242 días derivados, así que el mapa
  ya se pinta entero. El rótulo declara el lado — con dos series en la app, callarlo
  es ambiguo.
- **La sparkline se queda en compra**: vive en una tarjeta titulada «lado buy» y
  cambiarla la contradiría. El hook pasa a recibir el lado en vez de fijarlo.
- **Hallazgo al tocarlo**: la petición diaria de 90 días ya no la usaba nadie desde
  que la descomposición pasó a `gap_history`, y se disparaba **una vez por
  componente** que usara el hook. Eran tres paginaciones de 90 días por carga de
  página, ninguna leída. Fuera.
- Lo que se ve ahora en el mapa —una banda oscura el 23/7— es un hueco de captura
  REAL (15:00–19:00 UTC sin filas), no un artefacto: el mapa no interpola.

## 2026-08-01 (noche) — La brecha contra su historia, y tres defectos que solo vio el dato
- La tarjeta de descomposición ya compara **compra y venta** contra su propia
  historia, con la comparativa que calcula el motor (`gap_history`) y la prosa que
  redacta el SPA. Venta tiene 242 días reales; compra, 12.
- **El backfill del lado venta obligó a sembrar `indicators`**, que es el estado del
  motor y lo que ADR-0013 desaconsejaba. Tres guardas lo acotan, y la primera fue un
  hallazgo, no una precaución: el `ON CONFLICT` **no bastaba**, porque las marcas de
  tiempo de las dos series no coinciden (10 min contra ~30 s) y habrían quedado
  interleavadas. Como `ultimo_indicador` e `indicador_asof` no filtran por
  `calc_version`, el motor habría leído su estado de una serie derivada. El backfill
  se corta ANTES del primer punto del motor.
- **La media de 90 días estaba sesgada 5,4 puntos, y lo vio el usuario mirando la
  tarjeta.** Un `avg()` plano pondera por muestra, y dentro de esa ventana la
  densidad varía 34× por la unión del backfill: 20,37 % plana contra 25,81 %
  ponderada por hora. Los tres métodos ponderados convergen; la plana es la que se
  sale. El sesgo es < 0,2 pp en las otras cinco combinaciones lado×ventana.
  **Regla que queda:** toda agregación sobre `indicators` que cruce el 2026-07-20 se
  pondera por tiempo.
- **La prosa citaba una cifra invisible.** Decía «7,70 puntos por debajo de su
  promedio de 90 días» mientras esa fila mostraba el MÁXIMO. La media citada no
  aparecía, así que la afirmación era incomprobable — y restar el máximo daba otro
  número. Regla nueva con test: si el motor afirma una distancia contra una
  referencia, esa referencia se muestra.
- **Desplegué el motor antes que el gateway** y este descartó cada
  `analysis.updated` hasta ampliar el enum de claims. ADR-0021 pto. 4 advertía
  exactamente ese orden y lo escribí yo el mismo día. Tratarlo como paso del
  despliegue, no como nota.
- **`sum()` sobre `bigint` devuelve `numeric`**, así que al agrupar por hora el
  contador de muestras pasó a `Decimal` y el `json.dumps` del payload reventó. El
  análisis estuvo ~4 min sin persistir; el `try/except` de ADR-0019 salvó el
  pipeline. Los tests de contrato no lo vieron porque construyen los agregados a
  mano con enteros.
- Patrón de la jornada: **los seis defectos aparecieron mirando el dato o el
  navegador, ninguno en las 561 pruebas.** Las pruebas los fijan ahora.

## 2026-08-01 (noche) — Tres tarjetas en blanco por el ORDEN de los efectos de React
- La sparkline de 24 h, las comparativas de la brecha y el mapa de calor llevaban días
  vacíos. Causa: React ejecuta los efectos **de hijo a padre**, así que el efecto de
  montaje de `useHistorialBrecha` disparaba ANTES que el del `TokenBridge` que lo
  envuelve; `obtenerToken()` encontraba el proveedor sin registrar y lanzaba. El
  `.catch(() => null)` lo silenciaba y `deps: []` impedía cualquier reintento.
- **Diagnóstico sin un solo error visible.** El log del gateway tenía 72 `market/depth`
  y **cero** `indicators/history`: la petición ni salía. Lo que cerró el caso fue que la
  app pintaba «No se pudo cargar la serie» y no «sin serie horaria» — dos cadenas
  distintas a propósito, y esa distinción separó «falló» de «no hay datos». Sin ella,
  habría buscado el fallo en la base.
- Arreglado en el puente y no en el hook: `obtenerToken` espera al registro (tope 10 s)
  en vez de fallar. Cubre la clase entera — cualquier petición lanzada al montar caía
  en lo mismo.
- **Al arreglarlo aparece el problema de fondo**: «Promedio 30 días» y «Máximo 90 días»
  se calculan sobre los 12 días que hay en `indicators` (la serie arranca el 2026-07-20)
  y se ETIQUETAN como 30 y 90. Los números son reales; las ventanas, no.
- **Y el backfill obvio no sirve, medido**: la brecha calculada desde
  `historical_market_snapshots` está 1,08 pp POR DEBAJO de la que publica el motor
  (279 horas de solape, rango 0,36–3,28). `base_weighted_avg` es media ponderada del top
  of book; el motor usa la mediana del lado buy. Empalmarlas metería un escalón como el
  que evitamos en las tasas del BCV.

## 2026-08-01 (noche) — Histórico P2P al día, y un defecto que estaba escondido
- Cargado el export del 2026-08-01: 28.823 filas, de las que **solo 2.951 eran nuevas**.
  La tabla queda en 32.525 filas (2025-12-02 → 2026-08-01), 243 días **sin huecos > 2
  días**, y la unión entre exports no tiene escalón (824,08 → 824,23).
- **Hallazgo al verificar, no al cargar**: `banks[].volume` está poblado en el primer
  export (3.192 de 3.192 entradas) y **vacío en los otros dos** (0 de 113.972). La causa
  es que el formato nuevo publica el volumen por banco en `InforPerBank`, un mapa
  **anidado** cuyo nombre no contiene ninguna palabra de volumen; la heurística busca
  en el nombre, no en el contenido, así que la columna cae en `extra`.
- **No es pérdida de dato** —`extra` guarda la columna verbatim, que es justo lo que
  ADR-0013 previó— y hoy nada consume `volume`: la varianza solo usa `rate`. Pero deja
  la misma columna poblada para unas filas y nula para otras dentro de la misma tabla,
  y un `null` ahí se lee como «sin volumen», que sería falso. Anotado como pendiente
  con el arreglo concreto: reconocer mapas anidados en `detectar_columnas`.
- **Arreglado el mismo día.** `detectar_columnas` mapea ahora los anidados por
  contenido (`claves_anidadas`), y `cargar --rellenar-vacios` repara lo ya cargado. La
  guarda que lo hace seguro vive en **SQL, no en Python**: es la base la que mira lo que
  realmente tiene guardado y solo actualiza si no hay ningún volumen y el nuevo aporta
  alguno. Nunca sobrescribe, así que la segunda pasada actualiza 0.
- Resultado: **de 15 % a 100 %** de entradas de banco con volumen (128.962/128.962), sin
  tocar `rate`, `available` ni `low_liquidity` —verificado fila a fila contra el CSV— y
  con `InforPerBank` fuera de `extra`: el dato se movió, no se duplicó.
- Hizo falta pasar **los dos** exports: el de agosto arranca en 2026-01-01 y no cubría
  los 2.634 snapshots de diciembre, que salieron del de julio.

## 2026-08-01 (noche) — La serie oficial arranca en 2020, no en julio de 2026
- Cargadas **31.078 filas / 23 monedas** en `official_rates` desde el export de los XLS
  del BCV, con un comando nuevo del `ingestor-historico` (`cargar-oficiales`, RF-6).
- **La decisión de riesgo era de qué columna sacar el valor**, y se resolvió midiendo:
  el export trae BID y ASK, y lo que el scraper guarda hoy coincide a ocho decimales
  con el ASK. La verificación posterior lo confirma: 75 pares solapados, 75 coinciden,
  0 difieren. Con la BID el error habría sido invisible —números plausibles— y habría
  metido un escalón falso justo en la unión con la serie viva.
- **La redenominación de 2021 (÷ 1.000.000) se absorbe** usando la columna en escala
  BsD. Con la cruda, la serie daría en octubre de 2021 un salto de seis órdenes de
  magnitud que nunca ocurrió.
- **Un «salto del 87 %» que resultó ser un hueco.** Al buscar escalones falsos, el
  mayor factor diario de USD salía en 2021-04-06. No era un escalón: es que faltan los
  92 días anteriores. El dataset de origen tiene **dos trimestres truncados**
  (`2021-01-04 → 2021-04-04` y `2023-07-05 → 2023-10-01`), porque dos XLS del BCV
  vienen con 9 y 2 días en vez de un trimestre. Declarado en la doc para que nadie lo
  lea como «el BCV dejó de publicar».
- **44 filas con la hora inventada, y marcadas como tales.** Dos jornadas
  (2020-04-14 y 2026-06-25) no traen hora de publicación en el XLS. Descartarlas habría
  dejado huecos falsos; se usa la fecha real a las 00:00 y la fila lo declara en
  `source`, no solo el resumen de la carga: quien consulte la tabla dentro de un año
  tiene que poder aislarlas.
- ADR-0013 **enmendado**: decía que histórico y vivo viven en tablas distintas. Para las
  tasas oficiales se hizo al revés a propósito — son el mismo dato de la misma fuente
  por dos caminos de captura, y separarlas obligaría a unir dos tablas para responder
  lo mismo.

## 2026-08-01 (noche) — Barrido de coherencia tras ADR-0021
- **La misma contradicción que enmendé en ADR-0019 pto. 9 estaba también en el
  PRD del motor** (RF-6: «nada de régimen, probabilidades ni horizontes») y se me
  había pasado. Enmendado igual: «régimen» ahí significa el predictivo.
- **La lista de sellos demo de ADR-0018 dejó de ser una cola de tareas.** Decía
  que régimen, percentiles y escenarios «son, exactamente, el trabajo pendiente
  del indicator-engine». Los dos primeros se cerraron; los escenarios y riesgos
  que quedan **no son deuda**: hacerlos reales exigiría pronosticar. La lista pasó
  de cola de tareas a marca de frontera.
- **Deuda de ADR-0019 que nadie cerró**: el README raíz seguía diciendo que el
  motor emite solo `indicators.updated` y `signals.emitted`, y `architecture.md`
  no listaba la tabla `indicator_analysis`. Ambos corregidos; las 8 tablas reales
  ahora cuadran con las documentadas.
- **Una cifra mía que la medición desmintió**: escribí que el rango p25–p75 de la
  variación de brecha a 6 h era «±0,5». Remedido: media 0,55 pp con
  intercuartílico **[0,21 – 0,76]** sobre 274 ventanas. El umbral sigue siendo
  defendible —cae dentro del rango, cerca del centro— pero la redacción anterior
  no describía la distribución. Corregida en el ADR, la métrica y el YAML.
- Rastros caducados del bloqueo de Auth0 (ADR-0020 lo levantó) que sobrevivían en
  ADR-0018 y en el knowledge del SPA. El PRD del motor sube a 0.5.0 por RF-7 y
  `api-contracts.md` a 0.6.0 por el campo `reading`.
- **Anotado, no resuelto**: la suite del `api-gateway` falló **una vez** (1 de
  103) en la ejecución inmediatamente posterior a `docker compose up -d`, y no
  reproduce en 7 pasadas seguidas. Parece una carrera con los contenedores
  arrancando. Si reaparece, el sospechoso es un test que compite por un recurso
  del compose.

## 2026-08-01 (noche) — La tarjeta de régimen deja de ser maqueta (ADR-0021)
- La «Lectura de hoy» era **100 % literal**, incluida una barra de confianza al
  `width: "68%"` escrita a mano. Ahora el motor produce por revisión un régimen
  descriptivo (dos ejes mecánicos con umbrales versionados) y afirmaciones
  ordenadas con sus cifras, en el campo aditivo `reading` de `analysis.updated`.
- **La decisión de diseño fue la frontera, no el algoritmo.** La maqueta mezclaba
  cuatro registros y dos chocaban con límites que el propio repo se había puesto:
  «no se reabre cuando el paralelo despierte» es predicción (ADR-0019 pto. 9) y
  «hoy no hay nada que ejecutar» es consejo (no-objetivo del PRD). Se implementan
  hechos + atribución + condicional; los otros dos no.
- **ADR-0019 pto. 9 quedó enmendado**: decía «ni detección de régimen» y esto
  detecta uno. Se acota el término a régimen *predictivo* —que sigue excluido—
  frente a clasificación *del presente*. Sin la enmienda el repo se contradecía.
- **Un fallo real encontrado por un test que escribí con la expectativa
  equivocada**: la guarda de hueco de captura se aplicaba también a
  `official_rate`, y esa serie se persiste **solo cuando la tasa cambia**
  (ADR-0008). Una fila de hace tres días no es un hueco, es una meseta — y
  `Δoficial = 0` es justo la evidencia que la atribución necesita. Con la guarda
  puesta, la atribución no se habría disparado casi nunca: la capacidad
  principal de la feature estaba apagada. Medido en vivo tras el arreglo:
  `Δbrecha −1,168 pp`, `Δparalelo −8,749 VES`, `Δoficial 0` ⇒ atribución
  `paralelo`.
- **Import circular latente eliminado de paso**: `adapters/amqp/__init__.py`
  reexportaba `consumer`, lo que cerraba el ciclo
  `analizar_revision → publisher → __init__ → consumer → process_p2p_snapshot →
  analizar_revision`. Solo se disparaba si `analizar_revision` era el primero de
  la cadena en importarse. Nadie usaba el agregador: todo el repo importa de los
  submódulos.
- El SPA pasa de **3 sellos demo a 2**. Los que quedan (escenarios con
  probabilidades, riesgos redactados) se quedan a propósito.

## 2026-08-01 (noche) — Medida la consulta de percentiles: sobra margen
- El plan de RF-6 dejaba obligatorio medir con `EXPLAIN ANALYZE` la consulta de
  distribuciones con la tabla en régimen, porque temía un `GroupAggregate` sobre
  un sort de ~1,5 M filas cada 15 min.
- Medido sembrando **1.036.800 filas** (90 días a la densidad real de captura,
  256 MB) en `ves_market_test`: **747 ms**, ~7× por debajo del timeout de 5 s.
- **La suposición del plan era incorrecta**: no hay nodo `Sort`. El índice
  `(indicator, currency, as_of DESC)` sirve un `Merge Append` ya ordenado por
  indicador; lo único que ordena es el agregado de conjunto ordenado, por dentro.
  Subir `work_mem` para que no desborde a temporales gana solo ~15 %
  (798 → 679 ms), así que no compensa tocarlo.
- **El continuous aggregate se descarta por ahora**, con número encima de la
  mesa en vez de intuición. Reabrir si cambia la densidad o la ventana.
- **Hallazgo lateral que sí hay que atender**: `indicators` **no tiene política
  de retención** — sí la tienen `p2p_snapshots_raw` e `indicator_analysis`. No
  afecta a la consulta (la ventana de 90 días excluye chunks sola), pero la tabla
  crece sin límite: ~2,2 GB/año al ritmo actual. Y es el estado del motor, así
  que cualquier retención debe respetar lo que necesitan `ultimo_indicador` e
  `indicador_asof` — horas, no días.

## 2026-08-01 (tarde) — El login estaba roto y nadie lo sabía (ADR-0020)
- Pedido: «que entrar sea más directo y que la sesión persista». Al medirlo en
  vivo aparecieron **tres problemas distintos**, y ninguno era el que parecía.
- **La CSP tumbó el login sin que nada fallara.** Faltaba `worker-src`: con
  `useRefreshTokens` + caché en memoria, `auth0-spa-js` canjea el código en un
  Web Worker creado desde un `blob:`; sin la directiva cae en
  `default-src 'self'`, el worker **construye pero muere al cargar** — sin
  excepción, sin log y sin petición de red — y el login se colgaba para siempre.
  Lo introdujo el arreglo del 2026-07-31: mientras la CSP no llegaba al
  navegador todo funcionaba, y se rompió justo cuando la política empezó a
  aplicarse de verdad. **Una CSP que por fin se envía es un cambio funcional.**
- **`web_origins` estaba vacío en el tenant**: Auth0 rechaza el
  `response_mode=web_message` del iframe sin él, así que el silent auth nunca
  pudo funcionar, con cookies de terceros o sin ellas.
- **El consentimiento y la no-persistencia eran el mismo problema.** Auth0 solo
  omite el consentimiento para clientes *verificables*, y `http://localhost` no
  lo es; y como `prompt=none` no puede mostrar esa pantalla, devolvía
  `consent_required` y el silent auth caía a login visible.
- Arreglado con dominio propio `auth.higerotech.com` + desarrollo por túneles de
  Cloudflare. **Verificado en vivo**: entra sin clics, F5 y pestaña nueva
  mantienen la sesión, y **cero tokens en storage** — T12 no se relajó; se
  descartó `localStorage`, que era la vía corta.
- **Cuatro cosas que la documentación daba por pendientes ya estaban hechas** en
  el tenant: `allow_offline_access`, rotación de refresh tokens, `is_first_party`
  y el grant `refresh_token`. Siete documentos declaraban «F1 pendiente» y el
  design del gateway decía «sin offline access». La doc llevaba semanas
  describiendo un tenant que no era el real: corregido en todos.
- Lección de método: tres diagnósticos míos cayeron por verificación floja —
  probar que el worker *se construía* pero no que *corriera*, leer
  `sessionStorage` desde el origen equivocado, y dar por bueno un contenedor que
  no se había reconstruido. Mandó la medición en vivo, no la lectura del código.

## 2026-08-01 — El panel de medidores deja de ser demo (RF-6, ADR-0019)
- El «Panel de instrumentos» mostraba valores reales rodeados de literales: la
  escala percentil, el ancho del relleno, la marca de umbral y la nota estaban
  escritos a mano en `dict.ts` y eran **ajenos al valor mostrado**. Por eso el
  panel entero llevaba el sello `demo · sin fuente`.
- Ahora el motor calcula la lectura por **cada revisión** y la publica como
  evento nuevo `analysis.updated` (no un `indicators.v2`: el `const: 1` del
  schema habría forzado desplegar engine y gateway a la vez). El engine
  **clasifica** en vocabulario neutro de idioma; el SPA **redacta** ES/EN con 67
  claves nuevas × 2 idiomas.
- La escala son percentiles REALES de la ventana de 90 días con `percentile_disc`
  (numeric exacto, nunca float — ADR-0017), cacheados 15 min. Sin historia
  suficiente se cae a un respaldo con los umbrales reales del ruleset, y la
  elección **viaja en el payload**: degradar en silencio era justo el problema.
- **Defecto encontrado con datos reales, no en revisión**: con 14 039 muestras de
  `p2p_outliers_pct_buy` casi todas en cero, p10 = p50 = p90 = 0 y un snapshot
  impecable (0 % de outliers) salía clasificado `very_high` — «de lo más alto de
  los últimos 90 días». La igualdad cuenta hacia arriba, y ninguna regla de
  desempate lo arregla sin invertir el error en series saturadas por arriba. La
  escala de percentiles pasa a exigir cortes **estrictamente crecientes**: sin
  dispersión entre ellos no hay banda que sostener, y el respaldo dibuja el
  umbral real del 30 %, que es la referencia útil de ese medidor.
- Frontera respetada: **no hay pronóstico, ni régimen, ni probabilidades**. La
  síntesis es proximidad aritmética a reglas ya versionadas, `rules_met` se llama
  así porque el cooldown pudo suprimir la emisión, y la UI lleva siempre la
  aclaración de que no es una predicción.
- Engine 71 → **170 tests**, gateway 90 → **103**, SPA 179 → **210** (88,7 % de
  ramas). El único cambio sobre el camino de emisión de señales (`_vista_vigente`
  ampliada) va blindado con un test que compara las señales emitidas con y sin
  análisis.

## 2026-07-31 — La CSP no existía: nginx la descartaba entera
- Pedido: añadir `frame-src` para el iframe de silent auth de Auth0. Al ir a
  verificarlo, la cabecera **no estaba en ninguna respuesta**. Tampoco `nosniff`
  ni `Referrer-Policy`.
- Causa: en nginx, un `location` con `add_header` propio **descarta todos los
  heredados** del `server`. Los dos locations de cache tenían el suyo, así que
  las tres cabeceras escritas arriba no llegaban al navegador. T12 y ADR-0017
  daban ese control por implementado.
- Arreglado con un fragmento incluido en el server y en cada location con
  cabeceras propias. Y `frame-src` del tenant añadido: sin él el iframe
  `prompt=none` se bloquea y cada recarga acaba en Universal Login visible —
  funcionaba en `vite dev` (sin CSP) y se rompía solo en el contenedor.
- Verificado dentro del contenedor con una sonda en el mismo origen:
  `example.com` bloqueado por `frame-src`, el tenant permitido. De paso, el
  script inline de la sonda quedó bloqueado por `script-src 'self'` — buena
  señal de que la política se aplica de verdad.
- Lección: **una cabecera escrita no es una cabecera enviada**. El canario nuevo
  comprueba la config, no la intención.

## 2026-07-31 — Un reporte sobre un contenedor viejo destapó un defecto real
- Reportaron la tira de estado visible en móvil. El contenedor del compose
  servía un bundle anterior al trabajo responsive —se comprobó buscando
  marcadores del código nuevo en el JS servido—, así que el síntoma venía de ahí.
- Pero al mirarlo apareció un defecto de verdad: `useCompacto` arrancaba en
  `false`, o sea que **el primer render siempre era el ancho**. En un móvil la
  tira se pintaba un fotograma y desaparecía al correr el efecto.
- Arreglado midiendo el ancho de forma síncrona en el estado inicial y
  escondiendo la tira **también por CSS**: el estado de React llega un tic tarde
  y la regla vale aunque el JS falle. Canario para que el corte no se separe
  entre TS y CSS.
- Dos lecciones: **verificar contra lo que el usuario mira**, no contra el
  working tree; y un reporte puede ser correcto aunque su causa inmediata sea
  otra — aquí la medición previa y el reporte eran ambos ciertos.
- De paso: al reescribir la sección de paleta en el commit anterior me llevé por
  delante la sección «Shell responsive» del design.md. Recuperada de git.

## 2026-07-31 — La paleta de datos deja de ser la paleta de marca
- Arreglado el defecto que dejó el rediseño: en tema claro el par compra/venta
  daba ΔE 5,9 bajo protanopia. Ahora `#10846e` ↔ `#cf4946` (ΔE 8,1), a solo 4,1
  OKLab de los acentos de marca — lo mínimo para cruzar el piso.
- La regla que queda: **el acento de marca viste el cromo; el dato lleva slot
  propio**. Mezclarlos fue el origen del problema.
- «Sin lado» pasa a tinta neutra: es la ausencia de lado, no una tercera
  categoría (y el salvia leía gris igual, croma 0,046).
- El mapa de calor iba con los valores del tema oscuro escritos a fuego: no era
  monótono en luminosidad y en claro quedaba a 1,67:1 sobre blanco, invisible.
  Ahora rampa secuencial de un tono por tema, y la leyenda habla de INTENSIDAD
  porque en claro sube oscureciendo y en oscuro aclarando.
- Dos tropiezos propios que vale anotar: (1) mi filtro de búsqueda comparaba el
  estado de contraste con `true` cuando el validador devuelve la cadena
  `"pass"` — descartaba todo y me hizo creer que no existía solución; (2) el
  paso de tono de 2° saltaba justo el candidato bueno. El validador tenía razón
  desde el principio; el que fallaba era mi arnés.
- Canario nuevo (`tests/unit/paleta.test.ts`) que fija los valores medidos: la
  frase «validada» ya no puede caducar en silencio.

## 2026-07-31 — El shell se reparte en vez de encogerse
- La tira de estado se pintaba en todos los anchos y el diseño la declara dentro
  de `isWide`: por eso se partía en dos filas en pantallas medianas. Ahora en
  compacto no existe y su contenido va al punto de la barra (estado + antigüedad)
  y a la línea meta del menú.
- Regla que salió de aquí: **lo que no cabe se retira entero, no se estruja**. La
  etiqueta de vista llevaba flex por defecto y se encogía a 0 px mucho antes de
  su breakpoint, partiendo el texto a media palabra; con `flex: none` o entra
  entera o se retira.
- El estado del WSS deja de depender del color: región viva en las dos variantes
  y con el estado en texto accesible.
- Las media queries no corren en jsdom, así que la escalera se **midió en el
  navegador** con iframes de ancho fijo (cada uno tiene su propio viewport) de
  1280 a 320 px: una fila en la tira, sin desbordes ni solapes. Un "solape" que
  aparecio al medir era artefacto de un nodo con display:none.

## 2026-07-31 — Barrido tras el rediseño: la paleta ya no estaba validada
- El rediseño mapeó las series a los acentos de marca y los docs seguían
  diciendo «paleta validada con el skill dataviz». Se volvió a **correr el
  validador** en vez de dar por buena la frase: en oscuro el par compra/venta da
  ΔE 13,2 y pasa; en **claro cae a ΔE 5,9** (protan), por debajo del piso de 6
  donde ni el rótulo visible lo excusa. Defecto de accesibilidad abierto, con
  remedio anotado — no se repinta porque elegir pasos de las rampas de marca es
  decisión de diseño.
- Lección que vale para el próximo cambio de color: **la parte de color es
  computable, así que se computa**. La frase «validada» caduca en cuanto alguien
  toca un token de serie.
- El PRD del `web-spa` no conocía tres capacidades que ya estaban en pantalla:
  vista de análisis, idioma y tema. Añadidos como RF-8/RF-9/RF-10, y RF-5
  ampliado con la regla del sello `demo · sin fuente`.
- Anotado también un hueco que no es del rediseño: la CSP declara solo
  `default-src 'self'`, y la re-autenticación silenciosa de Auth0 va por iframe
  (`frame-src`). Nunca se ejercitó porque el login real sigue pendiente de HITL.

## 2026-07-31 — El dashboard se viste de Higerotech (ADR-0018)
- Rediseño completo importado del proyecto de diseño de Claude Design vía MCP:
  tokens, fuentes autoalojadas (Inter + Space Grotesk, OFL) y componentes del
  sistema copiados AL REPO — la CSP sigue sin abrirse a ningún CDN.
- El tema es explícito (oscuro por marca, no `prefers-color-scheme`) y el claro
  reasigna los MISMOS tokens con `data-theme`: ningún componente lo sabe.
- i18n ES/EN con diccionario tipado: `EN` es `Record<Clave, string>` sobre las
  claves de `ES`, así que una traducción olvidada no compila. No se traduce el
  vocabulario del contrato (nombres de indicadores y reglas de señal).
- La decisión de fondo fue qué hacer con lo que el diseño pide y la plataforma
  no calcula (régimen, percentiles de backtest, escenarios, riesgos). El dueño
  del producto eligió implementarlo marcado: **sello `demo · sin fuente`** en
  cada bloque. Lo derivable se derivó de verdad — sparkline 24 h, mapa de calor
  14 d × hora VET y comparativas 7/30/90 d salen de `/indicators/history`.
- Los sellos son la lista de pendientes del motor, ahora visible en pantalla.
- 100 → **156 tests** (88,6 % ramas). El e2e con login real sigue bloqueado por
  el `client_id` del tenant, así que la revisión visual se hizo con un andamio
  temporal de datos sembrados, retirado al terminar.

## 2026-07-30 — Barrido de coherencia: los docs de estado vuelven a ser legibles
- Tres olas de trabajo (gateway, SPA, intradía) dejaron los documentos de estado
  detrás del repo. Contrastado contra código y suites reales, no contra memoria.
- **Conteos**: gateway 83/78 → **90**, web-spa 65 → **100** (85,7 % ramas). El resto
  (bcv 54, binance 48, historico 39, engine 77) ya coincidía.
- **Los gates eran lo que más mentía**: Gate 1 decía «gateway aún sin código» (lleva
  implementado desde el 26), «WSS: esqueleto hasta AsyncAPI» (publicada ese mismo
  día), `ADR-0001…0015` y `T1–T14`. Gate 0 seguía en 5 PRDs.
- Patrón recurrente: **un pendiente se cierra en un doc y sobrevive en otros**. El
  residual «nombrar apps consumidoras» lo cerró la enmienda del charter del 27 y
  seguía vivo en el propio charter y en Gate 0; el SPA figuraba «fuera de este repo»
  en el plan de pruebas mientras el threat model ya lo daba implementado.
- Otro patrón: **pendientes que describen un mundo viejo** — «cuando exista el
  api-gateway» (existe; no lee esa tabla), «se crea junto con el front-end» (existe;
  falta su client_id), «engine fase 2 usará la serie histórica» (se entregó sin ella).
  Se conservan como pendientes, pero diciendo dónde vive hoy la cosa.
- El `design.md` y el README del `web-spa` no conocían su propia tercera vista
  (Intradía, RF-7): al añadir la vista se actualizó el knowledge, no los docs de la app.
- `repo-history.md` iba 6 commits atrasado: regenerado con `scripts/gitgraph_branches.py`
  (es doc generado, no editar a mano) y gitGraph validado.

## 2026-07-30 — El push WSS del gateway ya sobrevive a una caída del bus
- Era lo único roto en vivo: una interrupción de RabbitMQ dejaba el push muerto
  **hasta reiniciar el contenedor**, y en silencio. `start()` conectaba una sola
  vez y, si el broker no estaba, no reintentaba jamás.
- Peor: `/health` **mentía**. `conectado()` miraba `connection.is_closed`, que en
  una `RobustConnection` solo es cierto tras un `close()` explícito → `broker: ok`
  con el push muerto. Ahora la señal es «hay consumo», y solo vuelve a `ok`
  cuando la restauración de cola/bindings/consumidor terminó: aio-pika marca
  `connected` **antes** de restaurar, y esa restauración puede fallar y recaer.
- Se añade `AlertNotifier` al gateway (mismo puerto que el `indicator-engine`):
  una alerta al caer y otra al restablecerse, una por episodio.
- Trampa de aio-pika que costó el hallazgo: cada `connect_robust` fallido deja
  una tarea de reconexión propia dentro del objeto, reintentando para siempre y
  **sobreviviendo a la cancelación** (colgaba pytest). Sin el objeto en la mano no
  hay a quién cerrarle → se instancia `RobustConnection` y se conecta por separado.
- La cola efímera NO la nombra el servidor: con `declare_queue("")` aio-pika
  genera `amq_<hex>` en cliente — por eso el re-declare al reconectar funciona
  (un nombre `amq.*` del servidor sería prefijo reservado y daría ACCESS_REFUSED).
- Verificado en vivo con `rabbitmqctl close_connection` (quirúrgico, sin tocar
  los otros servicios): restablecido en 28 ms, 4 bindings y consumidor de vuelta.
  5 tests nuevos; el conteo del servicio pasa a 90 (lo documentado, 78, ya venía
  desactualizado: la suite real eran 85).

## 2026-07-29 — Intradía: la variación vs. apertura VET, por fin calculada
- Nueva vista **Intradía** del `web-spa` (RF-7): parrilla de small multiples con
  TODOS los indicadores del día operativo VET (UTC−4 fijo), agrupados en
  oficial / compra / venta / microestructura. Cada panel lleva último valor,
  sparkline con la apertura marcada y la **variación intradía** (Δ abs y %).
- La métrica estaba en el glosario y en los requisitos del motor desde el inicio,
  pero **nadie la calculaba**: el plan de pruebas la daba por cubierta en
  `indicator-engine` desde 0.3.0 y era falso (cero referencias a apertura en su
  código y sus tests); `knowledge/metrics` sí decía «pendiente». Plan corregido.
  Se deriva en el cliente sobre `/indicators/history`, sin tocar `calc_version`;
  persistirla como indicador del motor sigue pendiente.
- Aritmética exacta con `BigInt` en `lib/decimal.ts` (`restarDecimales`,
  `porcentajeRelativo`): la regla «decimales como string exacto» ahora cubre el
  CÁLCULO, no solo el formateo. Apertura cero ⇒ «—», nunca ∞ ni NaN.
- Excepción documentada a «filtra siempre por indicador»: con ventana de un día
  conviene pedir el formato largo (~23 series en una pasada por moneda) en vez
  de ~23 requests filtrados; el filtro de `currency` sí sigue siendo obligatorio.
- Color = lado del mercado y nada más; el signo de la Δ va en glifo + texto.
  Slots 1/2/3 revalidados **all-pairs** en claro y oscuro (small multiples topan
  en tres slots); token nuevo `--series-aqua`. Suite del SPA: 65 → **100 tests**
  (85,7 % ramas).

## 2026-07-27 — web-spa: el front-end entra al monorepo (ADR-0017)
- Enmienda HITL del charter: el SPA deja de ser «proyecto aparte». Nueva app
  `apps/web-spa` (React + Vite + TS + @auth0/auth0-react): dashboard en vivo
  (brecha, P2P por lado, microestructura, profundidad, señales con evidencia) +
  histórico con Recharts; tokens SOLO en memoria + refresh rotation (T12
  implementado); StreamClient singleton con backoff/watchdog/renovación y resync
  REST (ADR-0016); tipos del contrato generados del openapi.yaml y commiteados.
- Gateway con **CORS por allowlist** (`ALLOWED_ORIGINS`, solo GET, expose
  X-RateLimit) — nueva amenaza **T15** mitigada; T12 pasa a verificarse aquí.
- 65 tests (86,5 % ramas — Gate 2 ≥80 %) + 5 tests CORS del gateway (83 en su
  suite); e2e en vivo con M2M listo (skip sin credenciales). Compose: servicio
  `web-spa` (nginx, 8080). Pendiente HITL: `auth0 login` → F1 (client_id SPA,
  M2M, rotation en el tenant).

## 2026-07-26 — api-gateway implementado (quinto y último servicio)
- FastAPI hexagonal en `apps/api-gateway/src/`: REST `/api/v1` (8 endpoints del
  contrato, RFC 7807, paginación ≤ 90 días, rate limit por token) + WSS `/ws/v1`
  (whitelist de tópicos, límites 5/10 por `sub`, ping 30 s, cierre 4401 al expirar).
  Resource Server OIDC contra Auth0 (RS256/JWKS cache por kid; rechaza ID tokens —
  T11); DB de **solo lectura** (`default_transaction_read_only=on`, T9); consume los
  4 eventos con cola efímera para push best-effort (**ADR-0016**, nueva).
- Contrato WSS formalizado: `apps/api-gateway/docs/asyncapi.yaml` (cierra el TODO);
  OpenAPI ajustada (currency en tasa oficial, 404 en los current, `spread_pct` real).
- 78 tests (unit/contract/integration/e2e) en verde; verificado en vivo en el compose
  (puerto host 8800): health ok en DB/broker/auth y 401 correcto contra el tenant real.
- Fichas y índices actualizados: los 5 servicios implementados; eventos con el
  gateway como consumidor real. Pendiente: SPA + client M2M de prueba (HITL), MFA.

## 2026-07-26 — Barrido de coherencia post-0.3.0
- Índices y fichas del knowledge sincronizados con el estado real: 5 servicios
  (los 4 de datos implementados; api-gateway con tenant Auth0 y OpenAPI 3.1 listos
  pero **sin código**), engine con fases 1 y 2 + señales, `p2p.snapshot` con
  consumidor real (no «previsto»), gates 0/1 aprobados HITL, 5 PRDs y
  ADR-0001…0015 en el índice raíz.
- Conteos de tests actualizados a los reales: bcv 54, binance 48 (engine 77,
  historico 39 ya estaban). Anotado que en dev el compose fija `TOP_K=200` en el
  ingestor-binance (default del código: top-100).

## 2026-07-22 — Motor de reglas de señales (RF-4) implementado
- El indicator-engine ya **emite** `signals.emitted` (ADR-0015): ruleset versionado
  (`config/senales.v1.yaml`), evaluación por nivel sobre la vista de indicadores vigentes,
  dedup por cooldown (60 min/tipo) y evidencia (regla + insumos). Nueva hypertable `signals`
  (migración 002). 77 tests; verificado e2e en vivo (snapshot → `correccion_inminente` al bus
  y a la tabla). RF-4/RF-5 satisfechos; el api-gateway aún no consume el evento.
- `signals.emitted` pasa de «contrato definido» a **«implementado»** en índices y knowledge;
  tabla `signals` movida de planificada a implementada.

## 2026-07-20 — Coherencia post-fase-2 + contrato `signal.v1`
- Auditoría e2e de la doc contra el código tras la fase 2: corregida la deriva de tratar
  «fase 2» como «P2P + señales» (el código las separó). Actualizados motor-indicadores,
  knowledge del engine (fase 2 implementada, 49 tests), gate-0 (4→5 PRDs), gate-1,
  api-contracts y architecture. Nuevo **ADR-0014** (microestructura P2P: reúso de
  `indicators.updated`, ventanas sobre histórico, frescura entre lados, aplazamiento de
  señales).
- **`schemas/signal.v1.json`** definido (4.º schema de eventos): payload con `type` abierto,
  `direction` enum, `evidence` {rule, inputs} para trazabilidad. Contract test de forma
  (9 casos) en el engine. **Solo contrato**: la emisión depende del motor de reglas (RF-4),
  aún pendiente. `signals.emitted` pasa de «diseñado» a «contrato definido; emisión pendiente».

## 2026-07-17 — api-gateway: spec OpenAPI 3.1 (fase 03)
- Contrato REST formal en `apps/api-gateway/docs/openapi.yaml`, generado desde la
  sección REST de `docs/02-design/api-contracts.md` y ADR-0012. 8 endpoints `/api/v1`,
  seguridad OAuth2 `authorizationCode` contra el tenant Auth0 con los 5 scopes, decimales
  como string, paginación obligatoria (rango máx. 90 d → 422), errores RFC 7807 y
  cabeceras `X-RateLimit-*`. Validado con `openapi-spec-validator`.
- Campos dependientes de la fase 2 del engine marcados preliminares (brecha/spreads/volúmenes
  `null`; vocabulario de señales pendiente de `signal.v1`). Siguen abiertos: AsyncAPI del
  WSS `/ws/v1` y la app SPA del tenant.

## 2026-07-14 — Rama feat-ai-dlc cerrada
- Cerrada tras nivelar develop (0 commits exclusivos): borrada local y en origin.
  Todo su contenido — ingestor-historico (ADR-0013), evidencia diagramática de los
  tres ejes, tenant Auth0 — vive en develop (`8658d68` y posteriores).
- Ramas vivas: `main` (pendiente merge + tag v0.2.0) y `develop` (integración).
  `repo-history.md` regenerado con el mapa main+develop.

## 2026-07-14 — Auditoría de coherencia AI-DLC: evidencia diagramática de los tres ejes
- Hallazgo: los gates 0/1 se cerraron con la sustancia en tablas (STRIDE/DREAD/ASVS) pero
  solo 3 diagramas Mermaid en el repo (C4 Context/Container + gitGraph) — faltaba el eje
  comportamiento y casi todo trazabilidad según el catálogo de la metodología.
- Se generaron los 9 faltantes inline: mindmap (charter), journey (api-streaming),
  requirementDiagram (motor-indicadores; RF-4 sin `verifies` a propósito — fase 2),
  DFD + quadrant DREAD (threat-model), sequence + state TasaOficial + ER dominio +
  classDiagram hexagonal (architecture). El ASCII art de architecture se retiró.
- Fixes de forma: cabeceras de metadatos en los 4 design docs de apps y plan de pruebas;
  `ingesta-historica.md` 0.1.1→0.2.0. Los gates conservan su firma; la evidencia nueva
  queda anotada como adenda en cada gate.
- Tenant Auth0 `dev-higerotech.us.auth0.com` aprovisionado el mismo día: API audience
  `https://api.vesmarketwatch/` (RS256, 900 s, RBAC con permisos en el token), roles
  viewer/operator con los 5 permisos, attack protection (bfp 10 intentos, bpd con
  block+aviso, sit). Detalle y config del gateway en `apps/api-gateway/docs/design.md`.
  Gotcha del CLI: `auth0 api patch` bloquea leyendo stdin en entornos no-TTY (cerrar
  stdin con `$null |`) y PS 5.1 exige escapar `\"` en el JSON de `--data`.

## 2026-07-11 — ingestor-historico: backfill de históricos de precio (ADR-0013)
- Quinto servicio, batch por demanda (CLI `cargar`/`stats`), sin bus: carga exports
  CSV del sistema previo (top-100 combinado con 3 bancos principales) en la nueva
  hypertable `historical_market_snapshots`, idempotente por `(captured_at, source_id)`.
- Parseo adaptativo (heurística de columnas, bancos dinámicos, anotaciones de
  liquidez, fechas EN/ISO, fallback ObjectId); archivo ajeno → rechazo completo,
  fila corrupta → descarte contado.
- Varianza histórica vía `stats`: precio base y por banco, log-retornos, por día de
  mercado (UTC−4). Verificado en vivo: 1.064 filas (2025-12-02→12-11), recarga
  0/1.064, varianza σ²≈65.3 (σ≈8.08) sobre media 417.03.
- PRD `ingesta-historica.md` **approved (HITL 2026-07-11)** — Gate 0 incremental
  cerrado; 39 tests; migración montada en el compose. Carga oficial confirmada en la
  DB de desarrollo: 1.064 filas, `repo-history.md` regenerado tras el commit `31289f5`.

## 2026-07-11 — Gates 0 y 1 cerrados (HITL) y corte de versión 0.2.0
- Ambos gates firmados por Jeremi Alcalá; la aprobación del Gate 0 cubre la versión
  de requisitos actualizada por ADR-0012 (auth OIDC con Auth0, supersede ADR-0003).
- CHANGELOG: `[Unreleased]` cortado a **0.2.0** (convención AI-DLC: Gate 1 → 0.2.0);
  cabeceras de metadatos (Estado approved / Versión 0.2.0) sincronizadas en charter,
  glosario, data-classification, 4 PRDs, architecture, threat-model, api-contracts y C4.
- Nueva documentación viva de fase 03: `docs/03-implementation/repo-history.md`
  (gitGraph + bitácora derivados del historial real + trazabilidad tag↔versión↔ADR).
- Pendientes: taggear `v0.2.0` sobre el merge a `main`; residuales HITL del charter
  (apps consumidoras, marco legal); `signal.v1`/umbrales (engine fase 2); secret store
  (fase 05); api-gateway sin implementar (Resource Server, ADR-0012).

## 2026-07-07 — Verificación de pendientes de Gate 0 y Gate 1
- Gate 0: retención de alias → resuelto (ADR-0011 implementado); quedan como
  decisiones humanas los TODO del charter (apps consumidoras, marco legal).
- Gate 1: ADRs 0001–0011 (0010 proposed pero implementada de facto — el bundle
  OKF se mantiene desde 2026-07-05); contratos de eventos formales (3 de 4
  schemas, p2p-snapshot v1.1); abiertos: signal.v1/umbrales (engine fase 2),
  secret store (fase 05). Threat model T2/T10 citan ahora el ADR-0011.
- Ambos gates listos para la firma humana («Aprobado por» sigue pendiente).

## 2026-07-06 — ADR-0011 implementado: merchant_ref en producción
- `Pseudonimizador` en el dominio del ingestor-binance: HMAC-SHA256 sobre `userNo`
  (nunca el alias), 32 hex; en el evento (contrato v1.1 aditivo, `merchant_ref`
  requerido) y en el crudo persistido. `MERCHANT_HMAC_KEY` obligatoria (fail fast).
- Verificado en vivo: dos corridas con la misma clave → 88/96 anunciantes
  correlacionados entre snapshots; cero alias/ID crudos en disco. Suite en 48 tests.
- El motor de ingesta de Binance queda completo; sin pendientes en el servicio.

## 2026-07-06 — Identidad de anunciantes P2P: pseudonimización HMAC (ADR-0011)
- Decisión humana que cierra el TODO de data-classification: conservar historia de
  anunciantes como `merchant_ref` (HMAC-SHA256, clave dedicada `MERCHANT_HMAC_KEY`,
  sin rotación programada); alias e ID crudos siguen sin persistir.
- Habilita (fase 2 del engine): dedup de profundidad, concentración de mercado,
  recurrencia de manipuladores (T2) y forense de señales (T10).
- Implementación pendiente en `ingestor-binance` (`minimizar_crudo` + contrato
  p2p-snapshot v1.1, aditivo); PRD y data-classification actualizados.

## 2026-07-06 — Auditoría de coherencia docs↔implementación
- Minimización de datos aplicada al crudo P2P (`minimizar_crudo`): el alias e
  identificadores del anunciante ya no tocan disco — cierra la brecha con
  data-classification (el TODO de confirmación humana sigue abierto).
- ADR-0008/0009 → accepted (implementados por ingestor-bcv, con notas de cómo);
  Gate 1 y README raíz actualizados al estado real; índices del bundle
  (servicios/eventos/métricas) sincronizados; tabla de persistencia de
  architecture.md con estado por tabla.

## 2026-07-06 — ingestor-binance implementado (última fuente)
- Spike del endpoint P2P resuelto (ADR-0005): HTTP 200 con la forma esperada,
  ~643 anuncios USDT/VES; fixtures reales versionados. `tradeType` = perspectiva
  del taker.
- Servicio completo: polling educado (presupuesto, backoff+jitter, breaker),
  validación de schema de la fuente, sanitización, outliers MAD etiquetados
  (con piso relativo 2 % calibrado con datos reales), crudo 90 d y `p2p.snapshot`
  (contrato `schemas/p2p-snapshot.v1.json`). 40 tests; flujo productor→bus
  verificado en vivo (100 anuncios/lado).
- Con esto las 3 fuentes/servicios de datos están implementados; falta fase 2 del
  engine (brecha) y el api-gateway.

## 2026-07-05 — indicator-engine fase 1: primer consumidor del bus
- Motor implementado como consumidor de `official.rate.updated`: validación contra
  schema compartido, DLQ, idempotencia por `event_id`, hypertable `indicators`
  (calc_version) y emisión de `indicators.updated` con `triggered_by`.
- Contratos formales en `schemas/` (official-rate.v1, indicators.v1) verificados por
  contract tests en ambos lados; sobre estándar unificado a `occurred_at`.
- Flujo ingestor→bus→engine verificado en vivo (5 monedas del sitio real del BCV).
- PRD motor-indicadores accepted (fase 1); pendiente fase 2: P2P y señales.

## 2026-07-05 — Re-validación HITL de tasas suspect (ADR-0007 accepted)
- Job HITL implementado en `ingestor-bcv`: CLI `revalidar listar|aprobar|rechazar`,
  estado terminal `rejected`, expiración por TTL (24 h, `system:timeout`) y auditoría
  quién/cuándo/por qué (migración 002 sobre `official_rates`).
- Previo en la misma fecha: `docker-compose.yml` raíz (RabbitMQ 4 + TimescaleDB pg16
  en puerto 5433) y suites integration/e2e; la suite del servicio llega a 53 tests.

## 2026-07-05 — Creación del bundle
- Bundle OKF v0.1 inicial (ADR-0010): services, events, tables, metrics.
- Refleja: Gate 0/1 documentados; `ingestor-bcv` implementado (multi-moneda, hexagonal,
  TLS anclado, 28 tests, dry-run verificado con 5 monedas); resto de servicios en diseño.

## 2026-07-05 — Hitos previos del proyecto (resumen)
- v0.1.0: estructura AI-DLC completa hasta Gate 1 (charter, PRDs, threat model, C4, ADR-0001…0006).
- ADR-0007/0008/0009 (proposed): máquina de estados de la tasa, publicación solo-en-cambio, modelo bitemporal.
- Alcance de ingesta BCV ampliado de solo-USD a multi-moneda con descubrimiento dinámico.
