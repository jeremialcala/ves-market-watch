/** El playground de APIs: la llamada de ejemplo y su ejecución real (RF-7). */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Endpoint } from "../../src/catalogo/generar";
import {
  baseWss,
  comandoCurl,
  comandoWscat,
  ejecutarHttp,
  frase,
  probarWss,
  urlEndpoint,
} from "../../src/lib/playground";

const BASE = "https://criterio-api-dev.higerotech.com";

function endpoint(parcial: Partial<Endpoint>): Endpoint {
  return {
    ruta: "/api/v1/health",
    resumen: "Salud",
    descripcion: "",
    grupo: "sistema",
    publico: true,
    parametros: [],
    consulta: "",
    respuesta: null,
    ...parcial,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("la llamada de ejemplo", () => {
  it("público: curl sin cabecera", () => {
    expect(comandoCurl(BASE, endpoint({}))).toBe(`curl "${BASE}/api/v1/health"`);
  });

  it("de pago: el token va en Authorization, en dos líneas", () => {
    const p2p = endpoint({ ruta: "/api/v1/rates/p2p/current", consulta: "?side=buy", publico: false });
    expect(urlEndpoint(BASE, p2p)).toBe(`${BASE}/api/v1/rates/p2p/current?side=buy`);
    const curl = comandoCurl(BASE, p2p);
    expect(curl.split("\n")).toEqual([
      'curl -H "Authorization: Bearer $CRITERIO_TOKEN" ' + String.fromCharCode(92),
      `  "${BASE}/api/v1/rates/p2p/current?side=buy"`,
    ]);
  });

  it("WSS: el token en la query del handshake y el mensaje de suscripción", () => {
    expect(baseWss(BASE)).toBe("wss://criterio-api-dev.higerotech.com");
    expect(baseWss("http://localhost:8000")).toBe("ws://localhost:8000");
    expect(comandoWscat(BASE, "/ws/v1", '{"action":"subscribe"}')).toBe(
      'wscat -c "wss://criterio-api-dev.higerotech.com/ws/v1?token=$CRITERIO_TOKEN"\n> {"action":"subscribe"}',
    );
  });

  it("la frase de estado que HTTP/2 no manda", () => {
    expect(frase(401)).toBe("Unauthorized");
    expect(frase(200, "OK")).toBe("OK");
    expect(frase(418)).toBe("");
  });
});

describe("ejecutar contra el gateway", () => {
  function reloj(...marcas: number[]) {
    return () => marcas.shift() ?? 0;
  }

  it("JSON formateado, estado y milisegundos", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await ejecutarHttp(`${BASE}/api/v1/health`, reloj(100, 121.4));
    expect(r).toEqual({ tipo: "http", estado: 200, frase: "OK", ms: 21, cuerpo: '{\n  "status": "ok"\n}' });
    expect(fetchFalso).toHaveBeenCalledWith(`${BASE}/api/v1/health`, { headers: { Accept: "application/json" } });
  });

  it("un cuerpo que no es JSON va tal cual", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    const r = await ejecutarHttp(`${BASE}/x`, reloj(0, 5));
    expect(r).toMatchObject({ estado: 502, frase: "Bad Gateway", cuerpo: "Bad gateway" });
  });

  it("red caída o CORS: sin respuesta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await ejecutarHttp(`${BASE}/x`, reloj(0, 30))).toEqual({ tipo: "error", ms: 30 });
  });
});

class WebSocketFalso {
  static ultimo: WebSocketFalso | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) {
    WebSocketFalso.ultimo = this;
  }
  close() {
    this.onclose?.({ code: 1005, reason: "" });
  }
}

describe("probar el WSS", () => {
  it("devuelve el cierre del servidor: 4401 sin token", async () => {
    vi.stubGlobal("WebSocket", WebSocketFalso);
    const promesa = probarWss("wss://x/ws/v1", 10_000, (() => {
      const marcas = [0, 77];
      return () => marcas.shift() ?? 0;
    })());
    expect(WebSocketFalso.ultimo?.url).toBe("wss://x/ws/v1");
    WebSocketFalso.ultimo?.onclose?.({ code: 4401, reason: "token requerido" });
    expect(await promesa).toEqual({ tipo: "wss", codigo: 4401, razon: "token requerido", ms: 77 });
  });

  it("si el servidor no cierra, cierra el cliente al límite", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", WebSocketFalso);
    const promesa = probarWss("wss://x/ws/v1", 1000, () => 0);
    vi.advanceTimersByTime(1000);
    expect(await promesa).toMatchObject({ tipo: "wss", codigo: 1005 });
  });

  it("una URL que el navegador rechaza", async () => {
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          throw new SyntaxError("URL inválida");
        }
      },
    );
    expect(await probarWss("no-es-url")).toEqual({ tipo: "error", ms: 0 });
  });
});
