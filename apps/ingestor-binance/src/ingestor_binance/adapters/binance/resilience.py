"""Resiliencia del polling educado (ADR-0005): backoff, breaker y presupuesto.
Compartido por el cliente y el caso de uso.

Reloj y sleep inyectables — todo es determinista en tests. Nunca se rota IP
ni se evade el rate limit: ante señales de bloqueo se retrocede (respeto ToS).
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


class ErrorReintentable(Exception):
    """Fallo transitorio (429/5xx/red): candidato a reintento con backoff."""


async def con_backoff(
    operacion: Callable[[], Awaitable[T]],
    max_intentos: int = 3,
    base_segundos: float = 1.0,
    dormir: Callable[[float], Awaitable[None]] = asyncio.sleep,
    aleatorio: Callable[[], float] = random.random,
) -> T:
    """Reintenta `operacion` ante `ErrorReintentable` con backoff exponencial
    y jitter completo: espera = base · 2^intento · (0.5 + U[0,1))."""
    for intento in range(max_intentos):
        try:
            return await operacion()
        except ErrorReintentable:
            if intento == max_intentos - 1:
                raise
            await dormir(base_segundos * (2**intento) * (0.5 + aleatorio()))
    raise AssertionError("unreachable")


class CircuitBreaker:
    """Cerrado → abierto tras `umbral` fallos consecutivos; tras `cooldown`
    segundos permite un intento (half-open): éxito cierra, fallo reabre."""

    def __init__(
        self,
        umbral: int = 5,
        cooldown_segundos: float = 300.0,
        reloj: Callable[[], float] = time.monotonic,
    ) -> None:
        self._umbral = umbral
        self._cooldown = cooldown_segundos
        self._reloj = reloj
        self._fallos = 0
        self._abierto_hasta: float | None = None

    @property
    def abierto(self) -> bool:
        return self._abierto_hasta is not None and self._reloj() < self._abierto_hasta

    def permite_intento(self) -> bool:
        return not self.abierto

    def registrar_fallo(self) -> bool:
        """Registra un fallo de ciclo; devuelve True si el breaker ACABA de abrir."""
        self._fallos += 1
        if self._fallos >= self._umbral:
            recien_abierto = self._abierto_hasta is None or self._reloj() >= self._abierto_hasta
            self._abierto_hasta = self._reloj() + self._cooldown
            return recien_abierto
        return False

    def registrar_exito(self) -> None:
        self._fallos = 0
        self._abierto_hasta = None


class PresupuestoDeRequests:
    """Presupuesto de requests por ventana deslizante de 60 s (polling educado)."""

    def __init__(
        self, max_por_minuto: int, reloj: Callable[[], float] = time.monotonic
    ) -> None:
        self._max = max_por_minuto
        self._reloj = reloj
        self._marcas: list[float] = []

    def permite(self) -> bool:
        """Consume una unidad si hay presupuesto; False si está agotado."""
        ahora = self._reloj()
        self._marcas = [m for m in self._marcas if ahora - m < 60.0]
        if len(self._marcas) >= self._max:
            return False
        self._marcas.append(ahora)
        return True
