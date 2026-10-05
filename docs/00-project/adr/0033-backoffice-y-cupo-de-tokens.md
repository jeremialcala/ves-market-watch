# ADR-0033: Backoffice con app y API propias, esquema propio, y cupo de tokens con avisos escalonados y corte al 100 % en la emisión

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Origen:** decisiones D9, D10 y D11 de `docs/01-requirements/portal-publico.md`
- **Relacionado:** ADR-0030 (nivel Empresa: una aplicación M2M por cliente, 34
  tokens al mes), ADR-0029 (Resend), ADR-0027 (respaldo a B2)
- **Controles OWASP afectados:** A01 (acceso a la herramienta de
  administración), A04 (límites de consumo), A09 (registro de acciones)

## Contexto

ADR-0030 fija que cada cliente Empresa recibe una aplicación M2M de Auth0, con
**34 tokens al mes**. Con 29 clientes son 986 de los 1.000 que el plan actual
del tenant emite al mes. Esa misma ADR deja al backoffice la habilitación, el
cobro y el seguimiento de los clientes, y deja abierto cómo se hace cumplir el
cupo.

El cupo tiene una propiedad que obliga a pensarlo bien: **el límite que importa
es el del tenant, y es compartido.** Un cliente que pide tokens en bucle por un
error en su código no solo agota sus 34: puede agotar los 1.000 del tenant en
segundos y dejar sin token a los otros 28.

## Decisión

### 1. App y API propias, fuera del gateway público (D9)

- **`apps/backoffice`** (React, con `packages/criterio-ui` de ADR-0031) y
  **`apps/backoffice-api`** (Python, como el resto de servicios). Es un servicio
  aparte del `api-gateway`: la API pública no carga con la superficie de
  administración.
- **Dos puertas:**
  - **Cloudflare Access** delante del hostname del backoffice: sin identidad
    aprobada por Access, ni siquiera llega la petición;
  - **login de Auth0 con rol `admin` y MFA obligatorio**, validado también por
    la API en cada llamada.
- **La credencial de la Management API de Auth0** la tiene solo
  `backoffice-api`, con los permisos mínimos de ADR-0030 §5.
- **Toda acción se registra** en una tabla de solo inserción: quién, qué
  cliente, qué acción, cuándo y desde qué identidad de Access.

### 2. Datos en un esquema propio de la misma base (D10)

- **Esquema `backoffice`** en el PostgreSQL existente, con un **rol de base
  propio** que solo ve ese esquema. El gateway y los demás servicios no lo leen.
- **Tablas:**
  - clientes (empresa, contacto, email, WhatsApp, fecha de firma, estado,
    `client_id` de Auth0);
  - pagos (fecha, importe en USDT, red, hash, periodo);
  - consumo de tokens por cliente y ciclo;
  - avisos enviados;
  - auditoría de acciones.
- **Clasificación: Confidencial** (contactos de clientes y pagos). Se añade la
  fila en `data-classification.md` cuando se construya.
- **Respaldo:** entra en el `pg_dump` completo que ya sube cifrado a B2
  (ADR-0027).

### 3. El ciclo es el mes calendario

- **El ciclo de consumo de cada cliente va del día 1 al último día del mes,** el
  mismo periodo en el que Auth0 cuenta los 1.000 tokens del tenant.
- **Por qué no desde la fecha de pago de cada cliente:** con ciclos desalineados,
  un cliente gasta el final de un ciclo y el principio del siguiente dentro del
  mismo mes calendario, hasta 68 tokens. Las cuentas de capacidad (29 × 34 = 986)
  solo valen si todos los ciclos coinciden con el del tenant.
- El pago puede llegar cualquier día; el cupo se reinicia el día 1. Si el
  primer mes es parcial, se prorratea el cupo: días restantes ÷ días del mes ×
  34, redondeado hacia arriba.

### 4. Avisos escalonados desde el 80 %, y alerta si se adelanta al ritmo (D11)

- **Avisos al cliente**, por email desde el backoffice (Resend, ADR-0029):
  al **80 %** y después **cada 5 % de incremento**: 85, 90 y 95 %. Al 100 %
  llega el aviso de corte.
- **Con 34 tokens, los porcentajes caen en números enteros así:**

| Umbral | Tokens consumidos | Aviso |
|---|---|---|
| 80 % | 28 (82 %) | al cliente |
| 85 % | 29 | al cliente |
| 90 % | 31 | al cliente |
| 95 % | 33 | al cliente |
| 100 % | 34 | corte (§5) y aviso al cliente y al operador |

  El 5 % de 34 es 1,7 tokens: en la práctica hay un aviso cada uno o dos tokens.
- **Ritmo esperado:** con tokens de 24 h, el consumo normal es lineal. El ritmo
  esperado el día *d* de un mes de *D* días es **34 × d / D**, así que un
  cliente que va al día llega al 80 % hacia el día 24 de un mes de 30.
- **«Fuera de fecha»:** si un cliente llega al 80 % **antes** del día en que
  debería según ese ritmo (`ceil(0,8 × D)`), es que algo va mal en su
  integración, no que tenga mucho tráfico. Entonces se **alerta también al
  operador** (ntfy, el canal de los respaldos), además del aviso al cliente.
  Así hay tiempo de llamarle antes de que llegue al corte.
- **Lo que hay que saber de esta regla:** un cliente que integra bien llega al
  80 % de forma natural en la última semana del mes y **recibe los avisos todos
  los meses**. Y en un mes de 31 días, uno que no reinicia nunca gasta 31 tokens
  (91 %). Con tres reinicios en el mes, llega a 34 y se corta. Es la
  consecuencia directa de dejar solo 3–4 tokens de margen (ADR-0030 §3), y el
  texto de los avisos tiene que decirlo con claridad: «vas al ritmo normal» no
  es lo mismo que «vas adelantado».

### 5. El corte al 100 % se aplica en la emisión del token

Cortar revocando permisos después de leer los logs de Auth0 llega tarde. Entre
dos lecturas, un cliente que pide tokens en bucle consume los del tenant
entero. Por eso el corte se aplica **en el momento de emitir el token**:

- **Primera opción, si el plan de Auth0 la ofrece: la cuota de tokens por
  aplicación nativa de Auth0**, fijada en 34. Auth0 rechaza la emisión número
  35 y nadie más interviene. **Verificar con el plan contratado antes de
  construir la segunda opción.**
- **Si no está disponible: una *Action* de *credentials exchange*** que, antes
  de emitir, consulta e incrementa el contador del cliente en `backoffice-api`.
  - **Pasa por Cloudflare Access con un *service token*:** la API del
    backoffice no se abre a internet para que Auth0 la llame.
  - **Si el contador está en 34, la Action rechaza** con `access_denied`, así
    que el token 35 no llega a emitirse y no cuenta contra el tenant.
  - **Timeout corto (1 s) y *fail-open*:** si el backoffice no responde, el
    token se emite y se alerta al operador. Un backoffice caído no puede dejar
    sin servicio a 29 clientes. El riesgo que se acepta es que durante esa
    caída un cliente pueda pasar de 34; la lectura de los logs de Auth0 (§6) lo
    detecta después.
- **Además del rechazo en la emisión**, al llegar a 34 se **revoca el *client
  grant*** del cliente. Así el corte dura hasta el día 1 aunque cambie algo en
  la Action. El token ya emitido sigue valiendo hasta que caduca (≤ 24 h): es el
  último que pagó.
- **Reactivación automática el día 1** si el cliente está al día con el pago. Si
  no lo está, sigue suspendido (ADR-0030 §2).

### 6. Los logs de Auth0 como conciliación, no como fuente

`backoffice-api` lee de la Management API, cada hora, los intercambios de *client
credentials* (tipo `seccft`) por cliente, y los compara con su contador. Una
diferencia indica una emisión que la Action no vio, por ejemplo durante un
*fail-open*. Se alerta, y el valor de los logs gana.

## Alternativas consideradas

- **`/admin/v1` dentro del gateway público:** la superficie de administración
  quedaría al alcance de cualquiera, protegida solo por el login.
- **Base de datos aparte para el backoffice:** otra cosa que respaldar y operar,
  para unas pocas filas.
- **Solo vigilancia, con corte manual** (la recomendación inicial de D11): un
  operador no reacciona a tiempo ante un cliente que pide tokens en bucle, y
  el daño cae sobre los otros 28.
- **Corte leyendo los logs de Auth0 cada N minutos:** el mismo problema, con
  N minutos de ventana.
- **Action *fail-closed*:** un backoffice caído cortaría a todos los clientes a
  la vez. Peor que el riesgo que evita.
- **Ciclos por fecha de pago:** rompen el cálculo de capacidad del tenant (§3).

## Consecuencias

- **Positivas:**
  - ningún cliente puede agotar el cupo del tenant de los demás mientras el
    backoffice responda;
  - el cliente se entera antes del corte, y el operador antes de que el
    cliente lo sufra si va adelantado;
  - la administración no está en la superficie pública.
- **Negativas / deuda asumida:**
  - **si no hay cuota nativa, `backoffice-api` entra en el camino de emisión de
    tokens**: con *fail-open* no tumba el servicio, pero una caída abre una
    ventana sin límite;
  - **avisos todos los meses a los clientes que integran bien**: es el efecto
    de un margen de 3–4 tokens;
  - dos servicios nuevos (`backoffice` y `backoffice-api`), una Action más y un
    *service token* de Access que custodiar (Restringido).
- **Impacto en threat model:**
  - abuso de la herramienta de administración (dos puertas, MFA, auditoría);
  - suplantación de la Action ante `backoffice-api` (service token de Access,
    y la API solo acepta esa ruta desde ese token);
  - agotamiento del cupo del tenant por un cliente (corte en la emisión);
  - manipulación del contador (rol de base propio, conciliación horaria con los
    logs de Auth0).

## Verificación

- **El token número 35 de un cliente en el mes no se emite:** la respuesta de
  Auth0 es `access_denied`, y el contador del tenant no sube.
- **Con `backoffice-api` parado**, un cliente obtiene token (*fail-open*) y
  llega una alerta al operador. Al volver, la conciliación detecta la
  diferencia.
- **Los avisos salen en 28, 29, 31 y 33 tokens**, una sola vez cada uno por
  ciclo.
- **Un cliente que llega a 28 tokens el día 15** genera además la alerta
  «fuera de fecha» al operador. Uno que llega el día 26, no.
- **El día 1,** un cliente cortado y al día con el pago recupera su *grant*
  automáticamente; uno con el pago vencido, no.
- **Sin pasar por Cloudflare Access**, ninguna ruta del backoffice responde.
  Con Access pero sin rol `admin`, 403.
