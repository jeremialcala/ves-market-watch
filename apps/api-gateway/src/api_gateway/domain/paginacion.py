"""Paginación obligatoria y validación de rangos de históricos.

Regla transversal del contrato (openapi.yaml): paginación base 1 con tope de 500
por página, y un rango acotado por request (violarlo → 422). Protege la DB de
scraping de histórico sin límites (T4, A10).

### El tope se mide en FILAS, no en días (2026-09-08)

Hasta esta fecha el rango se acotaba en 90 días de calendario, **sin mirar el
intervalo**. Pero lo que cuesta una consulta de histórico es el número de
buckets que devuelve —días ÷ intervalo—, no el ancho del calendario, así que la
regla acotaba el eje equivocado. Medido contra la base de desarrollo:

| Petición | Filas | En la DB | Con la regla vieja |
|---|---|---|---|
| 279 d a `1d` | 279 | 38,9 ms | **bloqueada** |
| 90 d a `5m` | 25.920 | 78,9 ms + 52 páginas | permitida |

Se bloqueaba lo barato y se permitía lo que devuelve 93 veces más filas.

`FILAS_MAX` **no relaja el peor caso, lo conserva**: 26.000 es justo lo que ya
permitía el contrato en su granularidad más fina (90 d a 5 m = 25.920 buckets).
Lo que cambia es que ese mismo presupuesto se reparte según el bucket, en vez de
gastarse entero en la escala más cara. A `5m` el tope sigue siendo 90 días; a
`1d` alcanza los 9 meses de brecha derivada que ya están en la base.

Los endpoints **sin intervalo** —tasas oficiales por fecha-valor y señales— no
tienen buckets que contar y conservan el tope en días.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from api_gateway.domain.errores import ParametroInvalido, RangoInvalido

RANGO_MAX_DIAS = 90
PAGE_SIZE_MAX = 500
PAGE_SIZE_DEFAULT = 100

# Buckets máximos por request en los endpoints con `interval`. Es el peor caso
# que el contrato YA permitía (90 d a 5 m = 25.920), redondeado.
FILAS_MAX = 26_000

# Mapa canónico de intervalos. Vive en el dominio y no en el adaptador de
# Timescale porque ahora lo necesitan los dos: el repositorio para agrupar y la
# validación para estimar cuántas filas saldrían. Duplicarlo era garantizar que
# un día dejaran de coincidir.
INTERVALOS: dict[str, timedelta] = {
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
}


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


def validar_rango(
    desde: date | datetime,
    hasta: date | datetime,
    intervalo: timedelta | None = None,
) -> None:
    """Rango inclusive: no invertido y dentro del tope.

    Con `intervalo`, el tope son los **buckets** que devolvería. Sin él —tasas
    oficiales por fecha-valor, señales— se mantiene el tope en días: ahí no hay
    bucket que contar, y una fila por fecha-valor no depende de ninguna escala.
    """
    if hasta < desde:
        raise RangoInvalido("El rango solicitado está invertido ('to' < 'from').")
    if intervalo is None:
        if hasta - desde > timedelta(days=RANGO_MAX_DIAS):
            raise RangoInvalido(
                f"El rango solicitado excede el máximo de {RANGO_MAX_DIAS} días."
            )
        return
    # Cota SUPERIOR: los buckets posibles, no los que tengan dato. Una serie con
    # huecos devolverá menos, y para un guardia eso es exactamente lo que se
    # quiere — nunca subestimar el coste.
    filas = -(-(hasta - desde) // intervalo)
    if filas > FILAS_MAX:
        raise RangoInvalido(
            f"El rango solicitado devolvería hasta {filas} filas con ese "
            f"intervalo, y el máximo es {FILAS_MAX}. Pide un intervalo más "
            f"ancho o un rango más corto."
        )


def meta_pagina(pagina: Pagina, items_devueltos: int, total: int) -> dict:
    """Metadatos `PageMeta` del contrato (base 1, con total y has_more)."""
    return {
        "page": pagina.numero,
        "page_size": pagina.tamano,
        "total_items": total,
        "has_more": pagina.offset + items_devueltos < total,
    }
