# ADR-0020: Dominio propio de Auth0, desarrollo por túneles y configuración parametrizada

- **Estado:** accepted
- **Fecha:** 2026-08-01
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** A01 (orígenes permitidos), A02 (config por
  entorno sin secretos), A05 (CSP servida y coherente con el bundle), A07
  (sesión: tokens en memoria, cookie de primera parte)

## Contexto

Entrar al dashboard pedía credenciales una y otra vez. Al medirlo en vivo —no
leyendo el código— aparecieron **tres problemas distintos** que se presentaban
como uno:

1. **Un clic de «Accept» en cada inicio de sesión.** Auth0 mostraba una pantalla
   de consentimiento real y bloqueante en cada login.
2. **La sesión no sobrevivía a un F5.**
3. **El login estaba directamente roto** en el build del contenedor: la vuelta
   con `?code=` no se canjeaba nunca y acababa en un estado terminal sin salida.

Las causas resultaron ser tres capas independientes, y ninguna era la que
parecía:

**(a) Faltaba `worker-src` en la CSP.** Con `useRefreshTokens` y caché en
memoria, `auth0-spa-js` canjea el código dentro de un **Web Worker que crea
desde un `blob:`**. Sin `worker-src`, la directiva cae en `default-src 'self'`,
que no admite `blob:`: el worker **construye pero muere al cargar**, sin
excepción, sin log y sin ninguna petición de red. El login se quedaba colgado
para siempre. Lo introdujo, sin querer, el commit que hizo que la CSP **por fin
se enviara** (`798b83b`): mientras la política no llegaba al navegador, el login
funcionaba; en cuanto empezó a aplicarse de verdad, lo rompió.

**(b) `web_origins` (Allowed Web Origins) estaba vacío en el tenant.** El iframe
de `prompt=none` usa `response_mode=web_message`, que Auth0 **rechaza** si el
origen no está en esa lista. El silent auth no podía funcionar, con cookies de
terceros o sin ellas.

**(c) El cliente no era «verificable».** Auth0 solo omite el consentimiento para
clientes *first-party verificables*, y `http://localhost:8080` no lo es (ni
HTTPS ni dominio real). Y aquí está la unión de los dos síntomas: **`prompt=none`
no puede mostrar una pantalla de consentimiento**, así que devuelve
`consent_required`, el silent auth falla y se cae a login visible. El clic de
consentimiento y la no-persistencia **eran el mismo problema**.

Cuatro cosas que dábamos por pendientes ya estaban bien en el tenant:
`allow_offline_access`, la rotación de refresh tokens (30 d absoluta / 1 d de
inactividad), `is_first_party` y el grant `refresh_token`. La documentación que
decía lo contrario estaba desfasada.

## Decisión

1. **Dominio propio `auth.higerotech.com`** (verificado 2026-08-01, certificado
   Let's Encrypt gestionado por Auth0). Es lo que hace la cookie SSO de
   **primera parte** frente a un SPA servido bajo `*.higerotech.com`, y con ello
   el silent auth funciona sin depender de cookies de terceros —que Safari y
   Firefox bloquean por defecto y Chrome restringe cada vez más.

2. **Los tokens siguen en memoria** (`cacheLocation: "memory"`). **T12 no se
   relaja.** Se descartó explícitamente `localStorage`, que era la alternativa
   obvia para persistir sesión: el dominio propio consigue el mismo resultado
   sin poner un refresh token al alcance de un XSS.

3. **Desarrollo por túneles de Cloudflare**, con `criterio-dev.higerotech.com`
   (SPA) y `criterio-api-dev.higerotech.com` (API). Resuelve tres cosas a la vez:
   HTTPS real con certificado válido (sin CA local ni tocar el almacén de
   confianza), hosts que **no son `localhost`** —requisito de «verificable»— y
   mismo dominio registrable que `auth.higerotech.com`. `localhost:8080` sigue
   sirviendo para desarrollo, pero **ahí el consentimiento y la falta de
   persistencia son inevitables**, y eso es correcto, no un fallo.

4. **`worker-src 'self' blob:` en la CSP.** Ampliación mínima y acotada: un
   `blob:` solo puede contener código del propio origen y `script-src 'self'`
   queda intacto. Lo fija un test.

5. **La configuración se parametriza con `ARG` de build, no en runtime.** El
   dominio vive en dos sitios que deben coincidir: el bundle (Vite hornea las
   `VITE_*`) y la CSP del nginx. Se alimentan del **mismo input** vía `ARG` +
   `envsubst` sobre una plantilla, así que no pueden divergir por construcción.
   Se descartó `envsubst` en el arranque del contenedor porque permitiría una
   imagen que sirve un bundle apuntando al tenant X con una CSP que permite el
   tenant Y — justo el fallo que el test existente inventó para prevenir— y
   porque el PRD exige «sin config en runtime».

6. **Un solo issuer, no ventana dual.** Con dominio propio el `iss` pasa a ser
   `https://auth.higerotech.com/`, y el gateway lo valida de forma estricta. Se
   movieron a la vez SPA, Dockerfile, compose, e2e M2M y gateway. Aceptar dos
   emisores habría degradado T11 de «un emisor» a «una lista que alguien puede
   ampliar sin pensar».

7. **El guard de sesión distingue cuatro estados** —comprobando, error con
   salida, redirigiendo, dentro— y el error **siempre ofrece reintento**. No es
   cosmética: al fallar `handleRedirectCallback`, el `onRedirectCallback` que
   limpia la URL no llega a correr, el `?code=` se queda puesto y cada recarga
   vuelve a fallar igual. Sin botón, el estado es terminal y solo se sale
   editando la URL a mano.

## Alternativas consideradas

- **`cacheLocation: "localstorage"` + rotación**: la vía corta para persistir
  sesión. Descartada: rompe T12 y pone el refresh token al alcance de un XSS,
  cuando el dominio propio da el mismo resultado sin ese coste.
- **Certificado local (`mkcert` u `openssl` + `certutil`)** para el dev HTTPS:
  descartada al elegir túneles — Cloudflare termina TLS con un certificado real,
  así que no hace falta instalar software ni meter una CA en el almacén de
  confianza de la máquina.
- **Fichero `hosts` + subdominio local**: descartada por la misma razón, y
  además exige privilegios y se configura máquina a máquina.
- **Quedarse en `localhost` y aceptar el login visible**: descartada; era
  exactamente el problema a resolver.
- **Sustituir la CSP en el arranque del contenedor**: ver punto 5.

## Consecuencias

- (+) Entrar es un redirect silencioso **sin ningún clic**; F5 y pestaña nueva
  mantienen la sesión. Verificado en vivo.
- (+) T12 sigue en pie y **mejor sostenido que antes**: la persistencia ya no
  depende de una cookie de terceros, así que desaparece la presión de relajar
  `cacheLocation` para ganar comodidad.
- (+) Cambiar de tenant o de entorno es exportar variables, no editar tres
  archivos a mano; y bundle y CSP no pueden divergir.
- (−) **Dependencia operativa nueva**: DNS (CNAME de verificación) y un
  certificado que Auth0 renueva —hay que vigilar que renueve—. El dominio pasa a
  ser activo crítico del sistema de identidad.
- (−) **El desarrollo depende de un túnel activo.** Sin `cloudflared` corriendo,
  el flujo bueno no está disponible; queda `localhost:8080` con sus limitaciones.
- (−) Los hosts del túnel son de esta máquina y viven en el `.env` (gitignorado):
  otra persona necesita los suyos y registrarlos en Auth0.
- (−) Cambiar el issuer invalida los tokens en vuelo. En dev es un no-evento
  (900 s); en producción exigiría una ventana planificada.

## Verificación

Medido en `https://criterio-dev.higerotech.com`, no inferido:

1. Visita en pestaña limpia → **entra sin consentimiento y sin clics**.
2. **F5 → sigue dentro**, con `GET /authorize` del silent auth en la pestaña de
   red y la URL sin `?code=`.
3. **Pestaña nueva → entra sola.**
4. `localStorage` y `sessionStorage` **sin ningún token** (T12).
5. El dashboard carga datos reales por el túnel, lo que confirma que el gateway
   acepta el `iss` del dominio propio.
6. Callejón sin salida: con un `?code=` inválido forzado, aparece la pantalla de
   error **con botón**, y al pulsarlo limpia la URL y relanza el flujo.

Automático: **219 tests** en el SPA (88,76 % de ramas) y **103** en el gateway.
Destacan el canario de `worker-src` —el más caro de esta suite, porque su
ausencia no falla nada, solo deja de funcionar todo— y el contrato de
sustitución de la plantilla, que verifica que cada `${VAR}` está en la lista de
`envsubst` y que el build aborta si queda alguna sin sustituir.

## Lo que no cubre esta decisión

Cómo se organiza el despliegue real (producción/staging) queda **explícitamente
abierto**: los túneles son una solución de desarrollo. La topología de
despliegue se decide más adelante.
