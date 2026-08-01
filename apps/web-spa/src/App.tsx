import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

import { alCambiarCuota } from "./api/client";
import { RequireAuth } from "./auth/RequireAuth";
import { Footer } from "./components/shell/Footer";
import { NavBar } from "./components/shell/NavBar";
import { StatusStrip } from "./components/shell/StatusStrip";
import { marketStore } from "./state/marketStore";
import { AnalysisView } from "./views/AnalysisView";
import { DashboardView } from "./views/DashboardView";
import { HistoryView } from "./views/HistoryView";
import { IntradayView } from "./views/IntradayView";
import type { Vista } from "./views/vistas";
import { useStream } from "./ws/useStream";

function Tablero() {
  const [vista, setVista] = useState<Vista>("dashboard");
  const { user, logout } = useAuth0();
  useStream();

  useEffect(() => {
    alCambiarCuota((cuota) => marketStore.cuota(cuota));
    return () => alCambiarCuota(null);
  }, []);

  return (
    <div className="vmw-app">
      <header className="vmw-shell">
        <StatusStrip />
        <NavBar
          vista={vista}
          onVista={setVista}
          usuario={user?.name ?? user?.email ?? ""}
          onSalir={() =>
            logout({ logoutParams: { returnTo: window.location.origin } })
          }
        />
      </header>
      {vista === "dashboard" ? <DashboardView /> : null}
      {vista === "analisis" ? <AnalysisView /> : null}
      {vista === "intradia" ? <IntradayView /> : null}
      {vista === "historico" ? <HistoryView /> : null}
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <RequireAuth>
      <Tablero />
    </RequireAuth>
  );
}
