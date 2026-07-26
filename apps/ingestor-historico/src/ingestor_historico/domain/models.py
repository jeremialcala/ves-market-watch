"""Modelo de dominio de la ingesta histórica.

Un `SnapshotHistorico` es una observación puntual del mercado USDT/VES tomada
de un export externo: precio promedio ponderado del top de órdenes, volumen
total y el detalle por banco (tasa, volumen y señales de liquidez). El
conjunto de bancos es dinámico: el modelo no asume nombres concretos.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True, slots=True)
class DatoBanco:
    """Observación de un banco dentro de un snapshot.

    `liquidez_baja` y `disponible` provienen de las anotaciones del export
    («lower liquidity», «only N available»): la fuente agrega el top de
    órdenes por banco y marca cuando la profundidad no alcanzó el objetivo.
    """

    tasa: Decimal | None = None
    volumen: Decimal | None = None
    liquidez_baja: bool = False
    disponible: Decimal | None = None


@dataclass(frozen=True, slots=True)
class SnapshotHistorico:
    source_id: str
    capturado_en: datetime  # siempre timezone-aware
    precio_promedio: Decimal  # promedio ponderado base (fiat por asset)
    volumen_total: Decimal | None
    bancos: Mapping[str, DatoBanco] = field(default_factory=dict)
    # Columnas del export no reconocidas por el mapeo: se conservan crudas
    # para no perder información en formatos futuros (adaptabilidad).
    extra: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "bancos", MappingProxyType(dict(self.bancos)))
        object.__setattr__(self, "extra", MappingProxyType(dict(self.extra)))
