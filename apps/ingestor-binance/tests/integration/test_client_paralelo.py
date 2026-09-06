"""Paginación en paralelo (ADR-0026, enmienda a ADR-0005).

El SLO `consulta→evento <= 5 s (p95)` se incumplía en 7,16 s porque las 10
páginas del top-K iban en fila. Estos tests fijan lo que la paralelización
**tiene que conservar**, que es más importante que la ganancia en sí:

1. **Las peticiones por minuto no suben.** El presupuesto sigue consumiéndose
   una unidad por página. Si la ráfaga gastara más, ADR-0005 quedaría rota de
   verdad y no solo enmendada.
2. **El orden se mantiene.** La lista viene ordenada por precio y se concatena
   por página; `gather` conserva el orden de entrada, pero eso hay que fijarlo:
   un cambio a `as_completed` lo rompería en silencio y el VWAP saldría mal.
3. **Los errores se tratan igual.** Página fallida cuenta como parcial; schema
   inválido y tope de bytes se propagan.

Y comprueban que efectivamente hay concurrencia, porque un `gather` sobre una
lista de uno pasaría los tres puntos anteriores sin paralelizar nada.
"""

import asyncio

import pytest

from ingestor_binance.adapters.binance.client import FuenteBinanceP2P
from ingestor_binance.adapters.binance.resilience import PresupuestoDeRequests
from ingestor_binance.application.ports import EsquemaFuenteInvalido
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
        "top_k": 160,  # 8 páginas de 20
        "rows_per_page": 20,
        "max_retries": 2,
        "paginas_en_paralelo": 4,
        "timeout_seconds": 5.0,
    }
    parametros.update(kwargs)
    return FuenteBinanceP2P(**parametros)


async def test_las_paginas_del_lote_salen_a_la_vez(servidor_http):
    """Hay concurrencia real: 8 páginas con 4 en vuelo tardan ~2 tandas, no 8."""
    datos = cargar_fixture("buy")
    en_vuelo = 0
    pico = 0

    async def manejador(peticion: dict):
        nonlocal en_vuelo, pico
        en_vuelo += 1
        pico = max(pico, en_vuelo)
        await asyncio.sleep(0.05)
        en_vuelo -= 1
        return 200, datos

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.BUY)

    assert len(captura.anuncios_crudos) == 160
    # El pico tiene que llegar al tamaño del lote y NO pasarse: si fuera 8, la
    # cota estaría rota y la ráfaga sería el doble de lo decidido.
    assert pico == 4, f"pico de concurrencia {pico}, se esperaba exactamente 4"


async def test_el_presupuesto_se_consume_igual_que_en_secuencial(servidor_http):
    """La ráfaga no gasta más unidades: una por página, como antes."""
    datos = cargar_fixture("buy")
    url = await servidor_http(lambda p: (200, datos))

    presupuesto = PresupuestoDeRequests(1000)
    consumidas_antes = len(presupuesto._marcas)  # noqa: SLF001 — es el punto del test
    await _fuente(url, presupuesto=presupuesto).fetch_ads(Lado.BUY)

    assert len(presupuesto._marcas) - consumidas_antes == 8  # noqa: SLF001


async def test_el_presupuesto_agotado_sigue_cortando(servidor_http):
    """Con 3 unidades solo salen 3 páginas y la captura queda parcial."""
    datos = cargar_fixture("buy")
    url = await servidor_http(lambda p: (200, datos))

    captura = await _fuente(url, presupuesto=PresupuestoDeRequests(3)).fetch_ads(Lado.BUY)

    assert len(captura.anuncios_crudos) == 60  # 3 páginas de 20
    assert captura.parcial


async def test_el_orden_por_pagina_se_conserva(servidor_http):
    """El VWAP depende de este orden: `gather` lo conserva y aquí queda fijado.

    Se responde con una página distinta según el número, en orden inverso al de
    llegada más probable, para que un `as_completed` mal puesto se note.
    """
    datos = cargar_fixture("buy")

    async def manejador(peticion: dict):
        pagina = peticion["page"]
        # Las últimas páginas responden ANTES que las primeras.
        await asyncio.sleep(0.05 * (5 - min(pagina, 4)))
        anuncio = dict(datos["data"][0])
        anuncio["adv"] = {**anuncio["adv"], "advNo": f"pagina-{pagina}"}
        return 200, {**datos, "data": [anuncio] * 20}

    url = await servidor_http(manejador)
    captura = await _fuente(url, top_k=80).fetch_ads(Lado.BUY)

    vistos = [a["adv"]["advNo"] for a in captura.anuncios_crudos]
    esperado = [f"pagina-{p}" for p in range(1, 5) for _ in range(20)]
    assert vistos == esperado, "el orden por página se perdió al paralelizar"


async def test_una_pagina_corta_corta_la_captura(servidor_http):
    """La salida temprana sigue existiendo, ahora al cerrar el lote."""
    datos = cargar_fixture("buy")

    def manejador(peticion: dict):
        if peticion["page"] == 2:
            return 200, {**datos, "data": datos["data"][:5]}
        return 200, datos

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.BUY)

    # Páginas 1 y 2 del primer lote; la 2 viene corta y se para ahí.
    assert len(captura.anuncios_crudos) == 25
    assert not captura.parcial


async def test_el_schema_invalido_se_sigue_propagando(servidor_http):
    """`gather(return_exceptions=True)` no puede tragarse este error."""
    datos = cargar_fixture("buy")

    def manejador(peticion: dict):
        if peticion["page"] == 3:
            return 200, {"code": "000000", "success": True}  # sin `data`
        return 200, datos

    url = await servidor_http(manejador)
    with pytest.raises(EsquemaFuenteInvalido):
        await _fuente(url).fetch_ads(Lado.BUY)


async def test_una_pagina_fallida_marca_parcial_sin_perder_el_resto(servidor_http):
    datos = cargar_fixture("buy")

    def manejador(peticion: dict):
        if peticion["page"] == 2:
            return 500, {}
        return 200, datos

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.BUY)

    assert captura.parcial
    # Las otras 7 páginas sí entran: un fallo no se lleva el lote entero.
    assert len(captura.anuncios_crudos) == 140
