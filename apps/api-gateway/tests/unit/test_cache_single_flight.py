"""Caché con single-flight (plan del portal 2.2, ADR-0028 §2 y §Verificación)."""

from __future__ import annotations

import asyncio

import pytest

from api_gateway.application.cache import CacheSingleFlight


class Reloj:
    def __init__(self) -> None:
        self.ahora = 100.0

    def __call__(self) -> float:
        return self.ahora


def _calculo_lento(contador: list[int], valor: object = "dato", espera: float = 0.05):
    async def calcular():
        contador.append(1)
        await asyncio.sleep(espera)
        return valor

    return calcular


async def test_n_peticiones_concurrentes_en_frio_calculan_una_vez():
    """La verificación de ADR-0028: N concurrentes con la caché fría → 1 cómputo."""
    cache = CacheSingleFlight()
    contador: list[int] = []
    resultados = await asyncio.gather(
        *(cache.obtener("snapshot", 5, _calculo_lento(contador)) for _ in range(100))
    )
    assert len(contador) == 1
    assert cache.calculos == 1
    assert set(resultados) == {"dato"}


async def test_dentro_del_ttl_no_recalcula_y_al_caducar_si():
    reloj = Reloj()
    cache = CacheSingleFlight(reloj=reloj)
    contador: list[int] = []
    await cache.obtener("k", 5, _calculo_lento(contador, espera=0))
    reloj.ahora += 4.9
    await cache.obtener("k", 5, _calculo_lento(contador, espera=0))
    assert len(contador) == 1
    reloj.ahora += 0.2
    await cache.obtener("k", 5, _calculo_lento(contador, espera=0))
    assert len(contador) == 2


async def test_claves_distintas_no_se_mezclan():
    cache = CacheSingleFlight()
    a = await cache.obtener("a", 5, _calculo_lento([], "A", 0))
    b = await cache.obtener("b", 5, _calculo_lento([], "B", 0))
    assert (a, b) == ("A", "B")


async def test_un_error_llega_a_todos_y_no_se_guarda():
    cache = CacheSingleFlight()
    intentos: list[int] = []

    async def falla():
        intentos.append(1)
        await asyncio.sleep(0.02)
        raise RuntimeError("base caída")

    resultados = await asyncio.gather(
        *(cache.obtener("k", 5, falla) for _ in range(10)), return_exceptions=True
    )
    assert len(intentos) == 1
    assert all(isinstance(r, RuntimeError) for r in resultados)
    # La siguiente vuelve a intentarlo: un fallo no queda cacheado 5 s.
    assert await cache.obtener("k", 5, _calculo_lento([], "ok", 0)) == "ok"


async def test_si_el_primero_se_cancela_los_demas_reciben_el_resultado():
    cache = CacheSingleFlight()
    contador: list[int] = []
    primero = asyncio.create_task(cache.obtener("k", 5, _calculo_lento(contador, espera=0.05)))
    await asyncio.sleep(0.01)
    segundo = asyncio.create_task(cache.obtener("k", 5, _calculo_lento(contador)))
    primero.cancel()
    resultado_primero = (await asyncio.gather(primero, return_exceptions=True))[0]
    assert isinstance(resultado_primero, asyncio.CancelledError)
    assert await segundo == "dato"
    assert len(contador) == 1
