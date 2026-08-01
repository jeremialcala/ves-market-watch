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
from indicator_engine.domain.comparativas import ConfigComparativas
from indicator_engine.domain.lectura import (
    INDICADOR_BRECHA_BUY,
    LADO_POR_INDICADOR,
    ConfigLectura,
    HistoriaLado,
    Lectura,
    Variaciones,
    construir_historia,
    construir_lectura,
)
from indicator_engine.domain.models import (
    MONEDA_OFICIAL_REFERENCIA,
    OFFICIAL_RATE,
    P2P_MEDIANA,
    nombre_por_lado,
)
from indicator_engine.domain.reglas import Ruleset, evaluar_proximidad

logger = logging.getLogger("indicator_engine")

# La pierna paralela de la brecha buy: `p2p_brecha_pct_buy` se calcula contra
# esta mediana, así que es la que hay que medir para atribuir su movimiento.
INDICADOR_PARALELO = nombre_por_lado(P2P_MEDIANA, "BUY")


class AnalizarRevision:
    def __init__(
        self,
        config: ConfigAnalisis,
        ruleset: Ruleset,
        distribuciones: DistribucionRepository,
        repository: IndicatorRepository,
        publisher: EventPublisher,
        # Config de la lectura del mercado (RF-7). None ⇒ se publica el análisis
        # igual, sin `reading`: el panel de medidores no depende de esto.
        config_lectura: ConfigLectura | None = None,
        # Comparativa de la brecha contra su historia (RF-7). None ⇒ la lectura
        # se publica sin ella; el resto del análisis no depende de esto.
        config_comparativas: ConfigComparativas | None = None,
    ) -> None:
        self._config = config
        self._ruleset = ruleset
        self._distribuciones = distribuciones
        self._repository = repository
        self._publisher = publisher
        self._config_lectura = config_lectura
        self._config_comparativas = config_comparativas

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
        lectura = await self._construir_lectura(
            analisis=analisis,
            vista=vista,
            as_of=as_of,
            moneda=moneda,
            confianza_baja=confianza_baja,
            official_stale=official_stale,
        )
        evento = construir_evento_analisis(analisis, lectura)

        await self._repository.guardar_analisis(analisis, evento["payload"])
        await self._publisher.publish_analysis_updated(evento)
        logger.info(
            "análisis publicado: %s %s — %d medidor(es), escala=%s, más cerca=%s, "
            "régimen=%s",
            moneda,
            as_of.isoformat(),
            len(analisis.indicadores),
            analisis.fuente_escala,
            analisis.sintesis.regla_mas_cercana,
            lectura.regimen if lectura else "(sin lectura)",
        )
        return evento

    async def _construir_lectura(
        self, *, analisis, vista, as_of, moneda, confianza_baja, official_stale
    ) -> Lectura | None:
        if self._config_lectura is None:
            return None
        variaciones = await self._medir_variaciones(vista, as_of, moneda)
        historia = await self._medir_historia(vista, as_of, moneda)
        return construir_lectura(
            config=self._config_lectura,
            indicadores=analisis.indicadores,
            sintesis=analisis.sintesis,
            variaciones=variaciones,
            confianza_baja=confianza_baja,
            official_stale=official_stale,
            historia=historia,
            config_comparativas=self._config_comparativas,
        )

    async def _medir_historia(
        self, vista: Mapping[str, Decimal], as_of: datetime, moneda: str
    ) -> list[HistoriaLado]:
        """La brecha de cada lado contra su propia historia.

        Los dos lados se piden en la MISMA consulta —el puerto acepta varios
        nombres— para que añadir el segundo no duplique el coste.

        El valor de hoy sale de la vista vigente, no del histórico: es el mismo
        número que el resto del análisis publica, así que la tarjeta no puede
        pintar un «hoy» que contradiga a su propio titular.
        """
        if self._config_comparativas is None:
            return []
        agregados = await self._distribuciones.agregados(
            list(LADO_POR_INDICADOR),
            moneda,
            self._config_comparativas.ventanas_dias,
            as_of,
        )
        historia: list[HistoriaLado] = []
        for indicador, lado in LADO_POR_INDICADOR.items():
            actual = await self._valor_de_hoy(indicador, moneda, vista)
            construida = construir_historia(
                lado, actual, agregados.get(indicador), self._config_comparativas
            )
            if construida is not None:
                historia.append(construida)
        return historia

    async def _valor_de_hoy(
        self, indicador: str, moneda: str, vista: Mapping[str, Decimal]
    ) -> Decimal | None:
        """La vista primero; el histórico solo si el indicador no está en ella.

        La brecha de COMPRA sí está en la vista y de ahí tiene que salir: es la
        cifra que el resto del análisis publica, y si la tarjeta la tomara de
        otro sitio podría contradecir a su propio titular.

        La de VENTA no es medidor del panel ni la consume el ruleset, así que no
        entra en la vista vigente. Se lee del histórico —el motor la acaba de
        escribir en esta misma revisión— en vez de ampliar la vista, que
        cambiaría el payload del análisis para todos sin que nadie lo pida.
        """
        if (valor := vista.get(indicador)) is not None:
            return valor
        ultimo = await self._repository.ultimo_indicador(indicador, moneda)
        return ultimo.valor if ultimo is not None else None

    async def _medir_variaciones(
        self, vista: Mapping[str, Decimal], as_of: datetime, moneda: str
    ) -> Variaciones:
        """Δbrecha y las dos piernas que la explican, sobre la ventana.

        Nada de SQL nuevo: `indicador_asof` ya resuelve «último valor con
        as_of <= momento» para cualquier indicador, que es exactamente el patrón
        de las ventanas móviles del motor. Aquí se usa además sobre
        `official_rate`, que el motor solo leía en presente.

        Unidades a propósito distintas: la brecha en PUNTOS PORCENTUALES (que es
        lo que clasifica el eje) y las dos piernas en VES absolutos, la única
        unidad donde `Δbrecha_abs = Δparalelo − Δoficial` es exacta.
        """
        cfg = self._config_lectura
        objetivo = as_of - timedelta(hours=cfg.ventana_horas)
        limite = objetivo - timedelta(hours=cfg.holgura_horas)

        async def delta(
            nombre: str, mon: str, actual: Decimal | None, *, continua: bool = True
        ) -> Decimal | None:
            """`continua`: la serie se persiste en cada revisión (todo lo `p2p_*`).

            Ahí una fila vieja significa HUECO DE CAPTURA y la variación no es
            comparable, así que se omite en vez de estirarse.

            `official_rate` no es continua: el ingestor sondea cada 30 min y
            persiste **solo cuando la tasa cambia**, de modo que una fila vieja
            no es un hueco, es una meseta — y `Δ = 0` es exactamente el dato que
            la atribución necesita. Aplicarle la guarda apagaría la atribución
            casi siempre, que es justo el caso que esta lectura existe para
            describir. Lo que sí invalida esa serie —que el BCV lleve demasiado
            sin publicar— ya lo cubre `official_stale`, y con él la atribución se
            calla entera.
            """
            if actual is None:
                return None
            previo = await self._repository.indicador_asof(nombre, mon, objetivo)
            if previo is None:
                return None
            if continua and previo.as_of < limite:
                return None
            return actual - previo.valor

        async def nivel_actual(nombre: str, mon: str) -> Decimal | None:
            ind = await self._repository.ultimo_indicador(nombre, mon)
            return ind.valor if ind is not None else None

        return Variaciones(
            brecha_pp=await delta(
                INDICADOR_BRECHA_BUY, moneda, vista.get(INDICADOR_BRECHA_BUY)
            ),
            paralelo=await delta(
                INDICADOR_PARALELO, moneda, await nivel_actual(INDICADOR_PARALELO, moneda)
            ),
            oficial=await delta(
                OFFICIAL_RATE,
                MONEDA_OFICIAL_REFERENCIA,
                await nivel_actual(OFFICIAL_RATE, MONEDA_OFICIAL_REFERENCIA),
                continua=False,
            ),
        )
