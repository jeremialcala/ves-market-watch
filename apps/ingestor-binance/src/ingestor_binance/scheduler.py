"""Bucle de captura programada: ambos lados por ciclo, cada 60 s ± jitter (RF-1).

Métricas operativas (RF-6) como logs estructurados: latencia de ciclo,
anuncios capturados, outliers, capturas parciales, saltos del breaker.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time

from ingestor_binance.application.capture_snapshot import CapturarSnapshot
from ingestor_binance.domain.models import Lado

logger = logging.getLogger("ingestor_binance")

_JITTER_SECONDS = 5


async def run_forever(caso_de_uso: CapturarSnapshot, interval_seconds: int) -> None:
    while True:
        await ejecutar_ciclo(caso_de_uso)
        espera = interval_seconds + random.uniform(-_JITTER_SECONDS, _JITTER_SECONDS)
        await asyncio.sleep(max(espera, 10))


async def ejecutar_ciclo(caso_de_uso: CapturarSnapshot) -> None:
    inicio = time.monotonic()
    for lado in (Lado.BUY, Lado.SELL):
        resumen = await caso_de_uso.ejecutar(lado)
        if resumen.saltado_por_breaker:
            logger.warning("ciclo %s saltado: circuit breaker abierto", lado)
        elif resumen.error is not None:
            logger.error("ciclo %s fallido: %s", lado, resumen.error)
        else:
            logger.info(
                "ciclo %s OK — anuncios: %d | outliers: %d | parcial: %s",
                lado,
                resumen.total_anuncios,
                resumen.outliers,
                resumen.parcial,
            )
    logger.info("latencia de ciclo completo: %.2f s", time.monotonic() - inicio)
