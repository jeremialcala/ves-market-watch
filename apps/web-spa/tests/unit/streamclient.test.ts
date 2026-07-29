/** StreamClient contra un servidor WS mockeado (mock-socket): suscripción,
 * push → callback, resync en cada conexión y política ante 4403. */

import { Server, WebSocket as MockWebSocket } from "mock-socket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registrarTokenProvider } from "../../src/auth/tokenProvider";
import { wsUrl } from "../../src/config";
import { StreamClient } from "../../src/ws/StreamClient";
import type { PushEvento } from "../../src/ws/messages";
import { limpiarTokenDeTest, tokenFalso } from "../soporte";

function esperar(condicion: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      if (condicion()) {
        clearInterval(intervalo);
        resolver();
      } else if (Date.now() - inicio > timeoutMs) {
        clearInterval(intervalo);
        rechazar(new Error("condición no cumplida en el timeout"));
      }
    }, 10);
  });
}

describe("StreamClient", () => {
  let token: string;
  let servidor: Server;
  let cliente: StreamClient;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    token = tokenFalso();
    // Token FIJO: la URL del mock-server debe coincidir con la del cliente.
    registrarTokenProvider({ getToken: () => Promise.resolve(token) });
    servidor = new Server(wsUrl(token));
    cliente = new StreamClient();
  });

  afterEach(() => {
    cliente.close();
    servidor.stop();
    limpiarTokenDeTest();
    vi.unstubAllGlobals();
  });

  it("al conectar se suscribe a los 4 tópicos y dispara el resync", async () => {
    const suscripciones: string[] = [];
    let resyncs = 0;
    servidor.on("connection", (socket) => {
      socket.on("message", (crudo) => suscripciones.push(String(crudo)));
    });
    cliente.start({
      alRecibir: () => {},
      alResync: () => {
        resyncs += 1;
      },
      alCambiarEstado: () => {},
    });
    await esperar(() => suscripciones.length === 1 && resyncs === 1);
    const mensaje = JSON.parse(suscripciones[0]) as {
      action: string;
      topics: string[];
    };
    expect(mensaje.action).toBe("subscribe");
    expect(mensaje.topics).toEqual([
      "rates.official",
      "p2p.snapshot",
      "indicators",
      "signals",
    ]);
  });

  it("un push del servidor llega al callback; ping y error se ignoran", async () => {
    const recibidos: PushEvento[] = [];
    servidor.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "ping" }));
      socket.send(JSON.stringify({ type: "error", detail: "sin importancia" }));
      socket.send("basura-no-json");
      socket.send(
        JSON.stringify({
          topic: "signals",
          event_id: "evento-1",
          occurred_at: "2026-07-27T12:00:00Z",
          data: { type: "techo_inminente" },
        }),
      );
    });
    cliente.start({
      alRecibir: (push) => recibidos.push(push),
      alResync: () => {},
      alCambiarEstado: () => {},
    });
    await esperar(() => recibidos.length === 1);
    expect(recibidos[0].event_id).toBe("evento-1");
    expect(recibidos[0].topic).toBe("signals");
  });

  it("cierre 4403 detiene el cliente sin reintentos", async () => {
    const estados: string[] = [];
    servidor.on("connection", (socket) => {
      socket.close({ code: 4403, reason: "sin permiso", wasClean: true });
    });
    cliente.start({
      alRecibir: () => {},
      alResync: () => {},
      alCambiarEstado: (estado) => estados.push(estado),
    });
    await esperar(() => estados.includes("detenido"));
    expect(cliente.conectado).toBe(false);
  });
});
