/**
 * El portal entero: proveedores, marco y la página de la ruta.
 *
 * Lo comparten el cliente (`main.tsx`) y el prerender (`entry-server.tsx`): la
 * única diferencia es de dónde sale la ruta inicial y si hay datos en vivo.
 */

import { I18nProvider, ThemeProvider } from "@criterio/ui";
import { useEffect, type ReactNode } from "react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { Pie } from "./componentes/Pie";
import { useT } from "./i18n/contexto";
import { DICCIONARIOS } from "./i18n/dict";
import { Dashboard } from "./paginas/Dashboard";
import { NoEncontrada, Pronto } from "./paginas/Pronto";
import { Producto } from "./paginas/Producto";
import { RouterProvider } from "./router";
import { useRuta } from "./router/contexto";
import { buscarRuta } from "./rutas";

function Pagina() {
  const { ruta } = useRuta();
  const t = useT();
  const actual = buscarRuta(ruta);

  // El título de la pestaña sigue a la ruta y al idioma. En el prerender lo
  // escribe el script, que no ejecuta efectos.
  useEffect(() => {
    document.title =
      actual === null || actual.ruta === "/"
        ? t("hero.etiqueta")
        : `${t(actual.titulo)} · ${t("app.nombre")}`;
  }, [actual, t]);

  if (actual === null) {
    return <NoEncontrada />;
  }
  if (actual.ruta === "/") {
    return <Producto />;
  }
  if (actual.ruta === "/dashboard") {
    return <Dashboard />;
  }
  return <Pronto ruta={actual} />;
}

export function App({
  rutaInicial,
  datos,
}: {
  rutaInicial: string;
  /** El proveedor de datos en vivo; en el prerender no hay. */
  datos?: (hijos: ReactNode) => ReactNode;
}) {
  const marco = (
    <div className="portal">
      <BarraSuperior />
      <Pagina />
      <Pie />
    </div>
  );
  return (
    <ThemeProvider hidratar>
      <I18nProvider diccionarios={DICCIONARIOS} hidratar>
        <RouterProvider rutaInicial={rutaInicial}>{datos ? datos(marco) : marco}</RouterProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
