# C4 — Diagrama de Contexto

```mermaid
C4Context
  title Contexto del sistema — VES Market Watch

  Person(consumerDev, "Usuario consumidor", "Persona que consulta indicadores vía un front-end/SPA (REST/WSS)")
  Person(admin, "Operador (Jeremi)", "Administra umbrales de señales y operación")

  System(vmw, "VES Market Watch", "Trackea VES/USD oficial vs VES/USDT P2P y calcula indicadores financieros en tiempo casi real")

  System_Ext(auth0, "Auth0", "OpenID Provider — login OIDC y emisión de tokens")
  System_Ext(binance, "Binance P2P", "Portal público de anuncios P2P USDT/VES")
  System_Ext(bcv, "Sitio web BCV", "Publica la tasa oficial VES/USD")

  Rel(consumerDev, auth0, "Inicia sesión (OIDC Auth Code + PKCE)", "HTTPS")
  Rel(consumerDev, vmw, "Consulta indicadores e histórico; recibe eventos", "HTTPS REST / WSS + access token")
  Rel(vmw, auth0, "Valida tokens (JWKS / discovery)", "HTTPS")
  Rel(admin, vmw, "Opera y configura", "HTTPS")
  Rel(vmw, binance, "Consulta anuncios P2P (polling continuo)", "HTTPS")
  Rel(vmw, bcv, "Consulta tasa oficial (2x/hora)", "HTTPS")

  UpdateRelStyle(vmw, binance, $offsetY="-20")
```

**Trust boundaries:** todo lo externo (Auth0, Binance, BCV, usuarios) es no confiable. Las
respuestas de Binance/BCV se validan antes de entrar al dominio; los usuarios se autentican
en Auth0 y solo acceden con un access token válido a través del api-gateway, que verifica su
firma y audiencia contra el JWKS de Auth0.
