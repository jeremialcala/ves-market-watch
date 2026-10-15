"""Rate limiting: ventana fija de 60 s en memoria (T4, A10).

Lo usan dos cuotas: la de `/api/v1`, por token (`sub`), y la de `/portal/v1`,
por IP de cliente (ADR-0028 §3).

Estado en memoria del proceso: suficiente para una instancia (dev y arranque).
Si el gateway escala horizontalmente, la cuota pasa a un store compartido —
decisión registrada en ADR-0016. El reloj se inyecta para tests deterministas.

**Poda y tope de claves.** Las claves de tokens están acotadas por los usuarios
que hay; las IPs anónimas, no: cada visitante nuevo sería una clave más, para
siempre. Por eso, al empezar cada ventana se descartan las de ventanas vencidas
(con ventana fija ya no cuentan para nada), y con `max_claves` el diccionario no
pasa de ese tamaño aunque lleguen más IPs distintas en una misma ventana.
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
        self,
        limite_por_ventana: int,
        reloj: Callable[[], float] = time.time,
        max_claves: int | None = None,
    ) -> None:
        self._limite = limite_por_ventana
        self._reloj = reloj
        self._max_claves = max_claves
        self._contadores: dict[str, tuple[int, int]] = {}  # clave -> (ventana, usados)
        self._ventana_podada: int | None = None
        # Peticiones que llegaron con el diccionario lleno y no se contaron. Es
        # lo que hay que vigilar: si crece, el tope se quedó corto.
        self.desbordes = 0

    def __len__(self) -> int:
        """Claves en memoria: la otra cifra que vigilar (ADR-0028)."""
        return len(self._contadores)

    def consumir(self, clave: str) -> Cuota:
        """Registra una petición de `clave`; lanza LimiteExcedido al agotarse la cuota."""
        ahora = self._reloj()
        ventana = int(ahora // VENTANA_SEGUNDOS)
        reset_epoch = (ventana + 1) * VENTANA_SEGUNDOS
        self._podar(ventana)
        ventana_previa, usados = self._contadores.get(clave, (ventana, 0))
        if ventana_previa != ventana:
            usados = 0
        elif (
            clave not in self._contadores
            and self._max_claves is not None
            and len(self._contadores) >= self._max_claves
        ):
            # Lleno con claves de esta misma ventana. No se cuenta: negar el
            # servicio a una IP nueva porque haya muchas otras sería el DoS que
            # la cuota quiere evitar, y la base la protege la caché, no esto.
            self.desbordes += 1
            return Cuota(limite=self._limite, restante=self._limite, reset_epoch=reset_epoch)
        if usados >= self._limite:
            raise LimiteExcedido(limite=self._limite, reset_epoch=reset_epoch)
        usados += 1
        self._contadores[clave] = (ventana, usados)
        return Cuota(
            limite=self._limite, restante=self._limite - usados, reset_epoch=reset_epoch
        )

    def _podar(self, ventana: int) -> None:
        """Una vez por ventana: fuera las claves de ventanas que ya vencieron."""
        if self._ventana_podada == ventana:
            return
        self._ventana_podada = ventana
        self._contadores = {
            clave: valor for clave, valor in self._contadores.items() if valor[0] == ventana
        }
