"""Tests del parser BCV contra HTML real (RF-2: selector + fallback regex)."""

from datetime import date
from decimal import Decimal

import pytest

from ingestor_bcv.adapters.bcv.parser import ErrorDeParseo, _a_decimal, parsear_pagina

TASAS_ESPERADAS = {
    "USD": Decimal("667.05000000"),
    "EUR": Decimal("763.19191650"),
    "CNY": Decimal("98.39656596"),
    "TRY": Decimal("14.25354014"),
    "RUB": Decimal("8.63048259"),
}


def test_extrae_todas_las_monedas_publicadas(bcv_html):
    fecha_valor, tasas = parsear_pagina(bcv_html)

    assert fecha_valor == date(2026, 7, 6)
    assert set(tasas) == set(TASAS_ESPERADAS)
    for moneda, valor in TASAS_ESPERADAS.items():
        assert tasas[moneda] == valor, moneda


def test_fallback_regex_cuando_cambian_las_clases_css(bcv_html):
    # Simula un cambio de estructura: desaparecen las clases que usan los selectores.
    mutado = bcv_html.replace("recuadrotsmc", "otra-clase").replace(
        "date-display-single", "otra-fecha"
    )

    fecha_valor, tasas = parsear_pagina(mutado)

    assert fecha_valor == date(2026, 7, 6)
    for moneda, valor in TASAS_ESPERADAS.items():
        assert tasas[moneda] == valor, moneda


def test_html_sin_tasas_lanza_error_de_parseo():
    with pytest.raises(ErrorDeParseo, match="ninguna tasa"):
        parsear_pagina("<html><body><p>mantenimiento</p></body></html>")


def test_tasas_sin_fecha_valor_lanza_error_de_parseo():
    html = (
        '<div class="row recuadrotsmc">'
        "<div><span> USD</span></div>"
        "<div><strong>667,05</strong></div>"
        "</div>"
    )
    with pytest.raises(ErrorDeParseo, match="fecha-valor"):
        parsear_pagina(html)


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("667,05000000", Decimal("667.05")),
        (" 763,19191650", Decimal("763.1919165")),
        ("1.234,56", Decimal("1234.56")),
        ("98.39656596", Decimal("98.39656596")),  # ya con punto decimal
        ("no-numérico", None),
    ],
)
def test_conversion_decimal_formato_bcv(texto, esperado):
    assert _a_decimal(texto) == esperado
