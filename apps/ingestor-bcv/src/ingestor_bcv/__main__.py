"""Entrypoint: `python -m ingestor_bcv [--once] [--dry-run]`.

--once     ejecuta una sincronización y termina (útil para cron externo y pruebas).
--dry-run  sin RabbitMQ/TimescaleDB: adaptadores en memoria, eventos por log.
           La consulta al sitio del BCV siempre es real (TLS anclado).
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from ingestor_bcv.adapters.bcv.client import FuenteBcv
from ingestor_bcv.adapters.memory import (
    InMemoryRateRepository,
    LoggingAlertNotifier,
    LoggingEventPublisher,
)
from ingestor_bcv.application.sync_rates import SincronizarTasasOficiales
from ingestor_bcv.config import Settings
from ingestor_bcv.scheduler import ejecutar_una_vez, run_forever

logger = logging.getLogger("ingestor_bcv")


async def run(settings: Settings, once: bool, dry_run: bool) -> None:
    source = FuenteBcv(settings.bcv_url, settings.ca_bundle)
    notifier = LoggingAlertNotifier()

    if dry_run:
        repository = InMemoryRateRepository()
        publisher = LoggingEventPublisher()
        cerrar = []
    else:
        # Imports locales: en dry-run no se requieren los drivers de infraestructura.
        from ingestor_bcv.adapters.amqp.publisher import AmqpEventPublisher
        from ingestor_bcv.adapters.timescale.repository import TimescaleRateRepository

        repository = await TimescaleRateRepository.connect(settings.database_url)
        publisher = AmqpEventPublisher(settings.amqp_url, settings.amqp_exchange)
        cerrar = [publisher.close, repository.close]

    caso_de_uso = SincronizarTasasOficiales(
        source=source,
        publisher=publisher,
        repository=repository,
        notifier=notifier,
        max_delta_pct=settings.max_delta_pct,
        umbral_fallos=settings.umbral_fallos,
    )

    try:
        if once:
            await ejecutar_una_vez(caso_de_uso)
        else:
            await run_forever(caso_de_uso, settings.fetch_interval_seconds)
    finally:
        for close in cerrar:
            await close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ingestor-bcv",
        description="Ingesta de tasas oficiales de cambio del BCV (multi-moneda)",
    )
    parser.add_argument("--once", action="store_true", help="una sincronización y salir")
    parser.add_argument(
        "--dry-run", action="store_true", help="sin infraestructura: eventos por log"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    try:
        asyncio.run(run(Settings.from_env(), once=args.once, dry_run=args.dry_run))
    except KeyboardInterrupt:
        logger.info("detenido por el usuario")


if __name__ == "__main__":
    main()
