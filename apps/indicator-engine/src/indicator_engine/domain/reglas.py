"""Motor de reglas de señales (RF-4): evalúa la microestructura vigente contra
un ruleset versionado y decide qué señales se disparan.

Puro y determinista: recibe una vista `{indicador: valor}` de los indicadores ya
considerados vigentes y devuelve las señales candidatas. La frescura de esa vista,
el cooldown anti-duplicados y la persistencia/publicación son de la aplicación.

Config: `config/senales.v1.yaml` (umbrales del backtest 11–20 jul, HITL 2026-07-22).
Contrato del evento: `schemas/signal.v1.json`. Contexto: ADR-0015.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Callable, Mapping

OPERADORES: dict[str, Callable[[Decimal, Decimal], bool]] = {
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
}

DIRECCIONES = {"alcista", "bajista", "neutral"}


class RulesetInvalido(Exception):
    """El archivo de reglas no cumple la forma esperada — el motor no arranca."""


@dataclass(frozen=True, slots=True)
class Condicion:
    indicador: str
    op: str
    umbral: Decimal

    def cumple(self, valor: Decimal) -> bool:
        return OPERADORES[self.op](valor, self.umbral)

    def distancia(self, valor: Decimal) -> Decimal:
        """Cuánto debe moverse `valor` EN LA DIRECCIÓN EXIGIDA para satisfacer
        la condición: `umbral - valor` con gt/gte, `valor - umbral` con lt/lte.

        <= 0 significa satisfecha. Con `gt`/`lt` estrictos, exactamente 0 es el
        borde: `cumple` es la autoridad sobre si está satisfecha o no; esto solo
        mide la separación. Nunca es una predicción de cuándo ocurrirá (RF-6).
        """
        if self.op in ("gt", "gte"):
            return self.umbral - valor
        return valor - self.umbral


@dataclass(frozen=True, slots=True)
class Regla:
    tipo: str
    direccion: str
    condiciones: tuple[Condicion, ...]


@dataclass(frozen=True, slots=True)
class Ruleset:
    version: int
    cooldown_min: int
    reglas: tuple[Regla, ...]


@dataclass(frozen=True, slots=True)
class SenalDisparada:
    """Resultado puro de evaluar el ruleset: qué regla disparó y con qué insumos."""

    tipo: str
    direccion: str
    regla: str  # p. ej. "techo_inminente@v1"
    inputs: dict[str, Decimal]


@dataclass(frozen=True, slots=True)
class CondicionEvaluada:
    """Una condición del ruleset medida contra la vista actual (RF-6).

    `valor is None` ⇒ el indicador no está vigente: no se rellena jamás con el
    último conocido rancio, y por eso `distancia` también es None.
    """

    condicion: Condicion
    valor: Decimal | None
    cumple: bool
    distancia: Decimal | None


@dataclass(frozen=True, slots=True)
class ProximidadRegla:
    """k de n condiciones de una regla y cuál la bloquea. Aritmética sobre el
    presente, no un pronóstico: la emisión real vive en `evaluar_reglas`."""

    tipo: str
    direccion: str
    regla: str  # p. ej. "techo_inminente@v1"
    condiciones: tuple[CondicionEvaluada, ...]
    evaluable: bool

    @property
    def total(self) -> int:
        return len(self.condiciones)

    @property
    def cumplidas(self) -> int:
        return sum(1 for c in self.condiciones if c.cumple)

    @property
    def completa(self) -> bool:
        """Todas las condiciones satisfechas. NO implica que la señal se emitiera:
        el cooldown (RF-4) pudo suprimirla."""
        return self.cumplidas == self.total

    @property
    def bloqueada_por(self) -> str | None:
        """Indicador de la condición NO cumplida con mayor `distancia`; empate
        por orden alfabético del nombre canónico. `None` si la regla se cumple
        entera o no es evaluable."""
        if not self.evaluable or self.completa:
            return None
        pendientes = [
            c for c in self.condiciones if not c.cumple and c.distancia is not None
        ]
        if not pendientes:
            return None
        # Desempate determinista y documentado en el schema: mayor distancia y,
        # a igualdad, el menor nombre canónico. Se ordena por (-distancia, nombre)
        # en vez de un `max` con clave invertida porque el orden alfabético de
        # cadenas de distinta longitud no se puede negar elemento a elemento.
        pendientes.sort(key=lambda c: (-c.distancia, c.condicion.indicador))
        return pendientes[0].condicion.indicador


@dataclass(frozen=True, slots=True)
class Senal:
    """Señal lista para persistir/publicar (`schemas/signal.v1.json`)."""

    tipo: str
    direccion: str
    moneda: str
    as_of: datetime
    calc_version: int
    triggered_by: str
    regla: str
    inputs: dict[str, Decimal]


def cargar_ruleset(data: Mapping) -> Ruleset:
    """Parsea y valida el dict de un `senales.v*.yaml`. Estricto a propósito:
    un ruleset mal formado debe fallar al arrancar, no producir señales silenciosas."""
    if not isinstance(data, Mapping):
        raise RulesetInvalido("el ruleset debe ser un mapeo")
    try:
        version = int(data["version"])
        cooldown_min = int(data["cooldown_min"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RulesetInvalido(f"version/cooldown_min inválidos: {exc}") from exc
    if version < 1:
        raise RulesetInvalido("version debe ser >= 1")
    if cooldown_min < 0:
        raise RulesetInvalido("cooldown_min no puede ser negativo")

    reglas_raw = data.get("rules")
    if not isinstance(reglas_raw, list) or not reglas_raw:
        raise RulesetInvalido("rules debe ser una lista no vacía")

    reglas = tuple(_cargar_regla(r, i) for i, r in enumerate(reglas_raw))
    tipos = [r.tipo for r in reglas]
    if len(set(tipos)) != len(tipos):
        raise RulesetInvalido(f"tipos de regla duplicados: {tipos}")
    return Ruleset(version=version, cooldown_min=cooldown_min, reglas=reglas)


def _cargar_regla(raw: Mapping, indice: int) -> Regla:
    if not isinstance(raw, Mapping):
        raise RulesetInvalido(f"regla #{indice} no es un mapeo")
    tipo = raw.get("type")
    direccion = raw.get("direction")
    if not isinstance(tipo, str) or not tipo:
        raise RulesetInvalido(f"regla #{indice}: type vacío o no-string")
    if direccion not in DIRECCIONES:
        raise RulesetInvalido(
            f"regla '{tipo}': direction '{direccion}' no es una de {sorted(DIRECCIONES)}"
        )
    when = raw.get("when")
    if not isinstance(when, list) or not when:
        raise RulesetInvalido(f"regla '{tipo}': when debe ser una lista no vacía")
    condiciones = tuple(_cargar_condicion(c, tipo) for c in when)
    return Regla(tipo=tipo, direccion=direccion, condiciones=condiciones)


def _cargar_condicion(raw: Mapping, tipo: str) -> Condicion:
    if not isinstance(raw, Mapping):
        raise RulesetInvalido(f"regla '{tipo}': condición no es un mapeo")
    indicador = raw.get("indicator")
    op = raw.get("op")
    if not isinstance(indicador, str) or not indicador:
        raise RulesetInvalido(f"regla '{tipo}': indicator vacío o no-string")
    if op not in OPERADORES:
        raise RulesetInvalido(
            f"regla '{tipo}': op '{op}' no es uno de {sorted(OPERADORES)}"
        )
    try:
        umbral = Decimal(str(raw["value"]))
    except (KeyError, InvalidOperation) as exc:
        raise RulesetInvalido(
            f"regla '{tipo}': value inválido para {indicador}: {exc}"
        ) from exc
    return Condicion(indicador=indicador, op=op, umbral=umbral)


def evaluar_reglas(
    ruleset: Ruleset, vista: Mapping[str, Decimal]
) -> list[SenalDisparada]:
    """Reglas que disparan contra la vista actual. Una regla cuyo indicador no
    esté en la vista (ausente o no vigente) NO dispara: nunca se infiere sobre
    datos que faltan."""
    disparadas: list[SenalDisparada] = []
    for regla in ruleset.reglas:
        if any(c.indicador not in vista for c in regla.condiciones):
            continue
        if all(c.cumple(vista[c.indicador]) for c in regla.condiciones):
            inputs = {c.indicador: vista[c.indicador] for c in regla.condiciones}
            disparadas.append(
                SenalDisparada(
                    tipo=regla.tipo,
                    direccion=regla.direccion,
                    regla=f"{regla.tipo}@v{ruleset.version}",
                    inputs=inputs,
                )
            )
    return disparadas


def evaluar_proximidad(
    ruleset: Ruleset, vista: Mapping[str, Decimal], *, evaluable: bool = True
) -> list[ProximidadRegla]:
    """Qué tan cerca está cada regla de cumplirse con la vista actual (RF-6).

    Función hermana de `evaluar_reglas`, no sustituta: aquella decide qué se
    emite, esta solo describe. Misma regla de honestidad — un indicador ausente
    de la vista deja `valor=None`, `cumple=False` y marca la regla NO evaluable,
    exactamente el criterio por el que `evaluar_reglas` no dispararía.

    `evaluable=False` (confianza baja) fuerza no evaluable en todas: si las
    señales están suprimidas, hablar de proximidad engañaría.
    """
    proximidades: list[ProximidadRegla] = []
    for regla in ruleset.reglas:
        condiciones = tuple(
            _evaluar_condicion(cond, vista.get(cond.indicador))
            for cond in regla.condiciones
        )
        completa = all(c.valor is not None for c in condiciones)
        proximidades.append(
            ProximidadRegla(
                tipo=regla.tipo,
                direccion=regla.direccion,
                regla=f"{regla.tipo}@v{ruleset.version}",
                condiciones=condiciones,
                evaluable=evaluable and completa,
            )
        )
    return proximidades


def _evaluar_condicion(
    condicion: Condicion, valor: Decimal | None
) -> CondicionEvaluada:
    if valor is None:
        return CondicionEvaluada(
            condicion=condicion, valor=None, cumple=False, distancia=None
        )
    return CondicionEvaluada(
        condicion=condicion,
        valor=valor,
        cumple=condicion.cumple(valor),
        distancia=condicion.distancia(valor),
    )
