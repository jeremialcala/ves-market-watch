/** StreamClient contra un servidor WS mockeado (mock-socket): suscripción,
 * push → callback, resync en cada conexión y política ante 4403. */

import { Server, WebSocket as MockWebSocket } from "mock-socket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Espía sobre `decidirTrasCierre` que conserva la implementación real: lo único
 * que hace es anotar con qué `intento` se la llama. Es la ÚNICA forma de ver el
 * reinicio del contador desde fuera — el estado que emite el cliente sale
 * «reconectando» con y sin el defecto, porque `onclose` incrementa justo
 * después de que `onopen` pusiera el contador a cero.
 */
const { intentosVistos } = vi.hoisted(() => ({ intentosVistos: [] as number[] }));
vi.mock("../../src/ws/politicas", async (importarReal) => {
  const real =
    await importarReal<typeof import("../../src/ws/politicas")>();
  return {
    ...real,
    decidirTrasCierre: (
      codigo: number,
      intento: number,
      aleatorio: number,
      fallosAuth: number,
    ) => {
      intentosVistos.push(intento);
      return real.decidirTrasCierre(codigo, intento, aleatorio, fallosAuth);
    },
  };
});

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

  it("al conectar se suscribe a los 5 tópicos y dispara el resync", async () => {
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
      "analysis",
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

  it("4401 en cadena NO se reconecta en bucle: una inmediata y a esperar", async () => {
    /*
     * La regresión del 2026-08-22. El gateway ACEPTA el handshake antes de
     * validar —para que el 4401 llegue con su código en vez de un 1006 mudo—,
     * así que `onopen` dispara también cuando el token va a ser rechazado. Con
     * el `intento = 0` que había ahí y la rama de 4401 saltándose el backoff, el
     * cliente reconectaba sin esperar indefinidamente: 16 000 peticiones al
     * gateway en 18 minutos, porque cada conexión dispara además un resync REST
     * completo.
     *
     * La ventana son 400 ms y el backoff mínimo del segundo fallo es 500 ms
     * (1000 con jitter −50 %), así que aquí solo caben la conexión inicial y la
     * única reconexión inmediata que la política permite.
     */
    let conexiones = 0;
    const estados: string[] = [];
    servidor.on("connection", (socket) => {
      conexiones += 1;
      socket.close({ code: 4401, reason: "token inválido", wasClean: true });
    });
    cliente.start({
      alRecibir: () => {},
      alResync: () => {},
      alCambiarEstado: (estado) => estados.push(estado),
    });

    await esperar(() => conexiones >= 2);
    await new Promise((resolver) => setTimeout(resolver, 400));

    expect(conexiones).toBe(2);
    expect(estados[0]).toBe("conectando");
  });

  it("tras una sesión viva, el 4401 vuelve a ser inmediato", async () => {
    /*
     * La otra cara del arreglo: el caso corriente del 4401 es el token que
     * caduca en una conexión que llevaba horas funcionando, y ahí pedir uno
     * nuevo SÍ lo arregla. Si el contador de fallos no se pusiera a cero al
     * recibir mensajes, esa reconexión —la que nota el usuario— pagaría el
     * backoff de una avería que no existe.
     *
     * El ping va solo en la primera conexión: si fuera en todas, cada vuelta
     * reiniciaría el contador y el test se quedaría girando.
     */
    let conexiones = 0;
    servidor.on("connection", (socket) => {
      conexiones += 1;
      if (conexiones === 1) {
        // Primera: 4401 a secas. Deja el contador de fallos en 1.
        socket.close({ code: 4401, reason: "token inválido", wasClean: true });
        return;
      }
      if (conexiones === 2) {
        // Segunda: da señales de vida ANTES de caducar. Eso es lo que tiene
        // que devolver el contador a cero.
        socket.send(JSON.stringify({ type: "ping" }));
        setTimeout(
          () =>
            socket.close({ code: 4401, reason: "token expirado", wasClean: true }),
          20,
        );
      }
      // De la tercera en adelante, se deja abierta y el test termina.
    });
    cliente.start({
      alRecibir: () => {},
      alResync: () => {},
      alCambiarEstado: () => {},
    });

    /*
     * Sin el reinicio, el cierre de la segunda sería el fallo nº 2 y entraría
     * en el backoff: 500 ms como mínimo. La tercera conexión tiene que estar
     * aquí mucho antes, y si no llega, `esperar` agota el plazo y falla.
     */
    await esperar(() => conexiones >= 3, 300);
    expect(conexiones).toBe(3);
  });

  it("el contador de reintentos NO lo reinicia el handshake", async () => {
    /*
     * El gateway acepta el handshake antes de validar, así que `onopen` dispara
     * también en una conexión que muere al instante. Con el `intento = 0` que
     * había ahí, la política recibía SIEMPRE cero a partir del segundo intento y
     * el backoff exponencial se quedaba clavado en su valor base: un socket que
     * abre y muere en bucle reintentaba cada segundo para siempre.
     *
     * Se usa 1011 —un cierre cualquiera, rama `default`— porque el 4401 lo
     * decide `fallosAuth` y taparía lo que aquí se mide.
     */
    intentosVistos.length = 0;
    servidor.on("connection", (socket) => {
      socket.close({ code: 1011, reason: "error del servidor", wasClean: false });
    });
    cliente.start({
      alRecibir: () => {},
      alResync: () => {},
      alCambiarEstado: () => {},
    });

    await esperar(() => intentosVistos.length >= 2, 4000);

    expect(intentosVistos.slice(0, 2)).toEqual([0, 1]);
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
