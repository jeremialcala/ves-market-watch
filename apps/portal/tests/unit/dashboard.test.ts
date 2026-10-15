import { describe, expect, it } from "vitest";

import {
  cercania,
  comparativasBrecha,
  deltaVsTreintaDias,
  extremos,
  filasProfundidad,
  frasesLectura,
  gruposSenales,
  mapaCalor,
  medidoresDashboard,
  percentilBrecha,
  reglasCumplidas,
  tonoCalor,
  volumenCorto,
} from "../../src/lib/dashboard";
import { vistaMedidor } from "../../src/lib/lectura";
import { series, snapshot } from "../fixtura";

type Claims = Parameters<typeof frasesLectura>[0];

describe("lectura de hoy", () => {
  it("una frase por afirmación, en el orden del motor; un código desconocido se omite", () => {
    const frases = frasesLectura(snapshot().analysis!.reading!.claims, "es");
    expect(frases).toEqual([
      { clave: "lectura.claim.brecha.estable", params: { delta: "0,05", horas: "6" } },
      { clave: "lectura.claim.atribucion.oficial", params: {} },
      { clave: "lectura.claim.historia.porEncima", params: { lado: "buy", dias: "30", delta: "1,82" } },
      {
        clave: "lectura.claim.reglaCerca",
        params: { regla: "arranque_alcista@v1", cumplidas: "2", totales: "3" },
      },
    ]);
  });

  it.each([
    [{ code: "confianza_baja", data: {} }, "lectura.claim.confianzaBaja"],
    [{ code: "oficial_rancia", data: {} }, "lectura.claim.oficialRancia"],
    [{ code: "brecha", data: { direccion: "ampliando", delta_pp: "-1.5", horas: "6" } }, "lectura.claim.brecha.ampliando"],
    [{ code: "atribucion", data: { responsable: "paralelo" } }, "lectura.claim.atribucion.paralelo"],
    [{ code: "medidor_en_banda", data: { banda: "very_low", dias: "90" } }, "lectura.claim.banda.very_low"],
    [{ code: "brecha_vs_historia", data: { posicion: "por_debajo", dias: "7", delta_pp: "-0.5" } }, "lectura.claim.historia.porDebajo"],
    [{ code: "brecha_vs_historia", data: { posicion: "en_linea", dias: "90" } }, "lectura.claim.historia.enLinea"],
    [{ code: "brecha_extremo", data: { tipo: "maximo", dias: "90" } }, "lectura.claim.historia.maximo"],
    [{ code: "brecha_extremo", data: { tipo: "minimo", dias: "90" } }, "lectura.claim.historia.minimo"],
    [{ code: "historia_parcial", data: { dias: "12", ventana: "90" } }, "lectura.claim.historia.parcial"],
  ])("%j → %s", (claim, clave) => {
    expect(frasesLectura([claim] as Claims, "es")[0].clave).toBe(clave);
  });

  it("los puntos van sin signo: la dirección la dice la frase", () => {
    const [frase] = frasesLectura([{ code: "brecha", data: { direccion: "comprimiendo", delta_pp: "-1.25", horas: "6" } }] as Claims, "en");
    expect(frase.params.delta).toBe("1.25");
  });

  it("valores que el diccionario no cubre no dan frase", () => {
    const raras = [
      { code: "brecha", data: { direccion: "girando" } },
      { code: "atribucion", data: { responsable: "nadie" } },
      { code: "medidor_en_banda", data: { banda: "low", dias: "90" } },
    ] as Claims;
    expect(frasesLectura(raras, "es")).toEqual([]);
  });

  it("reglas con todas sus condiciones: solo las evaluables y completas", () => {
    const s = snapshot();
    expect(reglasCumplidas(s)).toBe(0);
    const regla = s.analysis!.rule_proximity[0];
    regla.conditions_met = regla.conditions_total;
    expect(reglasCumplidas(s)).toBe(1);
    regla.evaluable = false;
    expect(reglasCumplidas(s)).toBe(0);
    expect(reglasCumplidas({ ...s, analysis: null })).toBe(0);
  });
});

describe("brecha", () => {
  it("extremos exactos de una serie", () => {
    expect(extremos(series().series.gap_buy_24h.points)).toEqual({ min: "15.10", max: "15.60" });
    expect(extremos([])).toBeNull();
  });

  it("la brecha contra su media de 30 días", () => {
    expect(deltaVsTreintaDias(snapshot())).toEqual({ delta: "1.82238517", media: "13.51990217" });
    expect(deltaVsTreintaDias({ ...snapshot(), gap: null })).toBeNull();
  });

  it("hoy, medias de 7 y 30 días y máximo de 90, con la cobertura real", () => {
    const filas = comparativasBrecha(snapshot());
    expect(filas.map((f) => [f.clave, f.valor, f.cubiertos])).toEqual([
      ["hoy", "15.34228734", null],
      ["media7", "15.87388454", null],
      ["media30", "13.51990217", null],
      ["max90", "22.63737979", 87],
    ]);
    expect(filas[0].ancho).toBeCloseTo(67.77, 1);
    expect(filas[3].ancho).toBe(100);
  });

  it("sin máximo de 90 días las barras no tienen contra qué medirse", () => {
    const s = snapshot();
    const buy = s.analysis!.gap_history!.sides[0];
    buy.references = buy.references.filter((r) => r.days_configured !== 90);
    const filas = comparativasBrecha(s);
    expect(filas.map((f) => f.clave)).toEqual(["hoy", "media7", "media30"]);
    expect(filas.every((f) => f.ancho === 0)).toBe(true);
    expect(comparativasBrecha({ ...s, analysis: null })).toEqual([]);
  });

  it("el percentil de hoy sale de la escala de 90 días", () => {
    expect(percentilBrecha(snapshot())).toBe(56);
    const s = snapshot();
    s.analysis!.indicators.find((i) => i.indicator === "p2p_brecha_pct_buy")!.position = null;
    expect(percentilBrecha(s)).toBeNull();
  });
});

describe("panel de instrumentos", () => {
  it("los seis, primero los que ya cumplen, luego por cercanía, y sin regla al final", () => {
    expect(medidoresDashboard(snapshot()).map((m) => m.indicator)).toEqual([
      "p2p_spread_pct",
      "p2p_ratio_oferta_demanda",
      "p2p_drenaje_oferta_6h_pct",
      "p2p_momentum_bid_3h_pct",
      "p2p_brecha_pct_buy",
      "p2p_outliers_pct_buy",
    ]);
    expect(medidoresDashboard({ ...snapshot(), analysis: null })).toEqual([]);
  });

  it("la cercanía se mide en la escala, comparable entre medidores", () => {
    const momentum = snapshot().analysis!.indicators.find((i) => i.indicator === "p2p_momentum_bid_3h_pct")!;
    expect(cercania(momentum)).toBeCloseTo(0.3882, 4);
    expect(cercania({ ...momentum, position: null })).toBe(Number.POSITIVE_INFINITY);
  });

  it("los outliers dibujan su escala fija con el corte de confianza", () => {
    const outliers = snapshot().analysis!.indicators.find((i) => i.indicator === "p2p_outliers_pct_buy")!;
    const vista = vistaMedidor(outliers);
    expect(vista.guarda).toEqual({ valor: "30" });
    expect(vista.umbral).toBeCloseTo(30);
    expect(vista.zona?.izquierda).toBeCloseTo(30);
    expect(vista.zona?.ancho).toBeCloseTo(70);
    expect(vista.cortes).toEqual({ bajo: "0", medio: "30", alto: "100" });
    expect(vista.percentil).toBeNull();
  });
});

describe("mapa de calor", () => {
  it("14 días × 24 horas en hora de Caracas, del más antiguo a hoy", () => {
    const mapa = mapaCalor(series().series.gap_sell_14d.points);
    expect(mapa.filas).toHaveLength(14);
    expect(mapa.filas[0].dia).toBe("2026-10-01");
    expect(mapa.filas[13].dia).toBe("2026-10-14");
    expect(mapa.filas[13].celdas[19]).toBe("14.00");
    expect(mapa.filas[13].celdas[20]).toBe("18.00");
    expect(mapa.filas[12].celdas[22]).toBe("12.00");
    expect(mapa.filas[13].celdas.filter((c) => c !== null)).toHaveLength(2);
    expect([mapa.p10, mapa.p90]).toEqual([12, 18]);
  });

  it("sin puntos válidos no hay rejilla", () => {
    expect(mapaCalor([])).toEqual({ filas: [], p10: null, p90: null });
    expect(mapaCalor([{ t: "no-es-fecha", value: "1" }]).filas).toEqual([]);
  });

  it("coral solo por encima del p90; abajo sage, en medio teal", () => {
    expect(tonoCalor("18.5", 12, 18)).toEqual({ tono: "coral", intensidad: 1 });
    expect(tonoCalor("12", 12, 18)).toEqual({ tono: "sage", intensidad: 0.25 });
    const medio = tonoCalor("16", 12, 18);
    expect(medio.tono).toBe("teal");
    expect(medio.intensidad).toBeCloseTo(0.65);
    // Una ventana plana no divide por cero.
    expect(tonoCalor("12", 12, 12).tono).toBe("sage");
  });
});

describe("cronología de señales", () => {
  it("agrupadas por regla, la que disparó más recientemente primero", () => {
    const grupos = gruposSenales(snapshot().signals.items);
    expect(grupos.map((g) => [g.tipo, g.direccion, g.instancias.length])).toEqual([
      ["techo_inminente", "bajista", 1],
      ["arranque_alcista", "alcista", 2],
    ]);
    // Dentro del grupo, de la más reciente a la más antigua.
    expect(grupos[1].instancias.map((s) => s.outcome?.gap_delta_pp)).toEqual(["0.48000000", "-0.14541067"]);
    expect(gruposSenales([])).toEqual([]);
  });
});

describe("profundidad", () => {
  it("la barra de cada nivel, contra el más profundo del lado", () => {
    const filas = filasProfundidad(snapshot().depth.buy!.levels);
    expect(filas.map((f) => f.precio)).toEqual(["1014.0450", "1019.0900"]);
    expect(filas[0].ancho).toBeCloseTo(61.25, 1);
    expect(filas[1].ancho).toBe(100);
    expect(filasProfundidad([{ price_band: "1", cum_volume: "0" }])[0].ancho).toBe(0);
  });

  it.each([
    ["2499304.83", "es", "2,50 M"],
    ["383902.84", "es", "384 k"],
    ["626730.61", "en", "627 k"],
    ["1203471.65", "en", "1.20 M"],
    ["999", "es", "999"],
  ] as const)("%s → %s %s", (valor, idioma, esperado) => {
    expect(volumenCorto(valor, idioma)).toBe(esperado);
  });
});
