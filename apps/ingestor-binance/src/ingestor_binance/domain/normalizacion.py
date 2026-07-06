"""Normalización de anuncios crudos y etiquetado de outliers — funciones puras.

Seguridad (PRD):
- Los textos de la fuente (métodos de pago/bancos) son datos NO confiables:
  se sanitizan antes de persistir o reemitir (A05, escenario negativo 6).
- Los precios absurdos se etiquetan como outliers por MAD (escenario 2);
  nunca se filtran aquí — esa decisión es del indicator-engine.
"""

from __future__ import annotations

import unicodedata
from dataclasses import replace
from decimal import Decimal, InvalidOperation
from statistics import median

from ingestor_binance.domain.models import Anuncio

LONGITUD_MAX_TEXTO = 64

# Minimización (docs/00-project/data-classification.md): del anunciante solo se
# persisten las métricas públicas que pueden alimentar indicadores. El alias
# (nickName) y los identificadores pseudónimos (userNo, etc.) NO se persisten.
_CAMPOS_ADVERTISER_PERSISTIBLES = (
    "userType",
    "monthOrderCount",
    "monthFinishRate",
    "positiveRate",
)

# Constante del z-score modificado (Iglewicz & Hoaglin).
_FACTOR_MAD = Decimal("0.6745")
# Fallback cuando MAD = 0 (p. ej. 19 anuncios idénticos + 1 manipulado — el
# caso de ataque típico deja MAD en cero): desviación relativa vs. la mediana.
_UMBRAL_RELATIVO_SIN_MAD = Decimal("0.05")
# Piso de desviación relativa: en mercados muy agrupados (spike real: ~746 ± 1)
# el MAD es minúsculo y el z-score marcaría anuncios legítimos a < 1 % de la
# mediana. Nada dentro de este margen es outlier, sin importar el z-score.
_DESVIACION_RELATIVA_MINIMA = Decimal("0.02")


def sanitizar_texto(texto: object, max_len: int = LONGITUD_MAX_TEXTO) -> str:
    """Texto plano seguro: sin caracteres de control/formato, longitud acotada."""
    if not isinstance(texto, str):
        return ""
    limpio = "".join(
        c for c in texto if unicodedata.category(c) not in ("Cc", "Cf")
    ).strip()
    return limpio[:max_len]


def normalizar_anuncio(crudo: dict) -> Anuncio:
    """Convierte un item `{adv, advertiser}` de la fuente al modelo de dominio.

    Los campos numéricos vienen como string decimal (confirmado en el spike);
    un valor no numérico lanza y el llamador descarta el snapshot (A10).
    """
    adv = crudo["adv"]
    advertiser = crudo["advertiser"]
    metodos = tuple(
        texto
        for metodo in adv.get("tradeMethods", [])
        if (texto := sanitizar_texto(metodo.get("tradeMethodName") or metodo.get("identifier")))
    )
    return Anuncio(
        adv_no=sanitizar_texto(adv["advNo"]),
        precio=_a_decimal(adv["price"]),
        cantidad_disponible=_a_decimal(adv["surplusAmount"]),
        limite_min=_a_decimal(adv["minSingleTransAmount"]),
        limite_max=_a_decimal(adv["maxSingleTransAmount"]),
        metodos_pago=metodos,
        es_merchant=advertiser.get("userType") == "merchant",
    )


def etiquetar_outliers(
    anuncios: tuple[Anuncio, ...] | list[Anuncio], k: float = 3.5
) -> tuple[Anuncio, ...]:
    """Marca `outlier=True` por z-score modificado sobre el precio:

        |0.6745 · (precio − mediana) / MAD| > k

    Con MAD = 0 (precios mayoritariamente idénticos) se usa la desviación
    relativa frente a la mediana (> 5 %) — cubre el ataque de un anuncio
    absurdo entre muchos idénticos, donde el MAD clásico queda ciego.
    Adicionalmente, un precio a menos del 2 % de la mediana nunca es outlier:
    en mercados muy agrupados el MAD diminuto haría marcar dispersión normal.
    """
    if len(anuncios) < 3:
        return tuple(anuncios)

    precios = [a.precio for a in anuncios]
    mediana = median(precios)
    mad = median([abs(p - mediana) for p in precios])
    umbral_k = Decimal(str(k))

    def es_outlier(precio: Decimal) -> bool:
        if mediana == 0:
            return False
        if abs(precio - mediana) / mediana <= _DESVIACION_RELATIVA_MINIMA:
            return False  # dentro del ruido normal del mercado
        if mad == 0:
            return abs(precio - mediana) / mediana > _UMBRAL_RELATIVO_SIN_MAD
        return abs(_FACTOR_MAD * (precio - mediana) / mad) > umbral_k

    return tuple(
        replace(a, outlier=True) if es_outlier(a.precio) else a for a in anuncios
    )


def minimizar_crudo(items: list[dict]) -> list[dict]:
    """Versión persistible del crudo: `adv` completo (datos públicos del anuncio)
    y del `advertiser` solo las métricas públicas — el alias y los identificadores
    pseudónimos se redactan antes de tocar disco (minimización de datos)."""
    return [
        {
            "adv": item.get("adv", {}),
            "advertiser": {
                campo: valor
                for campo, valor in item.get("advertiser", {}).items()
                if campo in _CAMPOS_ADVERTISER_PERSISTIBLES
            },
        }
        for item in items
    ]


def _a_decimal(texto: str) -> Decimal:
    try:
        return Decimal(texto)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"valor numérico inválido de la fuente: {texto!r}") from exc
