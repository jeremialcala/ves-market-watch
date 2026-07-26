# ADR-0016: Implementación del api-gateway — push efímero, solo lectura y proyecciones

- **Estado:** accepted
- **Fecha:** 2026-07-26
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** 0.4.0
- **Controles OWASP afectados:** A01 (mínimo privilegio), A04 (diseño seguro), A05 (validación), A07 (authN), A10 (SSRF/recursos)

## Contexto
El api-gateway es el único punto de entrada externo (ADR-0012 fijó la
autenticación: Resource Server contra Auth0). Al implementarlo quedan decisiones
que ningún ADR previo cubría: cómo consume el bus para el push WSS, qué forma
tienen los mensajes push, cómo se protege la DB desde un servicio que solo lee,
dónde vive el estado del rate limiting, y qué hacer con `/market/depth`, cuyo
insumo (`p2p_top_of_book`) el engine aún no materializa.

## Decisión
1. **Cola AMQP efímera para el push WSS** (exclusiva, auto-delete, nombrada por
   el servidor, bind a los 4 routing keys). El push es fan-out en tiempo real:
   si el gateway está caído no hay a quién empujar, y el estado consultable vive
   en REST/DB — una cola durable solo acumularía backlog sin destinatario. El
   consumidor durable con DLQ del pipeline sigue siendo el indicator-engine
   (ADR-0004). Un cliente que se reconecta repone estado por REST y sigue por WSS.
2. **El push retransmite el payload canónico del evento**, validado contra su
   JSON Schema (`schemas/`, A05/A08), en el sobre
   `{topic, event_id, occurred_at, data}` — sin proyecciones propias por tópico.
   Una sola fuente de verdad de contratos; la AsyncAPI (`docs/asyncapi.yaml`)
   referencia esos schemas en vez de duplicarlos. Evento inválido → descarte con
   log (sin DLQ propia: la cola es efímera y la DLQ del pipeline ya existe).
3. **Pool de DB de solo lectura reforzado en la conexión**:
   `default_transaction_read_only=on` además del rol de mínimo privilegio del
   despliegue (defensa en profundidad, T9/A01). Un INSERT accidental o inyectado
   falla en el servidor; verificado por test de integración.
4. **Rate limiting en memoria del proceso** (ventana fija de 60 s por `sub`).
   Suficiente y honesto para una instancia (dev y arranque); si el gateway escala
   horizontalmente, la cuota migra a un store compartido — se decidirá en fase
   05-deployment. Cabeceras `X-RateLimit-*` en cada respuesta autenticada.
5. **`/market/depth` como proyección de lectura del gateway** sobre el último
   snapshot crudo minimizado (`p2p_snapshots_raw.raw`): bandas de 0,5 % desde el
   mejor precio del lado (función pura, testeada). Interim explícito: cuando el
   engine materialice `p2p_top_of_book` (architecture.md, planificada) la
   proyección migra al engine y el gateway vuelve a ser solo lectura de tablas.
6. **Frescura al servir "current"**: un indicador P2P más viejo que
   `P2P_FRESCURA_MIN` (default 20 min) no se sirve como vigente → 404 «sin datos
   frescos» en vez de presentar dato rancio como actual (A10); la tasa oficial
   vieja sí se sirve, marcada `stale` (ADR-0007).
7. **JWKS con cache por `kid` y refresco acotado** (mínimo 60 s entre fetches):
   un token basura no puede provocar hammering a Auth0 (T4). El motivo concreto
   de un rechazo de token se loguea pero nunca se responde (T11).

## Alternativas consideradas
- **Cola durable por instancia del gateway**: garantizaría no perder pushes
  durante reinicios, pero el cliente WSS igual está desconectado en ese lapso y
  el estado se repone por REST; el backlog solo añadiría latencia y estado.
  Descartada.
- **Proyecciones propias por tópico WSS** (resúmenes como los esbozados en el
  esqueleto de api-contracts): más compactas, pero duplican contratos y derivan
  con cada cambio del engine. Descartada a favor del payload canónico.
- **Rate limit compartido (Redis) desde ya**: infraestructura nueva sin necesidad
  actual (una instancia). Pospuesta a fase 05.
- **Depth vacío hasta que exista `p2p_top_of_book`**: honesto pero inútil para el
  consumidor; el crudo minimizado ya permite servirlo sin inventar métricas.
  Descartada a favor del interim con migración declarada.

## Consecuencias
- (+) Push con contratos únicos y verificables: el e2e valida bus → WSS contra
  los mismos schemas del pipeline.
- (+) La DB es intocable desde el gateway incluso ante un bug/inyección (T9).
- (+) `/health` refleja componentes reales (database/broker/auth) y el gateway
  sirve REST degradado si el broker falta.
- (−) Pushes emitidos mientras el gateway está caído no se re-entregan (por
  diseño; REST es la fuente de estado).
- (−) El rate limit es por proceso: N instancias multiplicarían la cuota hasta
  migrar a un store compartido (fase 05).
- (−) La lógica de profundidad vive temporalmente en el gateway; su migración al
  engine queda declarada aquí y en architecture.md.
