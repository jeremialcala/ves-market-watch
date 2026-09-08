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


def test_un_anuncio_marcado_outlier_no_ancla_la_rejilla():
    """El defecto del 2026-08-06, fijado.

    El ancla es el mejor precio del lado, así que un solo anuncio absurdo
    desplaza las diez bandas enteras: aquel día el lado venta se anclaba en
    920,00 —ocho anuncios, 2 983 USDT— mientras el libro real vivía entre 841 y
    845,5 con ~8,3 M USDT, y las bandas del 0,5 % bajaban hasta 874 sin llegar
    nunca al mercado. El panel enseñaba diez barras idénticas de 372 USDT: un
    libro profundo que no existía.
    """
    items = [
        item_crudo("920.00", "372", outlier=True),  # el anuncio manipulado
        item_crudo("845.00", "1000"),
        item_crudo("844.00", "2000"),
        item_crudo("841.00", "3000"),
    ]

    niveles = calcular_profundidad(items, "sell", BAND, 3)

    # Ancla en 845, no en 920: la primera banda ya toca el libro de verdad.
    assert Decimal(niveles[0]["price_band"]) == Decimal("840.775")
    assert niveles[0]["cum_volume"] == "6000"


def test_sin_la_marca_no_se_filtra_nada():
    """Los snapshots anteriores al cambio no llevan veredicto. Suponerles uno que
    nadie emitió sería inventarlo: se pintan tal cual, como antes."""
    items = [
        item_crudo("920.00", "372", outlier=None),
        item_crudo("845.00", "1000", outlier=None),
    ]

    niveles = calcular_profundidad(items, "sell", BAND, 1)

    assert Decimal(niveles[0]["price_band"]) == Decimal("915.4")
    assert niveles[0]["cum_volume"] == "372"


def test_un_snapshot_todo_outliers_no_inventa_profundidad():
    """Sin nada creíble que pintar, lista vacía — nunca una rejilla ficticia."""
    items = [item_crudo("920.00", "372", outlier=True)]

    assert calcular_profundidad(items, "sell", BAND, 3) == []


def test_el_outlier_tampoco_suma_volumen_dentro_de_una_banda():
    """No basta con no anclar en él: si cayera dentro de una banda seguiría
    inflando el acumulado, que es la cifra que el panel escribe."""
    items = [
        item_crudo("100.00", "10"),
        item_crudo("100.20", "999", outlier=True),  # dentro de la 1ª banda
        item_crudo("100.40", "20"),
    ]

    niveles = calcular_profundidad(items, "buy", BAND, 1)

    assert niveles[0]["cum_volume"] == "30"
