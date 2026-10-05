# ADR-0029: «Acceso Comunidad»: email sin contraseña en Auth0, correo por Resend y Turnstile en servidor

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Origen:** decisión D3 de `docs/01-requirements/portal-publico.md`
- **Relacionado:** ADR-0012 (Auth0 como emisor), ADR-0020 (dominio propio de
  Auth0 y sesión de primera parte), ADR-0028 (`/portal/v1`)
- **Controles OWASP afectados:** A01 (control de acceso por rol), A04 (diseño:
  abuso del alta), A07 (identificación y autenticación)

## Contexto

El diseño del portal abre Intradía e Histórico a cambio de un email: sin
contraseña y sin tarjeta, con «un enlace al correo». Lo llamaba «API key
Comunidad», pero **no es una key**: solo abre el portal, y llamar a REST o WSS
desde código es del nivel Empresa.

Es la primera vez que el sistema recoge datos personales de cualquiera que
llegue a una página pública. Hasta ahora las cuentas las creaba a mano quien
administra el tenant. Eso abre tres frentes que antes no existían:

- **mandar correo en nombre del proyecto**;
- **el abuso de un formulario de alta abierto**: bots, listas, y bombardeo de
  correos a terceros con nuestro dominio;
- **la privacidad** de esos emails.

## Decisión

### 1. Nombre: «acceso Comunidad»

Desde ahora se llama **acceso Comunidad**, en el portal, en los textos y en el
código. No «API key», que promete algo que se usa desde un programa. El diseño
se corrige en ese punto.

### 2. Identidad: Auth0 Passwordless por email, sin tabla de usuarios propia

- **Conexión *Passwordless — Email*** en el tenant existente, con el dominio
  propio de ADR-0020 (`auth.higerotech.com`). El primer acceso crea el usuario;
  no hay registro aparte, ni contraseña, ni pregunta de si el email ya existe.
  Así no se puede **enumerar** quién tiene cuenta: la respuesta es la misma
  siempre.
- **Rol `comunidad`** con un único permiso, **`read:portal-comunidad`**, que
  exigirán los endpoints Comunidad de `/portal/v1` (ADR-0028). Ninguno de los
  permisos de `/api/v1` (`read:rates`, `read:indicators`…) se concede: un token
  Comunidad recibe **403** en la API de pago sin cambiar una línea de ella. El
  rol se asigna en el primer acceso, con una *Action* de post-login.
- **El email vive en Auth0**, que es el *system of record* (ADR-0012). El
  gateway ve el `sub` y el permiso, no el email. El portal muestra el email que
  trae el ID token, en memoria.
- **Sesión:** tokens en memoria y *refresh token rotation*, como el `web-spa`
  (ADR-0020 §2). El portal vive en `*.higerotech.com` y Auth0 en
  `auth.higerotech.com`: la renovación silenciosa es de **primera parte**, y una
  recarga de página no obliga a pedir otro enlace.

### 3. Correo: Resend como SMTP de Auth0

- Auth0 manda los correos de acceso por **su proveedor SMTP personalizado**,
  configurado con **Resend**. El proveedor por defecto de Auth0 es para pruebas:
  tiene un límite bajo de envíos y no admite dominio propio.
- **Dominio de envío en un subdominio dedicado**, no en `higerotech.com`
  directamente. Por ejemplo `acceso@mail.higerotech.com`, con SPF, DKIM y DMARC
  en Cloudflare. Si el formulario sufre abuso y el subdominio pierde reputación,
  el correo de la empresa (`contacto@higerotech.com`) no cae con él.
- **La API key de Resend es de solo envío y solo de ese dominio**, y vive en la
  configuración de Auth0, no en nuestra infraestructura. Clasificación:
  Restringido.
- Las plantillas de Auth0 (enlace o código) se traducen a ES/EN y llevan la
  marca del portal.

### 4. Anti-abuso: Turnstile validado en servidor y límites por IP y por email

Un CAPTCHA que solo se comprueba en el navegador **no protege nada**. El
atacante llama directamente al endpoint que inicia el envío y se lo salta. La
regla es:

- **El token de Turnstile se valida en un servidor** (`siteverify`) **antes** de
  que se mande ningún correo.
- **Nadie puede iniciar el envío esquivando esa validación.** Ni siquiera
  llamando a Auth0 directamente con el `client_id`, que en una SPA es público.
- **Límites**, comprobados en el mismo punto que Turnstile:
  - **por email: 3 envíos por hora**. Es el que frena el bombardeo de correos a
    un tercero, aunque cambie de IP;
  - **por IP real: 10 por hora**, con la IP de `CF-Connecting-IP` desde proxies
    de confianza, como en ADR-0028.
- Respuesta idéntica haya o no cuenta, y haya o no límite: «si el email es
  válido, te llegará un enlace». El límite se nota en que no llega.

**El cableado concreto se fija en un spike al empezar la fase 5.** Hay dos
formas de cumplir la regla, y la elección depende de lo que el tenant permita:

- **(a) Bot Detection de Auth0 con Turnstile** en el Universal Login, si el plan
  del tenant lo admite. Auth0 valida en servidor, el formulario es el de Auth0
  (con la marca del portal) y no hay código nuestro en el camino.
- **(b) Endpoint propio `POST /portal/v1/acceso`** que valida Turnstile, aplica
  los límites e inicia el *passwordless* con un cliente **confidencial** de
  Auth0, cuyo secreto vive en el gateway. Es el único cliente que tiene
  habilitada la conexión de email; así, el `client_id` público del portal no
  sirve para iniciar envíos. Mantiene el formulario del diseño en nuestra
  página, pero es **el primer POST del gateway**, con lo que eso trae: CORS con
  `POST`, el secreto de Turnstile y el del cliente como nuevos secretos.

### 5. Enlace mágico o código: a confirmar en el mismo spike

El diseño dice «te enviamos un enlace». Los enlaces de un solo uso tienen dos
problemas conocidos, y el spike debe medirlos antes de comprometerse:

- **Los escáneres de correo corporativo abren los enlaces** para revisarlos y
  **consumen** el de un solo uso. El usuario hace clic en un enlace ya gastado.
- **Dispositivo cruzado:** el enlace pedido en el ordenador y abierto en el
  teléfono inicia la sesión en el teléfono.

El **código de 6 dígitos** no tiene ninguno de los dos problemas. Si el spike
confirma alguno, el portal pide el código, y el texto del diseño pasa de
«enlace» a «código».

### 6. Privacidad

- El email se usa **solo para dar el acceso**. Cualquier otro uso —boletines,
  avisos comerciales— requiere un consentimiento aparte, que hoy no se pide.
- Antes de abrir el alta en producción, el portal publica un **aviso de
  privacidad**: qué se guarda (email y fecha de acceso), dónde (Auth0, y Resend
  para el envío), para qué, y cómo pedir el borrado.
- **Borrado:** se borra el usuario en Auth0; no hay otra copia del email en el
  sistema. Runbook de una línea en la fase 5.
- **Pendiente:** quién redacta el texto del aviso. Es un bloqueante de la
  salida a producción, no del desarrollo.

## Alternativas consideradas

- **Una API key de verdad en nuestra base** (tabla de usuarios y claves):
  duplica lo que Auth0 ya hace —identidad, sesión, borrado—, hay que
  construirlo y protegerlo, y promete una key que no se puede usar desde código.
- **Email con contraseña:** el diseño pide expresamente «sin contraseña», y una
  contraseña más que proteger no aporta nada a un acceso gratuito de solo
  lectura.
- **Login social (Google, GitHub):** sin correo que mandar ni abuso del
  formulario. Se descartó por el diseño («solo email»), pero es la salida si el
  abuso del alta por email se vuelve caro.
- **El proveedor de correo de Auth0:** solo para pruebas.
- **Turnstile solo en el navegador:** no protege. Ver §4.

## Consecuencias

- **Positivas:**
  - ninguna tabla nueva de identidad;
  - la API de pago queda separada por permisos, sin tocar su código;
  - el email no entra en nuestra infraestructura;
  - la sesión sobrevive a recargas sin cookies de terceros.
- **Negativas / deuda asumida:**
  - **Dos dependencias externas nuevas:** Resend y Turnstile. Si cae Resend, no
    se puede entrar a Intradía e Histórico; el Dashboard sigue abierto.
  - **El rol se asigna con una Action de Auth0**, que es código fuera del repo
    si no se versiona. Se versiona en `infra/auth0/` con el resto de la
    configuración del tenant que se pueda exportar.
  - **Si gana la opción (b),** el gateway pasa a tener un POST, dos secretos más
    y una dependencia en el camino del alta.
- **Clasificación:**
  - los emails del acceso Comunidad entran en la fila existente *Identidad de
    usuarios* (Confidencial, en Auth0);
  - las claves de Resend y Turnstile, y el secreto del cliente confidencial si
    gana (b), son Restringido.
- **Impacto en threat model:** amenazas nuevas que hay que dar de alta:
  - alta automatizada (mitigada por Turnstile en servidor);
  - bombardeo de correos a terceros (límite por email);
  - enumeración de cuentas (respuesta uniforme);
  - phishing que imite el correo de acceso (DMARC en el subdominio de envío);
  - escalada desde un token Comunidad a la API de pago (permisos disjuntos).

## Verificación

- **Un token Comunidad contra cualquier ruta de `/api/v1`** → 403. Test de
  integración por cada permiso.
- **Iniciar el envío sin token de Turnstile, o con uno inválido** → no se manda
  correo, y la respuesta es idéntica a la del caso bueno.
- **Iniciar el envío directamente contra Auth0 con el `client_id` del portal**
  → rechazado: la conexión de email no está habilitada para ese cliente (si gana
  (b)), o la Bot Detection lo frena (si gana (a)).
- **El cuarto envío en una hora al mismo email** no sale, desde IPs distintas.
- **El correo llega con DKIM y SPF en `pass`** y DMARC alineado. Se comprueba
  en las cabeceras de un correo real.
- **Recargar la página con sesión** no pide otro enlace: renovación silenciosa
  de primera parte.
