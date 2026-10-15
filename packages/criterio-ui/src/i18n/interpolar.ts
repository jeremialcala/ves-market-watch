/** Sustituye `{nombre}` por su valor; deja el marcador si falta el parámetro. */
export function interpolar(
  plantilla: string,
  params?: Record<string, string | number>,
): string {
  if (params === undefined) {
    return plantilla;
  }
  return plantilla.replace(/\{(\w+)\}/g, (marcador, nombre: string) =>
    nombre in params ? String(params[nombre]) : marcador,
  );
}
