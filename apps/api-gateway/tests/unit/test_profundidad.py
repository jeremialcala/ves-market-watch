"""Profundidad por bandas de 0,5 % desde el mejor precio (proyección pura)."""

from decimal import Decimal

from api_gateway.domain.profundidad import calcular_profundidad
from tests.conftest import item_crudo

BAND = Decimal("0.5")


def test_buy_acumula_desde_el_precio_mas_bajo():
    items = [
        item_crudo("100.00", "10"),
        item_crudo("100.40", "20"),  # dentro de la 1ª banda (≤ 100.5)
        item_crudo("100.90", "5"),  # 2ª banda (≤ 101.0)
        item_crudo("150.00", "99"),  # fuera de las 3 bandas
    ]
    niveles = calcular_profundidad(items, "buy", BAND, 3)
    assert [n["cum_volume"] for n in niveles] == ["30", "35", "35"]
    assert Decimal(niveles[0]["price_band"]) == Decimal("100.5")


def test_sell_acumula_desde_el_precio_mas_alto_hacia_abajo():
    items = [
        item_crudo("200.00", "10"),
        item_crudo("199.20", "15"),  # 1ª banda (≥ 199.0)
        item_crudo("150.00", "99"),
    ]
    niveles = calcular_profundidad(items, "sell", BAND, 2)
    assert [n["cum_volume"] for n in niveles] == ["25", "25"]
    assert Decimal(niveles[0]["price_band"]) == Decimal("199.000")


def test_items_ilegibles_se_descartan_sin_abortar():
    items = [
        {"adv": {}},
        {"adv": {"price": "no-numerico", "surplusAmount": "5"}},
        {"otra": "forma"},
        item_crudo("100.00", "7"),
    ]
    niveles = calcular_profundidad(items, "buy", BAND, 1)
    assert niveles[0]["cum_volume"] == "7"


def test_sin_anuncios_legibles_devuelve_vacio():
    assert calcular_profundidad([], "buy", BAND, 5) == []
    assert calcular_profundidad([{"adv": {}}], "buy", BAND, 5) == []


def test_precio_no_positivo_se_descarta():
    assert calcular_profundidad([item_crudo("0", "5")], "buy", BAND, 3) == []
