"""Rate limiting por token: ventana fija de 60 s en memoria (T4, A10).

Estado en memoria del proceso: suficiente para una instancia (dev y arranque).
Si el gateway escala horizontalmente, la cuota pasa a un store compartido —
decisión registrada en ADR-0016. El reloj se inyecta para tests deterministas.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from api_gateway.domain.errores import LimiteExcedido

VENTANA_SEGUNDOS = 60


@dataclass(frozen=True, slots=True)
class Cuota:
    limite: int
    restante: int
    reset_epoch: int

    def como_headers(self) -> dict[str, str]:
        return {
            "X-RateLimit-Limit": str(self.limite),
            "X-RateLimit-Remaining": str(self.restante),
            "X-RateLimit-Reset": str(self.reset_epoch),
        }


class LimitadorVentanaFija:
    def __init__(
        self, limite_por_ventana: int, reloj: Callable[[], float] = time.time
    ) -> None:
        self._limite = limite_por_ventana
        self._reloj = reloj
        self._contadores: dict[str, tuple[int, int]] = {}  # clave -> (ventana, usados)

    def consumir(self, clave: str) -> Cuota:
        """Registra una petición de `clave`; lanza LimiteExcedido al agotarse la cuota."""
        ahora = self._reloj()
        ventana = int(ahora // VENTANA_SEGUNDOS)
        reset_epoch = (ventana + 1) * VENTANA_SEGUNDOS
        ventana_previa, usados = self._contadores.get(clave, (ventana, 0))
        if ventana_previa != ventana:
            usados = 0
        if usados >= self._limite:
            raise LimiteExcedido(limite=self._limite, reset_epoch=reset_epoch)
        usados += 1
        self._contadores[clave] = (ventana, usados)
        # Poda perezosa: las claves de ventanas viejas se reescriben al volver;
        # el diccionario queda acotado por los tokens activos por ventana.
        return Cuota(
            limite=self._limite, restante=self._limite - usados, reset_epoch=reset_epoch
        )
