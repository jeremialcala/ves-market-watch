"""Cache con TTL de las distribuciones de la ventana (RF-6, ADR-0019).

Decorador del mismo puerto `DistribucionRepository`. Existe por coste: el engine
procesa ~2 snapshots/min y la consulta de percentiles barre ~1,5 M filas con su
sort, así que no puede correr en cada revisión. Una distribución de 90 días no se
mueve en 30 segundos.

Degradación explícita, nunca silenciosa:

- fallo o timeout **con** entrada previa → se sirve esa entrada aunque esté
  vencida, con warning. Una escala de hace 40 min sigue siendo real y
  `scale.computed_at` lo declara en el payload;
- fallo **sin** entrada previa → `{}`, que degrada al respaldo del ruleset y
  viaja VISIBLE como `scale.source: "ruleset"`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Callable, Sequence

from indicator_engine.application.ports import DistribucionRepository
from indicator_engine.domain.analisis import Distribucion

logger = logging.getLogger("indicator_engine")

Reloj = Callable[[], datetime]


def _ahora() -> datetime:
    return datetime.now(UTC)


class DistribucionesConTTL:
    """Cache en memoria del proceso del engine: hay un solo consumidor, no hace
    falta cache distribuida. Al reiniciar, la primera revisión paga la consulta."""

    def __init__(
        self,
        inner: DistribucionRepository,
        ttl: timedelta = timedelta(minutes=15),
        timeout_s: float = 5.0,
        reloj: Reloj = _ahora,
    ) -> None:
        self._inner = inner
        self._ttl = ttl
        self._timeout_s = timeout_s
        self._reloj = reloj
        self._cache: dict[tuple, tuple[datetime, dict[str, Distribucion]]] = {}

    async def distribuciones(
        self,
        nombres: Sequence[str],
        moneda: str,
        desde: datetime,
        percentiles: Sequence[Decimal],
    ) -> dict[str, Distribucion]:
        # `desde` queda FUERA de la clave a propósito: cambia en cada snapshot y
        # metería un fallo de cache seguro, anulando el TTL. La consecuencia es
        # que la ventana se desliza a saltos de TTL en vez de continuamente, y
        # eso se declara en el payload con `scale.computed_at`.
        clave = (moneda, tuple(sorted(nombres)), tuple(percentiles))
        entrada = self._cache.get(clave)
        ahora = self._reloj()
        if entrada is not None and ahora - entrada[0] < self._ttl:
            return entrada[1]

        try:
            async with asyncio.timeout(self._timeout_s):
                frescas = await self._inner.distribuciones(
                    nombres, moneda, desde, percentiles
                )
        except Exception:
            if entrada is not None:
                logger.warning(
                    "distribuciones: consulta fallida, se sirve la entrada de %s "
                    "(vencida); la escala publicada lo declara en computed_at",
                    entrada[0].isoformat(),
                    exc_info=True,
                )
                return entrada[1]
            logger.warning(
                "distribuciones: consulta fallida y sin cache previa; el análisis "
                "degrada al respaldo del ruleset (visible en scale.source)",
                exc_info=True,
            )
            return {}

        self._cache[clave] = (ahora, frescas)
        return frescas
