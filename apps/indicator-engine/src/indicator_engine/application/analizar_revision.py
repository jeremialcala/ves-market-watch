"""Análisis de la revisión (RF-6) — colaborador de `ProcesarSnapshotP2P`.

Vive aparte para que el caso de uso principal no engorde: aquí se orquesta la
consulta de distribuciones (cacheada), el dominio puro de `domain/analisis.py` y
la construcción del documento que se persiste y se publica.

El documento se construye UNA vez: el sobre completo sale al bus y su `payload`
—el documento en sí— se guarda verbatim en la tabla, así
`GET /api/v1/analysis/current` devuelve exactamente lo que viajó por el exchange
(ADR-0019). El sobre no se persiste porque `event_id`/`occurred_at` son metadatos
de esa emisión concreta, no parte del recurso.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Mapping

from indicator_engine.adapters.amqp.publisher import construir_evento_analisis
from indicator_engine.application.ports import (
    DistribucionRepository,
    EventPublisher,
    IndicatorRepository,
)
from indicator_engine.domain.analisis import ConfigAnalisis, construir_analisis
from indicator_engine.domain.reglas import Ruleset, evaluar_proximidad

logger = logging.getLogger("indicator_engine")


class AnalizarRevision:
    def __init__(
        self,
        config: ConfigAnalisis,
        ruleset: Ruleset,
        distribuciones: DistribucionRepository,
        repository: IndicatorRepository,
        publisher: EventPublisher,
    ) -> None:
        self._config = config
        self._ruleset = ruleset
        self._distribuciones = distribuciones
        self._repository = repository
        self._publisher = publisher

    def nombres_requeridos(self) -> set[str]:
        """Indicadores que la vista vigente debe traer: los seis del panel más
        los que referencia el ruleset.

        Es un superconjunto de lo que necesitan las señales, y eso es inocuo:
        `evaluar_reglas` solo lee los nombres que sus condiciones referencian
        (blindado con `test_la_vista_ampliada_no_cambia_las_senales_emitidas`).
        """
        del_ruleset = {
            cond.indicador
            for regla in self._ruleset.reglas
            for cond in regla.condiciones
        }
        return set(self._config.nombres) | del_ruleset

    async def ejecutar(
        self,
        *,
        vista: Mapping[str, Decimal],
        as_of_por_indicador: Mapping[str, datetime],
        as_of: datetime,
        moneda: str,
        triggered_by: str,
        calc_version: int,
        confianza_baja: bool,
        official_stale: bool,
    ) -> dict:
        desde = as_of - timedelta(days=self._config.ventana_dias)
        distribuciones = await self._distribuciones.distribuciones(
            self._config.nombres, moneda, desde, self._config.fracciones
        )

        # Con confianza baja SÍ se emite análisis —la lectura de cada medidor
        # sigue siendo válida— pero ninguna regla es evaluable: si las señales
        # están suprimidas, hablar de proximidad engañaría.
        proximidad = evaluar_proximidad(
            self._ruleset, vista, evaluable=not confianza_baja
        )
        analisis = construir_analisis(
            config=self._config,
            ruleset=self._ruleset,
            vista=vista,
            as_of_por_indicador=as_of_por_indicador,
            distribuciones=distribuciones,
            proximidad=proximidad,
            as_of=as_of,
            moneda=moneda,
            calc_version=calc_version,
            triggered_by=triggered_by,
            confianza_baja=confianza_baja,
            official_stale=official_stale,
        )
        evento = construir_evento_analisis(analisis)

        await self._repository.guardar_analisis(analisis, evento["payload"])
        await self._publisher.publish_analysis_updated(evento)
        logger.info(
            "análisis publicado: %s %s — %d medidor(es), escala=%s, más cerca=%s",
            moneda,
            as_of.isoformat(),
            len(analisis.indicadores),
            analisis.fuente_escala,
            analisis.sintesis.regla_mas_cercana,
        )
        return evento
