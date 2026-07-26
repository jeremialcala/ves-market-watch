"""Tests del etiquetado de outliers por MAD (escenario negativo 2, amenaza T2)."""

from datetime import UTC, datetime
from decimal import Decimal

from ingestor_binance.domain.models import Anuncio
from ingestor_binance.domain.normalizacion import etiquetar_outliers


def _anuncio(precio: str, adv_no: str = "1") -> Anuncio:
    return Anuncio(
        adv_no=adv_no,
        precio=Decimal(precio),
        cantidad_disponible=Decimal("100"),
        limite_min=Decimal("1000"),
        limite_max=Decimal("50000"),
        metodos_pago=("PagoMovil",),
        es_merchant=False,
    )


def test_precio_absurdo_queda_etiquetado():
    # Mercado real ~745 + un anuncio manipulado a 10×.
    anuncios = [_anuncio(p, str(i)) for i, p in enumerate(
        ["745.0", "745.6", "746.0", "746.5", "747.0", "747.5", "7450.0"]
    )]

    etiquetados = etiquetar_outliers(anuncios)

    assert [a.outlier for a in etiquetados] == [False] * 6 + [True]


def test_distribucion_limpia_no_marca_nada():
    anuncios = [_anuncio(p, str(i)) for i, p in enumerate(
        ["745.0", "745.6", "746.0", "746.5", "747.0", "747.5", "748.0"]
    )]

    assert not any(a.outlier for a in etiquetar_outliers(anuncios))


def test_mad_cero_no_ciega_el_etiquetado():
    # Ataque típico: mayoría de precios idénticos (MAD = 0) + uno absurdo.
    anuncios = [_anuncio("745.0", str(i)) for i in range(19)] + [_anuncio("7450.0", "x")]

    etiquetados = etiquetar_outliers(anuncios)

    assert sum(a.outlier for a in etiquetados) == 1
    assert etiquetados[-1].outlier


def test_precios_todos_identicos_sin_marcas():
    anuncios = [_anuncio("745.0", str(i)) for i in range(10)]

    assert not any(a.outlier for a in etiquetar_outliers(anuncios))


def test_muestras_minusculas_no_se_etiquetan():
    anuncios = [_anuncio("745.0"), _anuncio("7450.0", "2")]

    assert not any(a.outlier for a in etiquetar_outliers(anuncios))


def test_umbral_k_configurable():
    anuncios = [_anuncio(p, str(i)) for i, p in enumerate(
        ["745.0", "745.5", "746.0", "746.5", "747.0", "800.0"]
    )]

    con_k_estricto = etiquetar_outliers(anuncios, k=1.0)
    con_k_holgado = etiquetar_outliers(anuncios, k=50.0)

    assert con_k_estricto[-1].outlier
    assert not any(a.outlier for a in con_k_holgado)


def test_dispersion_normal_de_mercado_agrupado_no_se_marca():
    # Como el fixture real del spike: cluster apretado → MAD diminuto. Un precio
    # a < 2 % de la mediana jamás es outlier aunque su z-score sea alto.
    anuncios = [_anuncio(p, str(i)) for i, p in enumerate(
        ["745.0", "746.9", "746.9", "746.9", "746.9", "746.9", "747.0", "748.5"]
    )]

    assert not any(a.outlier for a in etiquetar_outliers(anuncios))
