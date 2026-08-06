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


def test_la_clave_en_texto_y_en_bytes_dan_el_MISMO_pseudonimo():
    """Las dos formas admitidas tienen que coincidir, y no es cosmético.

    `merchant_ref` solo sirve si un mismo anunciante da el mismo pseudónimo hoy y
    dentro de seis meses (ADR-0011). Si el día que la clave llegue como `bytes`
    —desde un secret store que las devuelve así— el HMAC cambiara, la correlación
    histórica se rompería **en silencio**: los eventos seguirían siendo válidos,
    solo dejarían de casar con los anteriores.
    """
    clave = "clave-de-prueba-suficientemente-larga"

    desde_texto = Pseudonimizador(clave).referencia("anunciante-42")
    desde_bytes = Pseudonimizador(clave.encode("utf-8")).referencia("anunciante-42")

    assert desde_texto == desde_bytes


def test_una_clave_corta_se_rechaza_al_construir():
    """16 bytes mínimo (ADR-0011): una clave corta hace el HMAC adivinable y
    convierte el pseudónimo en un identificador reversible por fuerza bruta."""
    with pytest.raises(ValueError, match="demasiado corta"):
        Pseudonimizador("corta")


def test_el_crudo_persistido_lleva_el_veredicto_de_outlier():
    """El filtro MAD es el control de T2 y su regla vive aquí. Sin persistir el
    veredicto, quien lea el crudo después —la profundidad del gateway— tiene que
    reimplementarlo o quedarse sin él; el 2026-08-06 se quedó sin él y el panel
    enseñó un libro que no existía."""
    crudos = [
        {"adv": {"advNo": "A", "price": "845.00"}, "advertiser": {"userNo": "u1"}},
        {"adv": {"advNo": "B", "price": "920.00"}, "advertiser": {"userNo": "u2"}},
    ]

    minimizados = minimizar_crudo(crudos, PSEUDO, ["B"])

    assert [m["outlier"] for m in minimizados] == [False, True]


def test_el_veredicto_se_casa_por_advNo_y_no_por_posicion():
    """Casar dos listas por índice es una invitación a marcar el anuncio
    equivocado el día que una de las dos cambie de orden — y marcar el anuncio
    equivocado es peor que no marcar ninguno: se descarta uno bueno y se cuela
    el manipulado."""
    crudos = [
        {"adv": {"advNo": "A", "price": "845.00"}, "advertiser": {"userNo": "u1"}},
        {"adv": {"advNo": "B", "price": "920.00"}, "advertiser": {"userNo": "u2"}},
        {"adv": {"advNo": "C", "price": "846.00"}, "advertiser": {"userNo": "u3"}},
    ]

    minimizados = minimizar_crudo(crudos, PSEUDO, ["C", "A"])

    assert {m["adv"]["advNo"]: m["outlier"] for m in minimizados} == {
        "A": True,
        "B": False,
        "C": True,
    }


def test_sin_outliers_todos_quedan_marcados_como_limpios():
    """La marca va siempre, también en `False`: un campo ausente y un `False`
    significan cosas distintas para quien lee el crudo («nadie lo juzgó» vs
    «lo juzgaron y está limpio»)."""
    crudos = [{"adv": {"advNo": "A", "price": "845.00"}, "advertiser": {"userNo": "u1"}}]

    (minimizado,) = minimizar_crudo(crudos, PSEUDO)

    assert minimizado["outlier"] is False


def test_el_veredicto_no_altera_la_minimizacion_del_anunciante():
    """La marca es un campo hermano de `adv`/`advertiser`: no toca lo que
    ADR-0011 redacta."""
    crudos = [
        {
            "adv": {"advNo": "A", "price": "845.00"},
            "advertiser": {"userNo": "u1", "nickName": "Pepe", "userType": "merchant"},
        }
    ]

    (minimizado,) = minimizar_crudo(crudos, PSEUDO, ["A"])

    assert "nickName" not in minimizado["advertiser"]
    assert "userNo" not in minimizado["advertiser"]
    assert minimizado["advertiser"]["merchant_ref"]
    assert minimizado["outlier"] is True
