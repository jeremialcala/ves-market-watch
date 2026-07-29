import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

import { alCambiarCuota } from "./api/client";
import { RequireAuth } from "./auth/RequireAuth";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { marketStore } from "./state/marketStore";
import { DashboardView } from "./views/DashboardView";
import { HistoryView } from "./views/HistoryView";
import { IntradayView } from "./views/IntradayView";
import { useStream } from "./ws/useStream";

type Vista = "dashboard" | "intradia" | "historico";

const VISTAS: ReadonlyArray<{ clave: Vista; etiqueta: string }> = [
  { clave: "dashboard", etiqueta: "Dashboard" },
  { clave: "intradia", etiqueta: "Intradía" },
  { clave: "historico", etiqueta: "Histórico" },
];

function Tablero() {
  const [vista, setVista] = useState<Vista>("dashboard");
  const { user, logout } = useAuth0();
  useStream();

  useEffect(() => {
    alCambiarCuota((cuota) => marketStore.cuota(cuota));
    return () => alCambiarCuota(null);
  }, []);

  return (
    <>
      <header className="shell-header">
        <h1>VES Market Watch</h1>
        <nav className="tabs" role="tablist" aria-label="Vistas">
          {VISTAS.map(({ clave, etiqueta }) => (
            <button
              key={clave}
              role="tab"
              aria-selected={vista === clave}
              onClick={() => setVista(clave)}
            >
              {etiqueta}
            </button>
          ))}
        </nav>
        <div className="header-derecha">
          <ConnectionStatus />
          <span>{user?.name ?? user?.email ?? ""}</span>
          <button
            onClick={() =>
              logout({ logoutParams: { returnTo: window.location.origin } })
            }
          >
            Salir
          </button>
        </div>
      </header>
      {vista === "dashboard" ? <DashboardView /> : null}
      {vista === "intradia" ? <IntradayView /> : null}
      {vista === "historico" ? <HistoryView /> : null}
    </>
  );
}

export function App() {
  return (
    <RequireAuth>
      <Tablero />
    </RequireAuth>
  );
}
