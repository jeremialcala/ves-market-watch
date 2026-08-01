"""Derivación de la brecha histórica del lado VENTA (ADR-0013 RF-7).

Puro y sin IO. La aritmética es la misma de
`knowledge/metrics/brecha-cambiaria.md`, y se replica aquí en vez de importarla
del `indicator-engine` porque son servicios separados: acoplarlos por código
haría que un cambio de fórmula del motor reescribiera el pasado en silencio.
Lo que sí se replica es el resultado, y hay una medición que lo respalda.

Por qué SOLO el lado venta, medido antes de escribir una línea:
`historical_market_snapshots.base_weighted_avg` queda a ±0,6 VES de
`p2p_mediana_sell` y a ~8 VES de `p2p_mediana_buy`. Sobre 279 horas de solape, la
brecha así calculada difiere de `p2p_brecha_pct_sell` en **−0,078 pp** (desviación
0,186) y de `p2p_brecha_pct_buy` en **+1,083 pp** (desviación 0,607). El export es
el lado venta; derivar el de compra metería un escalón de ~1 pp.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

# Nombres canónicos del motor: la serie derivada tiene que llamarse igual que la
# viva para que `/indicators/history` las sirva como una sola.
INDICADOR_PCT = "p2p_brecha_pct_sell"
INDICADOR_ABS = "p2p_brecha_abs_sell"
MONEDA = "VES"

# `calc_version` versiona LA FÓRMULA QUE PRODUJO LA FILA (RF-3 del motor). Estas
# no las produjo el motor, así que no pueden llevar su 1: quien filtre por
# `calc_version = 1` debe seguir viendo solo lo que calculó el motor. El 0 es el
# sentinela de «derivado de un export externo».
CALC_VERSION_DERIVADO = 0

# `numeric(24,8)` en `indicators`.
_CUANTO = Decimal("0.00000001")
_CIEN = Decimal(100)


class BrechaNoDerivable(Exception):
    """Un punto del que no sale brecha creíble. Se omite con motivo."""

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


@dataclass(frozen=True, slots=True)
class BrechaDerivada:
    as_of: datetime
    precio_p2p: Decimal
    tasa_oficial: Decimal
    abs: Decimal
    pct: Decimal


def derivar(
    as_of: datetime, precio_p2p: Decimal | None, tasa_oficial: Decimal | None
) -> BrechaDerivada:
    """`abs = p2p − oficial` · `pct = abs / oficial × 100`.

    La expresión del porcentaje es **literalmente la de `calcular_brecha`** del
    motor, no una equivalente. `(p2p / oficial − 1) × 100` da el mismo número en
    álgebra pero NO en aritmética decimal: el orden de las operaciones cambia el
    redondeo, y el objetivo aquí es que la serie derivada empalme con la viva.

    Sin tasa oficial NO hay brecha: misma regla que el motor. Rellenarla con la
    más cercana en el futuro sería usar información que en ese instante no
    existía.
    """
    if precio_p2p is None:
        raise BrechaNoDerivable("snapshot sin precio de referencia")
    if tasa_oficial is None:
        raise BrechaNoDerivable("sin tasa oficial vigente en ese instante")
    if tasa_oficial <= 0:
        raise BrechaNoDerivable("tasa oficial no positiva")
    if precio_p2p <= 0:
        raise BrechaNoDerivable("precio P2P no positivo")

    bruta = precio_p2p - tasa_oficial
    absoluta = bruta.quantize(_CUANTO)
    porcentual = (bruta / tasa_oficial * _CIEN).quantize(_CUANTO)
    return BrechaDerivada(
        as_of=as_of,
        precio_p2p=precio_p2p,
        tasa_oficial=tasa_oficial,
        abs=absoluta,
        pct=porcentual,
    )


def metadata_procedencia(sesgo_medido_pp: str, horas_solape: int) -> dict:
    """Lo que se guarda en `indicators.metadata` para que la fila se pueda auditar.

    No es decoración: `calc_version: 0` dice «esto no lo calculó el motor», y
    esto dice **qué lo calculó y con cuánto error conocido**. Sin ello, dentro de
    un año nadie podrá distinguir una serie derivada de una medida.
    """
    return {
        "origen": "historical_market_snapshots",
        "formula": "(base_weighted_avg - official_rate) / official_rate * 100",
        "lado": "sell",
        "nota": (
            "Serie DERIVADA de un export externo, no calculada por el "
            "indicator-engine. El precio del export es el lado venta."
        ),
        "sesgo_vs_motor_pp": sesgo_medido_pp,
        "horas_de_solape_medidas": horas_solape,
    }
