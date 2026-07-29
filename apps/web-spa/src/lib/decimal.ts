/**
 * Decimales del contrato como STRING exacto de punta a punta (ADR-0017).
 *
 * Regla dura: prohibido `parseFloat`/`Number()` para lógica — comparación,
 * signo y formateo trabajan sobre el string (`^-?[0-9]+(\.[0-9]+)?$` del
 * contrato). La ÚNICA conversión permitida a number es `toChartNumber()`,
 * para coordenadas de gráfico (presentación pura), siempre acompañada del
 * string original en tooltips/etiquetas.
 */

const PATRON_DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;

export function esDecimal(valor: string): boolean {
  return PATRON_DECIMAL.test(valor);
}

interface Partes {
  negativo: boolean;
  entero: string; // sin ceros a la izquierda (mínimo "0")
  fraccion: string; // sin punto; puede ser ""
}

function partes(valor: string): Partes {
  if (!esDecimal(valor)) {
    throw new Error(`decimal inválido: ${JSON.stringify(valor)}`);
  }
  const negativo = valor.startsWith("-");
  const cuerpo = negativo ? valor.slice(1) : valor;
  const [enteroCrudo, fraccion = ""] = cuerpo.split(".");
  const entero = enteroCrudo.replace(/^0+(?=\d)/, "");
  // -0.000 es cero: nunca negativo
  const esCero = /^0*$/.test(entero) && /^0*$/.test(fraccion);
  return { negativo: negativo && !esCero, entero: esCero ? "0" : entero, fraccion };
}

/** -1 si a < b, 0 si iguales, 1 si a > b — sin pasar por float. */
export function compararDecimales(a: string, b: string): -1 | 0 | 1 {
  const pa = partes(a);
  const pb = partes(b);
  if (pa.negativo !== pb.negativo) {
    return pa.negativo ? -1 : 1;
  }
  const invertir = pa.negativo ? -1 : 1;
  let magnitud: -1 | 0 | 1 = 0;
  if (pa.entero.length !== pb.entero.length) {
    magnitud = pa.entero.length < pb.entero.length ? -1 : 1;
  } else if (pa.entero !== pb.entero) {
    magnitud = pa.entero < pb.entero ? -1 : 1;
  } else {
    const ancho = Math.max(pa.fraccion.length, pb.fraccion.length);
    const fa = pa.fraccion.padEnd(ancho, "0");
    const fb = pb.fraccion.padEnd(ancho, "0");
    magnitud = fa === fb ? 0 : fa < fb ? -1 : 1;
  }
  return (magnitud * invertir) as -1 | 0 | 1;
}

/** -1 negativo, 0 cero, 1 positivo. */
export function signo(valor: string): -1 | 0 | 1 {
  const p = partes(valor);
  if (p.entero === "0" && /^0*$/.test(p.fraccion)) {
    return 0;
  }
  return p.negativo ? -1 : 1;
}

// -- aritmética exacta con BigInt (variación intradía) ------------------------
// La regla «nunca float» también aplica al cálculo, no solo al formateo: la Δ
// contra la apertura se hace sobre enteros escalados.

/** El decimal como BigInt con `escala` dígitos de fracción (trunca si sobran). */
function aEscalado(valor: string, escala: number): bigint {
  const p = partes(valor);
  const fraccion = p.fraccion.padEnd(escala, "0").slice(0, escala);
  const magnitud = BigInt(`${p.entero}${fraccion}`);
  return p.negativo ? -magnitud : magnitud;
}

function desdeEscalado(entero: bigint, escala: number): string {
  const negativo = entero < 0n;
  const digitos = (negativo ? -entero : entero)
    .toString()
    .padStart(escala + 1, "0");
  const corte = digitos.length - escala;
  const cuerpo =
    escala === 0
      ? digitos
      : `${digitos.slice(0, corte)}.${digitos.slice(corte)}`;
  return negativo ? `-${cuerpo}` : cuerpo;
}

/** `a − b` exacto: la escala común conserva todos los decimales de ambos. */
export function restarDecimales(a: string, b: string): string {
  const escala = Math.max(partes(a).fraccion.length, partes(b).fraccion.length);
  return desdeEscalado(aEscalado(a, escala) - aEscalado(b, escala), escala);
}

/**
 * `parte / base × 100` por división entera (truncada hacia cero a `escala`
 * decimales), nunca float. `null` si la base es cero: no hay % contra cero
 * — el llamador muestra «—», no un infinito ni un NaN.
 */
export function porcentajeRelativo(
  parte: string,
  base: string,
  escala = 2,
): string | null {
  if (signo(base) === 0) {
    return null;
  }
  const escalaComun = Math.max(
    partes(parte).fraccion.length,
    partes(base).fraccion.length,
  );
  const numerador = aEscalado(parte, escalaComun) * 100n * 10n ** BigInt(escala);
  return desdeEscalado(numerador / aEscalado(base, escalaComun), escala);
}

// Símbolos de es-VE (grupo "." y decimal ","), obtenidos una sola vez de Intl
// — solo los símbolos: el número jamás pasa por float.
const partesLocale = new Intl.NumberFormat("es-VE").formatToParts(11111.1);
const SIMBOLO_GRUPO =
  partesLocale.find((p) => p.type === "group")?.value ?? ".";
const SIMBOLO_DECIMAL =
  partesLocale.find((p) => p.type === "decimal")?.value ?? ",";

export interface OpcionesFormato {
  /** Máximo de decimales mostrados (truncado, no redondeo — el dato es exacto). */
  maxDecimales?: number;
  /** Mínimo de decimales (padding con ceros). */
  minDecimales?: number;
}

/** Formatea el string exacto con separadores es-VE, sin conversión a float. */
export function formatDecimal(
  valor: string,
  { maxDecimales, minDecimales = 0 }: OpcionesFormato = {},
): string {
  const p = partes(valor);
  const enteroAgrupado = p.entero.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    SIMBOLO_GRUPO,
  );
  let fraccion = p.fraccion;
  if (maxDecimales !== undefined && fraccion.length > maxDecimales) {
    fraccion = fraccion.slice(0, maxDecimales);
  }
  if (fraccion.length < minDecimales) {
    fraccion = fraccion.padEnd(minDecimales, "0");
  }
  // sin decimales significativos ni mínimo exigido → solo el entero
  if (/^0*$/.test(fraccion) && minDecimales === 0) {
    fraccion = "";
  }
  const cuerpo = fraccion
    ? `${enteroAgrupado}${SIMBOLO_DECIMAL}${fraccion}`
    : enteroAgrupado;
  return p.negativo ? `-${cuerpo}` : cuerpo;
}

/** Porcentaje: formatea y añade el símbolo (el valor ya viene en %). */
export function formatPct(valor: string, maxDecimales = 2): string {
  return `${formatDecimal(valor, { maxDecimales })} %`;
}

/**
 * ÚNICA conversión a number del código: coordenadas de gráfico. La precisión
 * de float64 sobra para píxeles; el string original viaja al lado para
 * tooltips (ADR-0017).
 */
export function toChartNumber(valor: string): number {
  if (!esDecimal(valor)) {
    throw new Error(`decimal inválido: ${JSON.stringify(valor)}`);
  }
  return Number(valor);
}
