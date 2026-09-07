/**
 * La lectura del histórico se CALCULA de la ventana.
 *
 * Lo que estos tests protegen es justo eso: que el titular cambie cuando cambia
 * lo que hay delante. Un veredicto cableado pasaría cualquier prueba de
 * renderizado y sería una frase decorativa.
 */

import { describe, expect, it } from "vitest";

import {
  colorDistancia,
  colorZona,
  leerHistorico,
} from "../../src/lib/lecturaHistorico";
import type { CondicionDeIndicador } from "../../src/lib/reglas";

const DIA = 86_400_000;

/** Serie con un punto por día, del más viejo al más nuevo. */
function serie(...valores: string[]) {
  return valores.map((valor, i) => ({ t: i * DIA, valor }));
}

function regla(umbral: string, op: CondicionDeIndicador["op"] = "gt"): CondicionDeIndicador {
  return { regla: "r@v1", op, umbral, cumple: false, indice: 1, total: 1 };
}

describe("leerHistorico", () => {
  it("sin puntos no hay lectura que dar", () => {
    expect(leerHistorico([], null)).toBeNull();
  });

  it("hoy en el máximo de la ventana cae en zona alta", () => {
    const l = leerHistorico(serie("10", "12", "14", "16", "20"), null)!;
    expect(l.hoy).toBe("20");
    expect(l.percentil).toBe(90);
    expect(l.zona).toBe("alta");
  });

  it("hoy en el mínimo cae en zona baja", () => {
    const l = leerHistorico(serie("20", "16", "14", "12", "10"), null)!;
    expect(l.percentil).toBe(10);
    expect(l.zona).toBe("baja");
  });

  it("hoy en mitad de la ventana no es ni alto ni bajo", () => {
    const l = leerHistorico(serie("10", "12", "20", "16", "14"), null)!;
    expect(l.zona).toBe("centro");
  });

  it("una serie plana da percentil 50, no 0 ni 100", () => {
    // Si todo vale lo mismo, hoy no está ni alto ni bajo. Contar solo los
    // «estrictamente menores» daría 0 y el panel diría «mínimo de la ventana»
    // sobre una serie que no se ha movido.
    const l = leerHistorico(serie("7", "7", "7", "7"), null)!;
    expect(l.percentil).toBe(50);
    expect(l.zona).toBe("centro");
    expect(l.distancia).toBe("0");
  });

  it("la distancia a la mediana es exacta y con signo", () => {
    const l = leerHistorico(serie("1.10", "1.20", "1.35"), null)!;
    expect(l.mediana).toBe("1.20");
    expect(l.distancia).toBe("0.15"); // sin coma flotante de por medio
    const bajo = leerHistorico(serie("1.35", "1.20", "1.10"), null)!;
    expect(bajo.distancia).toBe("-0.10");
  });

  it("sin regla no se habla de cruces", () => {
    const l = leerHistorico(serie("10", "20"), null)!;
    expect(l.hayRegla).toBe(false);
    expect(l.diasDesdeCruce).toBeNull();
    expect(l.sinCruces).toBe(false);
  });

  it("cuenta los días desde el último cambio de lado del umbral", () => {
    // Cruza hacia arriba entre el día 2 y el 3, y se queda arriba: el último
    // cruce es ese, a 2 días del final.
    const l = leerHistorico(serie("5", "8", "9", "12", "14"), regla("10"))!;
    expect(l.hayRegla).toBe(true);
    expect(l.sinCruces).toBe(false);
    expect(l.diasDesdeCruce).toBe(2);
  });

  it("toma el ÚLTIMO cruce, no el primero", () => {
    // Sube, baja y vuelve a subir: lo que importa es el de más cerca del final.
    const l = leerHistorico(serie("12", "8", "13", "7", "15"), regla("10"))!;
    expect(l.diasDesdeCruce).toBe(1);
  });

  it("una serie que nunca cambia de lado se declara sin cruces", () => {
    // No es lo mismo que «no hay regla»: la serie lleva TODA la ventana
    // por encima, y eso es información.
    const l = leerHistorico(serie("12", "14", "16"), regla("10"))!;
    expect(l.hayRegla).toBe(true);
    expect(l.sinCruces).toBe(true);
    expect(l.diasDesdeCruce).toBeNull();
  });

  it("tocar el umbral no es cruzarlo", () => {
    // El valor exacto del umbral no tiene lado. Contarlo como cruce inventaría
    // un evento cada vez que la serie roza la línea.
    const l = leerHistorico(serie("12", "10", "14"), regla("10"))!;
    expect(l.sinCruces).toBe(true);
  });

  it("la ventana se reporta con sus extremos y su tamaño", () => {
    const l = leerHistorico(serie("1", "2", "3", "4"), null)!;
    expect(l.puntos).toBe(4);
    expect(l.desde).toBe(0);
    expect(l.hasta).toBe(3 * DIA);
  });
});

describe("estadísticas de la ventana", () => {
  it("mínimo y máximo traen el instante en que ocurrieron", () => {
    const l = leerHistorico(serie("14", "10", "18", "12"), null)!;
    expect(l.estadisticas.minimo.valor).toBe("10");
    expect(l.estadisticas.minimo.t).toBe(1 * DIA);
    expect(l.estadisticas.maximo.valor).toBe("18");
    expect(l.estadisticas.maximo.t).toBe(2 * DIA);
  });

  it("la mediana también dice cuándo se dio ese valor", () => {
    const l = leerHistorico(serie("10", "12", "14", "16", "18"), null)!;
    expect(l.estadisticas.mediana.valor).toBe("14");
    expect(l.estadisticas.mediana.t).toBe(2 * DIA);
  });

  it("la desviación NO trae fecha: no ocurre en un punto", () => {
    // Poner ahí una fecha cualquiera seria inventarse un hecho.
    const l = leerHistorico(serie("10", "12", "14"), null)!;
    expect(l.estadisticas.desviacion.t).toBeNull();
  });

  it("la desviación mide la dispersión de la ventana", () => {
    // Serie plana: dispersion cero, sin trampas de coma flotante en la salida.
    expect(leerHistorico(serie("7", "7", "7"), null)!.estadisticas.desviacion.valor)
      .toBe("0.00");
    // Poblacional de 10,20,30 = sqrt(200/3) = 8,1649...
    expect(leerHistorico(serie("10", "20", "30"), null)!.estadisticas.desviacion.valor)
      .toBe("8.16");
  });

  it("los extremos se comparan como DECIMALES, no como texto", () => {
    // "9" > "10" en orden alfabetico; si se comparara como string, el maximo
    // saldria 9 y el minimo 10.
    const l = leerHistorico(serie("10", "9", "100"), null)!;
    expect(l.estadisticas.minimo.valor).toBe("9");
    expect(l.estadisticas.maximo.valor).toBe("100");
  });
});

describe("color semántico", () => {
  it("el coral queda para los extremos, no para «malo»", () => {
    expect(colorZona("centro")).toBe("var(--sage)");
    expect(colorZona("alta")).toBe("var(--coral)");
    expect(colorZona("baja")).toBe("var(--coral)");
  });

  it("la distancia se colorea por signo, y el cero es neutro", () => {
    expect(colorDistancia("0.5")).toBe("var(--sage)");
    expect(colorDistancia("-0.5")).toBe("var(--coral)");
    expect(colorDistancia("0")).toBe("var(--text-muted)");
    expect(colorDistancia("0.00")).toBe("var(--text-muted)");
  });
});
