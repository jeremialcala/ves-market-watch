# C4 — Diagrama de Contexto

```mermaid
C4Context
  title Contexto del sistema — VES Market Watch

  Person(consumerDev, "Aplicación consumidora", "App externa que consume indicadores vía REST/WSS (JWT)")
  Person(admin, "Operador (Jeremi)", "Administra consumidores, umbrales de señales y operación")

  System(vmw, "VES Market Watch", "Trackea VES/USD oficial vs VES/USDT P2P y calcula indicadores financieros en tiempo casi real")

  System_Ext(binance, "Binance P2P", "Portal público de anuncios P2P USDT/VES")
  System_Ext(bcv, "Sitio web BCV", "Publica la tasa oficial VES/USD")

  Rel(consumerDev, vmw, "Consulta indicadores e histórico; recibe eventos", "HTTPS REST / WSS + JWT")
  Rel(admin, vmw, "Opera y configura", "HTTPS")
  Rel(vmw, binance, "Consulta anuncios P2P (polling continuo)", "HTTPS")
  Rel(vmw, bcv, "Consulta tasa oficial (2x/hora)", "HTTPS")

  UpdateRelStyle(vmw, binance, $offsetY="-20")
```

**Trust boundaries:** todo lo externo (Binance, BCV, apps consumidoras) es no confiable.
Las respuestas de Binance/BCV se validan antes de entrar al dominio; los consumidores
solo acceden autenticados a través del api-gateway.
