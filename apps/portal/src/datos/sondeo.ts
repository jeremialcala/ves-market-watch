/**
 * El «en vivo» del portal: sondeo con educación (RF-3, ADR-0028 §5).
 *
 * - Pide en cuanto monta y después cada `intervaloMs`.
 * - **Se para con la pestaña oculta** y pide en cuanto vuelve a verse: una
 *   pestaña olvidada no le cuesta nada a nadie.
 * - Ante un **429 o un 5xx retrocede** con jitter, y si llega `Retry-After`,
 *   no vuelve antes, aunque la pestaña se oculte y reaparezca. Un error de red
 *   cuenta igual: sin conexión no se reintenta en bucle.
 * - **Conserva el último dato** cuando falla: el portal lo sigue mostrando,
 *   con su edad, y dice «sin conexión».
 *
 * Lógica sin React, sobre `fetch`, documento y azar inyectables, para probarla
 * con tiempo falso.
 */

export type EstadoSondeo = "cargando" | "en-vivo" | "sin-conexion";

export interface Instantanea<T> {
  datos: T | null;
  estado: EstadoSondeo;
}

type Documento = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export interface OpcionesSondeo {
  url: string;
  intervaloMs: number;
  /** Tope del retroceso. */
  maxEsperaMs?: number;
  fetch?: typeof fetch;
  documento?: Documento;
  azar?: () => number;
}

export function esperaTrasFallo(
  fallos: number,
  intervaloMs: number,
  maxEsperaMs: number,
  retryAfterS: number | null,
  azar: () => number,
): number {
  const exponencial = Math.min(maxEsperaMs, intervaloMs * 2 ** fallos);
  // Jitter de ±20 %: que mil pestañas no vuelvan todas en el mismo segundo.
  const conJitter = Math.round(exponencial * (0.8 + 0.4 * azar()));
  const minimo = retryAfterS === null ? 0 : retryAfterS * 1000;
  return Math.max(minimo, conJitter);
}

/** `Retry-After` en segundos, que es la forma que usa el gateway. */
export function leerRetryAfter(valor: string | null): number | null {
  if (valor === null || !/^\d+$/.test(valor.trim())) {
    return null;
  }
  return Number(valor.trim());
}

export function crearSondeo<T>(
  opciones: OpcionesSondeo,
  alCambiar: (instantanea: Instantanea<T>) => void,
): () => void {
  const {
    url,
    intervaloMs,
    maxEsperaMs = 5 * 60_000,
    fetch: pedir = (entrada, init) => globalThis.fetch(entrada, init),
    documento = document,
    azar = Math.random,
  } = opciones;

  let actual: Instantanea<T> = { datos: null, estado: "cargando" };
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let fallos = 0;
  let parado = false;
  let enVuelo: AbortController | null = null;
  // Hasta cuándo no se puede volver a pedir tras un fallo (`Retry-After` o el
  // retroceso), aunque la pestaña vuelva a verse antes.
  let noAntesDe = 0;

  const publicar = (siguiente: Instantanea<T>) => {
    actual = siguiente;
    alCambiar(actual);
  };

  const cancelarTemporizador = () => {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  };

  const programar = (ms: number) => {
    cancelarTemporizador();
    temporizador = setTimeout(() => void pedirAhora(), ms);
  };

  async function pedirAhora() {
    temporizador = null;
    if (parado || documento.visibilityState === "hidden") {
      return;
    }
    enVuelo?.abort();
    const control = new AbortController();
    enVuelo = control;
    let retryAfter: number | null = null;
    try {
      const respuesta = await pedir(url, {
        signal: control.signal,
        headers: { Accept: "application/json" },
      });
      if (respuesta.ok) {
        const datos = (await respuesta.json()) as T;
        fallos = 0;
        noAntesDe = 0;
        publicar({ datos, estado: "en-vivo" });
        programar(intervaloMs);
        return;
      }
      retryAfter = leerRetryAfter(respuesta.headers.get("Retry-After"));
    } catch {
      // Error de red o cuerpo ilegible: cuenta como fallo, igual que un 5xx.
    }
    if (parado || control.signal.aborted) {
      return;
    }
    fallos += 1;
    const espera = esperaTrasFallo(fallos, intervaloMs, maxEsperaMs, retryAfter, azar);
    noAntesDe = Date.now() + espera;
    publicar({ datos: actual.datos, estado: "sin-conexion" });
    programar(espera);
  }

  const alCambiarVisibilidad = () => {
    if (documento.visibilityState === "hidden") {
      cancelarTemporizador();
      return;
    }
    programar(Math.max(0, noAntesDe - Date.now()));
  };

  documento.addEventListener("visibilitychange", alCambiarVisibilidad);
  programar(0);

  return () => {
    parado = true;
    enVuelo?.abort();
    cancelarTemporizador();
    documento.removeEventListener("visibilitychange", alCambiarVisibilidad);
  };
}
