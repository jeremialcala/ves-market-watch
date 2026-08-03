"""Lectura del estado de mercado (RF-7): qué está haciendo el mercado AHORA.

Puro y determinista, sin IO. Por cada revisión produce:

- un **régimen**: la celda de una matriz de dos ejes mecánicos —cómo se mueve el
  paralelo y qué hace la brecha— clasificados por umbrales de config versionada;
- una lista **ordenada de afirmaciones** con sus cifras, en vocabulario neutro de
  idioma, para que el cliente componga la prosa ES/EN sin explosión combinatoria.

Frontera explícita, heredada de ADR-0019 y del no-objetivo del PRD
(`motor-indicadores.md`: «recomendaciones financieras personalizadas»):

- **No pronostica.** El régimen clasifica el PRESENTE, no anticipa el siguiente.
- **No aconseja.** Ninguna afirmación dice qué hacer. Las que orientan lo hacen
  en condicional («si tienes que convertir, hoy el lado buy está…»), y esa
  redacción vive en el cliente, no aquí.
- Si un eje no resuelve, el régimen es `None`. Media clasificación no se publica.

Contrato: `schemas/analysis.v1.json#/properties/payload/properties/reading`.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

from indicator_engine.domain.comparativas import (
    POS_EN_LINEA,
    REF_MAXIMO,
    REF_MEDIA,
    Agregado,
    ConfigComparativas,
    clasificar_posicion,
    es_extremo,
    ventana_mas_ancha_completa,
)
from indicator_engine.domain.analisis import (
    BANDA_MUY_ALTA,
    BANDA_MUY_BAJA,
    BANDA_SIN_ESCALA,
    LecturaIndicador,
    Sintesis,
)

# Eje 1 — cómo se mueve el paralelo (desde `p2p_momentum_bid_3h_pct`).
MOV_SUBIENDO = "subiendo"
MOV_LATERAL = "lateral"
MOV_BAJANDO = "bajando"

# Eje 2 — qué hace la brecha (desde su variación sobre la ventana).
BRECHA_AMPLIANDO = "ampliando"
BRECHA_ESTABLE = "estable"
BRECHA_COMPRIMIENDO = "comprimiendo"

# Afirmaciones. El cliente tiene una frase por código, en cada idioma.
CLAIM_BRECHA = "brecha"  # + .datos["direccion"]
CLAIM_ATRIBUCION = "atribucion"  # + .datos["responsable"]
CLAIM_MEDIDOR_EN_BANDA = "medidor_en_banda"
CLAIM_REGLA_CERCA = "regla_cerca"
CLAIM_CONFIANZA_BAJA = "confianza_baja"
CLAIM_OFICIAL_RANCIA = "oficial_rancia"
CLAIM_BRECHA_VS_HISTORIA = "brecha_vs_historia"  # + .datos["posicion"]
CLAIM_BRECHA_EXTREMO = "brecha_extremo"
CLAIM_HISTORIA_PARCIAL = "historia_parcial"

RESP_PARALELO = "paralelo"
RESP_OFICIAL = "oficial"
RESP_AMBOS = "ambos"

# El medidor cuya banda se comenta: es el que responde «¿me conviene hoy?».
INDICADOR_BRECHA_BUY = "p2p_brecha_pct_buy"
INDICADOR_BRECHA_SELL = "p2p_brecha_pct_sell"
INDICADOR_MOMENTUM = "p2p_momentum_bid_3h_pct"

# Los dos lados de la brecha, con el código de lado que viaja en los claims.
LADO_POR_INDICADOR = {INDICADOR_BRECHA_BUY: "buy", INDICADOR_BRECHA_SELL: "sell"}

_CERO = Decimal(0)


class ConfigLecturaInvalida(Exception):
    """`lectura.v*.yaml` mal formado — el motor no arranca.

    Estricto igual que el ruleset: una config torcida produciría regímenes
    plausibles y falsos, que es peor que no publicar ninguno.
    """


@dataclass(frozen=True, slots=True)
class ConfigLectura:
    version: int
    ventana_horas: int
    holgura_horas: int
    # Umbral simétrico del eje de movimiento, en % de variación del bid a 3 h.
    umbral_movimiento: Decimal
    # Umbral simétrico del eje de brecha, en PUNTOS PORCENTUALES de brecha.
    umbral_brecha: Decimal
    # Fracción del movimiento total que un lado debe aportar para llevarse la
    # atribución en solitario.
    dominancia_minima: Decimal
    # Distancia máxima, en COORDENADAS DE DIBUJO [0,1], para contar un medidor
    # como «cerca de su umbral».
    proximidad_umbral: Decimal


@dataclass(frozen=True, slots=True)
class Variaciones:
    """Lo que la aplicación mide sobre la ventana y entrega ya calculado.

    `brecha_pp` va en puntos porcentuales de brecha (es lo que clasifica el eje);
    `paralelo` y `oficial` van en VES absolutos, que es la única unidad en la que
    la descomposición `Δbrecha_abs = Δparalelo − Δoficial` es exacta. Mezclarlas
    sería cómodo y falso.

    `None` = no medible (hueco de captura, o sin dato en el extremo antiguo).
    """

    brecha_pp: Decimal | None
    paralelo: Decimal | None
    oficial: Decimal | None


@dataclass(frozen=True, slots=True)
class Afirmacion:
    codigo: str
    datos: dict[str, str]


@dataclass(frozen=True, slots=True)
class HistoriaLado:
    """La brecha de un lado contra su propia historia, ventana a ventana.

    Es lo que la tarjeta pinta. Cada `Agregado` lleva su `dias_cubiertos`, así
    que el cliente puede rotular «Promedio 12 d (de 30)» en vez de mentir.
    """

    lado: str
    actual: Decimal | None
    agregados: tuple[Agregado, ...] = ()  # ordenados por ventana creciente


@dataclass(frozen=True, slots=True)
class Piernas:
    """Las dos piernas del movimiento, listas para publicar (ADR-0023).

    Se separan de `Afirmacion` a propósito. Las deltas son HECHOS y viajan
    siempre que sean medibles; `responsable` es una AFIRMACIÓN y solo se llena
    cuando se puede sostener —brecha que se movió y tasa oficial vigente—. Antes
    las tres cosas vivían dentro del claim `atribucion` y desaparecían juntas,
    así que la tarjeta se quedaba en blanco cada vez que el mercado estaba
    quieto, que es justo cuando el usuario quiere comprobar que no pasa nada.

    El neto NO se guarda: es la identidad `paralelo − oficial` y el consumidor la
    deriva. Una tercera cifra medida aparte podría no cuadrar con las otras dos
    en la misma pantalla.
    """

    ventana_horas: int
    paralelo: Decimal | None
    oficial: Decimal | None
    responsable: str | None


@dataclass(frozen=True, slots=True)
class Lectura:
    regimen: str | None
    eje_movimiento: str | None
    eje_brecha: str | None
    afirmaciones: tuple[Afirmacion, ...]
    medidores_cerca: int
    ventana_horas: int
    lectura_version: int
    # Vacío si el motor no pudo medir la historia: la comparativa se omite
    # entera antes que publicarse a medias.
    historia: tuple[HistoriaLado, ...] = ()
    # None solo si NINGUNA de las dos piernas fue medible.
    piernas: Piernas | None = None


# --------------------------------------------------------------------------- #
# Configuración                                                               #
# --------------------------------------------------------------------------- #


def cargar_config_lectura(data: Mapping) -> ConfigLectura:
    if not isinstance(data, Mapping):
        raise ConfigLecturaInvalida("la config debe ser un mapeo")
    try:
        version = int(data["version"])
        ventana_horas = int(data["ventana_horas"])
        holgura_horas = int(data["holgura_horas"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigLecturaInvalida(
            f"version/ventana_horas/holgura_horas inválidos: {exc}"
        ) from exc
    if version < 1:
        raise ConfigLecturaInvalida("version debe ser >= 1")
    if ventana_horas < 1:
        raise ConfigLecturaInvalida("ventana_horas debe ser >= 1")
    if holgura_horas < 0:
        raise ConfigLecturaInvalida("holgura_horas no puede ser negativa")

    umbrales = data.get("umbrales")
    if not isinstance(umbrales, Mapping):
        raise ConfigLecturaInvalida("umbrales debe ser un mapeo")
    movimiento = _decimal(umbrales, "movimiento")
    brecha = _decimal(umbrales, "brecha")
    dominancia = _decimal(umbrales, "dominancia_minima")
    proximidad = _decimal(umbrales, "proximidad_umbral")

    if movimiento <= _CERO or brecha <= _CERO:
        raise ConfigLecturaInvalida(
            "los umbrales de movimiento y brecha son simétricos: deben ser > 0"
        )
    if not Decimal("0.5") < dominancia <= Decimal(1):
        raise ConfigLecturaInvalida(
            "dominancia_minima debe estar en (0.5, 1]: por debajo de 0.5 ambos "
            "lados 'dominarían' a la vez"
        )
    if not _CERO < proximidad <= Decimal(1):
        raise ConfigLecturaInvalida("proximidad_umbral debe estar en (0, 1]")

    return ConfigLectura(
        version=version,
        ventana_horas=ventana_horas,
        holgura_horas=holgura_horas,
        umbral_movimiento=movimiento,
        umbral_brecha=brecha,
        dominancia_minima=dominancia,
        proximidad_umbral=proximidad,
    )


def _decimal(mapa: Mapping, clave: str) -> Decimal:
    try:
        return Decimal(str(mapa[clave]))
    except (KeyError, InvalidOperation) as exc:
        raise ConfigLecturaInvalida(f"umbral '{clave}' inválido: {exc}") from exc


# --------------------------------------------------------------------------- #
# Ejes y régimen                                                              #
# --------------------------------------------------------------------------- #


def clasificar_movimiento(
    momentum: Decimal | None, config: ConfigLectura
) -> str | None:
    """`None` si no hay momentum vigente — sin dato no hay eje."""
    if momentum is None:
        return None
    if momentum > config.umbral_movimiento:
        return MOV_SUBIENDO
    if momentum < -config.umbral_movimiento:
        return MOV_BAJANDO
    return MOV_LATERAL


def clasificar_brecha(delta_pp: Decimal | None, config: ConfigLectura) -> str | None:
    if delta_pp is None:
        return None
    if delta_pp > config.umbral_brecha:
        return BRECHA_AMPLIANDO
    if delta_pp < -config.umbral_brecha:
        return BRECHA_COMPRIMIENDO
    return BRECHA_ESTABLE


def componer_regimen(movimiento: str | None, brecha: str | None) -> str | None:
    """`<movimiento>_<brecha>`, o `None` si falta cualquiera de los dos ejes.

    Publicar «lateral» a secas cuando no se pudo medir la brecha daría a entender
    que la brecha está quieta, y no se sabe. Media clasificación no se publica.
    """
    if movimiento is None or brecha is None:
        return None
    return f"{movimiento}_{brecha}"


def atribuir(variaciones: Variaciones, config: ConfigLectura) -> str | None:
    """Quién movió la brecha, sobre la identidad exacta Δbrecha = Δparalelo − Δoficial.

    Cuando el BCV no publicó dentro de la ventana, `oficial` vale exactamente 0 y
    la atribución al paralelo es un hecho, no una inferencia: el ingestor sondea
    cada 30 min y persiste fila solo al cambiar, así que la ausencia de cambio es
    evidencia positiva.
    """
    if variaciones.paralelo is None or variaciones.oficial is None:
        return None
    total = abs(variaciones.paralelo) + abs(variaciones.oficial)
    if total == _CERO:
        return None  # nada se movió: no hay nada que atribuir
    peso_paralelo = abs(variaciones.paralelo) / total
    if peso_paralelo >= config.dominancia_minima:
        return RESP_PARALELO
    if (Decimal(1) - peso_paralelo) >= config.dominancia_minima:
        return RESP_OFICIAL
    return RESP_AMBOS


def medidores_cerca_de_umbral(
    indicadores: Sequence[LecturaIndicador], config: ConfigLectura
) -> int:
    """Medidores con algún umbral SIN cruzar a tiro de piedra.

    La distancia se mide en coordenadas de dibujo, no en unidades crudas: es lo
    único que hace comparable un porcentaje de brecha con un ratio de oferta.
    Un umbral ya cumplido no cuenta — dejó de estar «cerca», está pasado.
    """
    cerca = 0
    for lectura in indicadores:
        if lectura.posicion is None:
            continue
        if any(
            not regla.cumple
            and abs(lectura.posicion - regla.posicion_umbral) <= config.proximidad_umbral
            for regla in lectura.reglas
        ):
            cerca += 1
    return cerca


# --------------------------------------------------------------------------- #
# Construcción de la lectura                                                  #
# --------------------------------------------------------------------------- #


def construir_historia(
    lado: str,
    actual: Decimal | None,
    agregados: Mapping[int, Agregado] | None,
    config_comparativas: ConfigComparativas,
) -> HistoriaLado | None:
    """La historia de un lado, o `None` si no hay nada que comparar.

    Se publican TODAS las ventanas configuradas, completas o no, cada una con su
    `dias_cubiertos`. Filtrar aquí las incompletas escondería justo el dato que
    hace honesta la etiqueta del cliente.
    """
    if not agregados:
        return None
    ordenados = tuple(
        agregados[dias] for dias in config_comparativas.ventanas_dias if dias in agregados
    )
    if not ordenados:
        return None
    return HistoriaLado(lado=lado, actual=actual, agregados=ordenados)


def afirmaciones_de_historia(
    historia: HistoriaLado, config: ConfigComparativas
) -> list[Afirmacion]:
    """Las afirmaciones de UN lado, en su orden de lectura.

    Se emite **una comparativa por lado**, contra la ventana completa más ancha:
    contra 90 días dice más que contra 7. Publicar las tres daría seis frases en
    la tarjeta y ninguna se leería. Los números de las otras ventanas viajan
    igual en `historia` — esto es para la prosa, no para la tabla.

    `historia_parcial` va PRIMERO cuando ninguna ventana llega a su cobertura:
    es lo que impide que el resto se lea como si fuera de 90 días.
    """
    afirmaciones: list[Afirmacion] = []
    referencia = ventana_mas_ancha_completa(historia.agregados, config)

    if referencia is None:
        mas_ancha = max(historia.agregados, key=lambda a: a.ventana_dias)
        return [
            Afirmacion(
                CLAIM_HISTORIA_PARCIAL,
                {
                    "lado": historia.lado,
                    "ventana": str(mas_ancha.ventana_dias),
                    "dias": str(mas_ancha.dias_cubiertos),
                },
            )
        ]

    posicion = clasificar_posicion(historia.actual, referencia.media, config)
    if posicion is not None and historia.actual is not None:
        afirmaciones.append(
            Afirmacion(
                CLAIM_BRECHA_VS_HISTORIA,
                {
                    "lado": historia.lado,
                    "referencia": REF_MEDIA,
                    "dias": str(referencia.ventana_dias),
                    "posicion": posicion,
                    "delta_pp": _fmt(abs(historia.actual - referencia.media)),
                },
            )
        )

    # Ser el extremo del tramo es más informativo que estar «en línea», así que
    # se dice aunque ya haya salido la comparativa.
    extremo = es_extremo(historia.actual, referencia)
    if extremo is not None:
        afirmaciones.append(
            Afirmacion(
                CLAIM_BRECHA_EXTREMO,
                {
                    "lado": historia.lado,
                    "tipo": extremo,
                    "dias": str(referencia.ventana_dias),
                },
            )
        )
    return afirmaciones


def construir_lectura(
    *,
    config: ConfigLectura,
    indicadores: Sequence[LecturaIndicador],
    sintesis: Sintesis,
    variaciones: Variaciones,
    confianza_baja: bool,
    official_stale: bool,
    historia: Sequence[HistoriaLado] = (),
    config_comparativas: ConfigComparativas | None = None,
) -> Lectura:
    """Ensambla el régimen y las afirmaciones, EN ORDEN de lectura.

    El orden no es cosmético: lo que invalida al resto va primero. La confianza
    baja encabeza porque con ella el motor ni siquiera calculó la microestructura;
    la oficial rancia va después porque desmonta la atribución.
    """
    por_nombre = {i.indicador: i for i in indicadores}
    momentum = por_nombre.get(INDICADOR_MOMENTUM)

    eje_movimiento = clasificar_movimiento(
        momentum.valor if momentum else None, config
    )
    eje_brecha = clasificar_brecha(variaciones.brecha_pp, config)

    afirmaciones: list[Afirmacion] = []

    if confianza_baja:
        afirmaciones.append(Afirmacion(CLAIM_CONFIANZA_BAJA, {}))
    if official_stale:
        afirmaciones.append(Afirmacion(CLAIM_OFICIAL_RANCIA, {}))

    if eje_brecha is not None and variaciones.brecha_pp is not None:
        afirmaciones.append(
            Afirmacion(
                CLAIM_BRECHA,
                {
                    "direccion": eje_brecha,
                    "delta_pp": _fmt(abs(variaciones.brecha_pp)),
                    "horas": str(config.ventana_horas),
                },
            )
        )

    # La atribución se calla con la oficial rancia: la brecha se calculó contra
    # una tasa vencida, así que decir quién la movió sería afirmar de más. Y con
    # la brecha estable no hay movimiento que atribuir.
    responsable: str | None = None
    if not official_stale and eje_brecha in (BRECHA_AMPLIANDO, BRECHA_COMPRIMIENDO):
        responsable = atribuir(variaciones, config)
        if responsable is not None:
            afirmaciones.append(
                Afirmacion(
                    CLAIM_ATRIBUCION,
                    {
                        "responsable": responsable,
                        "paralelo": _fmt(variaciones.paralelo),
                        "oficial": _fmt(variaciones.oficial),
                    },
                )
            )

    # La brecha contra su propia historia. Va después de la atribución —que
    # explica el movimiento de las últimas horas— porque amplía el marco
    # temporal: primero qué pasó hoy, luego cómo es eso comparado con lo normal.
    if config_comparativas is not None:
        for lado in historia:
            afirmaciones.extend(afirmaciones_de_historia(lado, config_comparativas))

    # Banda del lado buy: la única afirmación que orienta, y solo si hay escala
    # empírica que la sostenga. Con el respaldo del ruleset la banda es
    # `unscaled` y decir «su tercio más barato» sería inventarlo.
    brecha_buy = por_nombre.get(INDICADOR_BRECHA_BUY)
    if (
        brecha_buy is not None
        and brecha_buy.banda != BANDA_SIN_ESCALA
        and brecha_buy.banda in (BANDA_MUY_BAJA, BANDA_MUY_ALTA)
    ):
        afirmaciones.append(
            Afirmacion(
                CLAIM_MEDIDOR_EN_BANDA,
                {
                    "indicador": brecha_buy.indicador,
                    "banda": brecha_buy.banda,
                    "dias": str(brecha_buy.escala.ventana_dias),
                },
            )
        )

    # Proximidad a un aviso: solo tiene sentido si las reglas son evaluables.
    if not confianza_baja and sintesis.regla_mas_cercana is not None:
        afirmaciones.append(
            Afirmacion(
                CLAIM_REGLA_CERCA,
                {
                    "regla": sintesis.regla_mas_cercana,
                    "cumplidas": str(sintesis.condiciones_cumplidas),
                    "totales": str(sintesis.condiciones_totales),
                },
            )
        )

    return Lectura(
        regimen=componer_regimen(eje_movimiento, eje_brecha),
        eje_movimiento=eje_movimiento,
        eje_brecha=eje_brecha,
        afirmaciones=tuple(afirmaciones),
        medidores_cerca=medidores_cerca_de_umbral(indicadores, config),
        ventana_horas=config.ventana_horas,
        lectura_version=config.version,
        historia=tuple(historia),
        piernas=_piernas(variaciones, config.ventana_horas, responsable),
    )


def _piernas(
    variaciones: Variaciones, ventana_horas: int, responsable: str | None
) -> Piernas | None:
    """Las piernas viajan aunque no haya atribución (ADR-0023).

    Solo se omiten si NINGUNA fue medible: ahí no hay nada que decir. Que una
    sola sea `None` sí se publica —el consumidor pinta «—» en esa y la otra
    sigue siendo un hecho—, porque enmudecer las dos por un hueco en una sería
    perder dato bueno.
    """
    if variaciones.paralelo is None and variaciones.oficial is None:
        return None
    return Piernas(
        ventana_horas=ventana_horas,
        paralelo=variaciones.paralelo,
        oficial=variaciones.oficial,
        responsable=responsable,
    )


def _fmt(valor: Decimal | None) -> str:
    """Punto fijo: `str(Decimal)` puede dar notación científica y el contrato
    exige `^-?[0-9]+(\\.[0-9]+)?$`."""
    return format(valor if valor is not None else _CERO, "f")
