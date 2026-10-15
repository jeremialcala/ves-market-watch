"""Lectura pública del portal: el snapshot y las series (ADR-0028).

**Lista blanca, campo a campo** (ADR-0028 §6). Nada de lo que sale de aquí es
un objeto de `/api/v1` o de la base reenviado entero: cada función copia los
campos que el contrato `docs/portal-openapi.yaml` declara y nada más. Un campo
nuevo en el análisis del motor, o en una fila, **no llega al portal** hasta
que alguien lo añada aquí y al contrato a la vez. Ningún `merchant_ref`, ningún
identificador de anunciante: solo agregados.

**La forma la dicta la página** (§1). El snapshot es todo lo que el Dashboard y
la landing pintan «ahora», en una respuesta. Las series van aparte, con
ventanas fijas, porque cambian más despacio y pesan más.

Sin datos no es un error (RF-5 de la ingesta): cada bloque sale en `null` y el
portal dice «sin datos» en ese panel.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from api_gateway.application.ports import LecturaRepository
from api_gateway.domain.paginacion import Pagina

# Las cinco que publica el BCV y captura el ingestor (consultado en la base el
# 2026-10-14: `official_rate` tiene USD, EUR, CNY, TRY y RUB).
MONEDAS_OFICIALES = ("USD", "EUR", "CNY", "TRY", "RUB")
LADOS = ("buy", "sell")
FIAT_P2P = "VES"
DIAS_SENALES = 30
MAX_SENALES = 500


# -- lista blanca ------------------------------------------------------------


def _solo(origen: Mapping[str, Any] | None, campos: Iterable[str]) -> dict[str, Any]:
    """Copia de `origen` solo `campos`. Los que falten salen en `None`."""
    origen = origen or {}
    return {campo: origen.get(campo) for campo in campos}


def _lista(
    origen: Iterable[Mapping[str, Any]] | None, copiar: Callable[[Mapping[str, Any]], dict]
) -> list[dict]:
    return [copiar(item) for item in (origen or [])]


# Las claves de `data` de los claims de la lectura que el motor emite hoy
# (`indicator_engine/domain/lectura.py`). Todas son cadenas.
_CLAVES_CLAIM = (
    "lado", "ventana", "dias", "referencia", "posicion", "delta_pp", "tipo",
    "direccion", "horas", "responsable", "paralelo", "oficial", "indicador",
    "banda", "regla", "cumplidas", "totales",
)


def _claim(claim: Mapping[str, Any]) -> dict:
    datos = claim.get("data") or {}
    return {
        "code": claim.get("code"),
        "data": {k: datos[k] for k in _CLAVES_CLAIM if k in datos},
    }


def _regla_en_medidor(regla: Mapping[str, Any]) -> dict:
    return _solo(
        regla,
        ("rule", "type", "direction", "op", "threshold", "met", "distance", "threshold_position"),
    )


def _escala(escala: Mapping[str, Any] | None) -> dict:
    escala = escala or {}
    return {
        "source": escala.get("source"),
        "window_days": escala.get("window_days"),
        "domain": _solo(escala.get("domain"), ("min", "max")),
        "cuts": _lista(escala.get("cuts"), lambda c: _solo(c, ("key", "value", "position"))),
    }


def _medidor(medidor: Mapping[str, Any]) -> dict:
    return {
        **_solo(medidor, ("indicator", "value", "as_of", "band", "position")),
        "scale": _escala(medidor.get("scale")),
        "rules": _lista(medidor.get("rules"), _regla_en_medidor),
    }


def _condicion(condicion: Mapping[str, Any]) -> dict:
    return _solo(condicion, ("indicator", "op", "threshold", "value", "met", "distance"))


def _proximidad(regla: Mapping[str, Any]) -> dict:
    return {
        **_solo(
            regla,
            (
                "rule", "type", "direction", "conditions_total", "conditions_met",
                "evaluable", "blocked_by",
            ),
        ),
        "conditions": _lista(regla.get("conditions"), _condicion),
    }


def _historia(lado: Mapping[str, Any]) -> dict:
    return {
        **_solo(lado, ("side", "current")),
        "references": _lista(
            lado.get("references"),
            lambda r: _solo(r, ("days_configured", "days_covered", "mean", "max", "min")),
        ),
    }


def _analisis(payload: Mapping[str, Any] | None) -> dict | None:
    """El análisis del motor, sin `triggered_by` (un id interno de evento) ni
    los riesgos, que hablan de calibración interna."""
    if payload is None:
        return None
    lectura = payload.get("reading")
    historia = payload.get("gap_history")
    piernas = payload.get("gap_legs")
    return {
        **_solo(payload, ("as_of", "confidence", "official_stale")),
        "reading": None
        if lectura is None
        else {
            **_solo(
                lectura,
                ("regime", "axis_movement", "axis_gap", "window_hours", "gauges_near_threshold"),
            ),
            "claims": _lista(lectura.get("claims"), _claim),
        },
        "summary": _solo(
            payload.get("summary"),
            (
                "rules_total", "rules_evaluable", "closest_rule", "conditions_met",
                "conditions_total", "blocked_by",
            ),
        ),
        "indicators": _lista(payload.get("indicators"), _medidor),
        "rule_proximity": _lista(payload.get("rule_proximity"), _proximidad),
        "gap_history": None
        if historia is None
        else {"sides": _lista(historia.get("sides"), _historia)},
        "gap_legs": None
        if piernas is None
        else _solo(piernas, ("hours", "official", "parallel", "responsible", "official_share")),
    }


def _referencia_p2p(ref: Mapping[str, Any] | None, calidad: Mapping[str, Any]) -> dict | None:
    """`best_price` es el top of book literal, sin filtrar (calculos.py del
    motor); `best_price_filtered`, el mejor que sobrevive al filtro de outliers.
    El portal pinta el filtrado y enseña el otro solo cuando se separan: en
    SELL un anuncio descartado encabezó el 15 % de los snapshots del
    2026-10-15, hasta un 160 % por encima del VWAP."""
    if ref is None:
        return None
    return {
        **_solo(ref, ("best_price", "median", "vwap", "volume", "as_of", "confidence")),
        "best_price_filtered": calidad.get("best_price_filtered"),
        "outliers_pct": calidad.get("outliers_pct"),
        "merchants_pct": calidad.get("merchants_pct"),
    }


def _senal(fila: Mapping[str, Any]) -> dict:
    """Una señal de la cronología: qué, hacia dónde, cuándo y qué hizo la brecha
    después. Sin `evidence` (los valores de entrada) ni `triggered_by`: la
    cronología pública no los pinta. Y sin ningún «N de M» (RF-2)."""
    resultado = fila.get("outcome")
    return {
        **_solo(fila, ("type", "direction", "as_of", "emitted_at")),
        "outcome": None if resultado is None else _solo(resultado, ("hours", "gap_delta_pp")),
    }


def _mas_reciente(*momentos: str | None) -> str | None:
    """El `as_of` del snapshot: el dato más nuevo que trae. Es lo que el portal
    pinta como «actualizado hace N s» (ADR-0028 §5)."""
    validos = [datetime.fromisoformat(m) for m in momentos if m]
    return max(validos).isoformat() if validos else None


# -- casos de uso ------------------------------------------------------------


class ConsultarSnapshotPortal:
    """Compone los casos de uso de `/api/v1` que ya existen; no consulta la
    base por su cuenta salvo para la calidad P2P, que ninguno sirve."""

    def __init__(self, repo: LecturaRepository, consultas: Any) -> None:
        self._repo = repo
        self._c = consultas

    async def ejecutar(self) -> dict:
        ahora = datetime.now(UTC)
        (
            indicadores,
            analisis,
            *resto,
        ) = await asyncio.gather(
            self._c.indicadores.ejecutar("USD"),
            self._c.analisis.ejecutar(FIAT_P2P),
            *(self._c.referencia_p2p.ejecutar(lado) for lado in LADOS),
            *(self._c.profundidad.ejecutar(lado) for lado in LADOS),
            *(self._c.tasa_vigente.ejecutar(m) for m in MONEDAS_OFICIALES),
            self._calidad_p2p(),
            self._c.senales.ejecutar(
                ahora - timedelta(days=DIAS_SENALES), ahora, None, Pagina(1, MAX_SENALES)
            ),
        )
        refs = dict(zip(LADOS, resto[0:2]))
        profundidades = dict(zip(LADOS, resto[2:4]))
        tasas = [t for t in resto[4 : 4 + len(MONEDAS_OFICIALES)] if t is not None]
        calidad, senales = resto[-2], resto[-1]

        brecha = None
        if indicadores is not None and indicadores.get("gap_pct") is not None:
            brecha = {
                "side": "buy",
                "pct": indicadores["gap_pct"],
                "abs": indicadores["gap_abs"],
                "spread_pct": indicadores["spread_pct"],
                "as_of": indicadores["as_of"],
            }

        p2p = {lado: _referencia_p2p(refs[lado], calidad[lado]) for lado in LADOS}
        return {
            "as_of": _mas_reciente(
                None if brecha is None else brecha["as_of"],
                *(None if p2p[lado] is None else p2p[lado]["as_of"] for lado in LADOS),
                None if analisis is None else analisis.get("as_of"),
            ),
            "generated_at": ahora.isoformat(),
            "calc_version": None if indicadores is None else indicadores["calc_version"],
            "ruleset_version": None if analisis is None else analisis.get("ruleset_version"),
            "official_stale": None if indicadores is None else indicadores["official_stale"],
            "gap": brecha,
            "official_rates": [
                _solo(t, ("currency", "rate", "value_date", "captured_at", "stale")) for t in tasas
            ],
            "p2p": p2p,
            "analysis": _analisis(analisis),
            "depth": {
                lado: None
                if profundidades[lado] is None
                else {
                    "as_of": profundidades[lado]["as_of"],
                    "levels": _lista(
                        profundidades[lado]["levels"],
                        lambda n: _solo(n, ("price_band", "cum_volume")),
                    ),
                }
                for lado in LADOS
            },
            "signals": {
                "window_days": DIAS_SENALES,
                "items": _lista(senales["data"], _senal),
            },
        }

    async def _calidad_p2p(self) -> dict[str, dict]:
        """Outliers, cobertura de merchants y mejor precio filtrado por lado: la
        «calidad y procedencia del dato», que `/api/v1` no sirve. Agregados del
        snapshot, no hay nada por anunciante."""
        nombres = [
            *(f"p2p_{m}_pct_{lado}" for lado in LADOS for m in ("outliers", "merchants")),
            *(f"p2p_mejor_precio_filtrado_{lado}" for lado in LADOS),
        ]
        vigentes = await self._repo.indicadores_vigentes(nombres, FIAT_P2P)

        def valor(nombre: str) -> str | None:
            fila = vigentes.get(nombre)
            return None if fila is None else fila["value"]

        return {
            lado: {
                "outliers_pct": valor(f"p2p_outliers_pct_{lado}"),
                "merchants_pct": valor(f"p2p_merchants_pct_{lado}"),
                "best_price_filtered": valor(f"p2p_mejor_precio_filtrado_{lado}"),
            }
            for lado in LADOS
        }


# Ventanas fijas de las series (ADR-0028 §1): sin `from`/`to` ni intervalo
# libre. (nombre, indicador, días, intervalo)
SERIES = (
    # La sparkline de la brecha buy: 24 buckets de 1 h.
    ("gap_buy_24h", "p2p_brecha_pct_buy", 1, "1h"),
    # El mapa de calor: venta, que es el lado con historia larga (ADR-0013).
    ("gap_sell_14d", "p2p_brecha_pct_sell", 14, "1h"),
    ("gap_buy_30d", "p2p_brecha_pct_buy", 30, "1h"),
)
MAX_PUNTOS = 1000


class ConsultarSeriesPortal:
    def __init__(self, repo: LecturaRepository) -> None:
        self._repo = repo

    async def ejecutar(self) -> dict:
        ahora = datetime.now(UTC)

        async def serie(indicador: str, dias: int, intervalo: str) -> list[dict]:
            filas, _total = await self._repo.historial_indicadores(
                ahora - timedelta(days=dias), ahora, intervalo, indicador, FIAT_P2P, 0, MAX_PUNTOS
            )
            puntos = [
                {"t": f["as_of"].isoformat(), "value": f["value"]}
                for f in sorted(filas, key=lambda f: f["as_of"])
            ]
            return puntos

        resultados = await asyncio.gather(*(serie(i, d, iv) for _, i, d, iv in SERIES))
        return {
            "generated_at": ahora.isoformat(),
            "series": {
                nombre: {"indicator": indicador, "interval": intervalo, "days": dias, "points": puntos}
                for (nombre, indicador, dias, intervalo), puntos in zip(SERIES, resultados)
            },
        }
