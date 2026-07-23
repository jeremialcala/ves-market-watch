"""Caso de uso fase 2: recalcular indicadores P2P ante cada `p2p.snapshot`.

Por cada snapshot (un lado del mercado) produce, en un solo lote atómico:

- Referencia del lado: mediana, VWAP, mejor precio, liquidez, % merchants,
  % outliers (knowledge/metrics/precio-referencia-p2p.md).
- Brecha BCV↔P2P del lado, con la tasa oficial conocida al momento (ADR-0009)
  y bandera `official_stale` (ADR-0007).
- Microestructura entre lados con el último snapshot fresco del lado opuesto:
  spread BUY↔SELL y ratio oferta/demanda.
- Ventanas móviles sobre el propio histórico del motor: momentum del bid (3 h,
  al procesar SELL) y drenaje de oferta (6 h, al procesar BUY)
  (knowledge/metrics/microestructura-p2p.md).

Calidad: con `confianza_baja` (> 30 % outliers) solo se publican la referencia
y el % de outliers — las señales derivadas se suprimen, nunca en silencio: el
propio `p2p_outliers_pct` deja el rastro del porqué.

Semántica at-least-once idéntica a fase 1: marcar procesado al FINAL; la
persistencia es idempotente por PK y re-publicar `indicators.updated` es
preferible a perderlo.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from indicator_engine.application.ports import (
    EventPublisher,
    IndicatorRepository,
    SnapshotP2PRecibido,
)
from indicator_engine.application.process_official_rate import ResultadoProcesamiento
from indicator_engine.domain.calculos import (
    calcular_brecha,
    calcular_ratio_oferta_demanda,
    calcular_referencia_p2p,
    calcular_spread_pct,
    calcular_variacion,
)
from indicator_engine.domain.models import (
    OFFICIAL_RATE,
    P2P_BRECHA_ABS,
    P2P_BRECHA_PCT,
    P2P_DRENAJE_OFERTA_6H_PCT,
    P2P_LIQUIDEZ,
    P2P_MEDIANA,
    P2P_MEJOR_PRECIO,
    P2P_MERCHANTS_PCT,
    P2P_MOMENTUM_BID_3H_PCT,
    P2P_OUTLIERS_PCT,
    P2P_RATIO_OFERTA_DEMANDA,
    P2P_SPREAD_PCT,
    P2P_VWAP,
    Indicador,
    nombre_por_lado,
)
from indicator_engine.domain.reglas import Ruleset, Senal, evaluar_reglas

logger = logging.getLogger("indicator_engine")

# La brecha se calcula contra la tasa oficial de esta moneda (par USDT/VES →
# el proxy oficial es el USD del BCV).
MONEDA_OFICIAL_REFERENCIA = "USD"


class ProcesarSnapshotP2P:
    def __init__(
        self,
        publisher: EventPublisher,
        repository: IndicatorRepository,
        calc_version: int = 1,
        umbral_stale: timedelta = timedelta(hours=6),
        ventana_momentum: timedelta = timedelta(hours=3),
        ventana_drenaje: timedelta = timedelta(hours=6),
        # Más viejo que esto, el lado opuesto pertenece a otra época del mercado
        # (p. ej. tras una pausa de captura): spread/ratio se omiten.
        tolerancia_lado_opuesto: timedelta = timedelta(minutes=15),
        # Holgura al buscar el punto histórico de una ventana móvil: si el punto
        # más cercano es más viejo que ventana + holgura, hubo un hueco de
        # captura y la variación no es comparable.
        holgura_ventana: timedelta = timedelta(hours=1),
        # Motor de reglas de señales (RF-4). None → el motor no emite señales
        # (p. ej. sin ruleset cargado); el resto del cálculo es idéntico.
        ruleset: Ruleset | None = None,
        # Antigüedad máxima de un indicador para contar como vigente al evaluar
        # reglas: evita disparar señales con microestructura rancia.
        max_age_indicadores: timedelta = timedelta(minutes=20),
    ) -> None:
        self._publisher = publisher
        self._repository = repository
        self._calc_version = calc_version
        self._umbral_stale = umbral_stale
        self._ventana_momentum = ventana_momentum
        self._ventana_drenaje = ventana_drenaje
        self._tolerancia_opuesto = tolerancia_lado_opuesto
        self._holgura_ventana = holgura_ventana
        self._ruleset = ruleset
        self._max_age = max_age_indicadores
        self._cooldown = (
            timedelta(minutes=ruleset.cooldown_min) if ruleset else timedelta()
        )

    async def ejecutar(self, snap: SnapshotP2PRecibido) -> ResultadoProcesamiento:
        if await self._repository.ya_procesado(snap.event_id):
            return ResultadoProcesamiento(duplicado=True)

        referencia = calcular_referencia_p2p(snap.anuncios)
        indicadores = [
            self._indicador(nombre_por_lado(P2P_MEDIANA, snap.side), snap, referencia.mediana),
            self._indicador(nombre_por_lado(P2P_VWAP, snap.side), snap, referencia.vwap),
            self._indicador(
                nombre_por_lado(P2P_MEJOR_PRECIO, snap.side), snap, referencia.mejor_precio
            ),
            self._indicador(nombre_por_lado(P2P_LIQUIDEZ, snap.side), snap, referencia.liquidez),
            self._indicador(
                nombre_por_lado(P2P_MERCHANTS_PCT, snap.side), snap, referencia.merchants_pct
            ),
            self._indicador(
                nombre_por_lado(P2P_OUTLIERS_PCT, snap.side), snap, referencia.outliers_pct
            ),
        ]

        official_stale = False
        if referencia.confianza_baja:
            logger.warning(
                "snapshot %s %s con confianza baja (%.1f%% outliers): señales suprimidas",
                snap.event_id,
                snap.side,
                referencia.outliers_pct,
            )
        else:
            official_stale = await self._agregar_brecha(snap, referencia.mediana, indicadores)
            await self._agregar_microestructura(snap, referencia, indicadores)
            await self._agregar_ventanas(snap, referencia, indicadores)

        await self._repository.guardar(indicadores)
        await self._publisher.publish_indicators_updated(
            indicadores,
            official_stale=official_stale,
            triggered_by=snap.event_id,
            as_of=snap.capturado_en,
        )

        # Señales (RF-4): solo con ruleset y confianza suficiente — nunca desde
        # datos low_confidence (el precio degradado ya se publicó marcado arriba).
        senales: list[Senal] = []
        if self._ruleset is not None and not referencia.confianza_baja:
            senales = await self._evaluar_senales(snap, indicadores)

        await self._repository.marcar_procesado(snap.event_id, "p2p.snapshot")
        return ResultadoProcesamiento(
            indicadores=indicadores, official_stale=official_stale, senales=senales
        )

    async def _evaluar_senales(self, snap, indicadores) -> list[Senal]:
        """Evalúa el ruleset contra los indicadores vigentes y emite las señales
        que disparan, respetando el cooldown por tipo (dedup, RF-4/A08)."""
        vista = await self._vista_vigente(snap, indicadores)
        emitidas: list[Senal] = []
        for disparo in evaluar_reglas(self._ruleset, vista):
            desde = snap.capturado_en - self._cooldown
            if await self._repository.senal_reciente(disparo.tipo, snap.fiat, desde):
                logger.info(
                    "señal %s (%s) suprimida por cooldown", disparo.tipo, snap.fiat
                )
                continue
            emitidas.append(
                Senal(
                    tipo=disparo.tipo,
                    direccion=disparo.direccion,
                    moneda=snap.fiat,
                    as_of=snap.capturado_en,
                    calc_version=self._calc_version,
                    triggered_by=snap.event_id,
                    regla=disparo.regla,
                    inputs=disparo.inputs,
                )
            )
        if emitidas:
            await self._repository.guardar_senales(emitidas)
            for senal in emitidas:
                await self._publisher.publish_signal_emitted(senal)
                logger.info(
                    "señal emitida: %s (%s) regla=%s", senal.tipo, senal.moneda, senal.regla
                )
        return emitidas

    async def _vista_vigente(self, snap, indicadores) -> dict[str, Decimal]:
        """Valores vigentes de los indicadores que referencia el ruleset: los del
        lote actual (`as_of` = ahora) más los últimos conocidos aún frescos
        (≤ `max_age`). Un indicador ausente o rancio no entra — su regla no dispara."""
        referenciados = {
            cond.indicador for regla in self._ruleset.reglas for cond in regla.condiciones
        }
        del_lote = {i.nombre: i.valor for i in indicadores}
        vista: dict[str, Decimal] = {}
        for nombre in referenciados:
            if nombre in del_lote:
                vista[nombre] = del_lote[nombre]
                continue
            ind = await self._repository.ultimo_indicador(nombre, snap.fiat)
            if ind is not None and snap.capturado_en - ind.as_of <= self._max_age:
                vista[nombre] = ind.valor
        return vista

    async def _agregar_brecha(self, snap, mediana, indicadores) -> bool:
        """Brecha del lado vs la última tasa oficial conocida (as-of, ADR-0009).
        Retorna la bandera `official_stale` (ADR-0007); sin tasa → True y sin brecha."""
        oficial = await self._repository.ultimo_indicador(
            OFFICIAL_RATE, MONEDA_OFICIAL_REFERENCIA
        )
        if oficial is None:
            return True
        brecha = calcular_brecha(mediana, oficial.valor)
        indicadores.append(
            self._indicador(nombre_por_lado(P2P_BRECHA_ABS, snap.side), snap, brecha.gap_abs)
        )
        indicadores.append(
            self._indicador(nombre_por_lado(P2P_BRECHA_PCT, snap.side), snap, brecha.gap_pct)
        )
        return snap.capturado_en - oficial.as_of > self._umbral_stale

    async def _agregar_microestructura(self, snap, referencia, indicadores) -> None:
        """Spread y ratio O/D con el último lado opuesto, solo si está fresco."""
        lado_opuesto = "SELL" if snap.side == "BUY" else "BUY"
        mediana_op = await self._repository.ultimo_indicador(
            nombre_por_lado(P2P_MEDIANA, lado_opuesto), snap.fiat
        )
        liquidez_op = await self._repository.ultimo_indicador(
            nombre_por_lado(P2P_LIQUIDEZ, lado_opuesto), snap.fiat
        )
        if mediana_op is None or liquidez_op is None:
            return
        if snap.capturado_en - mediana_op.as_of > self._tolerancia_opuesto:
            logger.info(
                "lado opuesto %s viejo (%s): spread/ratio omitidos",
                lado_opuesto,
                mediana_op.as_of.isoformat(),
            )
            return

        if snap.side == "BUY":
            spread = calcular_spread_pct(referencia.mediana, mediana_op.valor)
            ratio = calcular_ratio_oferta_demanda(referencia.liquidez, liquidez_op.valor)
        else:
            spread = calcular_spread_pct(mediana_op.valor, referencia.mediana)
            ratio = calcular_ratio_oferta_demanda(liquidez_op.valor, referencia.liquidez)
        indicadores.append(self._indicador(P2P_SPREAD_PCT, snap, spread))
        indicadores.append(self._indicador(P2P_RATIO_OFERTA_DEMANDA, snap, ratio))

    async def _agregar_ventanas(self, snap, referencia, indicadores) -> None:
        """Ventanas móviles sobre el histórico propio: momentum del bid (SELL, 3 h)
        y drenaje de oferta (BUY, 6 h). Con hueco de captura no son comparables."""
        if snap.side == "SELL":
            nombre_base, nombre_salida, ventana, valor_actual = (
                nombre_por_lado(P2P_MEDIANA, "SELL"),
                P2P_MOMENTUM_BID_3H_PCT,
                self._ventana_momentum,
                referencia.mediana,
            )
        else:
            nombre_base, nombre_salida, ventana, valor_actual = (
                nombre_por_lado(P2P_LIQUIDEZ, "BUY"),
                P2P_DRENAJE_OFERTA_6H_PCT,
                self._ventana_drenaje,
                referencia.liquidez,
            )

        objetivo = snap.capturado_en - ventana
        historico = await self._repository.indicador_asof(nombre_base, snap.fiat, objetivo)
        if historico is None or historico.as_of < objetivo - self._holgura_ventana:
            return
        if historico.valor <= 0:
            return
        variacion = calcular_variacion(valor_actual, historico.valor)
        indicadores.append(self._indicador(nombre_salida, snap, variacion.delta_pct))

    def _indicador(self, nombre: str, snap: SnapshotP2PRecibido, valor) -> Indicador:
        return Indicador(
            nombre=nombre,
            moneda=snap.fiat,
            valor=valor,
            as_of=snap.capturado_en,
            calc_version=self._calc_version,
        )
