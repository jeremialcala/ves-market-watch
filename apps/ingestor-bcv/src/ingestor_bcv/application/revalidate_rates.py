"""Caso de uso: re-validación HITL de tasas `suspect` (ADR-0007).

Una tasa retenida como `suspect` solo sale de ese estado por decisión humana:
- aprobar → la sospecha más reciente de la moneda pasa a `valid` y se publica
  `official.rate.updated` (se convierte en la nueva referencia); las sospechas
  pendientes más viejas de esa moneda quedan `rejected` como reemplazadas.
- rechazar → todas las pendientes de la moneda quedan `rejected`.

La expiración por timeout (la otra salida del ADR) vive en el ciclo de
sincronización — ver `sync_rates.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import Decimal

from ingestor_bcv.application.ports import EventPublisher, RateRepository
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial


class ErrorDeRevalidacion(Exception):
    """La operación no puede aplicarse (sin pendientes, o sospecha obsoleta)."""


@dataclass(frozen=True, slots=True)
class SospechaPendiente:
    tasa: TasaOficial
    ultima_valida: TasaOficial | None
    delta_pct: Decimal | None  # variación firmada vs. la referencia; None sin referencia


class RevalidarTasasSospechosas:
    def __init__(self, publisher: EventPublisher, repository: RateRepository) -> None:
        self._publisher = publisher
        self._repository = repository

    async def listar(self, moneda: str | None = None) -> list[SospechaPendiente]:
        pendientes = await self._repository.sospechosas_pendientes(moneda)
        resultado = []
        for tasa in pendientes:
            ultima = await self._repository.ultima_tasa_valida(tasa.moneda)
            delta = (
                (tasa.valor - ultima.valor) / ultima.valor * 100 if ultima is not None else None
            )
            resultado.append(SospechaPendiente(tasa=tasa, ultima_valida=ultima, delta_pct=delta))
        return resultado

    async def aprobar(self, moneda: str, usuario: str, nota: str) -> TasaOficial:
        pendientes = await self._repository.sospechosas_pendientes(moneda)
        if not pendientes:
            raise ErrorDeRevalidacion(f"no hay sospechas pendientes para {moneda}")

        mas_reciente = max(pendientes, key=lambda t: t.capturada_en)
        ultima = await self._repository.ultima_tasa_valida(moneda)
        if ultima is not None and ultima.capturada_en > mas_reciente.capturada_en:
            raise ErrorDeRevalidacion(
                f"existe una captura válida de {moneda} más reciente "
                f"({ultima.capturada_en.isoformat()}) que la sospecha "
                f"({mas_reciente.capturada_en.isoformat()}); la sospecha ya no es "
                "relevante — usar rechazar"
            )

        await self._repository.resolver_sospechosa(
            mas_reciente, EstadoTasa.VALID, usuario, nota
        )
        for otra in pendientes:
            if otra is not mas_reciente:
                await self._repository.resolver_sospechosa(
                    otra,
                    EstadoTasa.REJECTED,
                    usuario,
                    "reemplazada por la aprobación de la captura "
                    f"{mas_reciente.capturada_en.isoformat()}",
                )

        aprobada = replace(mas_reciente, estado=EstadoTasa.VALID)
        await self._publisher.publish_rate_updated(aprobada)
        return aprobada

    async def rechazar(self, moneda: str, usuario: str, nota: str) -> list[TasaOficial]:
        pendientes = await self._repository.sospechosas_pendientes(moneda)
        if not pendientes:
            raise ErrorDeRevalidacion(f"no hay sospechas pendientes para {moneda}")
        for tasa in pendientes:
            await self._repository.resolver_sospechosa(tasa, EstadoTasa.REJECTED, usuario, nota)
        return pendientes
