/** Componentes portados del sistema de diseño Higerotech: que apliquen los
 * tokens correctos por variante/tono y respondan a hover y deshabilitado. */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Button,
  Container,
  Icon,
  Pill,
  Stat,
  Tag,
} from "../../src/ds/components";

afterEach(cleanup);

describe("Button", () => {
  it("la variante nav NO es coral: el coral es del CTA de la vista", () => {
    /*
     * Era coral sólido con sombra —el tratamiento del CTA— y eso convertía
     * «Salir», la acción que menos se quiere pulsar, en lo más llamativo de la
     * pantalla. Además gasta el coral, que en este producto significa alerta.
     * Ahora comparte tratamiento con el conmutador de idioma y el de tema.
     */
    render(<Button variant="nav">Salir</Button>);
    const boton = screen.getByRole("button", { name: "Salir" });

    expect(boton.style.background).toBe("var(--overlay-soft)");
    expect(boton.style.color).toBe("var(--text-muted)");
    expect(boton.style.background).not.toContain("coral");
    expect(boton.style.boxShadow).toBe("");
  });

  it("al pasar el ratón cambia al color de hover y vuelve al salir", async () => {
    const usuario = userEvent.setup();
    render(<Button>Enviar</Button>);
    const boton = screen.getByRole("button", { name: "Enviar" });
    expect(boton.style.background).toBe("var(--teal)");

    await usuario.hover(boton);
    expect(boton.style.background).toBe("var(--teal-hover)");
    await usuario.unhover(boton);
    expect(boton.style.background).toBe("var(--teal)");
  });

  it("deshabilitado no responde al hover ni dispara el click", async () => {
    const usuario = userEvent.setup();
    const alPulsar = vi.fn();
    render(
      <Button disabled onClick={alPulsar}>
        Enviar
      </Button>,
    );
    const boton = screen.getByRole("button", { name: "Enviar" });
    await usuario.hover(boton);
    expect(boton.style.background).toBe("var(--teal)");
    expect(boton.style.cursor).toBe("not-allowed");
    await usuario.click(boton);
    expect(alPulsar).not.toHaveBeenCalled();
  });

  it("acepta un icono a cada lado", () => {
    const { container } = render(
      <Button icon="close" iconPosition="start">
        Cerrar
      </Button>,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("Tag", () => {
  it("aplica el tono pedido", () => {
    render(<Tag tone="sage">en vivo</Tag>);
    expect(screen.getByText("en vivo").style.color).toBe("var(--sage)");
  });

  it("puede ir sin punto", () => {
    const { container } = render(
      <Tag dot={false}>plano</Tag>,
    );
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(0);
  });
});

describe("Pill", () => {
  it("cielo y tierra usan sus fondos de marca", () => {
    render(
      <>
        <Pill>hace 3 s</Pill>
        <Pill tone="tierra">alerta</Pill>
      </>,
    );
    expect(screen.getByText("hace 3 s").style.background).toBe(
      "var(--pill-cielo-bg)",
    );
    expect(screen.getByText("alerta").style.background).toBe(
      "var(--pill-tierra-bg)",
    );
  });
});

describe("Stat", () => {
  it("pinta la cifra con el tono y la etiqueta en texto secundario", () => {
    render(<Stat value="0,59" label="ratio" tone="coral" />);
    expect(screen.getByText("0,59").style.color).toBe("var(--coral)");
    expect(screen.getByText("ratio").style.color).toBe("var(--text-muted)");
  });
});

describe("Icon", () => {
  it("dibuja el glifo pedido en el tamaño pedido", () => {
    const { container } = render(<Icon name="menu" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });
});

describe("Container", () => {
  it("respeta el ancho máximo del sistema y la etiqueta pedida", () => {
    const { container } = render(<Container as="main">contenido</Container>);
    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    expect(main?.style.maxWidth).toBe("var(--maxw)");
  });
});
