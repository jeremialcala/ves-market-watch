# Glosario / Lenguaje Ubicuo (DDD)

- **Estado:** approved (Gate 0, HITL 2026-07-11)
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 00-project
- **Versión:** 0.2.0

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
| Consumidor / Usuario | Persona autenticada vía Auth0 (OIDC) que consume la API REST o el WSS a través de un front-end/SPA | Acceso (API/WSS) |
| Auth0 (Proveedor de Identidad / OP) | OpenID Provider externo que gestiona login, MFA y emite tokens (ADR-0012) | Acceso (API/WSS) |
| OIDC (OpenID Connect) | Capa de identidad sobre OAuth2; aquí flujo Authorization Code + PKCE | Acceso (API/WSS) |
| Access Token | JWT (RS256) que autoriza el acceso a la API; el gateway lo valida por audiencia y firma | Acceso (API/WSS) |
| ID Token | JWT de identidad emitido por Auth0 para el front-end; **no** se usa para autorizar en el gateway | Acceso (API/WSS) |
| Resource Server | Rol del api-gateway: valida access tokens y sirve la data; no emite tokens | Acceso (API/WSS) |
| Scope / Permiso | Autorización granular (`read:rates`, `stream:events`, …) asignada por RBAC de Auth0 | Acceso (API/WSS) |
| Método de Pago | Banco o mecanismo aceptado en un anuncio (p. ej. Banesco, Pago Móvil) | Ingesta P2P |
| Límites (Min/Max) | Monto mínimo y máximo por transacción aceptado en un anuncio | Ingesta P2P |
