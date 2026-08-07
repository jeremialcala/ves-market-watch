// @vitest-environment node
/**
 * E2E en vivo contra el gateway real y el tenant Auth0 real.
 *
 * Dos suites con requisitos distintos, y separarlas es deliberado:
 *
 * - **Rechazos** — no necesitan credenciales, así que corren siempre que el
 *   gateway esté arriba. Son las aserciones de T11 (firma, audiencias ajenas) y
 *   T15 (autoridad ambiental) y hasta ahora **solo existían como unit tests**:
 *   en vivo intervienen nginx, el túnel y el proxy, y un despliegue mal
 *   configurado puede dejar pasar algo que el unit test no ve porque ahí no hay
 *   ni nginx ni túnel.
 * - **Camino feliz** — `client_credentials` con el client M2M de prueba
 *   (ADR-0017 F1) → REST autenticado → WSS subscribe + ack + ping. Salta sin
 *   credenciales, con el patrón de pytest del monorepo.
 *
 *   AUTH0_M2M_CLIENT_ID=… AUTH0_M2M_CLIENT_SECRET=… npm run test:e2e:live
 *
 * El secreto no vive en el repo ni se imprime: viaja por entorno y ningún
 * mensaje de error lo incluye.
 *
 * **La disponibilidad del gateway se resuelve UNA vez y las suites usan
 * `skipIf`.** La primera versión hacía `if (!arriba) return` dentro de cada
 * test, y eso reportaba **PASSED** con el gateway apagado: una suite que
 * certifica nada. Se comprobó apuntando a un puerto muerto —salían cinco en
 * verde—. Con `skipIf` el informe dice «skipped», que es la verdad.
 */

import { describe, expect, it } from "vitest";

const DOMINIO = process.env.VITE_AUTH0_DOMAIN ?? "auth.higerotech.com";
const AUDIENCE = process.env.VITE_AUTH0_AUDIENCE ?? "https://api.vesmarketwatch/";
const BASE = process.env.VITE_API_BASE_URL ?? "http://localhost:8800";

const CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;

/** Cierre WSS del contrato: 4401 sin token, con token inválido o expirado. */
const CIERRE_NO_AUTENTICADO = 4401;

/**
 * JWT bien formado y firmado por nadie.
 *
 * Se CONSTRUYE en vez de escribirse literal: un JWT en el codigo fuente dispara
 * el escaner de secretos (`generic-api-key`, entropia 4,65) y ya lo hizo. La
 * alternativa era una excepcion en `.gitleaks.toml`, pero silenciar un hallazgo
 * verdadero-en-forma para meter un token de mentira es peor que no tener el
 * literal: asi el gate conserva los dientes y ademas se lee lo que el token dice.
 */
const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN_FALSO = [
  b64({ alg: "RS256", typ: "JWT", kid: "inexistente" }),
  b64({ sub: "atacante", aud: AUDIENCE }),
  "firma-inventada",
].join(".");

async function gatewayArriba(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Código con el que el gateway cierra el WSS; `null` si nunca cerró. */
function cierreWss(url: string): Promise<number | null> {
  return new Promise((resolver) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      resolver(null);
    }, 15_000);
    ws.onclose = (evento) => {
      clearTimeout(timeout);
      resolver(evento.code);
    };
  });
}

const GATEWAY_VIVO = await gatewayArriba();

describe.skipIf(!GATEWAY_VIVO)(
  `e2e en vivo · rechazos${GATEWAY_VIVO ? "" : " — SKIP: gateway no disponible"}`,
  () => {
    it("REST sin token responde 401, no 200 ni 500", async () => {
      const r = await fetch(`${BASE}/api/v1/indicators/current?currency=USD`);

      expect(r.status).toBe(401);
      // El contrato exige problem+json en TODOS los errores, también los de auth.
      expect(r.headers.get("content-type")).toContain("application/problem+json");
    });

    it("REST con un token inventado responde 401 y no dice por qué falló", async () => {
      /*
       * T11: la firma se valida contra el JWKS. Y el cuerpo no debe explicar qué
       * parte falló —«kid desconocido», «firma inválida»—, porque eso es un
       * oráculo para quien esté probando el borde.
       */
      const r = await fetch(`${BASE}/api/v1/indicators/current?currency=USD`, {
        headers: { authorization: `Bearer ${TOKEN_FALSO}` },
      });

      expect(r.status).toBe(401);
      expect(await r.text()).not.toMatch(/kid|signature|jwks|firma/i);
    });

    it("el health sigue público: es lo que mira el orquestador", async () => {
      const r = await fetch(`${BASE}/api/v1/health`);

      expect(r.status).toBe(200);
    });

    it("WSS sin token CIERRA con 4401, no con un 1006 mudo", async () => {
      /*
       * El defecto que esto vigila ya ocurrió. Al cerrar sin aceptar el
       * handshake, Starlette abortaba con un HTTP 403 y el navegador recibía
       * 1006 —cierre anormal, sin motivo—, con lo que el 4401 del contrato era
       * inalcanzable para el único cliente que existe: el SPA caía en el
       * `default` de su política y reintentaba con el MISMO token caducado.
       *
       * Solo se ve con un handshake HTTP real. El `TestClient` de Starlette es
       * in-process y no lo reproduce: los unit tests pasaban con el fallo puesto.
       */
      expect(await cierreWss(`${BASE.replace(/^http/, "ws")}/ws/v1`)).toBe(
        CIERRE_NO_AUTENTICADO,
      );
    });

    it("WSS con token inventado cierra igual con 4401", async () => {
      const url = `${BASE.replace(/^http/, "ws")}/ws/v1?token=${encodeURIComponent(TOKEN_FALSO)}`;

      expect(await cierreWss(url)).toBe(CIERRE_NO_AUTENTICADO);
    });
  },
);

const razonSkip =
  CLIENT_ID === undefined || CLIENT_SECRET === undefined
    ? "sin AUTH0_M2M_CLIENT_ID/SECRET en el entorno (aprovisionar F1 — ADR-0017)"
    : !GATEWAY_VIVO
      ? "gateway no disponible"
      : null;

describe.skipIf(razonSkip !== null)(
  `e2e en vivo · camino feliz${razonSkip ? ` — SKIP: ${razonSkip}` : ""}`,
  () => {
    it("token M2M real → REST autenticado → WSS subscribe/ack/ping", async () => {
      // 1. client_credentials contra el tenant real
      const respuestaToken = await fetch(`https://${DOMINIO}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          audience: AUDIENCE,
        }),
      });
      // Sin cuerpo en el error: traería el `client_secret` de vuelta en el eco.
      expect(respuestaToken.status, "el tenant rechazó las credenciales M2M").toBe(
        200,
      );
      const { access_token } = (await respuestaToken.json()) as {
        access_token: string;
      };
      expect(access_token).toMatch(/^eyJ/);

      // 2. REST autenticado: 200 con datos o 404 problem+json — ambas formas
      //    válidas del contrato (RF-5: sin datos frescos no es un error).
      const respuestaRest = await fetch(
        `${BASE}/api/v1/indicators/current?currency=USD`,
        { headers: { authorization: `Bearer ${access_token}` } },
      );
      expect([200, 404]).toContain(respuestaRest.status);
      expect(respuestaRest.headers.get("x-ratelimit-limit")).not.toBeNull();
      if (respuestaRest.status === 404) {
        expect(respuestaRest.headers.get("content-type")).toContain(
          "application/problem+json",
        );
      } else {
        const cuerpo = (await respuestaRest.json()) as { currency: string };
        expect(cuerpo.currency).toBe("USD");
      }

      // 3. WSS: handshake con el token real → subscribe → ack → ping (≤ 35 s)
      const url = `${BASE.replace(/^http/, "ws")}/ws/v1?token=${encodeURIComponent(access_token)}`;
      const mensajes: { type?: string; topics?: string[] }[] = [];
      await new Promise<void>((resolver, rechazar) => {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => {
          ws.close();
          rechazar(
            new Error(`sin ack+ping en 40 s; recibido: ${JSON.stringify(mensajes)}`),
          );
        }, 40_000);
        ws.onopen = () =>
          ws.send(JSON.stringify({ action: "subscribe", topics: ["signals"] }));
        ws.onmessage = (evento) => {
          const mensaje = JSON.parse(String(evento.data)) as { type?: string };
          mensajes.push(mensaje);
          const tipos = mensajes.map((m) => m.type);
          if (tipos.includes("subscribed") && tipos.includes("ping")) {
            clearTimeout(timeout);
            ws.close(1000);
            resolver();
          }
        };
        ws.onclose = (evento) => {
          if (evento.code !== 1000) {
            clearTimeout(timeout);
            rechazar(new Error(`WSS cerró con ${evento.code}: ${evento.reason}`));
          }
        };
      });
      const ack = mensajes.find((m) => m.type === "subscribed");
      expect(ack?.topics).toEqual(["signals"]);
    }, 60_000);
  },
);
