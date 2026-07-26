"""Entrypoint del servicio y CLI de operador.

Daemon de ingesta (compatibilidad intacta):
    python -m ingestor_bcv [--once] [--dry-run]

Re-validación HITL de tasas `suspect` (ADR-0007) — usa DATABASE_URL/AMQP_URL reales:
    python -m ingestor_bcv revalidar listar [MONEDA]
    python -m ingestor_bcv revalidar aprobar MONEDA --nota "..." [--usuario ...]
    python -m ingestor_bcv revalidar rechazar MONEDA --nota "..." [--usuario ...]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
from datetime import timedelta

from ingestor_bcv.adapters.bcv.client import FuenteBcv
from ingestor_bcv.adapters.memory import (
    InMemoryRateRepository,
    LoggingAlertNotifier,
    LoggingEventPublisher,
)
from ingestor_bcv.application.revalidate_rates import (
    ErrorDeRevalidacion,
    RevalidarTasasSospechosas,
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
        ttl_sospechosas=timedelta(hours=settings.suspect_ttl_horas),
    )

    try:
        if once:
            await ejecutar_una_vez(caso_de_uso)
        else:
            await run_forever(caso_de_uso, settings.fetch_interval_seconds)
    finally:
        for close in cerrar:
            await close()


async def revalidar(settings: Settings, args: argparse.Namespace) -> int:
    from ingestor_bcv.adapters.amqp.publisher import AmqpEventPublisher
    from ingestor_bcv.adapters.timescale.repository import TimescaleRateRepository

    repository = await TimescaleRateRepository.connect(settings.database_url)
    publisher = AmqpEventPublisher(settings.amqp_url, settings.amqp_exchange)
    caso = RevalidarTasasSospechosas(publisher, repository)

    try:
        if args.accion == "listar":
            pendientes = await caso.listar(args.moneda)
            if not pendientes:
                print("Sin sospechas pendientes.")
                return 1
            print(f"{'MONEDA':<8}{'CAPTURADA':<27}{'VALOR':>16}{'REFERENCIA':>16}{'Δ %':>9}")
            for p in pendientes:
                referencia = f"{p.ultima_valida.valor}" if p.ultima_valida else "-"
                delta = f"{p.delta_pct:+.2f}" if p.delta_pct is not None else "-"
                print(
                    f"{p.tasa.moneda:<8}{p.tasa.capturada_en.isoformat():<27}"
                    f"{p.tasa.valor!s:>16}{referencia:>16}{delta:>9}"
                )
            return 0

        if args.accion == "aprobar":
            tasa = await caso.aprobar(args.moneda, args.usuario, args.nota)
            print(
                f"Aprobada y publicada: {tasa.moneda} = {tasa.valor} VES "
                f"(fecha-valor {tasa.fecha_valor}, capturada {tasa.capturada_en.isoformat()})"
            )
            return 0

        rechazadas = await caso.rechazar(args.moneda, args.usuario, args.nota)
        print(f"Rechazadas {len(rechazadas)} sospecha(s) de {args.moneda}.")
        return 0
    except ErrorDeRevalidacion as exc:
        print(f"Error: {exc}")
        return 1
    finally:
        await publisher.close()
        await repository.close()


def _construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ingestor-bcv",
        description="Ingesta de tasas oficiales de cambio del BCV (multi-moneda)",
    )
    parser.add_argument("--once", action="store_true", help="una sincronización y salir")
    parser.add_argument(
        "--dry-run", action="store_true", help="sin infraestructura: eventos por log"
    )
    sub = parser.add_subparsers(dest="comando")

    p_rev = sub.add_parser(
        "revalidar", help="re-validación HITL de tasas suspect (ADR-0007)"
    )
    acciones = p_rev.add_subparsers(dest="accion", required=True)

    p_listar = acciones.add_parser("listar", help="sospechas pendientes con Δ % vs referencia")
    p_listar.add_argument("moneda", nargs="?", default=None, help="filtrar por moneda")

    usuario_default = os.environ.get("USERNAME") or os.environ.get("USER") or "operador"
    for nombre, ayuda in (
        ("aprobar", "la sospecha más reciente pasa a valid y se publica al bus"),
        ("rechazar", "todas las sospechas pendientes de la moneda pasan a rejected"),
    ):
        p = acciones.add_parser(nombre, help=ayuda)
        p.add_argument("moneda", help="código ISO 4217, p. ej. USD")
        p.add_argument("--nota", required=True, help="justificación auditable de la decisión")
        p.add_argument("--usuario", default=usuario_default, help="quién decide (auditoría)")
    return parser


def main() -> None:
    args = _construir_parser().parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = Settings.from_env()

    try:
        if args.comando == "revalidar":
            raise SystemExit(asyncio.run(revalidar(settings, args)))
        asyncio.run(run(settings, once=args.once, dry_run=args.dry_run))
    except KeyboardInterrupt:
        logger.info("detenido por el usuario")


if __name__ == "__main__":
    main()
