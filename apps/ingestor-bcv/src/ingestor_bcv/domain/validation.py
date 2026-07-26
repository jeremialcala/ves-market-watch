"""Validación de plausibilidad antes de publicar (RF-3, ADR-0006, A08).

Una tasa que no pasa la validación queda en estado `suspect`: se persiste para
auditoría pero no se publica al bus hasta validación humana (HITL).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from ingestor_bcv.domain.models import TasaOficial


@dataclass(frozen=True, slots=True)
class ResultadoValidacion:
    es_valida: bool
    motivo: str | None = None


def validar_plausibilidad(
    valor: Decimal,
    fecha_valor: date,
    ultima_valida: TasaOficial | None,
    max_delta_pct: Decimal,
) -> ResultadoValidacion:
    """Valida un valor candidato contra la última tasa válida conocida.

    Reglas:
    - El valor debe ser positivo.
    - La fecha-valor no puede retroceder respecto a la última válida.
    - La variación porcentual no puede exceder `max_delta_pct` (default 20 %).
    - Sin tasa previa (primera captura de la moneda) el valor se acepta.
    """
    if valor <= 0:
        return ResultadoValidacion(False, f"valor no positivo: {valor}")

    if ultima_valida is None:
        return ResultadoValidacion(True)

    if fecha_valor < ultima_valida.fecha_valor:
        return ResultadoValidacion(
            False,
            f"fecha-valor retrocede: {fecha_valor} < {ultima_valida.fecha_valor}",
        )

    delta_pct = abs(valor - ultima_valida.valor) / ultima_valida.valor * 100
    if delta_pct > max_delta_pct:
        return ResultadoValidacion(
            False,
            f"variación {delta_pct:.2f} % excede el máximo {max_delta_pct} % "
            f"(última válida: {ultima_valida.valor}, candidata: {valor})",
        )

    return ResultadoValidacion(True)
