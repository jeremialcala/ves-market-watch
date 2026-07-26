"""Puertos (interfaces) de la aplicación — ver docs/design.md.

Los adaptadores concretos (HTTP/BCV, AMQP, TimescaleDB) los implementan;
el caso de uso solo depende de estos contratos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol

from ingestor_bcv.domain.models import EstadoTasa, TasaOficial


@dataclass(frozen=True, slots=True)
class CapturaOficial:
    """Resultado crudo de una consulta al sitio del BCV: todas las monedas
    publicadas en la sección «tipo de cambio de referencia»."""

    fecha_valor: date
    tasas: dict[str, Decimal]  # código ISO 4217 → VES por unidad
    capturada_en: datetime


class OfficialRateSource(Protocol):
    async def fetch_rates(self) -> CapturaOficial:
        """Obtiene y parsea las tasas publicadas. Lanza excepción si la fuente
        no responde o el HTML no se puede interpretar."""
        ...


class EventPublisher(Protocol):
    async def publish_rate_updated(self, tasa: TasaOficial) -> None:
        """Publica `official.rate.updated` en el bus de eventos (ADR-0004)."""
        ...


class RateRepository(Protocol):
    async def ultima_tasa_valida(self, moneda: str) -> TasaOficial | None: ...

    async def guardar(self, tasa: TasaOficial) -> None:
        """Persiste toda captura — válida, sospechosa o stale (RF-5, auditoría V16)."""
        ...

    async def sospechosas_pendientes(self, moneda: str | None = None) -> list[TasaOficial]:
        """Sospechas sin resolver, de una moneda o de todas, en orden de captura."""
        ...

    async def resolver_sospechosa(
        self, tasa: TasaOficial, nuevo_estado: "EstadoTasa", usuario: str, nota: str
    ) -> None:
        """Transición suspect→valid|rejected con auditoría quién/cuándo/por qué (ADR-0007)."""
        ...

    async def expirar_sospechosas_antes_de(self, limite: datetime) -> list[TasaOficial]:
        """Sospechas capturadas antes de `limite` → rejected por timeout; devuelve las expiradas."""
        ...

    async def registrar_exito(self) -> None: ...

    async def registrar_fallo(self, error: str) -> int:
        """Registra un fallo de la fuente y devuelve el número de fallos consecutivos."""
        ...

    async def marcar_stale(self) -> None:
        """Marca la fuente como stale (visible para consumidores vía salud de fuente)."""
        ...


class AlertNotifier(Protocol):
    async def alertar(self, mensaje: str) -> None: ...
