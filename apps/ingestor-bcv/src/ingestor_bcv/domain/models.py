"""Modelo de dominio: tasa oficial de cambio publicada por el BCV."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum


class EstadoTasa(StrEnum):
    """Máquina de estados de ADR-0007: valid | suspect | stale | rejected.

    `rejected` (la «descartada» del ADR) es terminal: una suspect resuelta por
    rechazo humano, timeout o reemplazo por una aprobación más reciente.
    """

    VALID = "valid"
    SUSPECT = "suspect"
    STALE = "stale"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class TasaOficial:
    """Una tasa oficial capturada: VES por unidad de `moneda` (ISO 4217)."""

    moneda: str
    valor: Decimal
    fecha_valor: date
    capturada_en: datetime
    estado: EstadoTasa = EstadoTasa.VALID
    fuente: str = "BCV"

    def cambio_frente_a(self, otra: "TasaOficial") -> bool:
        """True si el valor o la fecha-valor difieren (RF-4: publicar solo en cambio)."""
        return self.valor != otra.valor or self.fecha_valor != otra.fecha_valor
