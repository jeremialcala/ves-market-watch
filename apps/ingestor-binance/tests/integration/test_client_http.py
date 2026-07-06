"""Integración del cliente contra un servidor HTTP local (sin tocar Binance).

Cubre paginación, respuesta parcial, corte por tope de bytes y validación
del schema de la fuente — con el fixture real del spike como base.
"""

import pytest

from ingestor_binance.adapters.binance.client import FuenteBinanceP2P
from ingestor_binance.adapters.binance.resilience import PresupuestoDeRequests
from ingestor_binance.application.ports import EsquemaFuenteInvalido, FuenteNoDisponible
from ingestor_binance.domain.models import Lado

from conftest import SCHEMA_FUENTE, cargar_fixture  # type: ignore[import-not-found]

pytestmark = pytest.mark.integration


def _fuente(url: str, **kwargs) -> FuenteBinanceP2P:
    parametros = {
        "url": url,
        "asset": "USDT",
        "fiat": "VES",
        "schema_fuente": SCHEMA_FUENTE,
        "presupuesto": PresupuestoDeRequests(1000),
        "top_k": 40,  # 2 páginas de 20
        "rows_per_page": 20,
        "max_retries": 2,
        "timeout_seconds": 5.0,
    }
    parametros.update(kwargs)
    return FuenteBinanceP2P(**parametros)


async def test_pagina_hasta_top_k_y_corta_en_pagina_corta(servidor_http):
    datos = cargar_fixture("buy")

    def manejador(peticion: dict):
        assert peticion["asset"] == "USDT" and peticion["fiat"] == "VES"
        if peticion["page"] == 1:
            return 200, datos
        return 200, {**datos, "data": datos["data"][:5]}  # página corta: fin

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.BUY)

    assert len(captura.anuncios_crudos) == 25
    assert not captura.parcial


async def test_pagina_fallida_tras_reintentos_marca_parcial(servidor_http):
    datos = cargar_fixture("sell")

    def manejador(peticion: dict):
        if peticion["page"] == 2:
            return 500, {"error": "interno"}
        return 200, datos

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.SELL)

    assert len(captura.anuncios_crudos) == 20  # solo la página 1
    assert captura.parcial


async def test_todas_las_paginas_fallidas_es_fuente_no_disponible(servidor_http):
    url = await servidor_http(lambda _: (503, {"error": "mantenimiento"}))

    with pytest.raises(FuenteNoDisponible, match="ninguna página"):
        await _fuente(url).fetch_ads(Lado.BUY)


async def test_respuesta_gigante_se_corta_por_tope_de_bytes(servidor_http):
    # Zip-bomb simulada: cuerpo enorme; el cliente corta sin cargarlo entero.
    url = await servidor_http(lambda _: (200, b'{"x": "' + b"A" * 100_000 + b'"}'))

    with pytest.raises(FuenteNoDisponible, match="tope"):
        await _fuente(url, max_response_bytes=10_000).fetch_ads(Lado.BUY)


async def test_respuesta_con_schema_roto_es_esquema_invalido(servidor_http):
    datos = cargar_fixture("buy")
    del datos["data"][0]["adv"]["price"]  # cambio de esquema simulado

    url = await servidor_http(lambda _: (200, datos))

    with pytest.raises(EsquemaFuenteInvalido, match="schema"):
        await _fuente(url).fetch_ads(Lado.BUY)


async def test_presupuesto_agotado_a_mitad_de_ciclo_marca_parcial(servidor_http):
    datos = cargar_fixture("buy")
    url = await servidor_http(lambda _: (200, datos))

    captura = await _fuente(url, presupuesto=PresupuestoDeRequests(1)).fetch_ads(Lado.BUY)

    assert len(captura.anuncios_crudos) == 20  # solo alcanzó para una página
    assert captura.parcial
