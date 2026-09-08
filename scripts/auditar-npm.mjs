/**
 * `npm audit` con excepciones EXPLÍCITAS y con fecha de caducidad propia.
 *
 * `npm audit` no sabe de allowlists: o pasa entero o falla entero. Bajar el
 * umbral o añadir `--omit=dev` habría desactivado el control para todo el árbol
 * de desarrollo, que es justo lo que el comentario del workflow dice que NO se
 * quiere. Esto solo silencia los avisos que alguien ha aceptado por escrito, uno
 * a uno, con su motivo y su condición de retirada.
 *
 * La propiedad que hace que esto no se pudra: **una excepción que ya no aplica
 * es un fallo**. El día que `openapi-typescript` suba a un redocly con js-yaml
 * parcheado, este script falla pidiendo que se borre la excepción, en vez de
 * dejarla ahí cubriendo silenciosamente lo que venga después con el mismo id.
 *
 * Uso: node scripts/auditar-npm.mjs <directorio> [nivel]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NIVELES = ["info", "low", "moderate", "high", "critical"];

const [, , directorio = "apps/web-spa", nivel = "high"] = process.argv;
const minimo = NIVELES.indexOf(nivel);
if (minimo === -1) {
  console.error(`Nivel desconocido: ${nivel}`);
  process.exit(2);
}

const rutaExcepciones = resolve("scripts/npm-audit-excepciones.json");
/** @type {{advisories: {id: string, paquete: string, motivo: string, revisar: string}[]}} */
const { advisories: excepciones } = JSON.parse(
  readFileSync(rutaExcepciones, "utf8"),
);

// `npm audit` sale con código != 0 cuando encuentra algo: la salida es el dato.
let bruto;
try {
  bruto = execFileSync("npm", ["audit", "--json"], {
    cwd: resolve(directorio),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
} catch (error) {
  bruto = error.stdout;
  if (!bruto) {
    console.error("npm audit no devolvió salida:", error.message);
    process.exit(2);
  }
}

const informe = JSON.parse(bruto);
const vulnerabilidades = Object.values(informe.vulnerabilities ?? {});

/** Ids de aviso (GHSA/CVE) que cuelgan directamente de una vulnerabilidad. */
function idsDe(vuln) {
  return (vuln.via ?? [])
    .filter((v) => typeof v === "object")
    .flatMap((v) => [v.url?.split("/").pop(), v.source, v.title].filter(Boolean))
    .map(String);
}

const relevantes = vulnerabilidades.filter(
  (v) => NIVELES.indexOf(v.severity) >= minimo,
);

const usadas = new Set();
const porNombre = new Map(vulnerabilidades.map((v) => [v.name, v]));

/**
 * Si una vulnerabilidad está cubierta por una excepción escrita.
 *
 * Se resuelve la CADENA: `@redocly/openapi-core` no tiene aviso propio, es
 * vulnerable únicamente por depender del `js-yaml` aceptado, y `via` lo dice con
 * el nombre del paquete. Pedir una excepción por cada eslabón obligaría a
 * aceptar por escrito paquetes de los que no se ha aceptado nada.
 */
function cubierta(vuln, vistos = new Set()) {
  if (vistos.has(vuln.name)) {
    return true; // ciclo: ya lo está evaluando alguien más arriba
  }
  vistos.add(vuln.name);

  const ids = idsDe(vuln);
  const directa = excepciones.find(
    (e) => ids.some((id) => id.includes(e.id)) || vuln.name === e.paquete,
  );
  if (directa !== undefined) {
    usadas.add(directa.id);
    return true;
  }

  // Sin aviso propio: lo está solo si TODO lo que la hace vulnerable lo está.
  const heredado = (vuln.via ?? []).filter((v) => typeof v === "string");
  if (heredado.length === 0 || heredado.length !== (vuln.via ?? []).length) {
    return false;
  }
  return heredado.every((nombre) => {
    const padre = porNombre.get(nombre);
    return padre !== undefined && cubierta(padre, vistos);
  });
}

const sinCubrir = relevantes.filter((v) => !cubierta(v));

for (const v of relevantes) {
  const estado = sinCubrir.includes(v) ? "SIN ACEPTAR" : "aceptada";
  console.log(`  [${v.severity}] ${v.name} — ${estado}`);
}

const muertas = excepciones.filter((e) => !usadas.has(e.id));

if (sinCubrir.length > 0) {
  console.error(
    `\n${sinCubrir.length} vulnerabilidad(es) de nivel >= ${nivel} sin aceptar por escrito.`,
  );
  console.error(
    `Si el riesgo es asumible, añádela a ${rutaExcepciones} con su motivo.`,
  );
  process.exit(1);
}

if (muertas.length > 0) {
  console.error(
    `\n${muertas.length} excepción(es) ya no aplican: el aviso desapareció del árbol.`,
  );
  for (const e of muertas) {
    console.error(`  - ${e.id} (${e.paquete}) — bórrala de ${rutaExcepciones}`);
  }
  console.error(
    "Una excepción que sobrevive a su motivo cubre en silencio lo que venga después.",
  );
  process.exit(1);
}

console.log(
  `\nSin vulnerabilidades >= ${nivel} fuera de las ${excepciones.length} aceptadas.`,
);
