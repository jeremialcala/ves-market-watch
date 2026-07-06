"""Puertos (interfaces) de la aplicación — ver docs/design.md.

`P2PMarketSource` abstrae la fuente (ADR-0005): el endpoint actual puede
sustituirse por otro mecanismo sin tocar dominio ni casos de uso.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from ingestor_binance.domain.models import Lado, SnapshotP2P


class EsquemaFuenteInvalido(Exception):
    """La respuesta de la fuente no cumple su schema: descartar y alertar,
    nunca publicar datos corruptos (escenario negativo 1, A10)."""


class FuenteNoDisponible(Exception):
    """La fuente no respondió de forma utilizable (red, bloqueo, presupuesto);
    cuenta como fallo de ciclo para el circuit breaker."""


@dataclass(frozen=True, slots=True)
class CapturaP2P:
    """Resultado crudo de un ciclo de captura para un lado (páginas validadas)."""

    lado: Lado
    asset: str
    fiat: str
    anuncios_crudos: list[dict]  # items {adv, advertiser} tal como llegaron
    parcial: bool
    capturada_en: datetime


class P2PMarketSource(Protocol):
    async def fetch_ads(self, lado: Lado) -> CapturaP2P:
        """Trae el top-K paginado de un lado. Lanza `EsquemaFuenteInvalido` si
        la fuente cambió de forma, `FuenteNoDisponible` si ninguna página llegó."""
        ...


class EventPublisher(Protocol):
    async def publish_p2p_snapshot(self, snapshot: SnapshotP2P) -> None:
        """Publica `p2p.snapshot` (ADR-0004, publisher confirms)."""
        ...


class SnapshotRepository(Protocol):
    async def guardar_crudo(self, snapshot: SnapshotP2P, crudo: list[dict]) -> None:
        """Persiste el snapshot crudo completo para reproceso (RF-5, 90 días)."""
        ...


class AlertNotifier(Protocol):
    async def alertar(self, mensaje: str) -> None: ...
