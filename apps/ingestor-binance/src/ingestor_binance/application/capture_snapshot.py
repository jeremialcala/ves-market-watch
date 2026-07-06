"""Caso de uso: capturar un snapshot P2P de un lado del mercado.

Flujo (PRD RF-1..RF-5): fetch paginado → normalizar (sanitización A05) →
etiquetar outliers (MAD) → persistir crudo → publicar `p2p.snapshot`.

Fallos:
- Schema de la fuente inválido → descarte + alerta; JAMÁS se publica (A10).
- Fuente no disponible → cuenta para el circuit breaker; al abrir, alerta y
  los ciclos siguientes se saltan hasta el cooldown (escenario negativo 3).
"""

from __future__ import annotations

from dataclasses import dataclass

from ingestor_binance.adapters.binance.resilience import CircuitBreaker
from ingestor_binance.application.ports import (
    AlertNotifier,
    EsquemaFuenteInvalido,
    EventPublisher,
    FuenteNoDisponible,
    P2PMarketSource,
    SnapshotRepository,
)
from ingestor_binance.domain.models import Lado, SnapshotP2P
from ingestor_binance.domain.normalizacion import etiquetar_outliers, normalizar_anuncio


@dataclass(slots=True)
class ResumenCaptura:
    lado: Lado
    publicado: bool = False
    saltado_por_breaker: bool = False
    parcial: bool = False
    total_anuncios: int = 0
    outliers: int = 0
    error: str | None = None


class CapturarSnapshot:
    def __init__(
        self,
        source: P2PMarketSource,
        publisher: EventPublisher,
        repository: SnapshotRepository,
        notifier: AlertNotifier,
        breaker: CircuitBreaker,
        outlier_mad_k: float = 3.5,
    ) -> None:
        self._source = source
        self._publisher = publisher
        self._repository = repository
        self._notifier = notifier
        self._breaker = breaker
        self._outlier_mad_k = outlier_mad_k

    async def ejecutar(self, lado: Lado) -> ResumenCaptura:
        resumen = ResumenCaptura(lado=lado)

        if not self._breaker.permite_intento():
            resumen.saltado_por_breaker = True
            return resumen

        try:
            captura = await self._source.fetch_ads(lado)
        except EsquemaFuenteInvalido as exc:
            self._breaker.registrar_fallo()
            resumen.error = str(exc)
            await self._notifier.alertar(
                f"Respuesta de Binance P2P ({lado}) no cumple el schema de la "
                f"fuente; snapshot descartado sin publicar: {exc}"
            )
            return resumen
        except FuenteNoDisponible as exc:
            resumen.error = str(exc)
            if self._breaker.registrar_fallo():
                await self._notifier.alertar(
                    f"Circuit breaker ABIERTO para Binance P2P: {exc}. "
                    "Consultas suspendidas hasta el cooldown (sin rotación de IP)."
                )
            return resumen

        self._breaker.registrar_exito()

        try:
            anuncios = tuple(
                normalizar_anuncio(crudo) for crudo in captura.anuncios_crudos
            )
        except (ValueError, KeyError, TypeError) as exc:
            # Estructura válida pero contenido inutilizable: mismo tratamiento
            # que un cambio de esquema — descartar y alertar (A10).
            resumen.error = str(exc)
            await self._notifier.alertar(
                f"Snapshot P2P ({lado}) con contenido no normalizable; "
                f"descartado sin publicar: {exc}"
            )
            return resumen

        anuncios = etiquetar_outliers(anuncios, self._outlier_mad_k)
        snapshot = SnapshotP2P(
            lado=lado,
            asset=captura.asset,
            fiat=captura.fiat,
            capturado_en=captura.capturada_en,
            parcial=captura.parcial,
            anuncios=anuncios,
        )

        await self._repository.guardar_crudo(snapshot, captura.anuncios_crudos)
        await self._publisher.publish_p2p_snapshot(snapshot)

        resumen.publicado = True
        resumen.parcial = snapshot.parcial
        resumen.total_anuncios = len(anuncios)
        resumen.outliers = sum(1 for a in anuncios if a.outlier)
        return resumen
