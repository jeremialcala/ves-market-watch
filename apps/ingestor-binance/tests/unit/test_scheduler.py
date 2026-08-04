"""Bucle de captura programada (RF-1) y sus métricas operativas (RF-6).

Estaba al 0 %. Lo que hay dentro: que se capturen SIEMPRE los dos lados, que un
salto del breaker no se confunda con un fallo ni con un éxito, y el suelo que
impide convertir el bucle en un martillo contra Binance.
"""

import asyncio
import logging

import pytest

from ingestor_binance.application.capture_snapshot import ResumenCaptura
from ingestor_binance.domain.models import Lado
from ingestor_binance.scheduler import ejecutar_ciclo, run_forever


class CasoDeUsoFalso:
    def __init__(self, **por_lado: ResumenCaptura) -> None:
        self._por_lado = por_lado
        self.lados_pedidos: list[Lado] = []

    async def ejecutar(self, lado: Lado) -> ResumenCaptura:
        self.lados_pedidos.append(lado)
        return self._por_lado.get(lado.name, ResumenCaptura(lado=lado))


async def test_un_ciclo_captura_los_dos_lados_en_orden():
    """La brecha necesita ambos lados: capturar solo uno deja la mitad del
    mercado sin observar hasta el ciclo siguiente."""
    caso = CasoDeUsoFalso()

    await ejecutar_ciclo(caso)

    assert caso.lados_pedidos == [Lado.BUY, Lado.SELL]


async def test_un_lado_fallido_no_se_lleva_por_delante_al_otro():
    """El fallo se registra por lado, no aborta el ciclo.

    Si un `raise` cortara el bucle, un error en BUY —el lado que se pide
    primero— dejaría SELL sin capturar indefinidamente, y la serie de venta es
    justo la que tiene historia en el resto del sistema.
    """
    caso = CasoDeUsoFalso(BUY=ResumenCaptura(lado=Lado.BUY, error="502 del endpoint"))

    await ejecutar_ciclo(caso)

    assert caso.lados_pedidos == [Lado.BUY, Lado.SELL]


async def test_saltar_por_breaker_no_es_ni_fallo_ni_exito(caplog):
    """Tres estados, tres mensajes distintos.

    Un salto del breaker es una decisión propia —estamos retrocediendo a
    propósito (ADR-0005)—, no un error de Binance. Contarlo como fallo dispararía
    alarmas por un comportamiento correcto; contarlo como éxito escondería que no
    se capturó nada.
    """
    caso = CasoDeUsoFalso(
        BUY=ResumenCaptura(lado=Lado.BUY, saltado_por_breaker=True),
        SELL=ResumenCaptura(lado=Lado.SELL, total_anuncios=97, outliers=3),
    )

    with caplog.at_level(logging.INFO, logger="ingestor_binance"):
        await ejecutar_ciclo(caso)

    # Por nivel y en lista: el ciclo emite dos INFO (el lado OK y la latencia).
    por_nivel: dict[str, list[str]] = {}
    for registro in caplog.records:
        por_nivel.setdefault(registro.levelname, []).append(registro.getMessage())

    assert any("circuit breaker abierto" in m for m in por_nivel["WARNING"])
    assert "ERROR" not in por_nivel
    assert any("anuncios: 97 | outliers: 3" in m for m in por_nivel["INFO"])


async def test_el_ciclo_registra_su_latencia(caplog):
    """Métrica operativa de RF-6: sin ella no hay forma de ver que los ciclos se
    están alargando hasta solaparse con el siguiente."""
    with caplog.at_level(logging.INFO, logger="ingestor_binance"):
        await ejecutar_ciclo(CasoDeUsoFalso())

    assert any("latencia de ciclo completo" in r.getMessage() for r in caplog.records)


async def test_ningun_intervalo_puede_convertir_el_bucle_en_un_martillo(monkeypatch):
    """`max(espera, 10)` es un suelo, no una defensa contra el jitter.

    Con `FETCH_INTERVAL_SECONDS=0` la espera calculada sale negativa y sin el
    suelo se consultaría el endpoint P2P tan rápido como respondiera: exactamente
    lo que ADR-0005 evita y lo que hace que Binance banee una IP (T7). El
    presupuesto de requests es la segunda línea; esta es la primera.
    """
    esperas: list[float] = []

    async def sleep_espia(segundos: float) -> None:
        esperas.append(segundos)
        raise asyncio.CancelledError  # corta el `while True`

    # El peor caso del jitter, no uno al azar.
    monkeypatch.setattr("ingestor_binance.scheduler.random.uniform", lambda a, b: a)
    monkeypatch.setattr("ingestor_binance.scheduler.asyncio.sleep", sleep_espia)

    with pytest.raises(asyncio.CancelledError):
        await run_forever(CasoDeUsoFalso(), interval_seconds=0)

    assert esperas == [10]


async def test_con_intervalo_normal_manda_el_jitter(monkeypatch):
    esperas: list[float] = []

    async def sleep_espia(segundos: float) -> None:
        esperas.append(segundos)
        raise asyncio.CancelledError

    monkeypatch.setattr("ingestor_binance.scheduler.random.uniform", lambda a, b: b)
    monkeypatch.setattr("ingestor_binance.scheduler.asyncio.sleep", sleep_espia)

    caso = CasoDeUsoFalso()
    with pytest.raises(asyncio.CancelledError):
        await run_forever(caso, interval_seconds=60)

    assert esperas == [65]
    # Y captura ANTES de dormir: si el orden se invirtiera, arrancar el servicio
    # costaría un minuto de silencio.
    assert caso.lados_pedidos == [Lado.BUY, Lado.SELL]
