"""Varianza histórica del mercado (funciones puras, PRD RF-4).

Dos vistas complementarias sobre la serie de precios:
- Nivel: media, varianza muestral (n−1) y desviación del precio en la ventana.
- Retornos: log-retornos entre snapshots consecutivos y su desviación
  (volatilidad por paso). No se anualiza: la serie tiene huecos y el
  intervalo entre snapshots no es constante — el consumidor decide cómo
  escalar.

El mismo resumen se calcula por banco a partir de las tasas del detalle.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from statistics import mean, stdev, variance
from typing import Mapping, Sequence


@dataclass(frozen=True, slots=True)
class PuntoSerie:
    """Entrada mínima para las estadísticas: instante, precio base y tasa
    por banco. Los adaptadores (DB o memoria) producen esta forma."""

    capturado_en: datetime
    precio: Decimal
    tasas_por_banco: Mapping[str, Decimal]


@dataclass(frozen=True, slots=True)
class ResumenSerie:
    n: int
    media: float
    varianza: float
    desviacion: float
    minimo: float
    maximo: float

    @property
    def coeficiente_variacion(self) -> float:
        return self.desviacion / self.media if self.media else 0.0


@dataclass(frozen=True, slots=True)
class VarianzaHistorica:
    desde: datetime
    hasta: datetime
    precio: ResumenSerie
    # Desviación de log-retornos entre snapshots consecutivos; None con n < 2.
    retornos: ResumenSerie | None
    por_banco: Mapping[str, ResumenSerie]


def resumen_serie(valores: Sequence[float]) -> ResumenSerie | None:
    if not valores:
        return None
    var = variance(valores) if len(valores) >= 2 else 0.0
    return ResumenSerie(
        n=len(valores),
        media=mean(valores),
        varianza=var,
        desviacion=math.sqrt(var),
        minimo=min(valores),
        maximo=max(valores),
    )


def retornos_log(valores: Sequence[float]) -> list[float]:
    """Log-retornos entre valores consecutivos; ignora no-positivos."""
    positivos = [v for v in valores if v > 0]
    return [
        math.log(actual / anterior)
        for anterior, actual in zip(positivos, positivos[1:])
    ]


def varianza_historica(puntos: Sequence[PuntoSerie]) -> VarianzaHistorica | None:
    if not puntos:
        return None
    ordenados = sorted(puntos, key=lambda p: p.capturado_en)
    precios = [float(p.precio) for p in ordenados]

    series_bancos: dict[str, list[float]] = defaultdict(list)
    for punto in ordenados:
        for banco, tasa in punto.tasas_por_banco.items():
            series_bancos[banco].append(float(tasa))

    retornos = retornos_log(precios)
    return VarianzaHistorica(
        desde=ordenados[0].capturado_en,
        hasta=ordenados[-1].capturado_en,
        precio=resumen_serie(precios),
        retornos=resumen_serie(retornos) if retornos else None,
        por_banco={
            banco: resumen_serie(serie)
            for banco, serie in sorted(series_bancos.items())
        },
    )


def varianza_por_dia(
    puntos: Sequence[PuntoSerie],
) -> list[tuple[date, VarianzaHistorica]]:
    """Serie agrupada por día calendario (en la zona horaria del dato)."""
    por_dia: dict[date, list[PuntoSerie]] = defaultdict(list)
    for punto in puntos:
        por_dia[punto.capturado_en.date()].append(punto)
    return [
        (dia, varianza_historica(grupo))
        for dia, grupo in sorted(por_dia.items())
    ]
