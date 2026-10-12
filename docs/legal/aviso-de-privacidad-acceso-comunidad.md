# Aviso de privacidad — acceso Comunidad de Criterio

> **BORRADOR para revisión (2026-10-04).** Redactado a partir de ADR-0029 §6.
> **No es asesoría legal**: antes de publicarlo lo revisa Jeremi Alcalá y, si
> hace falta, un abogado. Los campos entre **[corchetes]** son datos que el
> borrador no puede saber y hay que completar. Bloquea la salida a producción
> del acceso Comunidad (fase 5 del plan), no su desarrollo. La versión en inglés
> se traduce de esta cuando esté aprobada.

---

**Última actualización:** [fecha de publicación]

Este aviso explica qué datos personales tratamos cuando creas un **acceso
Comunidad** en Criterio (criterio.higerotech.com) para ver Intradía e
Histórico, para qué los usamos y cómo puedes pedir que los borremos.

El Dashboard, la página de Producto, Precios, APIs y Estado se pueden ver **sin
crear ningún acceso**, y para eso no te pedimos ningún dato.

## Quién es el responsable

**[Razón social de Higerotech]**, con domicilio en **[dirección]**. Para
cualquier asunto de privacidad: **contacto@higerotech.com**.

## Qué datos tratamos

| Dato | Cuándo | Para qué |
|---|---|---|
| **Tu email** | al pedir el acceso | enviarte el enlace o código de acceso e identificar tu cuenta |
| **Fecha y hora de cada acceso** | al entrar | mantener tu sesión y detectar usos abusivos |
| **Tu dirección IP** | al pedir el acceso y al navegar | limitar el número de solicitudes, para evitar envíos masivos y abuso. **No la guardamos:** se usa en memoria durante una ventana de una hora como máximo |
| **Señales técnicas del navegador** | al pedir el acceso | la verificación anti-bots de Cloudflare Turnstile, que las procesa Cloudflare |

**No** te pedimos nombre, teléfono, contraseña ni datos de pago. **No**
guardamos tu email en nuestra base de datos: vive en nuestro proveedor de
identidad (ver abajo), y nuestros sistemas solo ven un identificador interno de
tu cuenta.

## Para qué los usamos, y para qué no

- **Solo para darte el acceso Comunidad** y mantenerlo seguro.
- **No** te enviamos boletines, ofertas ni comunicaciones comerciales. Si algún
  día queremos hacerlo, te lo pediremos por separado y podrás decir que no sin
  perder el acceso.
- **No** vendemos ni cedemos tus datos a terceros.

**Base del tratamiento:** **[a confirmar según la jurisdicción aplicable, por
ejemplo: tu consentimiento al solicitar el acceso, o la ejecución del servicio
que pides]**.

## Quién más los trata (encargados)

Para prestar el servicio usamos estos proveedores, que tratan tus datos por
cuenta nuestra:

| Proveedor | Qué hace | Qué datos ve |
|---|---|---|
| **Auth0 (Okta)** | gestiona tu cuenta y tu sesión | email, fechas de acceso, IP del inicio de sesión |
| **Resend** | envía el correo de acceso | email y contenido del correo |
| **Cloudflare** | entrega el sitio y la verificación anti-bots (Turnstile) | IP y señales técnicas del navegador |

Estos proveedores pueden tratar los datos **fuera de Venezuela**, en
particular en **Estados Unidos**. **[Revisar las garantías que ofrece cada uno
para transferencias internacionales y, si aplica, citarlas aquí.]**

## Cuánto tiempo los conservamos

- **Tu cuenta y tu email:** mientras tengas el acceso Comunidad, o hasta que
  pidas borrarlo. **[A decidir: si se borran automáticamente las cuentas sin uso
  tras un periodo, por ejemplo 12 meses sin acceder.]**
- **Tu IP:** no se conserva (ver arriba).
- **Los registros de acceso del proveedor de identidad:** el tiempo que fija
  Auth0 en su plan, **[completar]**.

## Cookies y almacenamiento en tu navegador

- **Una cookie de sesión** en `auth.higerotech.com`, el dominio de inicio de
  sesión, que mantiene tu sesión sin pedirte otro enlace cada vez.
- Las **cookies de Cloudflare** necesarias para la seguridad del sitio y para
  Turnstile.
- **No** usamos cookies de publicidad ni de seguimiento de terceros. Los tokens
  de acceso se guardan **solo en la memoria** de la pestaña, no en el
  almacenamiento del navegador.

## Tus derechos

Puedes pedirnos en cualquier momento, escribiendo a **contacto@higerotech.com**
desde el mismo email de tu acceso:

- **qué datos tenemos** sobre ti;
- que los **corrijamos**;
- que los **borremos**. Borramos tu cuenta en el proveedor de identidad, que es
  la única copia de tu email en nuestros sistemas, y te confirmamos el borrado.

**[Completar el plazo de respuesta y, si aplica, la autoridad ante la que puedes
reclamar.]**

## Cambios en este aviso

Si cambiamos algo importante, lo indicaremos en esta página con la fecha de
actualización y, si afecta a cómo usamos tu email, te avisaremos antes por
correo.

---

### Notas para la revisión (no se publican)

- **Coherencia con el sistema:** cada afirmación de arriba tiene que seguir
  siendo verdad cuando se implemente la fase 5. Las que dependen de decisiones:
  - «no guardamos tu email»: ADR-0029 §2;
  - «la IP no se guarda»: ADR-0028 §3 y ADR-0029 §4, el limitador en memoria;
  - «tokens solo en memoria»: ADR-0017 y ADR-0020.

  Si el spike de la fase 5 elige el endpoint propio `POST /portal/v1/acceso`
  (ADR-0029 §4, opción b), **el email pasaría por nuestro gateway** de camino a
  Auth0. Hay que añadir que no se registra ni se guarda, y que sea verdad: los
  logs del gateway no pueden incluir el cuerpo de esa petición.
- **Enlace o código:** el aviso habla de «enlace o código» hasta que el spike
  decida (ADR-0029 §5).
- **Clasificación de datos:** el email de los usuarios Comunidad entra en la
  fila *Identidad de usuarios* (Confidencial, en Auth0).
