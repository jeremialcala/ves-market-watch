"""Caso de uso: sincronizar las tasas oficiales del BCV (todas las monedas).

Flujo por ejecución (RF-1..RF-5):
  fetch → por moneda: validar plausibilidad → persistir siempre →
  publicar `official.rate.updated` solo si es válida y cambió (valor o fecha-valor).

Manejo de fallos de la fuente: contador persistente de fallos consecutivos;
al alcanzar el umbral (default 3) se alerta y se marca la fuente como `stale`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal

from ingestor_bcv.application.ports import (
    AlertNotifier,
    EventPublisher,
    OfficialRateSource,
    RateRepository,
)
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial
from ingestor_bcv.domain.validation import validar_plausibilidad


@dataclass(slots=True)
class ResumenSincronizacion:
    publicadas: list[str] = field(default_factory=list)
    heartbeats: list[str] = field(default_factory=list)
    sospechosas: list[str] = field(default_factory=list)
    expiradas: list[str] = field(default_factory=list)  # sospechas vencidas por TTL
    error: str | None = None
    fallos_consecutivos: int = 0


class SincronizarTasasOficiales:
    def __init__(
        self,
        source: OfficialRateSource,
        publisher: EventPublisher,
        repository: RateRepository,
        notifier: AlertNotifier,
        max_delta_pct: Decimal = Decimal("20"),
        umbral_fallos: int = 3,
        ttl_sospechosas: timedelta = timedelta(hours=24),
    ) -> None:
        self._source = source
        self._publisher = publisher
        self._repository = repository
        self._notifier = notifier
        self._max_delta_pct = max_delta_pct
        self._umbral_fallos = umbral_fallos
        self._ttl_sospechosas = ttl_sospechosas

    async def ejecutar(self) -> ResumenSincronizacion:
        resumen = ResumenSincronizacion()

        try:
            captura = await self._source.fetch_rates()
        except Exception as exc:  # red, TLS o parseo: la fuente falló completa
            fallos = await self._repository.registrar_fallo(str(exc))
            resumen.error = str(exc)
            resumen.fallos_consecutivos = fallos
            if fallos >= self._umbral_fallos:
                await self._repository.marcar_stale()
                await self._notifier.alertar(
                    f"Fuente BCV en estado stale tras {fallos} fallos consecutivos. "
                    f"Último error: {exc}"
                )
            return resumen

        await self._repository.registrar_exito()

        # Salida por timeout de la máquina de estados (ADR-0007): sospechas sin
        # revisión humana dentro del TTL expiran a rejected. Si el valor sigue
        # vigente en el sitio, esta misma corrida genera una sospecha fresca.
        expiradas = await self._repository.expirar_sospechosas_antes_de(
            captura.capturada_en - self._ttl_sospechosas
        )
        for tasa in expiradas:
            resumen.expiradas.append(tasa.moneda)
            await self._notifier.alertar(
                f"Sospecha {tasa.moneda} capturada {tasa.capturada_en.isoformat()} "
                f"expirada por timeout (> {self._ttl_sospechosas}) sin revisión humana"
            )

        for moneda in sorted(captura.tasas):
            valor = captura.tasas[moneda]
            ultima = await self._repository.ultima_tasa_valida(moneda)
            resultado = validar_plausibilidad(
                valor, captura.fecha_valor, ultima, self._max_delta_pct
            )
            tasa = TasaOficial(
                moneda=moneda,
                valor=valor,
                fecha_valor=captura.fecha_valor,
                capturada_en=captura.capturada_en,
                estado=EstadoTasa.VALID if resultado.es_valida else EstadoTasa.SUSPECT,
            )
            await self._repository.guardar(tasa)

            if not resultado.es_valida:
                resumen.sospechosas.append(moneda)
                await self._notifier.alertar(
                    f"Tasa {moneda} retenida como suspect: {resultado.motivo}"
                )
                continue

            if ultima is None or tasa.cambio_frente_a(ultima):
                await self._publisher.publish_rate_updated(tasa)
                resumen.publicadas.append(moneda)
            else:
                resumen.heartbeats.append(moneda)

        return resumen
