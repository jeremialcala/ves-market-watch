"""Entrypoint: `python -m ingestor_binance [--once] [--dry-run]`.

--once     un ciclo (BUY + SELL) y termina.
--dry-run  sin RabbitMQ/TimescaleDB: adaptadores en memoria, eventos por log.
           La consulta al endpoint P2P de Binance siempre es real.
"""

from __future__ import annotations

import argparse
import asyncio
import logging

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
from ingestor_binance.config import Settings
from ingestor_binance.domain.normalizacion import Pseudonimizador
from ingestor_binance.scheduler import ejecutar_ciclo, run_forever

logger = logging.getLogger("ingestor_binance")


async def run(settings: Settings, once: bool, dry_run: bool) -> None:
    source = FuenteBinanceP2P(
        url=settings.binance_p2p_url,
        asset=settings.asset,
        fiat=settings.fiat,
        schema_fuente=settings.schema_fuente,
        presupuesto=PresupuestoDeRequests(settings.request_budget_per_min),
        top_k=settings.top_k,
        rows_per_page=settings.rows_per_page,
        max_retries=settings.max_retries,
        max_response_bytes=settings.max_response_bytes,
    )
    breaker = CircuitBreaker(
        umbral=settings.breaker_threshold,
        cooldown_segundos=settings.breaker_cooldown_seconds,
    )
    notifier = LoggingAlertNotifier()

    if dry_run:
        repository = InMemorySnapshotRepository()
        publisher = LoggingEventPublisher()
        cerrar = []
    else:
        from ingestor_binance.adapters.amqp.publisher import AmqpEventPublisher
        from ingestor_binance.adapters.timescale.repository import (
            TimescaleSnapshotRepository,
        )

        repository = await TimescaleSnapshotRepository.connect(settings.database_url)
        publisher = AmqpEventPublisher(settings.amqp_url, settings.amqp_exchange)
        cerrar = [publisher.close, repository.close]

    caso_de_uso = CapturarSnapshot(
        source=source,
        publisher=publisher,
        repository=repository,
        notifier=notifier,
        breaker=breaker,
        pseudonimizador=Pseudonimizador(settings.merchant_hmac_key),
        outlier_mad_k=settings.outlier_mad_k,
    )

    try:
        if once:
            await ejecutar_ciclo(caso_de_uso)
        else:
            await run_forever(caso_de_uso, settings.fetch_interval_seconds)
    finally:
        for close in cerrar:
            await close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ingestor-binance",
        description="Ingesta del mercado P2P de Binance (USDT/VES)",
    )
    parser.add_argument("--once", action="store_true", help="un ciclo y salir")
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
