#!/usr/bin/env python3
"""Verificación de cierre del SLO de ingesta tras ADR-0026.

Contesta las **dos** preguntas que quedaron abiertas al paralelizar, no solo la
primera:

1. **¿El p95 aguanta sobre una corrida larga?** El cumplimiento se declaró con
   28 capturas en 15 minutos, contra las 4.342 en 41 h del incumplimiento.
2. **¿Ha subido la fricción con la fuente?** ADR-0026 sube el pico instantáneo y
   con él la probabilidad de T7 (baneo). Un p95 estupendo con el breaker
   abriéndose cada hora sería una victoria falsa, y la reversión escrita en la
   ADR es bajar `PAGINAS_EN_PARALELO`.

**Corre en la máquina del despliegue**: lee los logs del contenedor. Un agente en
la nube no puede hacer esto — no alcanza el Docker local.

Uso:
    python scripts/verificar_slo_ingesta.py [--salida informe.md]

Sale 0 si las dos preguntas salen bien, 1 si alguna no. El código de salida es lo
que permite encadenarlo desde una tarea programada.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from statistics import mean, median

# La consola de Windows es cp1252 y revienta con una flecha o un acento. Sin
# esto el informe muere a media impresión —y desde el Programador de tareas
# moriría en silencio, que es peor.
for _flujo in (sys.stdout, sys.stderr):
    if hasattr(_flujo, "reconfigure"):
        _flujo.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parent.parent
CONTENEDOR = "ves-market-watch-ingestor-binance-1"
SLO = 5.0
TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})")

# Referencia del incumplimiento, para que el informe compare y no solo informe.
ANTES = {"p95": 7.16, "fuera_pct": 34.6, "n": 4342}


def logs(lineas: int) -> list[str]:
    """Vuelca los logs del contenedor.

    `--tail` y no `--since`: en Docker Desktop para Windows `--since` no filtra
    nada y devuelve cero líneas, con los timestamps correctos. Y un `--tail`
    demasiado grande se trunca antes de llegar al presente, así que después hay
    que comprobar que la última línea es reciente.
    """
    r = subprocess.run(
        ["docker", "logs", "--tail", str(lineas), CONTENEDOR],
        capture_output=True, text=True, errors="replace",
    )
    if r.returncode != 0:
        sys.exit(f"ERROR: no pude leer los logs de {CONTENEDOR}: {r.stderr.strip()[:200]}")
    return (r.stdout + r.stderr).splitlines()


def ts(linea: str) -> datetime | None:
    m = TS.match(linea)
    return datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S,%f") if m else None


def percentil(d: list[float], p: float) -> float:
    d = sorted(d)
    k = (len(d) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(d) - 1)
    return d[lo] + (d[hi] - d[lo]) * (k - lo)


def analizar(lineas: list[str]) -> dict:
    buy, sell, total = [], [], []
    fallos = ciclos = 0
    t_buy = t_sell = None
    friccion = {"429": 0, "breaker": 0, "reintentos": 0, "parciales": 0, "presupuesto": 0}
    primera = ultima = None

    for l in lineas:
        t = ts(l)
        if t:
            primera = primera or t
            ultima = t
        bajo = l.lower()
        if "429" in l:
            friccion["429"] += 1
        if "breaker" in bajo:
            friccion["breaker"] += 1
        if "reintentos" in bajo:
            friccion["reintentos"] += 1
        if "parcial: true" in bajo:
            friccion["parciales"] += 1
        if "presupuesto" in bajo:
            friccion["presupuesto"] += 1

        if t is None:
            continue
        if "ciclo BUY OK" in l:
            t_buy = t
        elif "ciclo SELL OK" in l:
            t_sell = t
        elif "saltado por" in l or "fallido" in l:
            fallos += 1
        elif "latencia de ciclo completo" in l:
            ciclos += 1
            tot = float(re.search(r"([\d.]+) s", l).group(1))
            total.append(tot)
            if t_buy and t_sell and t_sell > t_buy:
                s = (t_sell - t_buy).total_seconds()
                if 0 < s < tot:
                    sell.append(s)
                    buy.append(tot - s)
            t_buy = t_sell = None

    return {
        "buy": buy, "sell": sell, "total": total, "ciclos": ciclos,
        "fallos": fallos, "friccion": friccion, "primera": primera, "ultima": ultima,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--lineas", type=int, default=50000,
                   help="tail de logs a analizar (50000 ~ 40 h de ciclos)")
    p.add_argument("--salida", default=None, help="escribir el informe en un fichero")
    args = p.parse_args()

    a = analizar(logs(args.lineas))
    lados = a["buy"] + a["sell"]
    out: list[str] = []

    def di(s=""):
        out.append(s)
        print(s)

    di(f"# Verificación del SLO de ingesta — {datetime.now():%Y-%m-%d %H:%M}")
    di()

    if not lados:
        di("**SIN MUESTRA:** los logs no traen ciclos completos. Nada que verificar.")
        Path(args.salida).write_text("\n".join(out), encoding="utf-8") if args.salida else None
        return 1

    horas = (a["ultima"] - a["primera"]).total_seconds() / 3600 if a["primera"] else 0
    di(f"Ventana analizada: **{a['primera']:%Y-%m-%d %H:%M} → {a['ultima']:%H:%M}** "
       f"({horas:.1f} h) · {a['ciclos']} ciclos · {len(lados)} capturas")
    di()

    # --- Pregunta 1: el p95 --------------------------------------------------
    p95 = percentil(lados, 95)
    fuera = sum(1 for x in lados if x > SLO)
    fuera_pct = 100 * fuera / len(lados)
    cumple = p95 <= SLO

    di("## 1. ¿Aguanta el p95?")
    di()
    di("| serie | n | media | p50 | p95 | max |")
    di("|---|---:|---:|---:|---:|---:|")
    for nombre, d in (("BUY", a["buy"]), ("SELL", a["sell"]), ("ciclo completo", a["total"])):
        di(f"| {nombre} | {len(d)} | {mean(d):.2f} s | {median(d):.2f} s | "
           f"{percentil(d,95):.2f} s | {max(d):.2f} s |")
    di()
    di(f"| | incumplimiento (n={ANTES['n']}) | ahora (n={len(lados)}) |")
    di("|---|---:|---:|")
    di(f"| p95 consulta→evento | {ANTES['p95']:.2f} s | **{p95:.2f} s** |")
    di(f"| capturas por encima de {SLO:.0f} s | {ANTES['fuera_pct']:.1f} % | **{fuera_pct:.1f} %** |")
    di()
    di(f"**{'CUMPLE' if cumple else 'INCUMPLE'}** — p95 {p95:.2f} s contra un techo de {SLO:.0f} s.")
    di()

    # --- Pregunta 2: la fricción --------------------------------------------
    f = a["friccion"]
    tranquilo = f["429"] == 0 and f["breaker"] == 0 and f["presupuesto"] == 0
    di("## 2. ¿Ha subido la fricción con la fuente? (T7)")
    di()
    di("| señal | ocurrencias |")
    di("|---|---:|")
    di(f"| respuestas 429 | {f['429']} |")
    di(f"| menciones del breaker | {f['breaker']} |")
    di(f"| páginas que agotaron reintentos | {f['reintentos']} |")
    di(f"| capturas parciales | {f['parciales']} |")
    di(f"| presupuesto agotado | {f['presupuesto']} |")
    di(f"| lados fallidos o saltados | {a['fallos']} |")
    di()
    completados = 100 * (a["ciclos"] - a["fallos"]) / a["ciclos"] if a["ciclos"] else 0
    di(f"Ciclos completados: **{completados:.2f} %** (SLO ≥ 99 %)")
    di()
    if tranquilo:
        di("**Sin fricción.** Ni un 429, ni el breaker, ni presupuesto agotado.")
    else:
        di("**HAY FRICCIÓN.** ADR-0026 subió el pico instantáneo y esto puede ser su "
           "coste. La reversión escrita en la ADR es **bajar `PAGINAS_EN_PARALELO`**, "
           "nunca subirlo ni rotar IP.")
    di()

    # --- Veredicto ------------------------------------------------------------
    ok = cumple and tranquilo and completados >= 99
    di("## Veredicto")
    di()
    if ok:
        di("Las dos preguntas salen bien sobre una muestra larga. **El criterio de "
           "rendimiento del Gate 3 queda verificado**; lo que falta para cerrarlo es "
           "la firma HITL en `.ai-dlc/gates/gate-3-testing.md`.")
    else:
        di("**No cerrar el gate todavía.** Revisar arriba qué falló antes de firmar.")

    if args.salida:
        Path(args.salida).write_text("\n".join(out) + "\n", encoding="utf-8")
        print(f"\ninforme escrito en {args.salida}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
