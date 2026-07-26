"""Adaptadores en memoria para `--dry-run` y tests unitarios."""

from __future__ import annotations

import logging

from ingestor_binance.adapters.amqp.publisher import construir_evento_snapshot
from ingestor_binance.domain.models import SnapshotP2P

logger = logging.getLogger("ingestor_binance")


class InMemorySnapshotRepository:
    def __init__(self) -> None:
        self.snapshots: list[tuple[SnapshotP2P, list[dict]]] = []

    async def guardar_crudo(self, snapshot: SnapshotP2P, crudo: list[dict]) -> None:
        self.snapshots.append((snapshot, crudo))


class LoggingEventPublisher:
    def __init__(self) -> None:
        self.eventos: list[dict] = []

    async def publish_p2p_snapshot(self, snapshot: SnapshotP2P) -> None:
        evento = construir_evento_snapshot(snapshot)
        self.eventos.append(evento)
        payload = evento["payload"]
        logger.info(
            "[dry-run] p2p.snapshot %s %s/%s: %d anuncios (outliers: %d, parcial: %s) "
            "— mejor precio %s",
            payload["side"],
            payload["asset"],
            payload["fiat"],
            len(payload["ads"]),
            sum(1 for a in payload["ads"] if a["outlier"]),
            payload["partial"],
            payload["ads"][0]["price"] if payload["ads"] else "-",
        )


class LoggingAlertNotifier:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)
        logger.critical("ALERTA: %s", mensaje)
