/**
 * Frescura por fuente (RF-5): el dashboard nunca presenta dato rancio como
 * vigente. Umbrales alineados con el backend: indicadores P2P 20 min
 * (P2P_FRESCURA_MIN del gateway), tasa oficial 6 h (ADR-0007).
 */

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

/** "hace 3 min" / "hace 2 h" para badges (es). */
export function haceRelativo(
  asOfIso: string,
  ahora: Date = new Date(),
): string {
  const ms = ahora.getTime() - Date.parse(asOfIso);
  if (ms < 0 || Number.isNaN(ms)) {
    return "ahora";
  }
  const seg = Math.floor(ms / 1000);
  if (seg < 60) {
    return `hace ${seg} s`;
  }
  const min = Math.floor(seg / 60);
  if (min < 60) {
    return `hace ${min} min`;
  }
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    return `hace ${horas} h`;
  }
  return `hace ${Math.floor(horas / 24)} días`;
}
