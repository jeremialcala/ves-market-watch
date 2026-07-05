# C4 — Diagrama de Contenedores

```mermaid
C4Container
  title Contenedores — VES Market Watch

  Person(consumerDev, "Aplicación consumidora", "REST/WSS + JWT")
  System_Ext(binance, "Binance P2P", "Anuncios USDT/VES")
  System_Ext(bcv, "Sitio web BCV", "Tasa oficial VES/USD")

  System_Boundary(vmw, "VES Market Watch (zona de confianza interna)") {
    Container(ingBin, "ingestor-binance", "Python asyncio", "Polling P2P, normaliza y publica p2p.snapshot")
    Container(ingBcv, "ingestor-bcv", "Python asyncio", "Scraping BCV 2x/h, valida y publica official.rate.updated")
    Container(engine, "indicator-engine", "Python asyncio", "Consume eventos, calcula indicadores y señales")
    Container(gateway, "api-gateway", "Python (FastAPI)", "REST + WSS, OAuth2/JWT, rate limiting")
    ContainerQueue(mq, "RabbitMQ", "AMQP topic exchange", "market.events + DLQ")
    ContainerDb(db, "PostgreSQL + TimescaleDB", "Hypertables", "Tasas, snapshots, indicadores, señales, clientes")
  }

  Rel(ingBin, binance, "GET/POST anuncios", "HTTPS, TLS verificado")
  Rel(ingBcv, bcv, "GET tasa oficial", "HTTPS, cert anclado")
  Rel(ingBin, mq, "p2p.snapshot", "AMQP, usuario mínimo privilegio")
  Rel(ingBcv, mq, "official.rate.updated", "AMQP")
  Rel(mq, engine, "eventos de mercado", "AMQP, validación de esquema")
  Rel(engine, mq, "indicators.updated / signals.emitted", "AMQP")
  Rel(mq, gateway, "eventos para push WSS", "AMQP")
  Rel(ingBin, db, "snapshots crudos", "SQL/TLS")
  Rel(ingBcv, db, "tasas oficiales", "SQL/TLS")
  Rel(engine, db, "indicadores y señales", "SQL/TLS")
  Rel(gateway, db, "histórico y clientes", "SQL/TLS, solo lectura + api_clients")
  Rel(consumerDev, gateway, "REST /api/v1 + WSS", "HTTPS/WSS + JWT")
```

**Trust boundaries:**

1. Internet ↔ api-gateway: única entrada externa; JWT + rate limiting + TLS.
2. Fuentes externas ↔ ingestores: datos no confiables; validación de esquema y rango.
3. Servicios ↔ RabbitMQ: usuarios AMQP dedicados por servicio con permisos mínimos
   (los ingestores solo publican; el engine consume y publica; el gateway solo consume).
4. Servicios ↔ DB: roles PostgreSQL separados por servicio (mínimo privilegio).
