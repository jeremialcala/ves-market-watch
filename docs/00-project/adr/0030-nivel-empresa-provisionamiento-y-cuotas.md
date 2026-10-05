# ADR-0030: Nivel Empresa: una aplicación M2M de Auth0 por cliente, alta manual tras el pago, 34 tokens al mes y 200 peticiones por minuto

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Origen:** decisión D4 de `docs/01-requirements/portal-publico.md`
- **Relacionado:** ADR-0012 (Auth0 como emisor), ADR-0016 (limitador del
  gateway), ADR-0028 (`/portal/v1`), ADR-0029 (acceso Comunidad)
- **Controles OWASP afectados:** A01 (control de acceso por cliente), A04
  (límites de consumo), A07 (credenciales de máquina)

## Contexto

El portal vende `/api/v1` y `/ws/v1` como nivel Empresa: «para sistemas que
consumen la data sin una persona de por medio». Hoy los únicos usuarios de la
API son personas que entran por el `web-spa` con Authorization Code + PKCE, y la
cuota es **una sola para todos**: 120 peticiones por minuto
(`RATE_LIMIT_PER_MIN`, por `sub`).

Un sistema no hace login. Necesita credenciales de máquina. Y el tenant de Auth0
**limita cuántos tokens de máquina (M2M) emite al mes**: ese límite, no la
capacidad del gateway, es lo que marca cuántos clientes caben con el plan
actual.

## Decisión

### 1. Credencial: una aplicación M2M de Auth0 por cliente

- Cada cliente Empresa es una **aplicación *Machine to Machine*** del tenant,
  con *client credentials* (OAuth2). Es lo que ya anuncia el catálogo del
  portal: «OAuth2 Bearer · RS256». El gateway no cambia su validación: el token
  M2M trae `iss`, `aud` y `permissions` como cualquier otro.
- **Permisos concedidos** (*client grant* contra la API del gateway):
  `read:rates`, `read:indicators`, `read:depth`, `read:signals` y
  `stream:events`. Son los 8 endpoints de datos más el WebSocket. `/health` es
  público.
- **El `sub` de un token M2M es `<client_id>@clients`**, así que el limitador
  actual ya separa a cada cliente sin cambios.
- **Una aplicación por cliente, no una compartida:** cada cliente se puede
  suspender, rotar o dar de baja sin tocar a los demás, y su consumo se mide por
  separado.

### 2. Alta manual, después de la firma y el pago

- **No hay autoservicio.** La aplicación M2M se crea **solo después** de la
  firma del contrato y de recibir el pago. Es coherente con Precios («Habla con
  nosotros») y con que no hay facturación que automatizar.
- **Precio de referencia: 50 USDT por cliente**, al mes. El pago se registra a
  mano: fecha, importe, red y hash de la transacción, y periodo que cubre.
- **El secreto del cliente se entrega una sola vez** y por un canal que no lo
  deje en claro en un buzón: enlace de un solo uso o el gestor de secretos del
  cliente. Nunca en el cuerpo de un email ni de un WhatsApp.
- **Suspensión por impago:** se revoca el *client grant* (el token deja de tener
  permisos) o se desactiva la aplicación. **Baja:** se borra la aplicación.

La operación de todo esto es el **backoffice** (ver §5).

### 3. Cuota de tokens M2M: 34 por cliente al mes

- **34 tokens al mes por cliente.** Se fijó primero en 36 y se bajó a 34 el
  mismo día para que 29 clientes quepan en el plan actual de Auth0:
  **29 × 34 = 986 tokens al mes**, por debajo de los 1.000 del tenant, con 14
  de holgura. Con 36 eran 1.044 y no cabían.
- **El margen por cliente es estrecho, y conviene saberlo.** Con tokens de
  **24 h** (el `Token Expiration` de la API en Auth0, 86.400 s), un cliente que
  reutiliza su token hasta que caduca gasta 30 en un mes de 30 días y 31 en uno
  de 31. Le quedan **3–4 tokens para reinicios y despliegues en todo el mes**.
  Dos caídas con reinicio en frío por semana ya lo agotan.
- **Pendiente de verificar antes del primer cliente:** si los tokens de las
  personas del `web-spa` y del acceso Comunidad cuentan contra el mismo límite
  que los M2M. Si cuentan, los 14 de holgura no alcanzan y el techo baja de 29.
- **La reutilización del token es responsabilidad del cliente, y se lo decimos
  por escrito.** La guía de alta exige:
  - pedir el token una vez y cachearlo, **también en disco o en un almacén
    compartido**, para que un reinicio no pida otro;
  - renovarlo solo al caducar;
  - compartirlo entre todas sus réplicas.

  Un cliente que pide un token por llamada agota sus 34 en minutos. Uno con
  diez réplicas que pide uno por réplica, en tres días y medio.
- **Cómo se hace cumplir el 34:** avisos desde el 80 % y corte en la emisión al
  100 %, en el ciclo del mes calendario (ADR-0033). Antes era decisión del
  backoffice: ver D11 en el plan.

### 4. Cuota de peticiones: 200 por minuto por cliente

- **200 peticiones por minuto**, por cliente, en `/api/v1`. Los límites del
  WebSocket siguen como están: 5 conexiones y 10 suscripciones.
- **El valor viaja en el token, no en el gateway.** Se guarda en los
  *metadata* de la aplicación M2M (`rate_limit_per_min: 200`). Una *Action* de
  Auth0 de *credentials exchange* lo pone como claim en el access token, y el
  gateway usa ese claim cuando existe y `RATE_LIMIT_PER_MIN` cuando no. Así un
  cliente con otro contrato cambia de cuota sin desplegar el gateway, y las
  personas del `web-spa` siguen con su 120.
- La *Action* se versiona en `infra/auth0/`, como la de ADR-0029.

### 5. Backoffice para habilitar y seguir a los clientes

La alta, el cobro, la suspensión y el seguimiento del consumo **no se hacen a
mano en la consola de Auth0**. Se hacen desde un backoffice interno, que pasa a
formar parte del plan del portal (sección «Backoffice» y decisiones D9 a D11).
Esta ADR fija lo que el backoffice tiene que garantizar, no cómo se construye:

- **Solo personas autorizadas y con MFA.** Es la herramienta con más poder del
  sistema: crea credenciales de la API de pago.
- **La credencial de la Management API de Auth0 tiene los permisos mínimos:**
  crear, actualizar y borrar clientes y *client grants*, y leer logs. Nada más.
  Es Restringido.
- **Toda acción queda registrada:** quién creó, suspendió, rotó o dio de baja
  qué cliente, y cuándo.

## Alternativas consideradas

- **API keys propias en nuestra base:** hay que emitirlas, guardarlas con hash,
  rotarlas y validarlas, y añaden un segundo camino de autenticación al gateway.
  Auth0 ya lo hace con M2M, y el gateway no cambia.
- **Una sola aplicación M2M con un token por cliente:** no se puede suspender a
  uno sin tocar a los demás, ni medir su consumo por separado.
- **Autoservicio con pago en línea:** no hay pasarela, y el pago en USDT se
  concilia a mano. Se reconsidera si el número de clientes lo justifica.
- **Cuota por niveles fijos** (por ejemplo 200, 1.000 y 5.000): con un único
  producto de 50 USDT, un solo valor basta. El claim por cliente deja abierta la
  puerta a niveles sin rediseñar.

## Consecuencias

- **Positivas:**
  - el gateway valida igual que hoy; los únicos cambios son leer la cuota del
    claim y medir el consumo;
  - cada cliente se puede apagar por separado;
  - la capacidad (unos 29 clientes) es conocida y calculada, no una sorpresa
    cuando el tenant deje de emitir tokens.
- **Negativas / deuda asumida:**
  - **El techo de clientes lo pone el plan de Auth0, no el sistema.** Pasar de
    unos 29 obliga a subir de plan o a alargar la vida del token, y eso último
    reduce la frecuencia con que se nota una revocación.
  - **Una revocación tarda hasta 24 h en verse.** Un token ya emitido vale hasta
    que caduca, aunque se revoque el *grant*. Para un corte inmediato, el
    gateway necesitará una lista de `client_id` suspendidos. Queda como mejora;
    no está en el alcance de esta ADR.
  - **Dos Actions de Auth0** (esta y la de ADR-0029) que versionar y probar.
- **Clasificación:**
  - **Datos de contacto de clientes Empresa** (nombre de la empresa, persona de
    contacto, email, WhatsApp) y **registro de pagos**: Confidencial. Fila nueva
    en la clasificación cuando se construya el backoffice.
  - **Credencial de la Management API y secretos de los clientes:**
    Restringido.
- **Impacto en threat model:**
  - robo del secreto de un cliente (mitigado por la entrega de un solo uso, la
    rotación desde el backoffice y la cuota por cliente);
  - abuso de la Management API (permisos mínimos, MFA y registro de acciones);
  - agotamiento del cupo M2M del tenant por un cliente mal integrado (guía de
    alta y vigilancia en el backoffice).

## Verificación

- **Un token M2M recién creado** llama a los 8 endpoints de datos y abre
  `/ws/v1`. Sin `stream:events`, el WebSocket cierra con 4403.
- **La petición 201 del mismo minuto** devuelve 429 con
  `X-RateLimit-Limit: 200`. Un usuario del `web-spa` sigue viendo 120.
- **Tras revocar el *grant***, un token nuevo no tiene permisos (403). El viejo
  sigue valiendo hasta caducar: comportamiento esperado y documentado.
- **El backoffice muestra el consumo de tokens M2M del mes por cliente** y
  coincide con los logs de Auth0 (tipo `seccft`, intercambio de *client
  credentials*).
- **Antes del primer cliente:** confirmado en Auth0 si los tokens de usuario
  (`web-spa`, acceso Comunidad) cuentan contra los 1.000 M2M del mes. Si
  cuentan, se recalcula el techo de clientes y se anota aquí.
- **Una cuenta del backoffice que pasa de 34 tokens en el mes** dispara el aviso
  del 100 % y el token 35 no se emite (ADR-0033 §5).
