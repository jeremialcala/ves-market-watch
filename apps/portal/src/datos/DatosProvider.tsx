/**
 * Un solo sondeo del snapshot y uno de las series para todo el portal: la
 * barra superior y la página leen del mismo, así que una pestaña hace una
 * petición cada 10 s, no una por panel.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BASE_API, RUTA_SERIES, RUTA_SNAPSHOT, type Series, type Snapshot } from "../api/cliente";
import { DatosContext, type ContextoDatos } from "./contexto";
import { crearSondeo, type Instantanea } from "./sondeo";

export const INTERVALO_SNAPSHOT_MS = 10_000;
export const INTERVALO_SERIES_MS = 60_000;

export function DatosProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Instantanea<Snapshot>>({ datos: null, estado: "cargando" });
  const [series, setSeries] = useState<Instantanea<Series>>({ datos: null, estado: "cargando" });

  useEffect(
    () =>
      crearSondeo<Snapshot>(
        { url: BASE_API + RUTA_SNAPSHOT, intervaloMs: INTERVALO_SNAPSHOT_MS },
        setSnapshot,
      ),
    [],
  );
  useEffect(
    () =>
      crearSondeo<Series>({ url: BASE_API + RUTA_SERIES, intervaloMs: INTERVALO_SERIES_MS }, setSeries),
    [],
  );

  const valor = useMemo<ContextoDatos>(() => ({ snapshot, series }), [snapshot, series]);
  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}
