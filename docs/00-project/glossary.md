# Glosario / Lenguaje Ubicuo (DDD)

| Término | Definición | Contexto acotado (Bounded Context) |
|---|---|---|
| Tasa Oficial | Valor VES/USD publicado por el BCV; referencia legal de cambio | Ingesta Oficial |
| Anuncio (Ad) | Publicación P2P en Binance con precio, cantidad disponible, límites y métodos de pago | Ingesta P2P |
| Lado (Side) | Dirección del anuncio: BUY (anunciante compra USDT) o SELL (anunciante vende USDT) | Ingesta P2P |
| Snapshot P2P | Conjunto de anuncios capturados en un instante para un lado del mercado | Ingesta P2P |
| Mejor Precio (Top of Book) | Precio del anuncio más competitivo de cada lado en un snapshot | Indicadores |
| Spread | Diferencia entre mejor precio de venta y mejor precio de compra en el P2P | Indicadores |
| Brecha Cambiaria (Diferencial) | Diferencia absoluta y porcentual entre tasa oficial BCV y precio P2P de referencia | Indicadores |
| Precio de Referencia P2P | Precio representativo del mercado P2P (mediana o VWAP del top-N de anuncios) | Indicadores |
| Profundidad de Mercado | Volumen acumulado disponible por nivel de precio en cada lado | Indicadores |
| Volumen Agregado | Suma de cantidades disponibles en anuncios de un lado en un snapshot | Indicadores |
| VWAP | Precio promedio ponderado por volumen de un snapshot o intervalo | Indicadores |
| Variación Intradía | Cambio de un indicador dentro del día operativo (VET) | Indicadores |
| Tendencia de Liquidez | Evolución del volumen agregado y profundidad a lo largo del tiempo | Indicadores |
| Señal | Evento derivado de reglas sobre indicadores (p. ej. brecha supera umbral) que apoya decisiones de compra/venta | Indicadores |
| Indicador | Métrica calculada y versionada a partir de snapshots y tasa oficial | Indicadores |
| Evento de Mercado | Mensaje publicado en el bus cuando llega nueva información de una fuente | Plataforma (mensajería) |
| Consumidor | Aplicación externa autenticada que consume la API REST o el WSS | Acceso (API/WSS) |
| Método de Pago | Banco o mecanismo aceptado en un anuncio (p. ej. Banesco, Pago Móvil) | Ingesta P2P |
| Límites (Min/Max) | Monto mínimo y máximo por transacción aceptado en un anuncio | Ingesta P2P |
