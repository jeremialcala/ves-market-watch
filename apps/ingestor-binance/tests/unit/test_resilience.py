"""Tests del backoff, circuit breaker y presupuesto (reloj/sleep inyectados)."""

import pytest

from ingestor_binance.adapters.binance.resilience import (
    CircuitBreaker,
    ErrorReintentable,
    PresupuestoDeRequests,
    con_backoff,
)


class RelojFake:
    def __init__(self) -> None:
        self.ahora = 0.0

    def __call__(self) -> float:
        return self.ahora

    def avanzar(self, segundos: float) -> None:
        self.ahora += segundos


async def test_backoff_reintenta_y_espera_exponencialmente():
    esperas: list[float] = []
    intentos = 0

    async def operacion():
        nonlocal intentos
        intentos += 1
        if intentos < 3:
            raise ErrorReintentable("HTTP 429")
        return "ok"

    async def dormir(segundos: float) -> None:
        esperas.append(segundos)

    resultado = await con_backoff(
        operacion, max_intentos=3, base_segundos=1.0, dormir=dormir, aleatorio=lambda: 0.5
    )

    assert resultado == "ok"
    assert esperas == [1.0, 2.0]  # base·2^n·(0.5+0.5)


async def test_backoff_agota_reintentos_y_propaga():
    async def operacion():
        raise ErrorReintentable("HTTP 503")

    async def dormir(_: float) -> None:
        pass

    with pytest.raises(ErrorReintentable):
        await con_backoff(operacion, max_intentos=3, dormir=dormir)


def test_breaker_abre_en_el_umbral_y_solo_alerta_al_abrir():
    reloj = RelojFake()
    breaker = CircuitBreaker(umbral=3, cooldown_segundos=300, reloj=reloj)

    assert breaker.registrar_fallo() is False
    assert breaker.registrar_fallo() is False
    assert breaker.registrar_fallo() is True  # acaba de abrir
    assert breaker.abierto
    assert not breaker.permite_intento()
    assert breaker.registrar_fallo() is False  # ya estaba abierto: sin re-alerta


def test_breaker_half_open_tras_cooldown_y_cierra_con_exito():
    reloj = RelojFake()
    breaker = CircuitBreaker(umbral=2, cooldown_segundos=300, reloj=reloj)
    breaker.registrar_fallo()
    breaker.registrar_fallo()
    assert not breaker.permite_intento()

    reloj.avanzar(301)
    assert breaker.permite_intento()  # half-open: se permite un intento

    breaker.registrar_exito()
    assert not breaker.abierto
    assert breaker.registrar_fallo() is False  # contador reiniciado


def test_breaker_half_open_reabre_con_fallo_y_realerta():
    reloj = RelojFake()
    breaker = CircuitBreaker(umbral=2, cooldown_segundos=300, reloj=reloj)
    breaker.registrar_fallo()
    breaker.registrar_fallo()
    reloj.avanzar(301)

    assert breaker.registrar_fallo() is True  # reabre → nueva alerta
    assert not breaker.permite_intento()


def test_presupuesto_por_ventana_deslizante():
    reloj = RelojFake()
    presupuesto = PresupuestoDeRequests(max_por_minuto=2, reloj=reloj)

    assert presupuesto.permite()
    assert presupuesto.permite()
    assert not presupuesto.permite()  # agotado

    reloj.avanzar(61)
    assert presupuesto.permite()  # la ventana se deslizó
