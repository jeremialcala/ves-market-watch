/**
 * Cliente de `/portal/v1` (ADR-0028). Sin token: es la lectura pública.
 *
 * La base sale de `VITE_PORTAL_API` en el build de producción (otro origen:
 * el portal vive en Workers y el gateway detrás del túnel). Vacía, la petición
 * es al mismo origen, que en desarrollo atiende el proxy de Vite.
 */

import type { components } from "./portal.gen";

export type Snapshot = components["schemas"]["PortalSnapshot"];
export type Series = components["schemas"]["PortalSeries"];
export type Medidor = components["schemas"]["Medidor"];
export type ProximidadRegla = components["schemas"]["ProximidadRegla"];

export const BASE_API: string = import.meta.env.VITE_PORTAL_API ?? "";

export const RUTA_SNAPSHOT = "/portal/v1/snapshot";
export const RUTA_SERIES = "/portal/v1/dashboard/series";
