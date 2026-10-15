/**
 * Diccionario del portal (ES canónico, EN traducido).
 *
 * `EN` está tipado sobre las claves de `ES`: una cadena que falte en inglés no
 * compila. Los valores admiten `{nombre}`, que `t()` sustituye. Algunas llevan
 * marcas `*…*` para el tramo resaltado de un titular (ver `Resaltado`).
 *
 * Los textos salen del diseño `Criterio Público.dc.html`. Los nombres de
 * indicadores y reglas son vocabulario del contrato y no se traducen.
 */

import type { Idioma } from "@criterio/ui";

export const ES = {
  // -- marco ------------------------------------------------------------------
  "app.nombre": "Criterio",
  "nav.producto": "Producto",
  "nav.dashboard": "Dashboard",
  "nav.intradia": "Intradía",
  "nav.historico": "Histórico",
  "nav.apis": "APIs",
  "nav.precios": "Precios",
  "nav.estado": "Estado",
  "nav.menu": "Menú",
  "nav.cerrarMenu": "Cerrar menú",
  "nav.principal": "Secciones",
  "nav.tema.claro": "Claro",
  "nav.tema.oscuro": "Oscuro",
  "nav.idioma": "Idioma",
  "nav.acceso": "Acceso gratis",

  "vivo.etiqueta": "En vivo",
  "vivo.actualizado": "actualizado {cuando}",
  "vivo.conectando": "Conectando",
  "vivo.sinConexion": "Sin conexión",
  "vivo.publico": "datos públicos, sin cuenta",
  "vivo.datosAl": "datos al {fecha}",
  "vivo.version": "calc v{calc} · ruleset v{ruleset}",

  "tiempo.ahora": "ahora",
  "tiempo.segundos": "hace {n} s",
  "tiempo.minutos": "hace {n} min",
  "tiempo.horas": "hace {n} h",
  "tiempo.dias": "hace {n} días",

  "pie.derechos": "© 2026 Higerotech. Todos los derechos reservados.",
  "pie.hecho": "Hecho con *♥* en Venezuela",

  "comun.sinDatos": "Sin datos todavía",
  "comun.sinDatosDetalle":
    "El panel se llena en cuanto el gateway responde. Si tarda, mira la página de Estado.",
  "comun.verDashboard": "Verlo en el dashboard",

  // -- landing: hero -----------------------------------------------------------
  "hero.etiqueta": "Criterio · datos del mercado VES",
  "hero.titulo": "La brecha cambiaria, medida y *servida por API*",
  "hero.texto":
    "Tasa oficial del BCV, libro P2P USDT/VES y 18 indicadores de microestructura, recalculados cada pocos segundos. Gratis en el portal; por REST y WSS para tu sistema.",
  "hero.ctaDashboard": "Ver el dashboard en vivo",
  "hero.ctaApis": "Explorar las APIs",
  "hero.tarjeta": "En vivo · brecha BCV ↔ P2P (buy)",
  "hero.sobreOficial": "{abs} VES sobre la oficial",
  "hero.vs7": "{delta} pts vs. media de 7 días",
  "hero.oficial": "Oficial USD/VES",
  "hero.vwap": "P2P VWAP buy",
  "hero.actualizado": "Actualizado",
  "hero.sparkline": "Brecha buy de las últimas 24 horas",

  // -- landing: promesas -------------------------------------------------------
  "promesas.etiqueta": "Lo que el dato demuestra",
  "promesas.titulo": "Cuatro promesas, *verificables en vivo*",
  "promesas.texto":
    "Cada bloque es un panel real del dashboard con la lectura de ahora mismo. Lo que ves aquí es lo que recibe tu sistema.",

  "procedencia.numero": "01 · Procedencia",
  "procedencia.titulo": "Cada número dice de dónde viene y cuándo",
  "procedencia.texto":
    "Hora de captura, edad del snapshot y porcentaje de outliers viajan con cada lectura. Si la tasa del BCV deja de estar vigente, se sirve como official_stale y las señales se suprimen: nunca un dato rancio disfrazado de fresco.",
  "procedencia.panel": "En vivo · calidad del dato",
  "procedencia.snapshot": "Snapshot P2P",
  "procedencia.oficial": "Tasa oficial BCV",
  "procedencia.vigente": "vigente",
  "procedencia.rancia": "no vigente",
  "procedencia.outliers": "Outliers descartados",
  "procedencia.merchants": "Cobertura merchants",
  "procedencia.delVolumen": "{pct} del volumen",
  "procedencia.motor": "Motor",

  "anticipacion.numero": "02 · Anticipación",
  "anticipacion.titulo": "Te dice qué falta para que el mercado cambie de pie",
  "anticipacion.texto":
    "Un ruleset versionado mide cada condición contra su umbral. No recibes una alerta de la nada: la ves venir condición por condición, y cada señal guarda qué hizo la brecha después.",
  "anticipacion.panel": "En vivo · distancia al disparo",
  "anticipacion.conteo": "{cumplidas} de {totales} condiciones",
  "anticipacion.necesita": "necesita {op} {umbral}",
  "anticipacion.cumple": "cumple",
  "anticipacion.falta": "falta {d}",
  "anticipacion.sinValor": "sin valor",
  "anticipacion.todas": "Se cumplen todas las condiciones: la regla dispara.",
  "anticipacion.bloquea": "La que más lejos está de su umbral es {indicador}.",
  "anticipacion.noEvaluable":
    "Ahora mismo no se evalúa: la calidad del snapshot no alcanza para emitir señales.",

  "contexto.numero": "03 · Contexto",
  "contexto.titulo": "Escala de 90 días, no un número suelto",
  "contexto.texto":
    "18 series de microestructura, cada una con su percentil y su umbral. Sabes si hoy es caro o barato antes de decidir.",
  "contexto.percentil": "p{p} · 90 d",
  "contexto.cumple": "Cumple una condición de {regla}",
  "contexto.distancia": "A {d} del umbral de {regla}",
  "contexto.sinRegla": "Ninguna regla lo usa ahora mismo.",

  "banda.very_low": "Muy bajo",
  "banda.low": "Bajo",
  "banda.high": "Alto",
  "banda.very_high": "Muy alto",
  "banda.unscaled": "Sin escala",

  "medidor.p2p_spread_pct": "Spread BUY↔SELL",
  "medidor.p2p_ratio_oferta_demanda": "Ratio oferta/demanda",
  "medidor.p2p_momentum_bid_3h_pct": "Momentum bid 3 h",

  "explicacion.numero": "04 · Explicación",
  "explicacion.titulo": "Dice qué pierna mueve la brecha",
  "explicacion.texto":
    "La misma brecha significa cosas distintas si sube la oficial o si cae el paralelo. Criterio la descompone para que tu decisión no se apoye en una coincidencia.",
  "explicacion.oficial": "Oficial USD/VES {v}",
  "explicacion.vwap": "P2P buy VWAP {v}",
  "explicacion.piernaOficial": "pierna oficial",
  "explicacion.brecha": "brecha",
  "explicacion.oficialH": "Oficial {h} h",
  "explicacion.paraleloH": "P2P {h} h",
  "explicacion.neto": "Neto brecha",
  "explicacion.oficialMueve":
    "En las últimas {h} h, el {pct} del movimiento viene de la oficial: la brecha se mueve porque se mueve el BCV.",
  "explicacion.paraleloMueve":
    "En las últimas {h} h, el movimiento viene sobre todo del paralelo: la brecha se mueve porque se mueve el P2P.",
  "explicacion.ambasMueven": "En las últimas {h} h se movieron las dos piernas a la vez.",
  "explicacion.quieta": "En las últimas {h} h ninguna pierna se movió lo bastante para atribuirle la brecha.",

  // -- landing: casos y CTA -----------------------------------------------------
  "casos.etiqueta": "Casos de uso",
  "casos.titulo": "Quién decide *con la brecha*",
  "casos.fintech.quien": "Fintechs y pasarelas de pago",
  "casos.fintech.t": "Cotiza con la tasa del momento, no con la del cierre de ayer",
  "casos.fintech.d":
    "El snapshot P2P llega por WSS cada pocos segundos; tu motor de conversión no tiene que adivinar.",
  "casos.comercio.quien": "Comercios y retail",
  "casos.comercio.t": "Reajusta precios cuando la brecha se mueve de verdad",
  "casos.comercio.d":
    "Las señales avisan cuando el mercado cambia de pie; el resto de los días, no tocas la lista de precios.",
  "casos.tesoreria.quien": "Tesorerías corporativas",
  "casos.tesoreria.t": "Convierte cuando la brecha está en su tercio barato",
  "casos.tesoreria.d":
    "El percentil de 90 días te dice si hoy es caro o barato comprar fuera de la oficial, con la serie para auditarlo.",
  "casos.dev.quien": "Desarrolladores independientes",
  "casos.dev.t": "Un contrato que no te sorprende",
  "casos.dev.d":
    "Decimales como string exacto, errores RFC 7807, paginación obligatoria y límites en las cabeceras X-RateLimit-*.",
  "casos.medios.quien": "Medios y analistas",
  "casos.medios.t": "Cita una cifra con su procedencia",
  "casos.medios.d":
    "Cada lectura trae hora de captura, versión del motor y porcentaje de outliers: lo que necesitas para publicarla.",

  "cta.titulo": "Convierte la brecha en *una variable de tu sistema*",
  "cta.texto": "El portal es gratis. Para REST y WSS, dimensionamos el plan contigo.",
  "cta.niveles": "Ver niveles",

  // -- páginas por llegar ----------------------------------------------------------
  "pronto.etiqueta": "En construcción",
  "pronto.texto":
    "Esta sección del portal llega en las próximas versiones. Mientras tanto, la portada ya muestra los paneles del dashboard en vivo.",
  "pronto.volver": "Volver a la portada",
  "dashboard.titulo": "Dashboard público",
  "dashboard.desc": "La lectura de hoy, los seis medidores, la descomposición de la brecha y la cronología de señales, en vivo y sin cuenta.",
  "intradia.titulo": "Intradía",
  "intradia.desc": "La sesión de hoy, minuto a minuto, con acceso Comunidad gratuito por email.",
  "historico.titulo": "Histórico",
  "historico.desc": "La brecha y sus indicadores en ventanas de 7, 30 y 90 días, con los episodios comparables.",
  "apis.titulo": "APIs",
  "apis.desc": "REST y WSS con OAuth2: los mismos números del portal, en tu sistema. Contrato OpenAPI y AsyncAPI.",
  "precios.titulo": "Precios",
  "precios.desc": "El portal es gratis. Comunidad añade Intradía e Histórico con tu email. Empresa trae REST y WSS con cuota propia.",
  "estado.titulo": "Estado",
  "estado.desc": "Disponibilidad de la API, la captura y el motor en los últimos 60 días, con su historial de incidentes.",
  "noEncontrada.titulo": "Esta página no existe",
  "noEncontrada.desc": "El enlace está roto o la página se movió.",
};

export type Clave = keyof typeof ES;

export const EN: Record<Clave, string> = {
  "app.nombre": "Criterio",
  "nav.producto": "Product",
  "nav.dashboard": "Dashboard",
  "nav.intradia": "Intraday",
  "nav.historico": "History",
  "nav.apis": "APIs",
  "nav.precios": "Pricing",
  "nav.estado": "Status",
  "nav.menu": "Menu",
  "nav.cerrarMenu": "Close menu",
  "nav.principal": "Sections",
  "nav.tema.claro": "Light",
  "nav.tema.oscuro": "Dark",
  "nav.idioma": "Language",
  "nav.acceso": "Get free access",

  "vivo.etiqueta": "Live",
  "vivo.actualizado": "updated {cuando}",
  "vivo.conectando": "Connecting",
  "vivo.sinConexion": "Offline",
  "vivo.publico": "public data, no account",
  "vivo.datosAl": "data as of {fecha}",
  "vivo.version": "calc v{calc} · ruleset v{ruleset}",

  "tiempo.ahora": "now",
  "tiempo.segundos": "{n} s ago",
  "tiempo.minutos": "{n} min ago",
  "tiempo.horas": "{n} h ago",
  "tiempo.dias": "{n} days ago",

  "pie.derechos": "© 2026 Higerotech. All rights reserved.",
  "pie.hecho": "Made with *♥* in Venezuela",

  "comun.sinDatos": "No data yet",
  "comun.sinDatosDetalle":
    "The panel fills in as soon as the gateway answers. If it takes long, check the Status page.",
  "comun.verDashboard": "See it on the dashboard",

  "hero.etiqueta": "Criterio · VES market data",
  "hero.titulo": "The exchange gap, measured and *served by API*",
  "hero.texto":
    "BCV official rate, the USDT/VES P2P book and 18 microstructure indicators, recalculated every few seconds. Free on the portal; via REST and WSS for your system.",
  "hero.ctaDashboard": "Open the live dashboard",
  "hero.ctaApis": "Explore the APIs",
  "hero.tarjeta": "Live · BCV ↔ P2P gap (buy)",
  "hero.sobreOficial": "{abs} VES over the official rate",
  "hero.vs7": "{delta} pts vs. 7-day mean",
  "hero.oficial": "Official USD/VES",
  "hero.vwap": "P2P VWAP buy",
  "hero.actualizado": "Updated",
  "hero.sparkline": "Buy-side gap over the last 24 hours",

  "promesas.etiqueta": "What the data proves",
  "promesas.titulo": "Four promises, *checkable live*",
  "promesas.texto":
    "Each block is a real dashboard panel with the reading of right now. What you see here is what your system receives.",

  "procedencia.numero": "01 · Provenance",
  "procedencia.titulo": "Every number says where it comes from and when",
  "procedencia.texto":
    "Capture time, snapshot age and outlier share travel with every reading. If the BCV rate stops being valid, it is served as official_stale and signals are suppressed — never a stale number dressed as fresh.",
  "procedencia.panel": "Live · data quality",
  "procedencia.snapshot": "P2P snapshot",
  "procedencia.oficial": "Official BCV rate",
  "procedencia.vigente": "valid",
  "procedencia.rancia": "not valid",
  "procedencia.outliers": "Discarded outliers",
  "procedencia.merchants": "Merchant coverage",
  "procedencia.delVolumen": "{pct} of volume",
  "procedencia.motor": "Engine",

  "anticipacion.numero": "02 · Anticipation",
  "anticipacion.titulo": "It tells you what is missing for the market to change footing",
  "anticipacion.texto":
    "A versioned ruleset measures each condition against its threshold. You do not get an alert out of nowhere: you see it coming, condition by condition, and every signal keeps what the gap did afterwards.",
  "anticipacion.panel": "Live · distance to firing",
  "anticipacion.conteo": "{cumplidas} of {totales} conditions",
  "anticipacion.necesita": "needs {op} {umbral}",
  "anticipacion.cumple": "met",
  "anticipacion.falta": "{d} short",
  "anticipacion.sinValor": "no value",
  "anticipacion.todas": "Every condition is met: the rule fires.",
  "anticipacion.bloquea": "The one furthest from its threshold is {indicador}.",
  "anticipacion.noEvaluable":
    "Not evaluated right now: snapshot quality is not enough to emit signals.",

  "contexto.numero": "03 · Context",
  "contexto.titulo": "A 90-day scale, not a loose number",
  "contexto.texto":
    "18 microstructure series, each with its percentile and its threshold. You know whether today is cheap or expensive before deciding.",
  "contexto.percentil": "p{p} · 90 d",
  "contexto.cumple": "Meets a condition of {regla}",
  "contexto.distancia": "{d} away from the {regla} threshold",
  "contexto.sinRegla": "No rule uses it right now.",

  "banda.very_low": "Very low",
  "banda.low": "Low",
  "banda.high": "High",
  "banda.very_high": "Very high",
  "banda.unscaled": "Unscaled",

  "medidor.p2p_spread_pct": "BUY↔SELL spread",
  "medidor.p2p_ratio_oferta_demanda": "Supply/demand ratio",
  "medidor.p2p_momentum_bid_3h_pct": "Bid momentum 3 h",

  "explicacion.numero": "04 · Explanation",
  "explicacion.titulo": "It says which leg moves the gap",
  "explicacion.texto":
    "The same gap means different things depending on whether the official rate climbs or the parallel falls. Criterio splits it so your decision does not rest on a coincidence.",
  "explicacion.oficial": "Official USD/VES {v}",
  "explicacion.vwap": "P2P buy VWAP {v}",
  "explicacion.piernaOficial": "official leg",
  "explicacion.brecha": "gap",
  "explicacion.oficialH": "Official {h} h",
  "explicacion.paraleloH": "P2P {h} h",
  "explicacion.neto": "Net gap",
  "explicacion.oficialMueve":
    "Over the last {h} h, {pct} of the move comes from the official rate: the gap moves because the BCV moves.",
  "explicacion.paraleloMueve":
    "Over the last {h} h, the move comes mostly from the parallel: the gap moves because P2P moves.",
  "explicacion.ambasMueven": "Over the last {h} h both legs moved at once.",
  "explicacion.quieta": "Over the last {h} h neither leg moved enough to attribute the gap to it.",

  "casos.etiqueta": "Use cases",
  "casos.titulo": "Who decides *with the gap*",
  "casos.fintech.quien": "Fintechs and payment gateways",
  "casos.fintech.t": "Quote with the rate of the moment, not yesterday's close",
  "casos.fintech.d":
    "The P2P snapshot arrives via WSS every few seconds; your conversion engine does not have to guess.",
  "casos.comercio.quien": "Retail and commerce",
  "casos.comercio.t": "Reprice when the gap actually moves",
  "casos.comercio.d":
    "Signals warn when the market changes footing; the rest of the days, you leave the price list alone.",
  "casos.tesoreria.quien": "Corporate treasuries",
  "casos.tesoreria.t": "Convert when the gap is in its cheap third",
  "casos.tesoreria.d":
    "The 90-day percentile tells you whether buying outside the official rate is cheap today, with the series to audit it.",
  "casos.dev.quien": "Independent developers",
  "casos.dev.t": "A contract that does not surprise you",
  "casos.dev.d":
    "Decimals as exact strings, RFC 7807 errors, mandatory pagination and limits in the X-RateLimit-* headers.",
  "casos.medios.quien": "Media and analysts",
  "casos.medios.t": "Quote a number with its provenance",
  "casos.medios.d":
    "Every reading carries capture time, engine version and outlier share: what you need to publish it.",

  "cta.titulo": "Turn the gap into *a variable in your system*",
  "cta.texto": "The portal is free. For REST and WSS, we size the plan with you.",
  "cta.niveles": "See tiers",

  "pronto.etiqueta": "Under construction",
  "pronto.texto":
    "This section of the portal arrives in upcoming versions. Meanwhile, the home page already shows the live dashboard panels.",
  "pronto.volver": "Back to the home page",
  "dashboard.titulo": "Public dashboard",
  "dashboard.desc": "Today's reading, the six gauges, the gap breakdown and the signal timeline, live and with no account.",
  "intradia.titulo": "Intraday",
  "intradia.desc": "Today's session, minute by minute, with free Community access by email.",
  "historico.titulo": "History",
  "historico.desc": "The gap and its indicators over 7, 30 and 90-day windows, with comparable episodes.",
  "apis.titulo": "APIs",
  "apis.desc": "REST and WSS with OAuth2: the same numbers as the portal, in your system. OpenAPI and AsyncAPI contracts.",
  "precios.titulo": "Pricing",
  "precios.desc": "The portal is free. Community adds Intraday and History with your email. Enterprise brings REST and WSS with its own quota.",
  "estado.titulo": "Status",
  "estado.desc": "Availability of the API, the capture and the engine over the last 60 days, with its incident history.",
  "noEncontrada.titulo": "This page does not exist",
  "noEncontrada.desc": "The link is broken or the page moved.",
};

export const DICCIONARIOS: Record<Idioma, Record<Clave, string>> = { es: ES, en: EN };

/** Regímenes de la lectura del motor (vocabulario del contrato → texto). */
export const REGIMENES: Record<Idioma, Record<string, string>> = {
  es: {
    subiendo_ampliando: "Al alza, con la brecha abriéndose",
    subiendo_estable: "Al alza, con la brecha quieta",
    subiendo_comprimiendo: "Al alza, con la brecha cerrándose",
    lateral_ampliando: "Lateral, con la brecha abriéndose",
    lateral_estable: "Lateral y sin cambios",
    lateral_comprimiendo: "Lateral en compresión",
    bajando_ampliando: "A la baja, con la brecha abriéndose",
    bajando_estable: "A la baja, con la brecha quieta",
    bajando_comprimiendo: "A la baja, con la brecha cerrándose",
  },
  en: {
    subiendo_ampliando: "Rising, with the gap widening",
    subiendo_estable: "Rising, with the gap holding",
    subiendo_comprimiendo: "Rising, with the gap closing",
    lateral_ampliando: "Sideways, with the gap widening",
    lateral_estable: "Sideways and unchanged",
    lateral_comprimiendo: "Compressing sideways",
    bajando_ampliando: "Falling, with the gap widening",
    bajando_estable: "Falling, with the gap holding",
    bajando_comprimiendo: "Falling, with the gap closing",
  },
};
