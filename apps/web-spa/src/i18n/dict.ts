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
  "brecha.ventana24h": "24 h · brecha lado buy",
  "brecha.minMax": "mín {min} · máx {max}",
  "brecha.sinSerie": "Sin serie de las últimas 24 h.",

  // -- régimen (demo) --------------------------------------------------------
  "regimen.titulo": "Régimen de mercado",
  "regimen.confianza": "Confianza",

  // -- medidores -------------------------------------------------------------
  "medidores.titulo": "Panel de instrumentos",
  "medidores.bajada":
    "Cada medidor con su valor vigente. El percentil de backtest y el umbral son de ejemplo: la plataforma no expone el ruleset ni sus percentiles.",
  "medidores.sinValor": "sin valor vigente",

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

  // -- mapa de calor ---------------------------------------------------------
  "calor.titulo": "Mapa de calor de la brecha",
  "calor.bajada": "últimos 14 días · bucket 1 h · VET",
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
  "medidores.brecha": "Brecha buy",
  "medidores.brechaEscala": "p12 · 90 d",
  "medidores.brechaNota": "Tercio bajo del rango de 90 días.",
  "medidores.spreadEscala": "p10 0,55 · p90 2,13",
  "medidores.spreadNota":
    "Cerca del p10: comprimido, sin llegar al umbral de «techo».",
  "medidores.ratioEscala": "p50 0,47",
  "medidores.ratioNota": "Por encima de la mediana: la oferta no escasea.",
  "medidores.momentumEscala": "> 0,5 / > 1,5",
  "medidores.momentumNota": "Plano. Lejos de las dos reglas alcistas.",
  "medidores.drenajeEscala": "< −40 %",
  "medidores.drenajeNota":
    "Oferta reponiéndose: signo contrario al de una corrida.",
  "medidores.outliersEscala": "confianza baja > 30 %",
  "medidores.outliersNota2": "Snapshot limpio: las señales no se suprimen.",
  "descomposicion.lectura":
    "La barra parte el precio P2P de compra en su pierna oficial y la brecha: es la misma cifra del titular, vista como reparto.",
  "descomposicion.sinPiernas":
    "Hacen falta la tasa oficial y el VWAP de compra para repartir el precio.",
  "calor.fallo": "No se pudo cargar la serie horaria de la brecha.",
  "calor.sinSerie": "Sin serie horaria en los últimos 14 días.",
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
  "auth.verificando": "Verificando sesión…",
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
  "brecha.ventana24h": "24 h · buy-side gap",
  "brecha.minMax": "min {min} · max {max}",
  "brecha.sinSerie": "No series for the last 24 h.",

  "regimen.titulo": "Market regime",
  "regimen.confianza": "Confidence",

  "medidores.titulo": "Instrument panel",
  "medidores.bajada":
    "Each gauge with its current value. The backtest percentile and threshold are samples: the platform exposes neither the ruleset nor its percentiles.",
  "medidores.sinValor": "no current value",

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

  "calor.titulo": "Gap heatmap",
  "calor.bajada": "last 14 days · hourly bucket · VET",
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
  "medidores.brecha": "Gap buy",
  "medidores.brechaEscala": "p12 · 90 d",
  "medidores.brechaNota": "Lowest third of the 90-day range.",
  "medidores.spreadEscala": "p10 0.55 · p90 2.13",
  "medidores.spreadNota":
    "Close to the p10: compressed but not at the top threshold.",
  "medidores.ratioEscala": "p50 0.47",
  "medidores.ratioNota": "Above the median: supply is not scarce.",
  "medidores.momentumEscala": "> 0.5 / > 1.5",
  "medidores.momentumNota": "Flat. Far from both bullish rules.",
  "medidores.drenajeEscala": "< −40 %",
  "medidores.drenajeNota": "Supply rebuilding — the opposite sign of a run.",
  "medidores.outliersEscala": "low confidence > 30 %",
  "medidores.outliersNota2": "Clean snapshot: signals are not suppressed.",
  "descomposicion.lectura":
    "The bar splits the P2P buy price into its official leg and the gap: the same headline number, seen as a share.",
  "descomposicion.sinPiernas":
    "The official rate and the buy VWAP are needed to split the price.",
  "calor.fallo": "Could not load the hourly gap series.",
  "calor.sinSerie": "No hourly series in the last 14 days.",
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
