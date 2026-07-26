"""Tests de normalización y sanitización (A05) contra datos reales del spike."""

from decimal import Decimal

import pytest

from ingestor_binance.domain.normalizacion import (
    Pseudonimizador,
    minimizar_crudo,
    normalizar_anuncio,
    sanitizar_texto,
)

from conftest import cargar_fixture  # type: ignore[import-not-found]

PSEUDO = Pseudonimizador("clave-de-prueba-suficientemente-larga")


def test_normaliza_anuncio_real_del_fixture():
    crudo = cargar_fixture("buy")["data"][0]

    anuncio = normalizar_anuncio(crudo, PSEUDO)

    assert anuncio.adv_no == crudo["adv"]["advNo"]
    assert anuncio.precio == Decimal(crudo["adv"]["price"])
    assert anuncio.cantidad_disponible == Decimal(crudo["adv"]["surplusAmount"])
    assert anuncio.limite_min == Decimal(crudo["adv"]["minSingleTransAmount"])
    assert anuncio.limite_max == Decimal(crudo["adv"]["maxSingleTransAmount"])
    assert len(anuncio.metodos_pago) == len(crudo["adv"]["tradeMethods"])
    assert not anuncio.outlier


def test_todos_los_anuncios_del_fixture_normalizan():
    for lado in ("buy", "sell"):
        for crudo in cargar_fixture(lado)["data"]:
            anuncio = normalizar_anuncio(crudo, PSEUDO)
            assert anuncio.precio > 0


def test_es_merchant_segun_user_type():
    crudo = cargar_fixture("buy")["data"][0]
    crudo["advertiser"]["userType"] = "merchant"
    assert normalizar_anuncio(crudo, PSEUDO).es_merchant

    crudo["advertiser"]["userType"] = "user"
    assert not normalizar_anuncio(crudo, PSEUDO).es_merchant


def test_precio_no_numerico_lanza():
    crudo = cargar_fixture("buy")["data"][0]
    crudo["adv"]["price"] = "no-es-numero"

    with pytest.raises(ValueError, match="inválido"):
        normalizar_anuncio(crudo, PSEUDO)


def test_sanitizar_remueve_caracteres_de_control_y_acota():
    assert sanitizar_texto("Pago\x00Movil\r\n") == "PagoMovil"
    assert sanitizar_texto("  Banco​ Plaza  ") == "Banco Plaza"  # zero-width fuera
    assert len(sanitizar_texto("A" * 500)) == 64
    assert sanitizar_texto(None) == ""
    assert sanitizar_texto(12345) == ""


def test_minimizar_crudo_redacta_alias_y_conserva_metricas_publicas():
    # data-classification: alias/identificadores del anunciante NO se persisten.
    items = cargar_fixture("buy")["data"]
    assert any("nickName" in i["advertiser"] for i in items)  # el crudo real los trae

    minimizado = minimizar_crudo(items, PSEUDO)

    assert len(minimizado) == len(items)
    for original, limpio in zip(items, minimizado):
        assert "nickName" not in limpio["advertiser"]
        assert "userNo" not in limpio["advertiser"]
        assert limpio["advertiser"].get("userType") == original["advertiser"]["userType"]
        assert limpio["adv"] == original["adv"]  # el anuncio (público) va completo
        # ADR-0011: la identidad sobrevive solo como pseudónimo HMAC.
        assert limpio["advertiser"]["merchant_ref"] == PSEUDO.referencia(
            str(original["advertiser"]["userNo"])
        )


def test_pseudonimo_es_determinista_y_de_128_bits():
    ref = PSEUDO.referencia("s123456789")

    assert ref == PSEUDO.referencia("s123456789")  # misma clave+id → mismo ref
    assert len(ref) == 32 and int(ref, 16) >= 0  # 128 bits en hex
    assert PSEUDO.referencia("s987654321") != ref  # ids distintos no coliden


def test_claves_distintas_producen_pseudonimos_distintos():
    otra = Pseudonimizador("otra-clave-igual-de-larga-que-la-primera")

    assert PSEUDO.referencia("s123456789") != otra.referencia("s123456789")


def test_clave_debil_falla_al_construir():
    with pytest.raises(ValueError, match="MERCHANT_HMAC_KEY"):
        Pseudonimizador("corta")


def test_normalizar_toma_el_identificador_estable_no_el_alias():
    crudo = cargar_fixture("buy")["data"][0]
    user_no = str(crudo["advertiser"]["userNo"])

    anuncio = normalizar_anuncio(crudo, PSEUDO)

    assert anuncio.merchant_ref == PSEUDO.referencia(user_no)
    # Cambiar el alias NO cambia el pseudónimo (correlación estable, ADR-0011).
    crudo["advertiser"]["nickName"] = "otro-alias"
    assert normalizar_anuncio(crudo, PSEUDO).merchant_ref == anuncio.merchant_ref


def test_sin_identificador_estable_el_pseudonimo_es_null():
    crudo = cargar_fixture("buy")["data"][0]
    del crudo["advertiser"]["userNo"]

    assert normalizar_anuncio(crudo, PSEUDO).merchant_ref is None


def test_metodos_de_pago_maliciosos_quedan_sanitizados():
    crudo = cargar_fixture("buy")["data"][0]
    crudo["adv"]["tradeMethods"] = [
        {"tradeMethodName": "Banco\x00\x1b[31mRojo", "identifier": "x"},
        {"tradeMethodName": None, "identifier": "Zelle\r\n"},
        {"tradeMethodName": "", "identifier": ""},  # vacío tras sanitizar → fuera
    ]

    anuncio = normalizar_anuncio(crudo, PSEUDO)

    assert anuncio.metodos_pago == ("Banco[31mRojo", "Zelle")
