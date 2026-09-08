"""Análisis de la revisión (RF-6): lectura mecánica de los medidores del panel.

Puro y determinista, sin IO. Por cada lote de indicadores emitido ante un
`p2p.snapshot` produce, para cada medidor con valor vigente:

- en qué **banda** cae el valor dentro de una escala de percentiles REALES de la
  hypertable `indicators` (ventana de `config/analisis.v*.yaml`), o `unscaled`
  cuando no hay historia suficiente y se usa el respaldo del ruleset;
- su **posición** de dibujo sobre esa escala, con los cortes que la generan;
- a cuánto está de cada **umbral** del ruleset de señales que lo consume.

Frontera explícita: esto NO pronostica. `Sintesis` es proximidad aritmética a
reglas ya versionadas (k de n condiciones y cuál bloquea), nunca un régimen ni
una probabilidad. El engine CLASIFICA en vocabulario neutro de idioma; la prosa
ES/EN la redacta el cliente (ADR-0019).

Contrato del evento emitido: `schemas/analysis.v1.json`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

from indicator_engine.domain.reglas import (
    OPERADORES,
    Condicion,
    ProximidadRegla,
    Regla,
    Ruleset,
)

# Códigos del contrato: neutros de idioma, como `type`/`direction` de las señales.
FUENTE_PERCENTILES = "percentiles"
FUENTE_RULESET = "ruleset"

BANDA_MUY_BAJA = "very_low"
BANDA_BAJA = "low"
BANDA_ALTA = "high"
BANDA_MUY_ALTA = "very_high"
BANDA_SIN_ESCALA = "unscaled"

CONFIANZA_NORMAL = "normal"
CONFIANZA_BAJA = "low"

# Bandas de la escala de percentiles, en orden: <p10 · [p10,p50) · [p50,p90) · >=p90.
# El enum del contrato tiene exactamente estas cuatro, así que la config debe
# declarar exactamente tres cortes (lo verifica `cargar_config_analisis`).
BANDAS = (BANDA_MUY_BAJA, BANDA_BAJA, BANDA_ALTA, BANDA_MUY_ALTA)
CORTES_ESPERADOS = len(BANDAS) - 1

# Las posiciones son coordenadas de dibujo, no percentiles empíricos: cuatro
# decimales sobran para una barra y mantienen el payload legible.
PRECISION_POSICION = Decimal("0.0001")

_CERO = Decimal(0)
_UNO = Decimal(1)


class ConfigAnalisisInvalida(Exception):
    """`analisis.v*.yaml` no cumple la forma esperada — el motor no arranca.

    Estricto a propósito, igual que `RulesetInvalido`: una config torcida
    produciría escalas raras en silencio, y una escala rara es dato inventado.
    """


# --------------------------------------------------------------------------- #
# Configuración                                                               #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class UmbralSistema:
    """Umbral real del sistema que no vive en el ruleset de señales (p. ej. el
    30 % de outliers que degrada la confianza). Se dibuja como corte en el
    respaldo para que la barra no quede sin referencia; NO clasifica."""

    clave: str
    op: str
    valor: Decimal
    origen: str


@dataclass(frozen=True, slots=True)
class IndicadorAnalizado:
    """Un medidor del panel y su dominio de respaldo.

    `dominio_respaldo` son los únicos números escritos a mano del sistema:
    existen solo para cerrar los extremos de una barra sin percentiles, viajan
    en `scale.domain` y aplican únicamente con `source: ruleset` (ADR-0019).
    """

    nombre: str
    dominio_min: Decimal
    dominio_max: Decimal
    umbrales_sistema: tuple[UmbralSistema, ...] = ()


@dataclass(frozen=True, slots=True)
class ConfigAnalisis:
    version: int
    ventana_dias: int
    muestras_minimas: int
    percentiles: tuple[int, ...]
    anclas: tuple[Decimal, ...]
    indicadores: tuple[IndicadorAnalizado, ...]

    @property
    def nombres(self) -> tuple[str, ...]:
        return tuple(i.nombre for i in self.indicadores)

    @property
    def fracciones(self) -> tuple[Decimal, ...]:
        """Percentiles como fracciones para `percentile_disc` (10 → 0.10)."""
        return tuple(Decimal(p) / Decimal(100) for p in self.percentiles)

    def indicador(self, nombre: str) -> IndicadorAnalizado | None:
        for ind in self.indicadores:
            if ind.nombre == nombre:
                return ind
        return None


def cargar_config_analisis(data: Mapping) -> ConfigAnalisis:
    """Parsea y valida el dict de un `analisis.v*.yaml`."""
    if not isinstance(data, Mapping):
        raise ConfigAnalisisInvalida("la config debe ser un mapeo")
    try:
        version = int(data["version"])
        ventana_dias = int(data["ventana_dias"])
        muestras_minimas = int(data["muestras_minimas"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigAnalisisInvalida(
            f"version/ventana_dias/muestras_minimas inválidos: {exc}"
        ) from exc
    if version < 1:
        raise ConfigAnalisisInvalida("version debe ser >= 1")
    if ventana_dias < 1:
        raise ConfigAnalisisInvalida("ventana_dias debe ser >= 1")
    if muestras_minimas < 1:
        raise ConfigAnalisisInvalida("muestras_minimas debe ser >= 1")

    percentiles = _cargar_percentiles(data.get("percentiles"))
    anclas = _cargar_anclas(data.get("anclas"), len(percentiles))

    indicadores_raw = data.get("indicadores")
    if not isinstance(indicadores_raw, list) or not indicadores_raw:
        raise ConfigAnalisisInvalida("indicadores debe ser una lista no vacía")
    indicadores = tuple(_cargar_indicador(i, n) for n, i in enumerate(indicadores_raw))
    nombres = [i.nombre for i in indicadores]
    if len(set(nombres)) != len(nombres):
        raise ConfigAnalisisInvalida(f"indicadores duplicados: {nombres}")

    return ConfigAnalisis(
        version=version,
        ventana_dias=ventana_dias,
        muestras_minimas=muestras_minimas,
        percentiles=percentiles,
        anclas=anclas,
        indicadores=indicadores,
    )


def _cargar_percentiles(raw) -> tuple[int, ...]:
    if not isinstance(raw, list):
        raise ConfigAnalisisInvalida("percentiles debe ser una lista")
    try:
        percentiles = tuple(int(p) for p in raw)
    except (TypeError, ValueError) as exc:
        raise ConfigAnalisisInvalida(f"percentiles no numéricos: {exc}") from exc
    if len(percentiles) != CORTES_ESPERADOS:
        raise ConfigAnalisisInvalida(
            f"percentiles debe declarar exactamente {CORTES_ESPERADOS} cortes: "
            f"el enum `band` del contrato tiene {len(BANDAS)} bandas"
        )
    if any(not 0 < p < 100 for p in percentiles):
        raise ConfigAnalisisInvalida("cada percentil debe estar en (0, 100)")
    if list(percentiles) != sorted(set(percentiles)):
        raise ConfigAnalisisInvalida("percentiles debe ser estrictamente creciente")
    return percentiles


def _cargar_anclas(raw, esperadas: int) -> tuple[Decimal, ...]:
    if not isinstance(raw, list):
        raise ConfigAnalisisInvalida("anclas debe ser una lista")
    try:
        anclas = tuple(Decimal(str(a)) for a in raw)
    except InvalidOperation as exc:
        raise ConfigAnalisisInvalida(f"anclas no decimales: {exc}") from exc
    if len(anclas) != esperadas:
        raise ConfigAnalisisInvalida(
            f"anclas ({len(anclas)}) y percentiles ({esperadas}) deben ser paralelos"
        )
    if any(not _CERO < a < _UNO for a in anclas):
        raise ConfigAnalisisInvalida("cada ancla debe estar en (0, 1)")
    if list(anclas) != sorted(set(anclas)):
        raise ConfigAnalisisInvalida("anclas debe ser estrictamente creciente")
    return anclas


def _cargar_indicador(raw: Mapping, indice: int) -> IndicadorAnalizado:
    if not isinstance(raw, Mapping):
        raise ConfigAnalisisInvalida(f"indicador #{indice} no es un mapeo")
    nombre = raw.get("nombre")
    if not isinstance(nombre, str) or not nombre:
        raise ConfigAnalisisInvalida(f"indicador #{indice}: nombre vacío o no-string")
    dominio = raw.get("dominio_respaldo")
    if not isinstance(dominio, Mapping):
        raise ConfigAnalisisInvalida(f"'{nombre}': dominio_respaldo debe ser un mapeo")
    try:
        minimo = Decimal(str(dominio["minimo"]))
        maximo = Decimal(str(dominio["maximo"]))
    except (KeyError, InvalidOperation) as exc:
        raise ConfigAnalisisInvalida(
            f"'{nombre}': dominio_respaldo minimo/maximo inválidos: {exc}"
        ) from exc
    if minimo >= maximo:
        raise ConfigAnalisisInvalida(f"'{nombre}': dominio_respaldo minimo >= maximo")

    umbrales = tuple(
        _cargar_umbral_sistema(u, nombre) for u in raw.get("umbrales_sistema", []) or []
    )
    return IndicadorAnalizado(
        nombre=nombre,
        dominio_min=minimo,
        dominio_max=maximo,
        umbrales_sistema=umbrales,
    )


def _cargar_umbral_sistema(raw: Mapping, nombre: str) -> UmbralSistema:
    if not isinstance(raw, Mapping):
        raise ConfigAnalisisInvalida(f"'{nombre}': umbral de sistema no es un mapeo")
    clave = raw.get("clave")
    op = raw.get("op")
    origen = raw.get("origen")
    if not isinstance(clave, str) or not clave:
        raise ConfigAnalisisInvalida(f"'{nombre}': umbral de sistema sin clave")
    if op not in OPERADORES:
        raise ConfigAnalisisInvalida(
            f"'{nombre}': umbral '{clave}' con op '{op}' no válido"
        )
    if not isinstance(origen, str) or not origen:
        raise ConfigAnalisisInvalida(
            f"'{nombre}': umbral '{clave}' sin `origen` — el umbral debe apuntar "
            "a la constante real que lo define, o se desincroniza en silencio"
        )
    try:
        valor = Decimal(str(raw["valor"]))
    except (KeyError, InvalidOperation) as exc:
        raise ConfigAnalisisInvalida(
            f"'{nombre}': umbral '{clave}' con valor inválido: {exc}"
        ) from exc
    return UmbralSistema(clave=clave, op=op, valor=valor, origen=origen)


# --------------------------------------------------------------------------- #
# Escala                                                                      #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class Distribucion:
    """Lo que devuelve el puerto `DistribucionRepository` para un indicador:
    la distribución empírica de la ventana. `cortes` son los percentiles pedidos,
    en el mismo orden."""

    muestras: int
    minimo: Decimal | None
    maximo: Decimal | None
    cortes: tuple[Decimal, ...]
    calculada_en: datetime | None


@dataclass(frozen=True, slots=True)
class Corte:
    clave: str
    valor: Decimal
    posicion: Decimal


@dataclass(frozen=True, slots=True)
class Escala:
    """La escala contra la que se lee un medidor, con su fuente y sus parámetros.

    La elección viaja en el payload: `fuente` distingue percentiles reales de
    respaldo, y la UI lo escribe en el pie de la tarjeta. Degradar en silencio
    sería inventar dato.
    """

    fuente: str
    ventana_dias: int
    muestras: int
    muestras_minimas: int
    calculada_en: datetime | None
    dominio_min: Decimal
    dominio_max: Decimal
    cortes: tuple[Corte, ...]


def escala_por_percentiles(dist: Distribucion, config: ConfigAnalisis) -> Escala:
    """Escala de percentiles REALES de la ventana. Presupone distribución
    utilizable (`_percentiles_utilizables`)."""
    cortes = tuple(
        Corte(clave=f"p{p}", valor=valor, posicion=_redondear(ancla))
        for p, ancla, valor in zip(config.percentiles, config.anclas, dist.cortes)
    )
    return Escala(
        fuente=FUENTE_PERCENTILES,
        ventana_dias=config.ventana_dias,
        muestras=dist.muestras,
        muestras_minimas=config.muestras_minimas,
        calculada_en=dist.calculada_en,
        dominio_min=dist.minimo,
        dominio_max=dist.maximo,
        cortes=cortes,
    )


def escala_por_ruleset(
    indicador: IndicadorAnalizado,
    ruleset: Ruleset | None,
    config: ConfigAnalisis,
    dist: Distribucion | None = None,
) -> Escala:
    """Respaldo VISIBLE: los umbrales reales del ruleset versionado más los
    umbrales de sistema declarados, sobre el dominio de presentación.

    No hay banda posible aquí (`clasificar_banda` devuelve `unscaled`): con solo
    umbrales no existe una noción empírica de alto/bajo. Lo único real es
    cruzado / no cruzado, y eso ya viaja en `rules[].met` y `.distance`.
    """
    minimo, maximo = indicador.dominio_min, indicador.dominio_max
    crudos: list[tuple[str, Decimal]] = [
        (f"{regla.tipo}@v{ruleset.version}", cond.umbral)
        for regla, cond in reglas_que_alimenta(indicador.nombre, ruleset)
    ]
    crudos += [(u.clave, u.valor) for u in indicador.umbrales_sistema]

    cortes = tuple(
        Corte(
            clave=clave,
            valor=valor,
            posicion=_redondear(_fraccion_lineal(valor, minimo, maximo)),
        )
        # Orden del contrato: por `value` ascendente; la clave desempata para
        # que dos umbrales iguales salgan siempre en el mismo orden.
        for clave, valor in sorted(crudos, key=lambda par: (par[1], par[0]))
    )
    return Escala(
        fuente=FUENTE_RULESET,
        ventana_dias=config.ventana_dias,
        muestras=dist.muestras if dist is not None else 0,
        muestras_minimas=config.muestras_minimas,
        calculada_en=dist.calculada_en if dist is not None else None,
        dominio_min=minimo,
        dominio_max=maximo,
        cortes=cortes,
    )


def elegir_escala(
    indicador: IndicadorAnalizado,
    dist: Distribucion | None,
    ruleset: Ruleset | None,
    config: ConfigAnalisis,
) -> Escala:
    """Percentiles si la distribución los sostiene; si no, respaldo del ruleset."""
    if dist is not None and _percentiles_utilizables(dist, config):
        return escala_por_percentiles(dist, config)
    return escala_por_ruleset(indicador, ruleset, config, dist)


def _percentiles_utilizables(dist: Distribucion, config: ConfigAnalisis) -> bool:
    """Muestras suficientes y cortes completos, ESTRICTAMENTE crecientes, dentro
    de un dominio con dispersión.

    Los cortes se exigen estrictamente crecientes, no solo monótonos, y eso no es
    remilgo: con dos cortes iguales la banda que hay entre ellos queda vacía y la
    moda de la serie cae del lado equivocado. El caso real que lo destapó es
    `p2p_outliers_pct_buy`, cuya distribución está concentrada en cero: con
    p10 = p50 = p90 = 0, un snapshot IMPECABLE (0 % de outliers) salía
    clasificado `very_high` —«de lo más alto de los últimos 90 días»— porque la
    igualdad cuenta hacia arriba.

    Ninguna regla de desempate arregla esto: usar `<=` en los cortes bajos
    invierte el error en una serie saturada por arriba. Cuando la distribución
    está tan concentrada que sus cortes coinciden, sencillamente NO hay banda que
    sostener, y para eso existe el respaldo (`unscaled`) — que además dibuja los
    umbrales reales, que es la referencia útil de ese medidor.
    """
    if dist.muestras < config.muestras_minimas:
        return False
    if len(dist.cortes) != len(config.percentiles):
        return False
    if dist.minimo is None or dist.maximo is None or dist.minimo >= dist.maximo:
        return False
    if any(c is None for c in dist.cortes):
        return False
    if list(dist.cortes) != sorted(set(dist.cortes)):
        return False
    return dist.minimo <= dist.cortes[0] and dist.cortes[-1] <= dist.maximo


def posicion_en_escala(valor: Decimal, escala: Escala) -> Decimal | None:
    """Coordenada de dibujo en [0,1] del valor sobre la escala publicada.

    Interpolación lineal a trozos entre `[(dominio_min, 0), *cortes, (dominio_max, 1)]`,
    acotada a [0,1]. `None` cuando la escala no tiene cortes: no hay nada que
    dibujar honestamente, y cero píxeles inventados es la respuesta correcta.

    **No es el percentil empírico del valor**: es reproducible a partir del
    propio payload, que publica los cortes que la generan (ADR-0019, riesgo 1).
    """
    if not escala.cortes:
        return None
    nudos = _nudos(escala)
    if len(nudos) < 2:
        return None

    if valor <= nudos[0][0]:
        return _redondear(nudos[0][1])
    if valor >= nudos[-1][0]:
        return _redondear(nudos[-1][1])
    for (x0, y0), (x1, y1) in zip(nudos, nudos[1:]):
        if x0 <= valor <= x1:
            fraccion = (valor - x0) / (x1 - x0)
            return _redondear(_acotar(y0 + fraccion * (y1 - y0)))
    # Inalcanzable: los nudos cubren [min, max] y el valor está entre ambos.
    return None


def _nudos(escala: Escala) -> list[tuple[Decimal, Decimal]]:
    """Nudos de la interpolación, ordenados y con los de igual x colapsados.

    Al colapsar se conserva la posición MÁS ALTA de esa x, coherente con la regla
    de bandas (la igualdad cuenta hacia arriba: `valor >= p90` es `very_high`).
    Ocurre, por ejemplo, cuando más del 10 % de la ventana vale exactamente el
    mínimo y entonces p10 == min.
    """
    crudos = [(escala.dominio_min, _CERO)]
    crudos += [(c.valor, c.posicion) for c in escala.cortes]
    crudos.append((escala.dominio_max, _UNO))
    crudos.sort(key=lambda nudo: (nudo[0], nudo[1]))

    colapsados: list[tuple[Decimal, Decimal]] = []
    for x, y in crudos:
        if colapsados and colapsados[-1][0] == x:
            colapsados[-1] = (x, y)  # ordenados por y: el último es el mayor
        else:
            colapsados.append((x, y))
    return colapsados


def clasificar_banda(valor: Decimal, escala: Escala) -> str:
    """Banda del valor dentro de la escala, en vocabulario neutro de idioma.

    `unscaled` cuando la fuente es el respaldo: sin distribución empírica no
    existe alto/bajo, y emitir ahí una banda tipo percentil sería inventar dato.
    """
    if escala.fuente != FUENTE_PERCENTILES:
        return BANDA_SIN_ESCALA
    for banda, corte in zip(BANDAS, escala.cortes):
        if valor < corte.valor:
            return banda
    return BANDAS[-1]


def _fraccion_lineal(valor: Decimal, minimo: Decimal, maximo: Decimal) -> Decimal:
    if maximo == minimo:
        return _CERO
    return _acotar((valor - minimo) / (maximo - minimo))


def _acotar(fraccion: Decimal) -> Decimal:
    return min(_UNO, max(_CERO, fraccion))


def _redondear(fraccion: Decimal) -> Decimal:
    return _acotar(fraccion).quantize(PRECISION_POSICION)


# --------------------------------------------------------------------------- #
# Lectura de un indicador                                                     #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class ReglaAlimentada:
    """Una condición del ruleset que consume ESTE indicador, con cuánto le falta
    al valor para satisfacerla."""

    regla: str
    tipo: str
    direccion: str
    op: str
    umbral: Decimal
    cumple: bool
    distancia: Decimal
    posicion_umbral: Decimal


@dataclass(frozen=True, slots=True)
class LecturaIndicador:
    indicador: str
    valor: Decimal
    as_of: datetime
    banda: str
    posicion: Decimal | None
    escala: Escala
    reglas: tuple[ReglaAlimentada, ...]


def reglas_que_alimenta(
    indicador: str, ruleset: Ruleset | None
) -> list[tuple[Regla, Condicion]]:
    """Pares (regla, condición) del ruleset que consumen este indicador.

    El mapeo indicador→reglas NO se declara en la config: se deriva del ruleset
    cargado, para que no pueda desincronizarse (ADR-0019).
    """
    if ruleset is None:
        return []
    return [
        (regla, cond)
        for regla in ruleset.reglas
        for cond in regla.condiciones
        if cond.indicador == indicador
    ]


def analizar_indicador(
    indicador: IndicadorAnalizado,
    valor: Decimal,
    as_of: datetime,
    dist: Distribucion | None,
    ruleset: Ruleset | None,
    config: ConfigAnalisis,
) -> LecturaIndicador:
    escala = elegir_escala(indicador, dist, ruleset, config)
    reglas = tuple(
        ReglaAlimentada(
            regla=f"{regla.tipo}@v{ruleset.version}",
            tipo=regla.tipo,
            direccion=regla.direccion,
            op=cond.op,
            umbral=cond.umbral,
            cumple=cond.cumple(valor),
            distancia=cond.distancia(valor),
            # Con reglas siempre hay cortes (el umbral de cada una es uno de
            # ellos en el respaldo, y los percentiles son tres), así que la
            # posición nunca es None aquí; el `or _CERO` es cinturón.
            posicion_umbral=posicion_en_escala(cond.umbral, escala) or _CERO,
        )
        for regla, cond in reglas_que_alimenta(indicador.nombre, ruleset)
    )
    return LecturaIndicador(
        indicador=indicador.nombre,
        valor=valor,
        as_of=as_of,
        banda=clasificar_banda(valor, escala),
        posicion=posicion_en_escala(valor, escala),
        escala=escala,
        reglas=reglas,
    )


# --------------------------------------------------------------------------- #
# Síntesis y análisis completo                                                #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class Sintesis:
    """Síntesis MECÁNICA del panel. `reglas_cumplidas` NO implica emisión: el
    cooldown (RF-4) pudo suprimir la señal — eso vive en `signals.emitted`."""

    reglas_total: int
    reglas_evaluables: int
    regla_mas_cercana: str | None
    condiciones_cumplidas: int
    condiciones_totales: int
    bloqueada_por: str | None
    reglas_cumplidas: tuple[str, ...]


def resumir(proximidad: Sequence[ProximidadRegla]) -> Sintesis:
    evaluables = [p for p in proximidad if p.evaluable]
    cumplidas = tuple(sorted(p.regla for p in evaluables if p.completa))

    # Desempate determinista y documentado en el schema: mayor número de
    # condiciones cumplidas; a igualdad, menos condiciones totales (una regla de
    # 2 que cumple 1 está más cerca que una de 3 que cumple 1) y luego alfabético.
    candidatas = sorted(
        (p for p in evaluables if not p.completa),
        key=lambda p: (-p.cumplidas, p.total, p.regla),
    )
    mas_cercana = candidatas[0] if candidatas else None
    return Sintesis(
        reglas_total=len(proximidad),
        reglas_evaluables=len(evaluables),
        regla_mas_cercana=mas_cercana.regla if mas_cercana else None,
        condiciones_cumplidas=mas_cercana.cumplidas if mas_cercana else 0,
        condiciones_totales=mas_cercana.total if mas_cercana else 0,
        bloqueada_por=mas_cercana.bloqueada_por if mas_cercana else None,
        reglas_cumplidas=cumplidas,
    )


@dataclass(frozen=True, slots=True)
class Analisis:
    """El documento completo de una revisión — lo que se publica y se persiste."""

    as_of: datetime
    moneda: str
    calc_version: int
    analysis_version: int
    ruleset_version: int
    confianza: str
    official_stale: bool
    triggered_by: str
    indicadores: tuple[LecturaIndicador, ...]
    proximidad: tuple[ProximidadRegla, ...]
    sintesis: Sintesis

    @property
    def fuente_escala(self) -> str:
        """Fuente dominante de la revisión, promovida a columna para responder
        «¿cuánto tiempo estuvimos en respaldo?» sin abrir el JSONB. Basta que un
        medidor esté en respaldo para que la revisión no sea de percentiles."""
        if not self.indicadores:
            return FUENTE_RULESET
        if all(i.escala.fuente == FUENTE_PERCENTILES for i in self.indicadores):
            return FUENTE_PERCENTILES
        return FUENTE_RULESET


def construir_analisis(
    *,
    config: ConfigAnalisis,
    # Obligatorio: sin ruleset no hay `ruleset_version` real que publicar ni
    # reglas a las que medir proximidad. El arranque desactiva el análisis en
    # ese caso en vez de inventar una versión.
    ruleset: Ruleset,
    vista: Mapping[str, Decimal],
    as_of_por_indicador: Mapping[str, datetime],
    distribuciones: Mapping[str, Distribucion],
    proximidad: Sequence[ProximidadRegla],
    as_of: datetime,
    moneda: str,
    calc_version: int,
    triggered_by: str,
    confianza_baja: bool,
    official_stale: bool,
) -> Analisis:
    """Ensambla el análisis de una revisión.

    Un indicador del panel sin valor vigente NO produce lectura: no aparece en
    `indicadores` y la UI lo dice. Nunca se infiere.
    """
    lecturas = tuple(
        analizar_indicador(
            indicador=cfg,
            valor=vista[cfg.nombre],
            as_of=as_of_por_indicador.get(cfg.nombre, as_of),
            dist=distribuciones.get(cfg.nombre),
            ruleset=ruleset,
            config=config,
        )
        for cfg in config.indicadores
        if cfg.nombre in vista
    )
    return Analisis(
        as_of=as_of,
        moneda=moneda,
        calc_version=calc_version,
        analysis_version=config.version,
        ruleset_version=ruleset.version,
        confianza=CONFIANZA_BAJA if confianza_baja else CONFIANZA_NORMAL,
        official_stale=official_stale,
        triggered_by=triggered_by,
        indicadores=lecturas,
        proximidad=tuple(proximidad),
        sintesis=resumir(proximidad),
    )
