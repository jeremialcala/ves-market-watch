"""Caché en proceso con *single-flight* (plan del portal 2.2, ADR-0028 §2).

Lo que mantiene constante la carga de la base bajo `/portal/v1`, haya un
visitante o mil:

- **TTL por clave.** Mientras la entrada no caduca, se sirve sin calcular.
- **Single-flight.** Si la entrada está fría y llegan cien peticiones a la vez,
  calcula **una**; las demás esperan ese mismo resultado. Sin esto, al caducar
  el TTL cada petición concurrente iría a la base: una estampida cada 5 s.
- **Los errores no se guardan.** Si el cálculo falla, falla para todos los que
  lo esperaban, y la siguiente petición vuelve a intentarlo.
- **Un cliente que corta no cancela el cálculo.** Corre en su propia tarea, y
  cada petición la espera con `shield`: si la primera se cancela, las demás
  siguen esperando el mismo resultado.

El reloj se inyecta para los tests. Las claves son pocas y fijas (el snapshot y
las series): no hace falta podarlas.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any


class CacheSingleFlight:
    def __init__(self, reloj: Callable[[], float] = time.monotonic) -> None:
        self._reloj = reloj
        self._entradas: dict[str, tuple[float, Any]] = {}
        self._en_vuelo: dict[str, asyncio.Task[Any]] = {}
        # Cálculos de verdad, no aciertos: lo que la verificación cuenta.
        self.calculos = 0

    async def obtener(
        self, clave: str, ttl: float, calcular: Callable[[], Awaitable[Any]]
    ) -> Any:
        entrada = self._entradas.get(clave)
        if entrada is not None and entrada[0] > self._reloj():
            return entrada[1]

        tarea = self._en_vuelo.get(clave)
        if tarea is None:
            tarea = asyncio.create_task(self._calcular(clave, ttl, calcular))
            # Si todos los que esperaban se cancelan y el cálculo falla, nadie
            # leería la excepción y asyncio avisaría en el log de «nunca
            # recuperada». Se lee aquí; quien sí espera la recibe igual.
            tarea.add_done_callback(lambda t: t.cancelled() or t.exception())
            self._en_vuelo[clave] = tarea
        return await asyncio.shield(tarea)

    async def _calcular(
        self, clave: str, ttl: float, calcular: Callable[[], Awaitable[Any]]
    ) -> Any:
        try:
            self.calculos += 1
            valor = await calcular()
            self._entradas[clave] = (self._reloj() + ttl, valor)
            return valor
        finally:
            del self._en_vuelo[clave]
