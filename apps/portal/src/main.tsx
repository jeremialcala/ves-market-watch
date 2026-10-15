import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import "@criterio/ui/styles.css";
import "./index.css";

import { App } from "./App";
import { DatosProvider } from "./datos/DatosProvider";

const raiz = document.getElementById("root")!;
const arbol = (
  <StrictMode>
    <App
      rutaInicial={window.location.pathname}
      datos={(hijos) => <DatosProvider>{hijos}</DatosProvider>}
    />
  </StrictMode>
);

// Una página prerenderizada se HIDRATA: React adopta el HTML del build en vez
// de repintarlo. En `vite dev` no hay prerender y se monta de cero.
if (raiz.firstElementChild !== null) {
  hydrateRoot(raiz, arbol);
} else {
  createRoot(raiz).render(arbol);
}
