"""Parser del HTML del sitio BCV — selectores CSS con fallback regex (RF-2, ADR-0006).

Estructura observada (fixture `tests/fixtures/bcv_home.html`, capturado 2026-07-05):

    <div id="dolar" class="col-sm-12 col-xs-12">
      <div class="field-content">
        <div class="row recuadrotsmc">
          <div ...><span> USD</span></div>
          <div ...><strong class="strong-tb">667,05000000</strong></div>
        </div>
      </div>
    </div>

    <div class="pull-right dinpro center">
      Fecha Valor: <span class="date-display-single" content="2026-07-06T00:00:00-04:00">…</span>
    </div>

Las monedas se descubren dinámicamente: cualquier bloque `recuadrotsmc` con un
código ISO 4217 y un valor numérico se ingesta — si el BCV agrega una moneda
nueva, entra sin cambios de código.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from bs4 import BeautifulSoup

PATRON_CODIGO_MONEDA = re.compile(r"^[A-Z]{3}$")

# Fallback: pares <span>XXX</span> … <strong>1.234,56</strong> cercanos en el HTML crudo.
PATRON_TASA_CRUDA = re.compile(
    r"<span>\s*([A-Z]{3})\s*</span>(?:.{0,400}?)<strong[^>]*>\s*([\d.,]+)\s*</strong>",
    re.DOTALL,
)
PATRON_FECHA_CRUDA = re.compile(
    r"Fecha\s+Valor:.{0,200}?content=\"(\d{4}-\d{2}-\d{2})", re.DOTALL
)


class ErrorDeParseo(Exception):
    """El HTML no contiene la estructura esperada (posible cambio del sitio)."""


def parsear_pagina(html: str) -> tuple[date, dict[str, Decimal]]:
    """Extrae (fecha_valor, {moneda: valor}) de la página del BCV.

    Intenta primero con selectores CSS; si la estructura cambió, cae al
    fallback por regex sobre el HTML crudo. Si ninguno encuentra tasas o
    fecha-valor, lanza `ErrorDeParseo` (dispara el circuito de fallos → stale).
    """
    soup = BeautifulSoup(html, "html.parser")

    tasas = _tasas_por_selector(soup) or _tasas_por_regex(html)
    if not tasas:
        raise ErrorDeParseo("no se encontró ninguna tasa en la página del BCV")

    fecha_valor = _fecha_por_selector(soup) or _fecha_por_regex(html)
    if fecha_valor is None:
        raise ErrorDeParseo("no se encontró la fecha-valor en la página del BCV")

    return fecha_valor, tasas


def _tasas_por_selector(soup: BeautifulSoup) -> dict[str, Decimal]:
    tasas: dict[str, Decimal] = {}
    for bloque in soup.select("div.recuadrotsmc"):
        span = bloque.find("span")
        strong = bloque.find("strong")
        if span is None or strong is None:
            continue
        codigo = span.get_text(strip=True)
        if not PATRON_CODIGO_MONEDA.match(codigo):
            continue
        valor = _a_decimal(strong.get_text(strip=True))
        if valor is not None:
            tasas[codigo] = valor
    return tasas


def _tasas_por_regex(html: str) -> dict[str, Decimal]:
    tasas: dict[str, Decimal] = {}
    for codigo, crudo in PATRON_TASA_CRUDA.findall(html):
        valor = _a_decimal(crudo)
        if valor is not None and codigo not in tasas:
            tasas[codigo] = valor
    return tasas


def _fecha_por_selector(soup: BeautifulSoup) -> date | None:
    nodo = soup.select_one("div.pull-right.dinpro.center span.date-display-single[content]")
    if nodo is None:
        return None
    try:
        return date.fromisoformat(str(nodo["content"])[:10])
    except ValueError:
        return None


def _fecha_por_regex(html: str) -> date | None:
    coincidencia = PATRON_FECHA_CRUDA.search(html)
    if coincidencia is None:
        return None
    try:
        return date.fromisoformat(coincidencia.group(1))
    except ValueError:
        return None


def _a_decimal(texto: str) -> Decimal | None:
    """Convierte el formato del BCV (coma decimal, punto de miles) a Decimal."""
    limpio = texto.replace("\xa0", "").replace(" ", "")
    if "," in limpio:
        limpio = limpio.replace(".", "").replace(",", ".")
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None
