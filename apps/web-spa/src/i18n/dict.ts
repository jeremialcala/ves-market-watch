/**
 * Diccionario de la interfaz (ES canónico, EN traducido).
 *
 * `EN` está tipado como `Record<Clave, string>` sobre las claves de `ES`: si se
 * añade una cadena en español y se olvida en inglés, no compila. Los valores
 * admiten marcadores `{nombre}` que `t()` sustituye.
 *
 * Lo que NO vive aquí: los decimales (se formatean desde el string exacto del
 * contrato, ver `lib/decimal`) ni los nombres canónicos de indicadores y
 * señales, que son vocabulario del contrato y no se traducen.
 */

import type { Idioma } from "./idioma";

export const ES = {
  // -- shell -----------------------------------------------------------------
  "app.titulo": "VES Market Watch",
  "nav.dashboard": "Dashboard",
  "nav.analisis": "Análisis",
  "nav.intradia": "Intradía",
  "nav.historico": "Histórico",
  "nav.menu": "Menú",
  "nav.salir": "Salir",
  "nav.tema.claro": "Claro",
  "nav.tema.oscuro": "Oscuro",
  "nav.idioma": "Idioma",
  "nav.vistas": "Vistas",

  // -- barra de estado -------------------------------------------------------
  "estado.conectado": "WSS conectado",
  "estado.conectando": "WSS conectando",
  "estado.reconectando": "WSS reconectando",
  "estado.desconectado": "WSS desconectado",
  "estado.detenido": "WSS detenido",
  "estado.flujo": "flujo /ws/v1 · {n} suscripciones",
  "estado.ultimoEvento": "último evento {cuando}",
  "estado.sinEventos": "sin eventos todavía",
  "estado.version": "calc v{calc} · ruleset v1",
  "estado.versionSinDato": "calc — · ruleset v1",
  "estado.cuota": "cuota {restante}/{limite}",

  // -- tiempo relativo -------------------------------------------------------
  "tiempo.ahora": "ahora",
  "tiempo.segundos": "hace {n} s",
  "tiempo.minutos": "hace {n} min",
  "tiempo.horas": "hace {n} h",
  "tiempo.dias": "hace {n} días",

  // -- genéricos -------------------------------------------------------------
  "generico.sinDatos": "Sin datos",
  "generico.cargando": "Cargando…",
  "generico.reintentar": "Reintentar",
  "frescura.sinDatos": "sin datos",
  "frescura.rancio": "rancio · {cuando}",
  "estado.gateway": "gateway {estado}",
  "estado.cuotaTitulo": "cuota REST: {restante}/{limite} por minuto",
  "generico.demo": "demo · sin fuente",
  "generico.demoTitulo":
    "Bloque de ejemplo: la plataforma todavía no calcula este dato. No proviene del gateway.",

  // -- brecha (hero) ---------------------------------------------------------
  "brecha.titulo": "Brecha BCV ↔ P2P (lado buy)",
  "brecha.sobreOficial": "{valor} VES sobre la oficial",
  "brecha.sinSnapshot":
    "Sin snapshot P2P reciente que alimente la brecha — se muestra en cuanto llegue.",
  "brecha.sinIndicadores": "Sin indicadores calculados todavía.",
  "brecha.oficialStale": "oficial stale",
  "brecha.spread": "Spread BUY↔SELL: {valor}",
  "brecha.oficialPar": "oficial USD/VES {valor}",
  "brecha.vwap": "P2P VWAP {valor}",
  "brecha.ventana24h": "24 h · los dos lados",
  // `minMax` la sigue usando la parrilla intradía, que pinta UNA serie.
  "brecha.minMax": "mín {min} · máx {max}",
  // La leyenda ES la etiqueta de cada línea: sin ella dos trazos en el mismo
  // gráfico no se distinguen, y uno de los dos no es el del titular.
  "brecha.rangoCompra": "compra {min}–{max}",
  "brecha.rangoVenta": "venta {min}–{max}",
  "brecha.sinSerie": "Sin serie de las últimas 24 h.",

  // -- lectura del mercado ---------------------------------------------------
  // Mismo registro que los medidores (ADR-0019/0021): describe el PRESENTE,
  // nunca el futuro, y NUNCA dice qué hacer. Lo único que orienta va en
  // condicional («si tienes que convertir…»), que informa sin ordenar.
  "regimen.titulo": "Lectura de hoy",
  "regimen.confianza": "Confianza",
  "regimen.sinLectura":
    "Sin lectura del mercado en esta revisión: se muestran los indicadores, no su interpretación.",
  "regimen.sinRegimen":
    "Todavía no se puede nombrar el estado del mercado: falta alguno de los dos datos que lo definen.",
  "regimen.aclaracion":
    "Describe cómo está el mercado ahora, con los datos de esta lectura. No es una predicción ni una recomendación.",

  // Los nueve regímenes: <movimiento>_<brecha>. El titular de la tarjeta.
  "regimen.subiendo_ampliando": "Al alza, con la brecha abriéndose",
  "regimen.subiendo_estable": "Al alza, con la brecha quieta",
  "regimen.subiendo_comprimiendo": "Al alza, con la brecha cerrándose",
  "regimen.lateral_ampliando": "Lateral, con la brecha abriéndose",
  "regimen.lateral_estable": "Lateral y sin cambios",
  "regimen.lateral_comprimiendo": "Lateral en compresión",
  "regimen.bajando_ampliando": "A la baja, con la brecha abriéndose",
  "regimen.bajando_estable": "A la baja, con la brecha quieta",
  "regimen.bajando_comprimiendo": "A la baja, con la brecha cerrándose",

  // Afirmaciones. Una frase por código; el motor manda el orden.
  "regimen.claim.brecha.ampliando":
    "La distancia entre el precio de la calle y el oficial se ha abierto {delta} puntos en las últimas {horas} horas.",
  "regimen.claim.brecha.comprimiendo":
    "La distancia entre el precio de la calle y el oficial se ha cerrado {delta} puntos en las últimas {horas} horas.",
  "regimen.claim.brecha.estable":
    "La distancia entre el precio de la calle y el oficial apenas se ha movido en las últimas {horas} horas.",
  "regimen.claim.atribucion.paralelo":
    "El movimiento vino del precio de la calle: la tasa oficial no cambió en ese rato.",
  "regimen.claim.atribucion.oficial":
    "El movimiento vino de la tasa oficial, no del precio de la calle.",
  "regimen.claim.atribucion.ambos":
    "Se movieron los dos lados a la vez: la tasa oficial y el precio de la calle.",
  "regimen.claim.banda.very_low":
    "Si tienes que comprar, hoy la calle está de lo más barata frente al oficial en {dias} días.",
  "regimen.claim.banda.very_high":
    "Si tienes que comprar, hoy la calle está de lo más cara frente al oficial en {dias} días.",
  "regimen.claim.reglaCerca":
    "El aviso más cerca de activarse es {regla}: cumple {cumplidas} de {totales} condiciones.",
  "regimen.claim.confianzaBaja":
    "Demasiados anuncios con precio raro en esta lectura: los avisos están desactivados y el resto se mira con reservas.",
  "regimen.claim.oficialRancia":
    "La tasa oficial lleva más de 6 horas sin actualizarse, así que no se puede decir qué lado movió la distancia.",

  // Chips de contexto.
  "regimen.chip.frescos": "Datos frescos · {cuando}",
  "regimen.chip.reglas": "{n} reglas disparadas",
  "regimen.chip.cerca": "{n} medidores cerca de su umbral",
  "regimen.chip.cercaUno": "1 medidor cerca de su umbral",
  "regimen.chip.confianzaNormal": "Confianza normal · {outliers} de precios raros",
  "regimen.chip.confianzaBaja": "Confianza baja · {outliers} de precios raros",

  // -- medidores -------------------------------------------------------------
  // Registro DIDÁCTICO, no de mesa de operaciones: quien lee esto compra o vende
  // divisas, no analiza libros de órdenes. Reglas que gobiernan las 134 cadenas
  // (ADR-0019): describen el presente y nunca el futuro · ninguna dice
  // «percentil X» (los cortes se rotulan bajo/normal/alto y una sola cadena
  // explica qué significan) · el número vive en la cifra y en el pie, no en la
  // prosa · `{tipo}`, `{regla}` e `{indicador}` son vocabulario del contrato y
  // se interpolan crudos · «señal» se dice **aviso**.
  "medidores.titulo": "Panel de instrumentos",
  "medidores.bajada":
    "Cada medidor comparado con su propia historia de 90 días: qué significa el número y qué tan cerca está de disparar un aviso, en cada lectura.",
  "medidores.sinValor": "sin valor vigente",
  "medidores.brecha": "Brecha buy",

  // Qué mide (definición, en el desplegable).
  "medidores.def.brecha":
    "Cuánto más caro está el dólar en el mercado P2P que en la tasa oficial del BCV. Si la brecha es 13 %, por cada 100 bolívares que costaría al cambio oficial, en la calle pagas 113.",
  "medidores.def.spread":
    "La diferencia entre lo que pagas al comprar y lo que recibes al vender. Si es 0,5 %, comprar y vender de inmediato te cuesta medio por ciento. En negativo pasa algo raro: se vende más caro de lo que se compra.",
  "medidores.def.ratio":
    "Compara cuántos dólares hay en venta con cuántos se quieren comprar. Por debajo de 1 hay más gente queriendo comprar que dólares disponibles; por encima de 1 sobran dólares y falta quien los compre.",
  "medidores.def.momentum":
    "Cuánto ha subido o bajado el precio en las últimas tres horas, en porcentaje. Positivo es que va subiendo; negativo, que va bajando.",
  "medidores.def.drenaje":
    "Cuánto ha cambiado en seis horas la cantidad de dólares puestos en venta. Negativo es que se están agotando; positivo, que están entrando más.",
  "medidores.def.outliers":
    "Qué parte de los anuncios se descartó por tener un precio disparatado. Si pasa de 30 %, los datos de esta lectura dejan de ser confiables y el sistema no envía avisos.",

  // Qué dice ahora: una frase por indicador y banda. Sin marcadores a propósito
  // — el número ya está en la cifra grande y en el pie de la escala.
  "medidores.lectura.brecha.muyBajo":
    "La brecha está de las más estrechas de los últimos 90 días: el precio de la calle se ha acercado al oficial.",
  "medidores.lectura.brecha.bajo":
    "La brecha está más estrecha que de costumbre: comprar fuera del oficial cuesta menos de lo habitual.",
  "medidores.lectura.brecha.alto":
    "La brecha está más ancha que de costumbre: comprar fuera del oficial cuesta más de lo habitual.",
  "medidores.lectura.brecha.muyAlto":
    "La brecha está de las más anchas de los últimos 90 días: el precio de la calle se ha alejado mucho del oficial.",
  "medidores.lectura.brecha.sinEscala":
    "Todavía no hay suficiente historia para decir si esta brecha es alta o baja comparada con lo normal.",

  "medidores.lectura.spread.muyBajo":
    "La diferencia entre comprar y vender está de las más pequeñas de los últimos 90 días: entrar y salir sale barato.",
  "medidores.lectura.spread.bajo":
    "Comprar y vender están más cerca de lo habitual: la vuelta cuesta poco.",
  "medidores.lectura.spread.alto":
    "Comprar y vender están más separados de lo habitual: la vuelta sale más cara.",
  "medidores.lectura.spread.muyAlto":
    "La diferencia entre comprar y vender está de las más grandes de los últimos 90 días: entrar y salir sale caro.",
  "medidores.lectura.spread.sinEscala":
    "Todavía no hay suficiente historia para decir si esta diferencia es grande o pequeña comparada con lo normal.",

  "medidores.lectura.ratio.muyBajo":
    "Quedan muy pocos dólares en venta frente a la gente que quiere comprar: de lo más escaso de los últimos 90 días.",
  "medidores.lectura.ratio.bajo":
    "Hay menos dólares en venta de lo habitual para la gente que quiere comprar.",
  "medidores.lectura.ratio.alto":
    "Hay más dólares en venta de lo habitual: no escasean.",
  "medidores.lectura.ratio.muyAlto":
    "Hay muchos más dólares en venta que compradores: de lo más abundante de los últimos 90 días.",
  "medidores.lectura.ratio.sinEscala":
    "Todavía no hay suficiente historia para decir si esta proporción es alta o baja comparada con lo normal.",

  "medidores.lectura.momentum.muyBajo":
    "El precio viene cayendo con una fuerza que casi no se ha visto en los últimos 90 días.",
  "medidores.lectura.momentum.bajo":
    "El precio viene flojo o bajando algo en las últimas horas.",
  "medidores.lectura.momentum.alto":
    "El precio viene subiendo más de lo habitual en las últimas horas.",
  "medidores.lectura.momentum.muyAlto":
    "El precio viene subiendo con una fuerza que casi no se ha visto en los últimos 90 días.",
  "medidores.lectura.momentum.sinEscala":
    "Todavía no hay suficiente historia para decir si este movimiento es fuerte o flojo comparado con lo normal.",

  "medidores.lectura.drenaje.muyBajo":
    "Los dólares en venta se están agotando a una velocidad que casi no se ha visto en los últimos 90 días.",
  "medidores.lectura.drenaje.bajo":
    "Los dólares en venta se están agotando más rápido de lo habitual.",
  "medidores.lectura.drenaje.alto":
    "Están entrando más dólares en venta: lo contrario de una corrida.",
  "medidores.lectura.drenaje.muyAlto":
    "Están entrando dólares en venta a un ritmo poco común en los últimos 90 días.",
  "medidores.lectura.drenaje.sinEscala":
    "Todavía no hay suficiente historia para decir si este cambio es grande o pequeño comparado con lo normal.",

  "medidores.lectura.outliers.muyBajo":
    "Casi ningún anuncio con precio raro: la lectura se apoya en un mercado limpio.",
  "medidores.lectura.outliers.bajo":
    "Pocos anuncios con precio raro: la lectura es confiable.",
  "medidores.lectura.outliers.alto":
    "Más anuncios con precio raro de lo habitual.",
  "medidores.lectura.outliers.muyAlto":
    "Muchos anuncios con precio raro, de lo más alto de los últimos 90 días: la lectura se acerca al punto donde deja de ser confiable.",
  "medidores.lectura.outliers.sinEscala":
    "Todavía no hay historia suficiente para comparar; se mira contra el límite de 30 % a partir del cual la lectura deja de ser confiable.",

  // Pie de la escala y su glosa. `explicacion` es la ÚNICA cadena que enseña a
  // leer la escala, y va solo en el desplegable para que el pie siga corto.
  "medidores.escala.percentiles": "bajo {p10} · normal {p50} · alto {p90} · {dias} d",
  "medidores.escala.ruleset":
    "comparando con los umbrales de aviso · {muestras}/{minimo} lecturas en {dias} d",
  "medidores.escala.explicacion":
    "«Bajo» es el valor que solo se queda por debajo 1 de cada 10 veces; «normal» es el punto medio; «alto», el que solo se supera 1 de cada 10 veces. Comparado con los últimos {dias} días.",

  // Distancia a la regla de aviso.
  "medidores.regla.porEncima":
    "{tipo}: el sistema avisa cuando pasa de {umbral}. Ahora faltan {distancia}.",
  "medidores.regla.porDebajo":
    "{tipo}: el sistema avisa cuando baja de {umbral}. Ahora faltan {distancia}.",
  "medidores.regla.cumplida":
    "{tipo}: ya está del lado que el sistema vigila ({umbral}).",
  "medidores.regla.sinReglas":
    "Este medidor no dispara ningún aviso por sí solo; sirve de contexto.",

  // Detalle desplegable.
  "medidores.detalle.abrir": "Ver explicación",
  "medidores.detalle.cerrar": "Ocultar explicación",
  "medidores.detalle.definicionTitulo": "Qué mide",
  "medidores.detalle.lecturaTitulo": "Qué dice ahora",
  "medidores.detalle.reglasTitulo": "Avisos que dependen de este medidor",

  // Síntesis del panel. `aclaracion` va SIEMPRE: es la frontera explícita entre
  // proximidad aritmética y pronóstico.
  "medidores.sintesis.titulo": "Qué dice el panel",
  "medidores.sintesis.cerca":
    "El aviso más cerca de activarse es {regla}: cumple {cumplidas} de {totales} condiciones. Falta que se mueva {indicador}.",
  "medidores.sintesis.cumplidas":
    "Ahora mismo se cumplen todas las condiciones de: {reglas}. Que el aviso se haya enviado depende además de si ya salió uno igual hace poco.",
  "medidores.sintesis.ninguna":
    "Ningún aviso está cerca de activarse con los datos de esta lectura.",
  "medidores.sintesis.noEvaluable":
    "Solo {evaluables} de {totales} avisos se pueden evaluar: a los demás les falta algún dato actualizado.",
  "medidores.sintesis.confianzaBaja":
    "Datos poco confiables ({outliers} de anuncios con precio raro): los avisos están desactivados en esta lectura.",
  "medidores.sintesis.aclaracion":
    "Describe qué tan cerca están los avisos de activarse con los datos de ahora. No es una predicción de lo que va a pasar.",

  // Bandas, para el detalle y la etiqueta accesible de la barra.
  "medidores.banda.muyBajo": "de los más bajos",
  "medidores.banda.bajo": "por debajo de lo normal",
  "medidores.banda.alto": "por encima de lo normal",
  "medidores.banda.muyAlto": "de los más altos",
  "medidores.banda.sinEscala": "sin comparación todavía",

  // Con qué se compara.
  "medidores.fuente.percentiles": "su propia historia",
  "medidores.fuente.ruleset": "los umbrales de aviso",

  "medidores.barraEtiqueta": "{etiqueta}: {valor}, {banda}, comparado con {fuente}.",

  // Estados degradados: todos explícitos, ninguno inventa.
  "medidores.sinAnalisis":
    "Sin lectura disponible: se muestran los valores, pero no su explicación.",
  "medidores.sinLectura":
    "Sin explicación en esta lectura: el motor no recalculó este medidor.",
  "medidores.escalaEnFormacion":
    "Aún comparando: {muestras} de {minimo} lecturas necesarias en {dias} días.",
  "medidores.oficialStale":
    "La tasa oficial con la que se calculó esta brecha lleva más de 6 horas sin actualizarse.",

  // -- descomposición --------------------------------------------------------
  "descomposicion.titulo": "Descomposición de la brecha",
  "descomposicion.bajada": "qué pierna mueve el número",
  "descomposicion.piernaOficial": "pierna oficial",
  "descomposicion.brecha": "brecha",
  "descomposicion.oficial30": "Oficial {dias} d",
  "descomposicion.p2p30": "P2P {dias} d",
  "descomposicion.neto": "Neto brecha",
  "descomposicion.comparativas": "Brecha hoy vs. historia",
  "descomposicion.hoy": "Hoy",
  "descomposicion.promedio7": "Promedio 7 días",
  "descomposicion.promedio30": "Promedio 30 días",
  "descomposicion.maximo90": "Máximo 90 días",
  // Lado del mercado en la comparativa.
  "descomposicion.ladoCompra": "Compra",
  "descomposicion.ladoVenta": "Venta",
  // Etiqueta de una ventana. Cuando la serie no la alcanza se rotula el tramo
  // REAL: es lo que impide llamar «30 días» a una media de 12.
  "descomposicion.media": "Promedio {dias} días",
  "descomposicion.mediaParcial": "Promedio {cubiertos} d (de {dias})",
  "descomposicion.maximo": "Máximo {dias} días",
  "descomposicion.maximoParcial": "Máximo {cubiertos} d (de {dias})",
  "descomposicion.sinHistoria": "Sin historia todavía para comparar.",
  "descomposicion.tramoParcial":
    "La serie de este lado empieza hace {cubiertos} días, así que las ventanas más largas se rotulan con su tramo real.",

  // Interpretación (claims del motor). El SPA solo redacta.
  "brechaHist.porEncima":
    "La brecha de {lado} está {delta} puntos por encima de su promedio de {dias} días.",
  "brechaHist.porDebajo":
    "La brecha de {lado} está {delta} puntos por debajo de su promedio de {dias} días.",
  "brechaHist.enLinea":
    "La brecha de {lado} está donde suele estar en los últimos {dias} días.",
  "brechaHist.maximo":
    "Es el valor más alto de {lado} en {dias} días.",
  "brechaHist.minimo":
    "Es el valor más bajo de {lado} en {dias} días.",
  "brechaHist.parcial":
    "De {lado} solo hay {dias} días de historia, todavía no bastan para comparar contra {ventana}.",


  // -- mapa de calor ---------------------------------------------------------
  "calor.titulo": "Mapa de calor de la brecha",
  "calor.bajada": "lado venta · últimos 14 días · bucket 1 h · VET",
  "calor.leyenda": "más tenue = brecha menor · más intenso = brecha mayor",
  "calor.celda": "{dia} {hora}:00 — {valor}",
  "calor.sinDato": "{dia} {hora}:00 — sin dato",

  // -- referencia P2P --------------------------------------------------------
  "p2p.titulo": "Referencia P2P USDT/VES",
  "p2p.compra": "Compra (buy)",
  "p2p.venta": "Venta (sell)",
  "p2p.detalle": "VWAP {vwap} · mejor {mejor}",
  "p2p.liquidez": "liquidez {valor} USDT",
  "p2p.confianzaBaja": "confianza baja",
  "p2p.sinLado": "Sin referencia fresca.",

  // -- microestructura -------------------------------------------------------
  "micro.titulo": "Microestructura P2P",
  "micro.ratio": "Ratio oferta/demanda",
  "micro.momentum": "Momentum bid 3 h",
  "micro.drenaje": "Drenaje oferta 6 h",
  "micro.merchants": "Merchants (buy)",
  "micro.outliers": "Outliers (buy)",
  "micro.spread": "Spread BUY↔SELL",
  "micro.outliersSell": "Outliers (sell)",
  "micro.sinDatos": "Sin microestructura todavía (llega con los snapshots P2P).",

  // -- tasa oficial ----------------------------------------------------------
  "oficial.titulo": "Tasa oficial BCV",
  "oficial.bajada": "fecha-valor {fecha} · capturada {cuando}",
  "oficial.sinDatos": "Sin tasas oficiales registradas todavía.",
  "oficial.stale": "stale",
  "oficial.vigente": "vigente {fecha}",

  // -- señales ---------------------------------------------------------------
  "senales.titulo": "Cronología de señales",
  "senales.bajada": "ruleset v1 · pulsa para abrir la evidencia",
  "senales.sinDatos":
    "Sin señales en las últimas horas — el mercado no ha disparado ninguna regla.",
  "senales.evidencia": "Evidencia · insumos al as_of",
  "senales.regla": "regla",
  "senales.abrir": "Ver evidencia de la señal",
  "senales.cerrar": "Cerrar evidencia",
  "senales.disparadaPor": "disparada por el evento {id}",
  "senales.calcVersion": "calc v{version}",

  // -- profundidad -----------------------------------------------------------
  "profundidad.titulo": "Profundidad P2P",
  "profundidad.bajada": "volumen acumulado por banda de 0,5 %",
  "profundidad.compra": "Compra (buy) — asks",
  "profundidad.venta": "Venta (sell) — bids",
  "profundidad.sinDatos": "Sin profundidad servida para este lado.",

  // -- análisis --------------------------------------------------------------
  "analisis.kicker": "Análisis comprensivo",
  "analisis.titulo":
    "Qué está haciendo el mercado del VES y qué tendría que romperse para que cambie",
  "analisis.bajada":
    "Los números de esta vista salen de los indicadores vigentes; la lectura, los escenarios y las probabilidades son de ejemplo — la plataforma no los calcula.",
  "analisis.escenariosTitulo": "Escenarios",
  "analisis.brecha72": "brecha a 72 h",
  "analisis.liquidezTitulo": "Presión de liquidez",
  "analisis.asks": "asks {valor} USDT",
  "analisis.bids": "bids {valor} USDT",
  "analisis.desbalance": "desbalance del libro",
  "analisis.sinLiquidez": "Sin liquidez servida por el gateway todavía.",
  "analisis.riesgosTitulo": "Riesgos que vigilar",

  // -- histórico -------------------------------------------------------------
  "historico.rango7": "7 días",
  "historico.rango30": "30 días",
  "historico.rango90": "90 días",
  "historico.moneda": "Moneda",
  "historico.indicador": "Indicador",
  "historico.bucket": "Bucket",
  "historico.limite": "rango máx. 90 días · REST /api/v1",
  "historico.tasaTitulo": "Tasa oficial {moneda}/VES por fecha-valor",
  "historico.serieTitulo": "{indicador} · bucket {bucket}",
  "historico.cancelar": "Cancelar",
  "historico.progreso": "{paginas} páginas · {items} filas",
  "historico.sinSerie": "Sin datos en el rango pedido.",
  "historico.rangoLabel": "{dias} días",

  // -- intradía --------------------------------------------------------------
  "intradia.titulo": "Intradía · día operativo VET",
  "intradia.grupoOficial": "Tasa oficial (BCV)",
  "intradia.grupoCompra": "P2P — compra (buy)",
  "intradia.grupoVenta": "P2P — venta (sell)",
  "intradia.grupoMicro": "Microestructura",

  // -- auth ------------------------------------------------------------------
  "footer.derechos": "© {anio} Higerotech. Todos los derechos reservados.",
  "footer.hechoCon1": "Hecho con",
  "footer.hechoCon2": "en Venezuela",

  // -- bloques de ejemplo del diseño (sin fuente en la plataforma) -----------
  "regimen.ejemploTitulo": "Lateral en compresión",
  "regimen.ejemploTexto":
    "Ni corrida ni desplome: la brecha lleva seis sesiones cerrándose mientras la oferta se repone. Vigila el ratio, no el precio.",
  "regimen.ejemploConfianza": "media",
  "micro.ratioNota": "insumo de las reglas de señal",
  "micro.outliersNota": "por encima de 30 % la confianza baja",
  "descomposicion.lectura":
    "La barra parte el precio P2P de compra en su pierna oficial y la brecha: es la misma cifra del titular, vista como reparto.",
  "descomposicion.sinPiernas":
    "Hacen falta la tasa oficial y el VWAP de compra para repartir el precio.",
  "calor.fallo": "No se pudo cargar la serie horaria de la brecha de venta.",
  "calor.sinSerie": "Sin serie horaria de venta en los últimos 14 días.",
  "analisis.escBase": "Base",
  "analisis.escBaseTexto":
    "La oficial sigue subiendo y el paralelo permanece anclado por el muro de bids.",
  "analisis.escBaseDisparador": "Se confirma si: el ratio se mantiene > 0,4",
  "analisis.escCorrida": "Corrida alcista",
  "analisis.escCorridaTexto":
    "La liquidez de asks vuelve a drenarse por debajo de −40 %/6 h y el momentum cruza +0,5 %.",
  "analisis.escCorridaDisparador": "Dispara la regla «arranque alcista»",
  "analisis.escConvergencia": "Convergencia forzada",
  "analisis.escConvergenciaTexto":
    "El BCV acelera la oficial con el paralelo plano.",
  "analisis.escConvergenciaDisparador":
    "Vigila official_rate_change_pct al alza",
  "analisis.liquidezLectura":
    "Asks {asks} USDT contra bids {bids} USDT. El lado con más volumen acumulado es el que sostiene el precio; cuando ese muro se vacía, la brecha se mueve.",
  "analisis.nivelAlto": "alto",
  "analisis.nivelMedio": "medio",
  "analisis.nivelBajo": "bajo",
  "analisis.riesgoLibro": "Libro concentrado",
  "analisis.riesgoLibroTexto":
    "Con una proporción alta de merchants en el lado buy, que un puñado de mesas se retire vacía la banda en minutos.",
  "analisis.riesgoLibroUmbral": "Alerta si merchants_pct > 80 %",
  "analisis.riesgoRancidez": "Rancidez de la oficial",
  "analisis.riesgoRancidezTexto":
    "La brecha se calcula contra la tasa del BCV: pasadas 6 h sin captura se sirve official_stale y las señales se degradan.",
  "analisis.riesgoRancidezUmbral":
    "El titular marca «oficial stale» cuando pasa",
  "analisis.riesgoUmbrales": "Umbrales sin recalibrar",
  "analisis.riesgoUmbralesTexto":
    "El ruleset v1 sale de un backtest corto. Tres reglas, una con una sola aparición histórica.",
  "analisis.riesgoUmbralesUmbral": "Pendiente recalibración HITL",
  "analisis.riesgoSnapshot": "Calidad del snapshot",
  "analisis.riesgoSnapshotTexto":
    "Con pocos outliers el filtro MAD/IQR no está trabajando duro: las señales no se suprimen por ruido.",
  "analisis.riesgoSnapshotUmbral": "Confianza: normal",
  "historico.controles": "Controles del histórico",
  "historico.error": "No se pudo cargar el histórico.",
  "historico.bucket5m": "5 min (rangos ≤ 7 días)",
  "historico.bucket1h": "1 hora",
  "historico.bucket1d": "1 día",
  "intradia.controles": "Controles del intradía",
  "intradia.monedaOficial": "Moneda de la tasa oficial",
  "intradia.bucket5m": "5 min",
  "intradia.actualizar": "Actualizar",
  "intradia.actualizado": "actualizado {hora} VET",
  "intradia.dia":
    "Día operativo (VET): {dia} — la Δ de cada panel se mide contra la apertura del día.",
  "intradia.sinDia": "Todavía no hay indicadores para el día operativo en curso.",
  "intradia.sinHoy": "Sin datos hoy.",
  "intradia.apertura": "apertura {valor}",
  "intradia.valor": "valor",
  "intradia.error": "No se pudo cargar el intradía.",
  "intradia.ladoCompra": "compra",
  "intradia.ladoVenta": "venta",
  "intradia.ladoSinLado": "sin lado",
  "intradia.descripcionPanel":
    "{etiqueta}: apertura {apertura}, último {ultimo}, variación {delta} ({pct})",

  // -- auth ------------------------------------------------------------------
  // Los cuatro estados del guard de sesión (`auth/RequireAuth.tsx`). Son
  // distintos a propósito: «verificando» es la comprobación silenciosa contra
  // la cookie SSO, «redirigiendo» es la salida hacia Universal Login. Decir lo
  // segundo mientras pasa lo primero era mentirle al usuario.
  "auth.verificando": "Verificando sesión…",
  "auth.redirigiendo": "Redirigiendo al inicio de sesión…",
  "auth.entrar": "Entrar",
  "auth.error": "No se pudo iniciar sesión",
} as const;

export type Clave = keyof typeof ES;

export const EN: Record<Clave, string> = {
  "app.titulo": "VES Market Watch",
  "nav.dashboard": "Dashboard",
  "nav.analisis": "Analysis",
  "nav.intradia": "Intraday",
  "nav.historico": "History",
  "nav.menu": "Menu",
  "nav.salir": "Sign out",
  "nav.tema.claro": "Light",
  "nav.tema.oscuro": "Dark",
  "nav.idioma": "Language",
  "nav.vistas": "Views",

  "estado.conectado": "WSS connected",
  "estado.conectando": "WSS connecting",
  "estado.reconectando": "WSS reconnecting",
  "estado.desconectado": "WSS disconnected",
  "estado.detenido": "WSS stopped",
  "estado.flujo": "stream /ws/v1 · {n} subscriptions",
  "estado.ultimoEvento": "last event {cuando}",
  "estado.sinEventos": "no events yet",
  "estado.version": "calc v{calc} · ruleset v1",
  "estado.versionSinDato": "calc — · ruleset v1",
  "estado.cuota": "quota {restante}/{limite}",

  "tiempo.ahora": "just now",
  "tiempo.segundos": "{n} s ago",
  "tiempo.minutos": "{n} min ago",
  "tiempo.horas": "{n} h ago",
  "tiempo.dias": "{n} days ago",

  "generico.sinDatos": "No data",
  "generico.cargando": "Loading…",
  "generico.reintentar": "Retry",
  "frescura.sinDatos": "no data",
  "frescura.rancio": "stale · {cuando}",
  "estado.gateway": "gateway {estado}",
  "estado.cuotaTitulo": "REST quota: {restante}/{limite} per minute",
  "generico.demo": "demo · no source",
  "generico.demoTitulo":
    "Sample block: the platform does not compute this yet. It does not come from the gateway.",

  "brecha.titulo": "BCV ↔ P2P gap (buy side)",
  "brecha.sobreOficial": "{valor} VES over the official rate",
  "brecha.sinSnapshot":
    "No recent P2P snapshot feeding the gap — it will show as soon as one arrives.",
  "brecha.sinIndicadores": "No indicators computed yet.",
  "brecha.oficialStale": "official stale",
  "brecha.spread": "Spread BUY↔SELL: {valor}",
  "brecha.oficialPar": "official USD/VES {valor}",
  "brecha.vwap": "P2P VWAP {valor}",
  "brecha.ventana24h": "24 h · both sides",
  "brecha.minMax": "min {min} · max {max}",
  "brecha.rangoCompra": "buy {min}–{max}",
  "brecha.rangoVenta": "sell {min}–{max}",
  "brecha.sinSerie": "No series for the last 24 h.",

  "regimen.titulo": "Today's reading",
  "regimen.confianza": "Confidence",
  "regimen.sinLectura":
    "No market reading in this revision: the indicators are shown without their interpretation.",
  "regimen.sinRegimen":
    "The state of the market cannot be named yet: one of the two figures that define it is missing.",
  "regimen.aclaracion":
    "Describes how the market stands right now, with the data in this reading. It is not a prediction nor a recommendation.",

  "regimen.subiendo_ampliando": "Rising, with the gap widening",
  "regimen.subiendo_estable": "Rising, with the gap holding",
  "regimen.subiendo_comprimiendo": "Rising, with the gap closing",
  "regimen.lateral_ampliando": "Sideways, with the gap widening",
  "regimen.lateral_estable": "Sideways and unchanged",
  "regimen.lateral_comprimiendo": "Compressing sideways",
  "regimen.bajando_ampliando": "Falling, with the gap widening",
  "regimen.bajando_estable": "Falling, with the gap holding",
  "regimen.bajando_comprimiendo": "Falling, with the gap closing",

  "regimen.claim.brecha.ampliando":
    "The distance between the street price and the official rate has widened {delta} points over the last {horas} hours.",
  "regimen.claim.brecha.comprimiendo":
    "The distance between the street price and the official rate has closed {delta} points over the last {horas} hours.",
  "regimen.claim.brecha.estable":
    "The distance between the street price and the official rate has barely moved over the last {horas} hours.",
  "regimen.claim.atribucion.paralelo":
    "The move came from the street price: the official rate did not change in that time.",
  "regimen.claim.atribucion.oficial":
    "The move came from the official rate, not from the street price.",
  "regimen.claim.atribucion.ambos":
    "Both sides moved at once: the official rate and the street price.",
  "regimen.claim.banda.very_low":
    "If you have to buy, the street is today among the cheapest against the official rate in {dias} days.",
  "regimen.claim.banda.very_high":
    "If you have to buy, the street is today among the dearest against the official rate in {dias} days.",
  "regimen.claim.reglaCerca":
    "The alert closest to firing is {regla}: {cumplidas} of {totales} conditions met.",
  "regimen.claim.confianzaBaja":
    "Too many listings with odd prices in this reading: alerts are switched off and the rest is to be taken with care.",
  "regimen.claim.oficialRancia":
    "The official rate has not been updated in over 6 hours, so which side moved the distance cannot be told.",

  "regimen.chip.frescos": "Fresh data · {cuando}",
  "regimen.chip.reglas": "{n} rules fired",
  "regimen.chip.cerca": "{n} gauges near their threshold",
  "regimen.chip.cercaUno": "1 gauge near its threshold",
  "regimen.chip.confianzaNormal": "Normal confidence · {outliers} odd prices",
  "regimen.chip.confianzaBaja": "Low confidence · {outliers} odd prices",

  // Traducción, no reescritura: mismos marcadores y misma afirmación que ES, o
  // `tests/unit/i18n.test.tsx` falla.
  "medidores.titulo": "Instrument panel",
  "medidores.bajada":
    "Each gauge compared with its own 90-day history: what the number means and how close it is to triggering an alert, on every reading.",
  "medidores.sinValor": "no current value",
  "medidores.brecha": "Gap buy",

  "medidores.def.brecha":
    "How much more expensive the dollar is on the P2P market than at the BCV official rate. If the gap is 13 %, for every 100 bolívares it would cost officially, on the street you pay 113.",
  "medidores.def.spread":
    "The difference between what you pay when buying and what you get when selling. At 0.5 %, buying and selling right away costs you half a percent. A negative value means something odd: selling pays more than buying costs.",
  "medidores.def.ratio":
    "Compares how many dollars are up for sale with how many are wanted for purchase. Below 1 there are more people wanting to buy than dollars available; above 1, dollars are plentiful and buyers are scarce.",
  "medidores.def.momentum":
    "How much the price has risen or fallen over the last three hours, as a percentage. Positive means it is going up; negative, that it is coming down.",
  "medidores.def.drenaje":
    "How much the amount of dollars up for sale has changed over six hours. Negative means they are running out; positive, that more are coming in.",
  "medidores.def.outliers":
    "What share of the listings was discarded for having an absurd price. Above 30 % the data behind this reading stops being reliable and the system sends no alerts.",

  "medidores.lectura.brecha.muyBajo":
    "The gap is among the narrowest of the last 90 days: the street price has moved closer to the official one.",
  "medidores.lectura.brecha.bajo":
    "The gap is narrower than usual: buying outside the official rate costs less than it normally does.",
  "medidores.lectura.brecha.alto":
    "The gap is wider than usual: buying outside the official rate costs more than it normally does.",
  "medidores.lectura.brecha.muyAlto":
    "The gap is among the widest of the last 90 days: the street price has moved far away from the official one.",
  "medidores.lectura.brecha.sinEscala":
    "Not enough history yet to say whether this gap is high or low compared with normal.",

  "medidores.lectura.spread.muyBajo":
    "The difference between buying and selling is among the smallest of the last 90 days: going in and out is cheap.",
  "medidores.lectura.spread.bajo":
    "Buying and selling are closer than usual: the round trip costs little.",
  "medidores.lectura.spread.alto":
    "Buying and selling are further apart than usual: the round trip costs more.",
  "medidores.lectura.spread.muyAlto":
    "The difference between buying and selling is among the largest of the last 90 days: going in and out is expensive.",
  "medidores.lectura.spread.sinEscala":
    "Not enough history yet to say whether this difference is large or small compared with normal.",

  "medidores.lectura.ratio.muyBajo":
    "Very few dollars left for sale against the people wanting to buy: among the scarcest of the last 90 days.",
  "medidores.lectura.ratio.bajo":
    "Fewer dollars for sale than usual for the people wanting to buy.",
  "medidores.lectura.ratio.alto":
    "More dollars for sale than usual: they are not scarce.",
  "medidores.lectura.ratio.muyAlto":
    "Far more dollars for sale than buyers: among the most plentiful of the last 90 days.",
  "medidores.lectura.ratio.sinEscala":
    "Not enough history yet to say whether this ratio is high or low compared with normal.",

  "medidores.lectura.momentum.muyBajo":
    "The price has been falling with a force barely seen in the last 90 days.",
  "medidores.lectura.momentum.bajo":
    "The price has been weak or slipping over the last few hours.",
  "medidores.lectura.momentum.alto":
    "The price has been rising more than usual over the last few hours.",
  "medidores.lectura.momentum.muyAlto":
    "The price has been rising with a force barely seen in the last 90 days.",
  "medidores.lectura.momentum.sinEscala":
    "Not enough history yet to say whether this move is strong or weak compared with normal.",

  "medidores.lectura.drenaje.muyBajo":
    "Dollars for sale are running out at a speed barely seen in the last 90 days.",
  "medidores.lectura.drenaje.bajo":
    "Dollars for sale are running out faster than usual.",
  "medidores.lectura.drenaje.alto":
    "More dollars for sale are coming in: the opposite of a run.",
  "medidores.lectura.drenaje.muyAlto":
    "Dollars for sale are coming in at a rate uncommon in the last 90 days.",
  "medidores.lectura.drenaje.sinEscala":
    "Not enough history yet to say whether this change is large or small compared with normal.",

  "medidores.lectura.outliers.muyBajo":
    "Almost no listings with odd prices: the reading rests on a clean market.",
  "medidores.lectura.outliers.bajo":
    "Few listings with odd prices: the reading is reliable.",
  "medidores.lectura.outliers.alto": "More listings with odd prices than usual.",
  "medidores.lectura.outliers.muyAlto":
    "Many listings with odd prices, among the highest of the last 90 days: the reading is nearing the point where it stops being reliable.",
  "medidores.lectura.outliers.sinEscala":
    "Not enough history to compare yet; it is checked against the 30 % limit beyond which the reading stops being reliable.",

  "medidores.escala.percentiles": "low {p10} · normal {p50} · high {p90} · {dias} d",
  "medidores.escala.ruleset":
    "compared against alert thresholds · {muestras}/{minimo} readings in {dias} d",
  "medidores.escala.explicacion":
    "“Low” is the value only fallen below 1 time in 10; “normal” is the midpoint; “high”, the one only exceeded 1 time in 10. Compared with the last {dias} days.",

  "medidores.regla.porEncima":
    "{tipo}: the system alerts when it goes above {umbral}. It is {distancia} away.",
  "medidores.regla.porDebajo":
    "{tipo}: the system alerts when it drops below {umbral}. It is {distancia} away.",
  "medidores.regla.cumplida":
    "{tipo}: it is already on the side the system watches ({umbral}).",
  "medidores.regla.sinReglas":
    "This gauge does not trigger any alert on its own; it provides context.",

  "medidores.detalle.abrir": "Show explanation",
  "medidores.detalle.cerrar": "Hide explanation",
  "medidores.detalle.definicionTitulo": "What it measures",
  "medidores.detalle.lecturaTitulo": "What it says now",
  "medidores.detalle.reglasTitulo": "Alerts that depend on this gauge",

  "medidores.sintesis.titulo": "What the panel says",
  "medidores.sintesis.cerca":
    "The alert closest to firing is {regla}: {cumplidas} of {totales} conditions met. It is waiting on {indicador}.",
  "medidores.sintesis.cumplidas":
    "All conditions are currently met for: {reglas}. Whether the alert was actually sent also depends on whether an identical one went out recently.",
  "medidores.sintesis.ninguna":
    "No alert is close to firing with the data in this reading.",
  "medidores.sintesis.noEvaluable":
    "Only {evaluables} of {totales} alerts can be evaluated: the rest are missing up-to-date data.",
  "medidores.sintesis.confianzaBaja":
    "Unreliable data ({outliers} of listings with odd prices): alerts are switched off for this reading.",
  "medidores.sintesis.aclaracion":
    "Describes how close the alerts are to firing with current data. It is not a prediction of what will happen.",

  "medidores.banda.muyBajo": "among the lowest",
  "medidores.banda.bajo": "below normal",
  "medidores.banda.alto": "above normal",
  "medidores.banda.muyAlto": "among the highest",
  "medidores.banda.sinEscala": "not comparable yet",

  "medidores.fuente.percentiles": "its own history",
  "medidores.fuente.ruleset": "the alert thresholds",

  "medidores.barraEtiqueta": "{etiqueta}: {valor}, {banda}, compared against {fuente}.",

  "medidores.sinAnalisis":
    "No reading available: values are shown without their explanation.",
  "medidores.sinLectura":
    "No explanation in this reading: the engine did not recalculate this gauge.",
  "medidores.escalaEnFormacion":
    "Still building the comparison: {muestras} of {minimo} readings needed over {dias} days.",
  "medidores.oficialStale":
    "The official rate used for this gap has not been updated in over 6 hours.",

  "descomposicion.titulo": "Gap decomposition",
  "descomposicion.bajada": "which leg moves the number",
  "descomposicion.piernaOficial": "official leg",
  "descomposicion.brecha": "gap",
  "descomposicion.oficial30": "{dias} d official",
  "descomposicion.p2p30": "{dias} d P2P",
  "descomposicion.neto": "Net gap",
  "descomposicion.comparativas": "Gap today vs. history",
  "descomposicion.hoy": "Today",
  "descomposicion.promedio7": "7-day average",
  "descomposicion.promedio30": "30-day average",
  "descomposicion.maximo90": "90-day maximum",
  // Market side in the comparison.
  "descomposicion.ladoCompra": "Buy",
  "descomposicion.ladoVenta": "Sell",
  "descomposicion.media": "{dias}-day average",
  "descomposicion.mediaParcial": "{cubiertos}-day average (of {dias})",
  "descomposicion.maximo": "{dias}-day maximum",
  "descomposicion.maximoParcial": "{cubiertos}-day maximum (of {dias})",
  "descomposicion.sinHistoria": "No history to compare against yet.",
  "descomposicion.tramoParcial":
    "This side's series starts {cubiertos} days ago, so longer windows are labelled with their real span.",

  "brechaHist.porEncima":
    "The {lado} gap is {delta} points above its {dias}-day average.",
  "brechaHist.porDebajo":
    "The {lado} gap is {delta} points below its {dias}-day average.",
  "brechaHist.enLinea":
    "The {lado} gap is where it usually sits over the last {dias} days.",
  "brechaHist.maximo":
    "It is the highest {lado} value in {dias} days.",
  "brechaHist.minimo":
    "It is the lowest {lado} value in {dias} days.",
  "brechaHist.parcial":
    "There are only {dias} days of {lado} history, not enough yet to compare against {ventana}.",


  "calor.titulo": "Gap heatmap",
  "calor.bajada": "sell side · last 14 days · hourly bucket · VET",
  "calor.leyenda": "fainter = narrower gap · stronger = wider gap",
  "calor.celda": "{dia} {hora}:00 — {valor}",
  "calor.sinDato": "{dia} {hora}:00 — no data",

  "p2p.titulo": "P2P reference USDT/VES",
  "p2p.compra": "Buy",
  "p2p.venta": "Sell",
  "p2p.detalle": "VWAP {vwap} · best {mejor}",
  "p2p.liquidez": "liquidity {valor} USDT",
  "p2p.confianzaBaja": "low confidence",
  "p2p.sinLado": "No fresh reference.",

  "micro.titulo": "P2P microstructure",
  "micro.ratio": "Supply/demand ratio",
  "micro.momentum": "Bid momentum 3 h",
  "micro.drenaje": "Supply drain 6 h",
  "micro.merchants": "Merchants (buy)",
  "micro.outliers": "Outliers (buy)",
  "micro.spread": "Spread BUY↔SELL",
  "micro.outliersSell": "Outliers (sell)",
  "micro.sinDatos": "No microstructure yet (it arrives with the P2P snapshots).",

  "oficial.titulo": "Official BCV rate",
  "oficial.bajada": "value date {fecha} · captured {cuando}",
  "oficial.sinDatos": "No official rates recorded yet.",
  "oficial.stale": "stale",
  "oficial.vigente": "value date {fecha}",

  "senales.titulo": "Signal timeline",
  "senales.bajada": "ruleset v1 · click to open the evidence",
  "senales.sinDatos":
    "No signals in the last hours — the market has not fired any rule.",
  "senales.evidencia": "Evidence · inputs at as_of",
  "senales.regla": "rule",
  "senales.abrir": "See the signal evidence",
  "senales.cerrar": "Close evidence",
  "senales.disparadaPor": "triggered by event {id}",
  "senales.calcVersion": "calc v{version}",

  "profundidad.titulo": "P2P depth",
  "profundidad.bajada": "cumulative volume per 0.5 % band",
  "profundidad.compra": "Buy — asks",
  "profundidad.venta": "Sell — bids",
  "profundidad.sinDatos": "No depth served for this side.",

  "analisis.kicker": "Comprehensive analysis",
  "analisis.titulo":
    "What the VES market is doing, and what would have to break for it to change",
  "analisis.bajada":
    "The numbers in this view come from the current indicators; the reading, the scenarios and the probabilities are samples — the platform does not compute them.",
  "analisis.escenariosTitulo": "Scenarios",
  "analisis.brecha72": "gap in 72 h",
  "analisis.liquidezTitulo": "Liquidity pressure",
  "analisis.asks": "asks {valor} USDT",
  "analisis.bids": "bids {valor} USDT",
  "analisis.desbalance": "book imbalance",
  "analisis.sinLiquidez": "No liquidity served by the gateway yet.",
  "analisis.riesgosTitulo": "Risks to watch",

  "historico.rango7": "7 days",
  "historico.rango30": "30 days",
  "historico.rango90": "90 days",
  "historico.moneda": "Currency",
  "historico.indicador": "Indicator",
  "historico.bucket": "Bucket",
  "historico.limite": "max range 90 days · REST /api/v1",
  "historico.tasaTitulo": "Official {moneda}/VES by value date",
  "historico.serieTitulo": "{indicador} · bucket {bucket}",
  "historico.cancelar": "Cancel",
  "historico.progreso": "{paginas} pages · {items} rows",
  "historico.sinSerie": "No data in the requested range.",
  "historico.rangoLabel": "{dias} days",

  "intradia.titulo": "Intraday · VET operating day",
  "intradia.grupoOficial": "Official rate (BCV)",
  "intradia.grupoCompra": "P2P — buy",
  "intradia.grupoVenta": "P2P — sell",
  "intradia.grupoMicro": "Microstructure",

  "footer.derechos": "© {anio} Higerotech. All rights reserved.",
  "footer.hechoCon1": "Made with",
  "footer.hechoCon2": "in Venezuela",
  "regimen.ejemploTitulo": "Compressing sideways",
  "regimen.ejemploTexto":
    "Neither a run nor a flush: the gap has been narrowing for six sessions while supply rebuilds. Watch the ratio, not the price.",
  "regimen.ejemploConfianza": "medium",
  "micro.ratioNota": "input of the signal rules",
  "micro.outliersNota": "above 30 % confidence drops",
  "descomposicion.lectura":
    "The bar splits the P2P buy price into its official leg and the gap: the same headline number, seen as a share.",
  "descomposicion.sinPiernas":
    "The official rate and the buy VWAP are needed to split the price.",
  "calor.fallo": "Could not load the hourly sell gap series.",
  "calor.sinSerie": "No hourly sell series in the last 14 days.",
  "analisis.escBase": "Base",
  "analisis.escBaseTexto":
    "The official rate keeps climbing and the parallel stays anchored by the bid wall.",
  "analisis.escBaseDisparador": "Confirms if: ratio stays > 0.4",
  "analisis.escCorrida": "Bullish run",
  "analisis.escCorridaTexto":
    "Ask liquidity drains again below −40 %/6 h and momentum crosses +0.5 %.",
  "analisis.escCorridaDisparador": "Fires the bullish start rule",
  "analisis.escConvergencia": "Forced convergence",
  "analisis.escConvergenciaTexto":
    "The BCV accelerates the official rate while the parallel stays flat.",
  "analisis.escConvergenciaDisparador": "Watch official_rate_change_pct rising",
  "analisis.liquidezLectura":
    "Asks {asks} USDT against bids {bids} USDT. The side with more cumulative volume is the one holding the price; when that wall empties, the gap moves.",
  "analisis.nivelAlto": "high",
  "analisis.nivelMedio": "medium",
  "analisis.nivelBajo": "low",
  "analisis.riesgoLibro": "Concentrated book",
  "analisis.riesgoLibroTexto":
    "With a high share of merchants on the buy side, a handful of desks withdrawing empties the band in minutes.",
  "analisis.riesgoLibroUmbral": "Alert if merchants_pct > 80 %",
  "analisis.riesgoRancidez": "Official rate staleness",
  "analisis.riesgoRancidezTexto":
    "The gap is computed against the BCV rate: over 6 h without capture it is served as official_stale and the signals degrade.",
  "analisis.riesgoRancidezUmbral":
    "The headline flags official stale when it happens",
  "analisis.riesgoUmbrales": "Uncalibrated thresholds",
  "analisis.riesgoUmbralesTexto":
    "The v1 ruleset comes from a short backtest. Three rules, one of them with a single historical appearance.",
  "analisis.riesgoUmbralesUmbral": "Pending HITL recalibration",
  "analisis.riesgoSnapshot": "Snapshot quality",
  "analisis.riesgoSnapshotTexto":
    "With few outliers the MAD/IQR filter is not working hard: signals are not suppressed by noise.",
  "analisis.riesgoSnapshotUmbral": "Confidence: normal",
  "historico.controles": "History controls",
  "historico.error": "Could not load the history.",
  "historico.bucket5m": "5 min (ranges <= 7 days)",
  "historico.bucket1h": "1 hour",
  "historico.bucket1d": "1 day",
  "intradia.controles": "Intraday controls",
  "intradia.monedaOficial": "Official rate currency",
  "intradia.bucket5m": "5 min",
  "intradia.actualizar": "Refresh",
  "intradia.actualizado": "updated {hora} VET",
  "intradia.dia":
    "Operating day (VET): {dia} — each panel's change is measured against the day's open.",
  "intradia.sinDia": "No indicators for the current operating day yet.",
  "intradia.sinHoy": "No data today.",
  "intradia.apertura": "open {valor}",
  "intradia.valor": "value",
  "intradia.error": "Could not load the intraday view.",
  "intradia.ladoCompra": "buy",
  "intradia.ladoVenta": "sell",
  "intradia.ladoSinLado": "no side",
  "intradia.descripcionPanel":
    "{etiqueta}: open {apertura}, last {ultimo}, change {delta} ({pct})",
  "auth.verificando": "Checking session…",
  "auth.redirigiendo": "Redirecting to sign in…",
  "auth.entrar": "Sign in",
  "auth.error": "Could not sign in",
};

export const DICCIONARIOS: Record<Idioma, Record<Clave, string>> = {
  es: ES,
  en: EN,
};

/** Sustituye `{nombre}` por su valor; deja el marcador si falta el parámetro. */
export function interpolar(
  plantilla: string,
  params?: Record<string, string | number>,
): string {
  if (params === undefined) {
    return plantilla;
  }
  return plantilla.replace(/\{(\w+)\}/g, (marcador, nombre: string) =>
    nombre in params ? String(params[nombre]) : marcador,
  );
}
