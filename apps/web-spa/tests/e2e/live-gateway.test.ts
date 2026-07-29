// @vitest-environment node
/**
 * E2E en vivo contra el gateway real y el tenant Auth0 real: token por
 * client_credentials (client M2M de prueba, ADR-0017 F1) → REST autenticado
 * → WSS subscribe + ack + ping. Skip elegante (patrón pytest del monorepo) si
 * faltan credenciales o el gateway no está arriba.
 *
 *   AUTH0_M2M_CLIENT_ID=... AUTH0_M2M_CLIENT_SECRET=... npm run test:e2e:live
 */

import { describe, expect, it } from "vitest";

const DOMINIO = process.env.VITE_AUTH0_DOMAIN ?? "dev-higerotech.us.auth0.com";
const AUDIENCE = process.env.VITE_AUTH0_AUDIENCE ?? "https://api.vesmarketwatch/";
const BASE = process.env.VITE_API_BASE_URL ?? "http://localhost:8800";

const CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;

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

const razonSkip =
  CLIENT_ID === undefined || CLIENT_SECRET === undefined
    ? "sin AUTH0_M2M_CLIENT_ID/SECRET en el entorno (aprovisionar F1 — ADR-0017)"
    : null;

describe.skipIf(razonSkip !== null)(`e2e en vivo${razonSkip ? ` — SKIP: ${razonSkip}` : ""}`, () => {
  it("token M2M real → REST autenticado → WSS subscribe/ack/ping", async () => {
    if (!(await gatewayArriba())) {
      console.warn("SKIP: gateway no disponible (docker compose up -d --wait)");
      return;
    }

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
    expect(respuestaToken.ok).toBe(true);
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
        rechazar(new Error(`sin ack+ping en 40 s; recibido: ${JSON.stringify(mensajes)}`));
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
});
