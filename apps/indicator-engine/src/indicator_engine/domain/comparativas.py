"""Comparativa de un indicador contra su propia historia (RF-7, ADR-0021).

Puro y sin IO. Responde «¿cómo está esto hoy comparado con lo normal?» sobre
ventanas móviles de días, y —lo que hace que la respuesta sea honesta— publica
**hasta dónde llega la serie de verdad**.

Ese `dias_cubiertos` es el corazón del módulo, no un extra. La tarjeta del
dashboard mostraba «Promedio 30 días» calculado sobre 12 días de historia: el
número era real y la etiqueta no. Es el mismo fallo que `scale.source` resuelve
en los medidores, y se resuelve igual: la degradación viaja en el dato y la UI la
escribe, en vez de degradar en silencio.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

# Posición de hoy frente a una referencia.
POS_POR_ENCIMA = "por_encima"
POS_EN_LINEA = "en_linea"
POS_POR_DEBAJO = "por_debajo"

# Qué referencia resume la ventana.
REF_MEDIA = "media"
REF_MAXIMO = "maximo"
REF_MINIMO = "minimo"

_CERO = Decimal(0)


class ConfigComparativasInvalida(Exception):
    """`comparativas` mal formado en la config — el motor no arranca."""


@dataclass(frozen=True, slots=True)
class ConfigComparativas:
    ventanas_dias: tuple[int, ...]
    # Fracción de la ventana que la serie debe alcanzar para considerarla
    # completa. Por debajo, la comparativa se publica igual pero MARCADA.
    cobertura_minima: Decimal
    # Umbral simétrico, en puntos porcentuales, para decir que hoy está «en
    # línea» con la referencia en vez de por encima o por debajo.
    umbral_desvio: Decimal


@dataclass(frozen=True, slots=True)
class Agregado:
    """Resumen de una serie en una ventana.

    `dias_cubiertos` es **hasta dónde llega la serie dentro de la ventana**, no
    cuántos días distintos tienen dato: lo que invalida una media de 30 días es
    que la serie empiece hace 12, no que falte una tarde.
    """

    ventana_dias: int
    media: Decimal | None
    maximo: Decimal | None
    minimo: Decimal | None
    muestras: int
    dias_cubiertos: int

    def completa(self, config: ConfigComparativas) -> bool:
        if self.ventana_dias <= 0:
            return False
        cubierto = Decimal(self.dias_cubiertos) / Decimal(self.ventana_dias)
        return cubierto >= config.cobertura_minima


def cargar_config_comparativas(data: Mapping) -> ConfigComparativas:
    if not isinstance(data, Mapping):
        raise ConfigComparativasInvalida("comparativas debe ser un mapeo")

    ventanas = data.get("ventanas_dias")
    if not isinstance(ventanas, (list, tuple)) or not ventanas:
        raise ConfigComparativasInvalida("ventanas_dias debe ser una lista no vacía")
    try:
        dias = tuple(int(v) for v in ventanas)
    except (TypeError, ValueError) as exc:
        raise ConfigComparativasInvalida(f"ventanas_dias no numéricas: {exc}") from exc
    if any(d < 1 for d in dias):
        raise ConfigComparativasInvalida("cada ventana debe ser >= 1 día")
    if len(set(dias)) != len(dias):
        raise ConfigComparativasInvalida("ventanas_dias repetidas")
    if list(dias) != sorted(dias):
        # Ordenadas: el cliente las pinta en ese orden y elegir «la más ancha
        # completa» se vuelve un recorrido, no una búsqueda.
        raise ConfigComparativasInvalida("ventanas_dias deben ir de menor a mayor")

    cobertura = _decimal(data, "cobertura_minima")
    if not _CERO < cobertura <= Decimal(1):
        raise ConfigComparativasInvalida("cobertura_minima debe estar en (0, 1]")

    umbral = _decimal(data, "umbral_desvio")
    if umbral <= _CERO:
        raise ConfigComparativasInvalida(
            "umbral_desvio es simétrico: debe ser > 0"
        )

    return ConfigComparativas(
        ventanas_dias=dias, cobertura_minima=cobertura, umbral_desvio=umbral
    )


def _decimal(mapa: Mapping, clave: str) -> Decimal:
    try:
        return Decimal(str(mapa[clave]))
    except (KeyError, InvalidOperation) as exc:
        raise ConfigComparativasInvalida(f"'{clave}' inválido: {exc}") from exc


def clasificar_posicion(
    hoy: Decimal | None, referencia: Decimal | None, config: ConfigComparativas
) -> str | None:
    """Dónde cae el valor de hoy respecto de una referencia.

    `None` cuando falta cualquiera de los dos: sin referencia no hay posición, y
    «en línea» sería una afirmación que nadie midió.
    """
    if hoy is None or referencia is None:
        return None
    delta = hoy - referencia
    if delta > config.umbral_desvio:
        return POS_POR_ENCIMA
    if delta < -config.umbral_desvio:
        return POS_POR_DEBAJO
    return POS_EN_LINEA


def ventana_mas_ancha_completa(
    agregados: Sequence[Agregado], config: ConfigComparativas
) -> Agregado | None:
    """La ventana completa de mayor alcance, que es la que más dice.

    Comparar contra 90 días pesa más que contra 7; pero una ventana de 90 con 12
    días de serie detrás no es una ventana de 90. Si ninguna está completa se
    devuelve `None` y el cliente lo dice en vez de citar una media que no lo es.
    """
    completas = [a for a in agregados if a.completa(config) and a.media is not None]
    return max(completas, key=lambda a: a.ventana_dias) if completas else None


def es_extremo(
    hoy: Decimal | None, agregado: Agregado | None
) -> str | None:
    """`maximo` / `minimo` si hoy iguala o supera el extremo de la ventana.

    Se compara con `>=` y `<=` a propósito: el valor de hoy ya está DENTRO de la
    serie agregada, así que igualar el extremo es serlo.
    """
    if hoy is None or agregado is None:
        return None
    if agregado.maximo is not None and hoy >= agregado.maximo:
        return REF_MAXIMO
    if agregado.minimo is not None and hoy <= agregado.minimo:
        return REF_MINIMO
    return None
