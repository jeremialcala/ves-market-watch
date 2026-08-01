/**
 * Frescura por fuente (RF-5): el dashboard nunca presenta dato rancio como
 * vigente. Umbrales alineados con el backend: indicadores P2P 20 min
 * (P2P_FRESCURA_MIN del gateway), tasa oficial 6 h (ADR-0007).
 */

import type { Clave } from "../i18n/dict";

export const UMBRAL_P2P_MS = 20 * 60 * 1000;
export const UMBRAL_OFICIAL_MS = 6 * 60 * 60 * 1000;

export type Frescura = "fresco" | "rancio" | "sin-datos";

export function frescura(
  asOfIso: string | null | undefined,
  umbralMs: number,
  ahora: Date = new Date(),
): Frescura {
  if (!asOfIso) {
    return "sin-datos";
  }
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(asOf)) {
    return "sin-datos";
  }
  return ahora.getTime() - asOf > umbralMs ? "rancio" : "fresco";
}

/** Antigüedad como clave del diccionario + cantidad: quien la muestre decide
 * el idioma (`t(clave, { n })`). Sin esto, «hace 3 min» quedaría en español
 * dentro de la interfaz en inglés. */
export function relativo(
  asOfIso: string,
  ahora: Date = new Date(),
): { clave: Clave; n: number } {
  const ms = ahora.getTime() - Date.parse(asOfIso);
  if (ms < 0 || Number.isNaN(ms)) {
    return { clave: "tiempo.ahora", n: 0 };
  }
  const seg = Math.floor(ms / 1000);
  if (seg < 60) {
    return { clave: "tiempo.segundos", n: seg };
  }
  const min = Math.floor(seg / 60);
  if (min < 60) {
    return { clave: "tiempo.minutos", n: min };
  }
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    return { clave: "tiempo.horas", n: horas };
  }
  return { clave: "tiempo.dias", n: Math.floor(horas / 24) };
}

const PLANTILLA_ES: Record<Clave & `tiempo.${string}`, (n: number) => string> = {
  "tiempo.ahora": () => "ahora",
  "tiempo.segundos": (n) => `hace ${n} s`,
  "tiempo.minutos": (n) => `hace ${n} min`,
  "tiempo.horas": (n) => `hace ${n} h`,
  "tiempo.dias": (n) => `hace ${n} días`,
};

/** "hace 3 min" / "hace 2 h" en español — atajo para código sin contexto de
 * i18n (tests y utilidades). La UI usa `relativo()` + `t()`. */
export function haceRelativo(
  asOfIso: string,
  ahora: Date = new Date(),
): string {
  const { clave, n } = relativo(asOfIso, ahora);
  return PLANTILLA_ES[clave as keyof typeof PLANTILLA_ES](n);
}
