"""T7 — el endpoint P2P deja de colaborar: qué hace el cliente.

`unit/test_resilience.py` prueba el backoff y el breaker contra una operación
falsa que lanza `ErrorReintentable("HTTP 429")`. Eso verifica la mecánica, pero
**da por hecho lo que aquí se comprueba**: que un 429 de verdad, llegado por
HTTP, se traduzca a reintentable — y que un 404 no. El plan de pruebas pedía
elevar este escenario a integración con servidor local; esto es eso.

La política de ADR-0005 es explícita: ante señales de bloqueo se retrocede.
Nunca se rota IP ni se evade el rate limit.
"""

import asyncio

import pytest

from ingestor_binance.adapters.binance.client import FuenteBinanceP2P
from ingestor_binance.adapters.binance.resilience import (
    CircuitBreaker,
    PresupuestoDeRequests,
)
from ingestor_binance.adapters.memory import (
    InMemorySnapshotRepository,
    LoggingAlertNotifier,
    LoggingEventPublisher,
)
from ingestor_binance.application.capture_snapshot import CapturarSnapshot
from ingestor_binance.application.ports import EsquemaFuenteInvalido, FuenteNoDisponible
from ingestor_binance.domain.models import Lado
from ingestor_binance.domain.normalizacion import Pseudonimizador

from conftest import SCHEMA_FUENTE, cargar_fixture  # type: ignore[import-not-found]

pytestmark = [pytest.mark.integration, pytest.mark.security]


def _fuente(url: str, **kwargs) -> FuenteBinanceP2P:
    parametros = {
        "url": url,
        "asset": "USDT",
        "fiat": "VES",
        "schema_fuente": SCHEMA_FUENTE,
        "presupuesto": PresupuestoDeRequests(1000),
        "top_k": 40,
        "rows_per_page": 20,
        "max_retries": 2,
        "timeout_seconds": 5.0,
    }
    parametros.update(kwargs)
    return FuenteBinanceP2P(**parametros)


async def test_un_429_se_reintenta_y_luego_se_cede(servidor_http):
    """429 es «vas demasiado rápido»: se reintenta con backoff y, si insiste, se
    abandona el ciclo. Lo que NO se hace es seguir pidiendo."""
    peticiones = []

    def manejador(peticion):
        peticiones.append(peticion)
        return 429, {"code": "429", "message": "too many requests"}

    url = await servidor_http(manejador)

    with pytest.raises(FuenteNoDisponible, match="ninguna página"):
        await _fuente(url).fetch_ads(Lado.BUY)

    # `max_retries=2` por página × 2 páginas del top_k: se cede, no se insiste.
    assert len(peticiones) == 4


async def test_un_404_no_se_reintenta_y_solo_pierde_su_pagina(servidor_http):
    """Un 404 no es congestión: reintentarlo sería ruido inútil contra el
    endpoint. Se cuenta como página perdida y el ciclo sigue con las demás, que
    es la diferencia entre una captura parcial y ninguna captura."""
    datos = cargar_fixture("buy")
    peticiones = []

    def manejador(peticion):
        peticiones.append(peticion)
        if peticion["page"] == 1:
            return 404, {"error": "not found"}
        return 200, datos

    url = await servidor_http(manejador)
    captura = await _fuente(url).fetch_ads(Lado.BUY)

    assert len(peticiones) == 2  # una por página: la fallida NO se reintentó
    assert captura.parcial
    assert len(captura.anuncios_crudos) == 20  # lo que trajo la página buena


async def test_una_respuesta_que_no_es_json_es_esquema_invalido(servidor_http):
    """El caso del portal cautivo o la página de bloqueo: llega un 200 con HTML.

    Se distingue de `FuenteNoDisponible` a propósito — el caso de uso lo trata
    como cambio de esquema, descarta el snapshot y **alerta**, porque significa
    que lo que responde ya no es la API que creemos.
    """
    url = await servidor_http(lambda _: (200, b"<html><body>Access denied</body></html>"))

    with pytest.raises(EsquemaFuenteInvalido, match="no es JSON"):
        await _fuente(url).fetch_ads(Lado.BUY)


async def test_si_el_endpoint_cuelga_la_conexion_es_reintentable():
    """El middlebox que acepta y cuelga: un error de RED, no un timeout.

    Es lo que hace un rate limiter agresivo cuando deja de responder educadamente
    —acepta el TCP y cierra sin enviar nada—, y se traduce a reintentable como
    cualquier fallo transitorio de transporte.

    Vale la pena decir cómo se llegó aquí: los candidatos obvios —puerto cerrado
    del loopback, dominio `.invalid`— NO sirven. Los dos acaban en
    `httpx.ConnectTimeout`, que hereda de `TimeoutException` y por tanto entra por
    el `except` ANTERIOR. La prueba habría pasado sin ejercitar la rama que dice
    ejercitar.
    """
    conexiones = []

    async def colgar(reader, writer):
        conexiones.append(writer)
        writer.close()

    servidor = await asyncio.start_server(colgar, "127.0.0.1", 0)
    puerto = servidor.sockets[0].getsockname()[1]
    try:
        with pytest.raises(FuenteNoDisponible):
            await _fuente(
                f"http://127.0.0.1:{puerto}/", top_k=20, max_retries=1
            ).fetch_ads(Lado.BUY)
    finally:
        servidor.close()
        await servidor.wait_closed()


async def test_un_endpoint_que_no_responde_agota_el_timeout():
    """Un servidor que acepta la conexión y se queda callado es peor que uno
    caído: sin timeout el ciclo se colgaría indefinidamente y el daemon dejaría
    de capturar sin dar señal alguna."""
    conexiones = []

    async def callar(reader, writer):
        conexiones.append(writer)  # ni responde ni cierra

    servidor = await asyncio.start_server(callar, "127.0.0.1", 0)
    puerto = servidor.sockets[0].getsockname()[1]
    try:
        with pytest.raises(FuenteNoDisponible):
            await _fuente(
                f"http://127.0.0.1:{puerto}/", timeout_seconds=0.3, max_retries=1
            ).fetch_ads(Lado.BUY)
    finally:
        for writer in conexiones:
            writer.close()
        servidor.close()
        await servidor.wait_closed()


async def test_429_sostenido_abre_el_breaker_y_suspende_las_consultas(servidor_http):
    """La cadena completa de T7, de extremo a extremo.

    El unit test comprueba que el breaker abre al llegar al umbral; aquí se
    comprueba lo que de verdad importa en producción: que un 429 real de Binance
    llegue hasta ese contador, y que una vez abierto **el ciclo siguiente ni
    siquiera consulta**. Sin ese último paso, un breaker que abre no protege de
    nada.
    """
    peticiones = []

    def manejador(peticion):
        peticiones.append(peticion)
        return 429, {"code": "429"}

    url = await servidor_http(manejador)
    notifier = LoggingAlertNotifier()
    caso = CapturarSnapshot(
        source=_fuente(url, max_retries=1),
        publisher=LoggingEventPublisher(),
        repository=InMemorySnapshotRepository(),
        notifier=notifier,
        breaker=CircuitBreaker(umbral=2, cooldown_segundos=300),
        pseudonimizador=Pseudonimizador("0" * 64),
    )

    primero = await caso.ejecutar(Lado.BUY)
    segundo = await caso.ejecutar(Lado.SELL)
    assert primero.error and segundo.error  # los dos fallos que abren el breaker

    consultas_antes = len(peticiones)
    tercero = await caso.ejecutar(Lado.BUY)

    assert tercero.saltado_por_breaker
    assert tercero.error is None  # saltar no es fallar
    assert len(peticiones) == consultas_antes  # NO se consultó: eso es retroceder
    # Y se avisa una sola vez, al abrir: una alerta por ciclo sería ruido.
    assert sum("Circuit breaker ABIERTO" in a for a in notifier.alertas) == 1
