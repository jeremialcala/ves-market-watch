"""Bucle de sincronización programada: 2×/hora configurable (RF-1)."""

from __future__ import annotations

import asyncio
import logging
import random

from ingestor_bcv.application.sync_rates import SincronizarTasasOficiales

logger = logging.getLogger("ingestor_bcv")

# Jitter para no consultar en instantes exactos predecibles y repartir carga.
_JITTER_SECONDS = 60


async def run_forever(caso_de_uso: SincronizarTasasOficiales, interval_seconds: int) -> None:
    while True:
        await ejecutar_una_vez(caso_de_uso)
        espera = interval_seconds + random.uniform(-_JITTER_SECONDS, _JITTER_SECONDS)
        logger.info("próxima sincronización en %.0f s", espera)
        await asyncio.sleep(max(espera, 60))


async def ejecutar_una_vez(caso_de_uso: SincronizarTasasOficiales) -> None:
    resumen = await caso_de_uso.ejecutar()
    if resumen.error is not None:
        logger.error(
            "sincronización fallida (%d fallos consecutivos): %s",
            resumen.fallos_consecutivos,
            resumen.error,
        )
        return
    logger.info(
        "sincronización OK — publicadas: %s | sin cambio (heartbeat): %s | sospechosas: %s",
        ",".join(resumen.publicadas) or "-",
        ",".join(resumen.heartbeats) or "-",
        ",".join(resumen.sospechosas) or "-",
    )
