"""Casos de uso de lectura: arman las respuestas del contrato REST
(openapi.yaml) desde el repositorio de solo lectura. Sin HTTP aquí: los
adaptadores traducen estos dicts/None a respuestas y 404.

Convención de datos: los indicadores P2P viven en la hypertable `indicators`
con currency = fiat del par (VES); la brecha se calcula contra la tasa
oficial USD (ADR-0014). Un indicador más viejo que la frescura configurada
no se sirve como vigente — nunca se presenta dato rancio como actual (A10).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from api_gateway.application.ports import LecturaRepository
from api_gateway.domain.paginacion import Pagina, meta_pagina
from api_gateway.domain.profundidad import calcular_profundidad

FIAT_P2P = "VES"
MONEDA_BRECHA = "USD"  # la pierna oficial del par USDT/VES (ADR-0014)
UMBRAL_CONFIANZA_BAJA_PCT = Decimal("30")


def _por_lado(nombre: str, side: str) -> str:
    return f"{nombre}_{side.lower()}"


class ConsultarTasaOficialVigente:
    def __init__(self, repo: LecturaRepository, umbral_stale: timedelta) -> None:
        self._repo = repo
        self._umbral = umbral_stale

    async def ejecutar(self, currency: str) -> dict | None:
        fila = await self._repo.tasa_oficial_vigente(currency)
        if fila is None:
            return None
        captured_at: datetime = fila["captured_at"]
        return {
            "currency": fila["currency"],
            "rate": fila["rate"],
            "value_date": fila["value_date"].isoformat(),
            "captured_at": captured_at.isoformat(),
            "stale": datetime.now(UTC) - captured_at > self._umbral,
        }


class ConsultarHistoricoTasaOficial:
    def __init__(self, repo: LecturaRepository) -> None:
        self._repo = repo

    async def ejecutar(
        self, currency: str, desde: date, hasta: date, pagina: Pagina
    ) -> dict:
        filas, total = await self._repo.historial_tasa_oficial(
            currency, desde, hasta, pagina.offset, pagina.tamano
        )
        return {
            "data": [
                {
                    "currency": f["currency"],
                    "rate": f["rate"],
                    "value_date": f["value_date"].isoformat(),
                    "captured_at": f["captured_at"].isoformat(),
                }
                for f in filas
            ],
            "pagination": meta_pagina(pagina, len(filas), total),
        }


class ConsultarReferenciaP2P:
    def __init__(self, repo: LecturaRepository, frescura: timedelta) -> None:
        self._repo = repo
        self._frescura = frescura

    async def ejecutar(self, side: str) -> dict | None:
        nombres = [
            _por_lado(n, side)
            for n in (
                "p2p_mejor_precio",
                "p2p_mediana",
                "p2p_vwap",
                "p2p_liquidez",
                "p2p_outliers_pct",
            )
        ]
        vigentes = await self._repo.indicadores_vigentes(nombres, FIAT_P2P)
        requeridos = nombres[:4]  # outliers_pct puede faltar en snapshots viejos
        if any(n not in vigentes for n in requeridos):
            return None
        as_of = max(vigentes[n]["as_of"] for n in requeridos)
        if datetime.now(UTC) - as_of > self._frescura:
            return None
        outliers = vigentes.get(_por_lado("p2p_outliers_pct", side))
        confianza_baja = (
            outliers is not None
            and Decimal(outliers["value"]) > UMBRAL_CONFIANZA_BAJA_PCT
        )
        return {
            "side": side,
            "best_price": vigentes[_por_lado("p2p_mejor_precio", side)]["value"],
            "median": vigentes[_por_lado("p2p_mediana", side)]["value"],
            "vwap": vigentes[_por_lado("p2p_vwap", side)]["value"],
            "volume": vigentes[_por_lado("p2p_liquidez", side)]["value"],
            "as_of": as_of.isoformat(),
            "confidence": "low" if confianza_baja else "normal",
        }


class ConsultarIndicadoresVigentes:
    """Vista `Indicators` del contrato: núcleo oficial + resumen P2P.

    La brecha servida es la del lado buy (comprar USDT con VES) — la
    referencia de compra del paralelo; `spread_pct` es la microestructura
    entre lados (ADR-0014). Campos P2P en null si la moneda no es USD o no
    hay snapshot P2P fresco.
    """

    def __init__(
        self,
        repo: LecturaRepository,
        umbral_stale: timedelta,
        frescura_p2p: timedelta,
    ) -> None:
        self._repo = repo
        self._umbral = umbral_stale
        self._frescura = frescura_p2p

    async def ejecutar(self, currency: str) -> dict | None:
        oficial = await self._repo.indicadores_vigentes(["official_rate"], currency)
        fila_oficial = oficial.get("official_rate")
        if fila_oficial is None:
            return None
        tasa = await self._repo.tasa_oficial_vigente(currency)
        official_stale = (
            tasa is None
            or datetime.now(UTC) - tasa["captured_at"] > self._umbral
        )
        respuesta: dict = {
            "currency": currency,
            "as_of": fila_oficial["as_of"].isoformat(),
            "calc_version": fila_oficial["calc_version"],
            "official_stale": official_stale,
            "gap_abs": None,
            "gap_pct": None,
            "spread_pct": None,
            "volumes": None,
        }
        if currency != MONEDA_BRECHA:
            return respuesta

        nombres = [
            "p2p_brecha_abs_buy",
            "p2p_brecha_pct_buy",
            "p2p_spread_pct",
            "p2p_liquidez_buy",
            "p2p_liquidez_sell",
        ]
        p2p = await self._repo.indicadores_vigentes(nombres, FIAT_P2P)
        limite = datetime.now(UTC) - self._frescura
        frescos = {n: f for n, f in p2p.items() if f["as_of"] >= limite}
        if frescos:
            respuesta["as_of"] = max(
                fila_oficial["as_of"], *(f["as_of"] for f in frescos.values())
            ).isoformat()
        if "p2p_brecha_abs_buy" in frescos:
            respuesta["gap_abs"] = frescos["p2p_brecha_abs_buy"]["value"]
        if "p2p_brecha_pct_buy" in frescos:
            respuesta["gap_pct"] = frescos["p2p_brecha_pct_buy"]["value"]
        if "p2p_spread_pct" in frescos:
            respuesta["spread_pct"] = frescos["p2p_spread_pct"]["value"]
        if "p2p_liquidez_buy" in frescos and "p2p_liquidez_sell" in frescos:
            respuesta["volumes"] = {
                "buy": frescos["p2p_liquidez_buy"]["value"],
                "sell": frescos["p2p_liquidez_sell"]["value"],
            }
        return respuesta


class ConsultarHistoricoIndicadores:
    def __init__(self, repo: LecturaRepository) -> None:
        self._repo = repo

    async def ejecutar(
        self,
        desde: datetime,
        hasta: datetime,
        intervalo: str,
        pagina: Pagina,
        indicador: str | None = None,
        moneda: str | None = None,
    ) -> dict:
        filas, total = await self._repo.historial_indicadores(
            desde, hasta, intervalo, indicador, moneda, pagina.offset, pagina.tamano
        )
        return {
            "data": [
                {
                    "as_of": f["as_of"].isoformat(),
                    "indicator": f["indicator"],
                    "currency": f["currency"],
                    "value": f["value"],
                    "calc_version": f["calc_version"],
                }
                for f in filas
            ],
            "pagination": meta_pagina(pagina, len(filas), total),
            "interval": intervalo,
        }


class ConsultarProfundidad:
    def __init__(
        self, repo: LecturaRepository, band_pct: Decimal, niveles: int
    ) -> None:
        self._repo = repo
        self._band_pct = band_pct
        self._niveles = niveles

    async def ejecutar(self, side: str) -> dict | None:
        snap = await self._repo.snapshot_p2p_reciente(side.upper())
        if snap is None:
            return None
        return {
            "side": side,
            "as_of": snap["captured_at"].isoformat(),
            "levels": calcular_profundidad(
                snap["items"], side, self._band_pct, self._niveles
            ),
        }


class ConsultarAnalisisVigente:
    """Última lectura de los medidores del panel (RF-6, ADR-0019).

    Devuelve el payload **tal como se publicó**: el gateway no reclasifica
    bandas ni recalcula escalas. Hacerlo abriría una segunda fuente de verdad
    sobre la lectura del panel, y dos fuentes que se contradicen es peor que
    ninguna. Mismo criterio de frescura que `/rates/p2p/current`: una revisión
    más vieja que la frescura P2P no se sirve como vigente (A10).
    """

    def __init__(self, repo: LecturaRepository, frescura: timedelta) -> None:
        self._repo = repo
        self._frescura = frescura

    async def ejecutar(self, currency: str) -> dict | None:
        fila = await self._repo.analisis_vigente(currency)
        if fila is None:
            return None
        as_of: datetime = fila["as_of"]
        if datetime.now(UTC) - as_of > self._frescura:
            return None
        return fila["payload"]


class ConsultarSenales:
    def __init__(self, repo: LecturaRepository) -> None:
        self._repo = repo

    async def ejecutar(
        self, desde: datetime, hasta: datetime, tipo: str | None, pagina: Pagina
    ) -> dict:
        filas, total = await self._repo.senales(
            desde, hasta, tipo, pagina.offset, pagina.tamano
        )
        return {
            "data": [
                {
                    "type": f["type"],
                    "direction": f["direction"],
                    "currency": f["currency"],
                    "as_of": f["as_of"].isoformat(),
                    "emitted_at": f["emitted_at"].isoformat(),
                    "calc_version": f["calc_version"],
                    "triggered_by": f["triggered_by"],
                    "evidence": f["evidence"],
                }
                for f in filas
            ],
            "pagination": meta_pagina(pagina, len(filas), total),
        }
