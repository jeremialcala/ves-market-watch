"""Paginación obligatoria y validación de rangos de históricos.

Regla transversal del contrato (openapi.yaml): rango máximo de 90 días por
request (violarlo → 422) y paginación base 1 con tope de 500 por página.
Protege la DB de scraping de histórico sin límites (T4, A10).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from api_gateway.domain.errores import ParametroInvalido, RangoInvalido

RANGO_MAX_DIAS = 90
PAGE_SIZE_MAX = 500
PAGE_SIZE_DEFAULT = 100


@dataclass(frozen=True, slots=True)
class Pagina:
    numero: int
    tamano: int

    @property
    def offset(self) -> int:
        return (self.numero - 1) * self.tamano


def validar_pagina(page: int, page_size: int) -> Pagina:
    if page < 1:
        raise ParametroInvalido("El parámetro 'page' debe ser >= 1.")
    if not 1 <= page_size <= PAGE_SIZE_MAX:
        raise ParametroInvalido(
            f"El parámetro 'page_size' debe estar entre 1 y {PAGE_SIZE_MAX}."
        )
    return Pagina(numero=page, tamano=page_size)


def validar_rango(desde: date | datetime, hasta: date | datetime) -> None:
    """Rango inclusive: no invertido y de a lo sumo RANGO_MAX_DIAS."""
    if hasta < desde:
        raise RangoInvalido("El rango solicitado está invertido ('to' < 'from').")
    if hasta - desde > timedelta(days=RANGO_MAX_DIAS):
        raise RangoInvalido(
            f"El rango solicitado excede el máximo de {RANGO_MAX_DIAS} días."
        )


def meta_pagina(pagina: Pagina, items_devueltos: int, total: int) -> dict:
    """Metadatos `PageMeta` del contrato (base 1, con total y has_more)."""
    return {
        "page": pagina.numero,
        "page_size": pagina.tamano,
        "total_items": total,
        "has_more": pagina.offset + items_devueltos < total,
    }
