"""Entrypoint: `python -m indicator_engine [--drain]`.

Daemon consumidor de `market.events`. Con `--drain` procesa los mensajes ya
encolados y termina (útil para verificación y procesamiento por lotes).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import timedelta
from pathlib import Path

import yaml

from indicator_engine.adapters.amqp.consumer import ConsumidorMarketEvents
from indicator_engine.adapters.amqp.publisher import AmqpEventPublisher
from indicator_engine.adapters.memory import LoggingAlertNotifier
from indicator_engine.adapters.timescale.repository import TimescaleIndicatorRepository
from indicator_engine.application.contracts import ValidadorDeContratos
from indicator_engine.application.process_official_rate import ProcesarTasaOficial
from indicator_engine.application.process_p2p_snapshot import ProcesarSnapshotP2P
from indicator_engine.config import Settings
from indicator_engine.domain.reglas import Ruleset, cargar_ruleset

logger = logging.getLogger("indicator_engine")


def _cargar_ruleset(path_str: str) -> Ruleset | None:
    """Carga el ruleset de señales (RF-4). Sin archivo → señales deshabilitadas
    (el resto del motor funciona igual). Un ruleset mal formado aborta el arranque."""
    path = Path(path_str)
    if not path.exists():
        logger.warning(
            "sin ruleset de señales en %s; emisión de señales deshabilitada", path
        )
        return None
    ruleset = cargar_ruleset(yaml.safe_load(path.read_text(encoding="utf-8")))
    logger.info(
        "ruleset de señales v%d cargado (%d reglas, cooldown %d min)",
        ruleset.version,
        len(ruleset.reglas),
        ruleset.cooldown_min,
    )
    return ruleset


async def run(settings: Settings, drain: bool) -> None:
    repository = await TimescaleIndicatorRepository.connect(settings.database_url)
    publisher = AmqpEventPublisher(settings.amqp_url, settings.amqp_exchange)
    ruleset = _cargar_ruleset(settings.signals_ruleset_path)
    procesador = ProcesarTasaOficial(
        publisher=publisher,
        repository=repository,
        calc_version=settings.calc_version,
        umbral_stale=timedelta(hours=settings.stale_threshold_hours),
    )
    procesador_p2p = ProcesarSnapshotP2P(
        publisher=publisher,
        repository=repository,
        calc_version=settings.calc_version,
        umbral_stale=timedelta(hours=settings.stale_threshold_hours),
        ruleset=ruleset,
        max_age_indicadores=timedelta(minutes=settings.signals_max_age_min),
    )
    consumidor = ConsumidorMarketEvents(
        amqp_url=settings.amqp_url,
        procesador_tasa_oficial=procesador,
        validador=ValidadorDeContratos(settings.schemas_dir),
        notifier=LoggingAlertNotifier(),
        exchange_name=settings.amqp_exchange,
        queue_name=settings.queue_name,
        dlx_name=settings.dlx_name,
        dlq_name=settings.dlq_name,
        prefetch=settings.prefetch,
        procesador_snapshot_p2p=procesador_p2p,
    )
    try:
        if drain:
            manejados = await consumidor.procesar_disponibles()
            logger.info("drain: %d mensaje(s) manejado(s)", manejados)
        else:
            await consumidor.run_forever()
    finally:
        await consumidor.close()
        await publisher.close()
        await repository.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="indicator-engine",
        description="Motor reactivo de indicadores (consumidor de market.events)",
    )
    parser.add_argument(
        "--drain", action="store_true", help="procesa lo encolado y termina"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    try:
        asyncio.run(run(Settings.from_env(), drain=args.drain))
    except KeyboardInterrupt:
        logger.info("detenido por el usuario")


if __name__ == "__main__":
    main()
