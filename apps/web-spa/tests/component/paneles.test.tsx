/** Paneles del dashboard alimentados por el marketStore real (sin red):
 * estados con datos, degradados (low/stale/rancio) y vacíos honestos. */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "../../src/components/ConnectionStatus";
import { GapPanel } from "../../src/components/GapPanel";
import { MicrostructurePanel } from "../../src/components/MicrostructurePanel";
import { OfficialRatePanel } from "../../src/components/OfficialRatePanel";
import { P2PReferencePanel } from "../../src/components/P2PReferencePanel";
import { SignalsFeed } from "../../src/components/SignalsFeed";
import { marketStore } from "../../src/state/marketStore";
import {
  FIXTURE_INDICADORES,
  FIXTURE_INDICADORES_NULOS,
  FIXTURE_P2P_LOW,
  FIXTURE_SENAL,
  FIXTURE_TASA,
} from "../contract/fixtures.test";

afterEach(() => {
  cleanup();
  marketStore.reset();
});

describe("GapPanel", () => {
  it("sin indicadores muestra el vacío honesto", () => {
    render(<GapPanel />);
    expect(screen.getByText(/sin indicadores calculados/i)).toBeTruthy();
  });

  it("muestra la brecha formateada es-VE con su spread", () => {
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);
    expect(screen.getByText("103,83 %")).toBeTruthy();
    // 433.00000000 → los decimales no significativos se omiten
    expect(screen.getByText(/433 VES sobre la oficial/)).toBeTruthy();
    expect(screen.getByText(/-0,35 %/)).toBeTruthy();
  });

  it("nulls como «—» y bandera de oficial stale", () => {
    marketStore.resync({ indicadores: FIXTURE_INDICADORES_NULOS });
    render(<GapPanel />);
    expect(screen.getByText("oficial stale")).toBeTruthy();
    expect(screen.getByText(/sin snapshot p2p reciente/i)).toBeTruthy();
  });
});

describe("P2PReferencePanel", () => {
  it("resalta la confianza baja y muestra el lado faltante como sin datos", () => {
    marketStore.resync({ p2p: { buy: FIXTURE_P2P_LOW } });
    render(<P2PReferencePanel />);
    expect(screen.getByText("confianza baja")).toBeTruthy();
    expect(screen.getByText("853,10")).toBeTruthy();
    expect(screen.getByText(/sin referencia fresca/i)).toBeTruthy();
  });
});

describe("OfficialRatePanel", () => {
  it("vacío honesto sin tasas", () => {
    render(<OfficialRatePanel />);
    expect(screen.getByText(/sin tasas oficiales/i)).toBeTruthy();
  });

  it("tarjeta por moneda con bandera stale cuando aplica", () => {
    marketStore.resync({
      tasas: {
        USD: FIXTURE_TASA,
        EUR: { ...FIXTURE_TASA, currency: "EUR", rate: "480.10", stale: true },
      },
    });
    render(<OfficialRatePanel />);
    expect(screen.getByText("USD/VES")).toBeTruthy();
    expect(screen.getByText("480,10")).toBeTruthy();
    expect(screen.getByText("stale")).toBeTruthy();
  });
});

describe("MicrostructurePanel", () => {
  it("muestra las métricas vigentes con su formato", () => {
    marketStore.push({
      topic: "indicators",
      event_id: "evento-micro",
      occurred_at: "2026-07-27T12:00:00Z",
      data: {
        as_of: "2026-07-27T12:00:00Z",
        calc_version: 1,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [
          {
            indicator: "p2p_ratio_oferta_demanda",
            currency: "VES",
            value: "2.40000000",
          },
          {
            indicator: "p2p_momentum_bid_3h_pct",
            currency: "VES",
            value: "-1.20000000",
          },
        ],
      },
    });
    render(<MicrostructurePanel />);
    expect(screen.getByText("Ratio oferta/demanda")).toBeTruthy();
    expect(screen.getByText("2,40")).toBeTruthy();
    expect(screen.getByText("-1,20 %")).toBeTruthy();
  });
});

describe("SignalsFeed", () => {
  it("lista la señal y el clic abre la evidencia (T10)", async () => {
    const usuario = userEvent.setup();
    marketStore.resync({ senales: [FIXTURE_SENAL] });
    render(<SignalsFeed />);
    await usuario.click(screen.getByRole("button", { name: /correccion/i }));
    const modal = screen.getByRole("dialog");
    expect(modal.textContent).toContain("correccion_inminente@v1");
    expect(modal.textContent).toContain("p2p_ratio_oferta_demanda");
    expect(modal.textContent).toContain("2,4");
  });
});

describe("ConnectionStatus", () => {
  it("refleja el estado del stream y el gateway degradado", () => {
    marketStore.conexion("reconectando", "límite de conexiones");
    marketStore.salud({ status: "degraded", components: { broker: "down" } });
    render(<ConnectionStatus />);
    expect(screen.getByText(/reconectando…\s*· gateway degraded/)).toBeTruthy();
  });
});
