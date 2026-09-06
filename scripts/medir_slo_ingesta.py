"""Mide el SLO de ingesta (consulta->evento publicado <= 5 s p95) desde los logs.

SLO declarado en `docs/01-requirements/ingesta-binance-p2p.md`.

El log registra la latencia del ciclo COMPLETO (BUY + SELL secuenciales), pero el
SLO es por lado. Se deriva:
    SELL = t(SELL OK) - t(BUY OK)      exacto, ambos lados son secuenciales
    BUY  = total - SELL                el total arranca al inicio del ciclo

Que el intervalo es el del PRD esta comprobado contra el codigo:
`CapturarSnapshot.ejecutar()` va de `fetch_ads()` a `publish_p2p_snapshot()`.

Uso:
    docker logs --tail 50000 ves-market-watch-ingestor-binance-1 2>&1 \
      | grep -E "ciclo (BUY|SELL) OK|latencia de ciclo completo|saltado por|fallido" \
      > ciclos.log
    python scripts/medir_slo_ingesta.py ciclos.log

`--tail` y no `--since`: en Docker Desktop para Windows `--since` no filtra nada
y devuelve cero lineas, aunque los timestamps del log sean correctos. Y con un
`--tail` muy grande la salida se trunca antes de llegar al presente: comprueba
siempre que la ultima linea del volcado sea reciente antes de fiarte del p95.
"""

import re
import sys
from datetime import datetime
from statistics import mean, median

TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})")


def ts(linea):
    m = TS.match(linea)
    return datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S,%f") if m else None


def pct(datos, p):
    """Percentil por interpolacion lineal, como el nearest-rank de referencia."""
    if not datos:
        return float("nan")
    d = sorted(datos)
    k = (len(d) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(d) - 1)
    return d[lo] + (d[hi] - d[lo]) * (k - lo)


buy, sell, total = [], [], []
fallos = 0
ciclos = 0
t_buy = t_sell = None

with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for linea in f:
        t = ts(linea)
        if t is None:
            continue
        if "ciclo BUY OK" in linea:
            t_buy = t
        elif "ciclo SELL OK" in linea:
            t_sell = t
        elif "saltado por" in linea or "fallido" in linea:
            fallos += 1
        elif "latencia de ciclo completo" in linea:
            ciclos += 1
            tot = float(re.search(r"([\d.]+) s", linea).group(1))
            total.append(tot)
            if t_buy and t_sell and t_sell > t_buy:
                s = (t_sell - t_buy).total_seconds()
                if 0 < s < tot:            # descarta ciclos con lados incompletos
                    sell.append(s)
                    buy.append(tot - s)
            t_buy = t_sell = None

SLO = 5.0
print(f"muestra: {ciclos} ciclos | {len(sell)} con ambos lados medibles")
print(f"lados fallidos o saltados: {fallos}")
print()
print(f"{'serie':<26}{'n':>6}{'media':>9}{'p50':>8}{'p95':>8}{'p99':>8}{'max':>8}")
for nombre, datos in (
    ("BUY  (consulta->evento)", buy),
    ("SELL (consulta->evento)", sell),
    ("ciclo completo (2 lados)", total),
):
    if datos:
        print(
            f"{nombre:<26}{len(datos):>6}{mean(datos):>9.2f}{median(datos):>8.2f}"
            f"{pct(datos,95):>8.2f}{pct(datos,99):>8.2f}{max(datos):>8.2f}"
        )

print()
por_lado = buy + sell
if por_lado:
    p95 = pct(por_lado, 95)
    incumplen = sum(1 for x in por_lado if x > SLO)
    print(f"SLO consulta->evento <= {SLO} s (p95), agregando ambos lados:")
    print(f"  n={len(por_lado)}  p95={p95:.2f} s  ->  {'CUMPLE' if p95 <= SLO else 'INCUMPLE'}")
    print(f"  capturas por encima de {SLO} s: {incumplen} ({100*incumplen/len(por_lado):.1f} %)")

if ciclos:
    ok = ciclos - fallos
    print()
    print(f"SLO ciclos completados >= 99 %:")
    print(f"  {ok}/{ciclos} = {100*ok/ciclos:.2f} %  ->  {'CUMPLE' if 100*ok/ciclos >= 99 else 'INCUMPLE'}")
