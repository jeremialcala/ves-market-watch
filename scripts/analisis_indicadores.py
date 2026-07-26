# Análisis VES->USDT sobre el último snapshot persistido (top-200 por lado):
# referencia global + corte por método de pago (Banco de Venezuela y BNC).
# Reutiliza el dominio real del repo para outliers/brecha/variación.
import json
import statistics
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

REPO = Path(r"c:\Users\Jeremi Alcala\Claude\Projects\VES - FX tracker\ves-market-watch")
sys.path.insert(0, str(REPO / "apps" / "ingestor-binance" / "src"))
sys.path.insert(0, str(REPO / "apps" / "indicator-engine" / "src"))

import psycopg

from ingestor_binance.domain.normalizacion import (
    Pseudonimizador,
    etiquetar_outliers,
    normalizar_anuncio,
)
from indicator_engine.domain.calculos import calcular_brecha

PSEUDO = Pseudonimizador("analisis-puntual-clave-desechable")

BANCOS = {
    "BDV": lambda m: "banco de venezuela" in m,
    "BNC": lambda m: m == "bnc" or "banco nacional de cr" in m,
}


def metricas(anuncios) -> dict | None:
    """Métricas de referencia sobre una lista ya etiquetada de outliers."""
    limpios = [a for a in anuncios if not a.outlier]
    if not limpios:
        return None
    precios = sorted(a.precio for a in limpios)
    peso = sum(a.cantidad_disponible for a in limpios)
    vwap = (
        sum(a.precio * a.cantidad_disponible for a in limpios) / peso
        if peso > 0
        else statistics.median(precios)
    )
    n, n_out = len(anuncios), sum(1 for a in anuncios if a.outlier)
    return {
        "n": n,
        "outliers": n_out,
        "confidence": "low" if n and n_out / n > 0.30 else "ok",
        "mediana": statistics.median(precios),
        "vwap": vwap,
        "min": precios[0],
        "max": precios[-1],
        "liquidez_usdt": peso,
        "pct_merchants": round(100 * sum(1 for a in limpios if a.es_merchant) / len(limpios), 1),
    }


def main() -> None:
    out = {}
    with psycopg.connect(
        "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
    ) as conn:
        oficial_row = conn.execute(
            "select rate, value_date, captured_at from official_rates "
            "where currency='USD' and status='valid' "
            "order by captured_at desc limit 1"
        ).fetchone()
        snaps = {}
        for side in ("BUY", "SELL"):
            row = conn.execute(
                "select captured_at, ad_count, raw from p2p_snapshots_raw "
                "where side=%s order by captured_at desc limit 1",
                (side,),
            ).fetchone()
            if row:
                snaps[side] = row

    oficial = Decimal(str(oficial_row[0])) if oficial_row else None
    out["bcv"] = (
        {
            "usd": oficial,
            "value_date": str(oficial_row[1]),
            "captured_at": oficial_row[2].isoformat(),
        }
        if oficial_row
        else None
    )

    metodos_global = Counter()
    for side, (captured_at, ad_count, raw) in snaps.items():
        items = raw if isinstance(raw, list) else json.loads(raw)
        anuncios = etiquetar_outliers(
            [normalizar_anuncio(it, PSEUDO) for it in items], k=3.5
        )
        for a in anuncios:
            metodos_global.update(m.lower() for m in a.metodos_pago)

        lado = {"captured_at": captured_at.isoformat(), "ad_count": ad_count}
        lado["global"] = metricas(anuncios)

        seleccion_combinada = [
            a
            for a in anuncios
            if any(
                pred(m.lower()) for m in a.metodos_pago for pred in BANCOS.values()
            )
        ]
        # Outliers re-etiquetados dentro de cada subconjunto: la mediana/MAD de
        # un corte por banco es distinta a la del mercado completo.
        for nombre, pred in BANCOS.items():
            sel = [a for a in anuncios if any(pred(m.lower()) for m in a.metodos_pago)]
            lado[nombre] = metricas(etiquetar_outliers(sel, k=3.5)) if sel else None
        lado["BDV+BNC"] = (
            metricas(etiquetar_outliers(seleccion_combinada, k=3.5))
            if seleccion_combinada
            else None
        )

        if oficial:
            for clave in ("global", "BDV", "BNC", "BDV+BNC"):
                ref = lado.get(clave)
                if ref:
                    b = calcular_brecha(ref["mediana"], oficial)
                    ref["brecha_pct"] = b.gap_pct
        g = lado["global"]
        for clave in ("BDV", "BNC", "BDV+BNC"):
            ref = lado.get(clave)
            if ref and g:
                ref["premium_vs_global_pct"] = (
                    (ref["mediana"] - g["mediana"]) / g["mediana"] * 100
                )
        out[side] = lado

    out["metodos_top"] = metodos_global.most_common(15)

    def enc(o):
        return str(o)

    print(json.dumps(out, default=enc, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
