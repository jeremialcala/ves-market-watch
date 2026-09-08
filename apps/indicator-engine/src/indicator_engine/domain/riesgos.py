"""Riesgos de la vista de Análisis: qué nivel tiene cada uno AHORA.

Puro y determinista, sin IO. Convierte valores vigentes y banderas de la propia
revisión en un nivel (`alto` / `medio` / `bajo`) con cortes de config versionada.

Frontera explícita, la misma que `lectura.py`:

- **No pronostica.** Un riesgo describe el presente del mercado o el estado de la
  propia plataforma. Ninguno dice qué va a pasar ni qué hacer.
- **No redacta.** Publica códigos neutros de idioma; el texto de cada tarjeta es
  del cliente, igual que con `reading.claims`.
- **No inventa.** Un riesgo cuyo indicador no está vigente sale con `nivel: None`
  y `valor: None`. Un `bajo` sin dato detrás sería una tranquilidad falsa, que es
  el peor de los errores posibles en un panel de riesgos.

Por qué existe: la vista pintaba los niveles a mano en el componente. Un nivel
cableado no puede cambiar cuando cambia el mercado, y por eso decía `alto` con el
valor real en 60,50 % contra su propio umbral declarado de 80 %
(`docs/01-requirements/analisis-comprensivo.md`).

Contrato: `schemas/analysis.v1.json#/properties/payload/properties/risks`.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

# Niveles. Vocabulario neutro de idioma: el cliente tiene una etiqueta por nivel.
NIVEL_ALTO = "alto"
NIVEL_MEDIO = "medio"
NIVEL_BAJO = "bajo"
NIVELES = (NIVEL_ALTO, NIVEL_MEDIO, NIVEL_BAJO)

# Orden de publicación: lo más grave primero, y lo que no se pudo evaluar al
# final. Un riesgo sin dato no es tranquilizador, pero tampoco urgente: lo que
# pide es que alguien mire por qué falta el indicador.
_ORDEN = {NIVEL_ALTO: 0, NIVEL_MEDIO: 1, NIVEL_BAJO: 2, None: 3}

TIPO_UMBRAL = "umbral_indicador"
TIPO_BANDERA = "bandera"
TIPO_CALIBRACION = "calibracion"
TIPOS = (TIPO_UMBRAL, TIPO_BANDERA, TIPO_CALIBRACION)

# Peor = el extremo que importa. Un riesgo de concentración empeora al subir; uno
# de liquidez empeoraría al bajar. Se declara para que el YAML se lea solo.
PEOR_MAYOR = "mayor"
PEOR_MENOR = "menor"
PEORES = (PEOR_MAYOR, PEOR_MENOR)

# Banderas booleanas de la revisión que un riesgo puede leer. Lista cerrada: una
# bandera desconocida en el YAML es un error de arranque, no un riesgo mudo.
BANDERA_OFICIAL_RANCIA = "official_stale"
BANDERAS = (BANDERA_OFICIAL_RANCIA,)


class ConfigRiesgosInvalida(Exception):
    """`riesgos.v*.yaml` mal formado — el motor no arranca.

    Estricto igual que el ruleset y la lectura: una config torcida produciría
    niveles plausibles y falsos, y un panel de riesgos que miente tranquiliza.
    """


@dataclass(frozen=True, slots=True)
class DefinicionRiesgo:
    codigo: str
    tipo: str
    # `umbral_indicador`
    indicadores: tuple[str, ...] = ()
    peor: str = PEOR_MAYOR
    alto: Decimal | None = None
    medio: Decimal | None = None
    # `bandera`
    bandera: str | None = None
    nivel_si: str | None = None
    nivel_si_no: str | None = None
    # `calibracion`
    calibrado_hasta_version: int | None = None
    nivel_sin_calibrar: str | None = None
    nivel_calibrado: str | None = None


@dataclass(frozen=True, slots=True)
class ConfigRiesgos:
    version: int
    riesgos: tuple[DefinicionRiesgo, ...]

    @property
    def nombres_indicadores(self) -> set[str]:
        """Indicadores que la vista vigente debe traer para evaluar los riesgos.

        Se une a `nombres_requeridos` del caso de uso: sin esto, `merchants_pct`
        no llegaría a la vista —no es uno de los seis medidores del panel— y el
        riesgo saldría permanentemente sin evaluar.
        """
        return {n for r in self.riesgos for n in r.indicadores}


@dataclass(frozen=True, slots=True)
class Riesgo:
    codigo: str
    # `None` = no evaluable en esta revisión (falta el indicador).
    nivel: str | None
    valor: Decimal | None
    # Corte a partir del cual sería `alto`; `None` en los riesgos sin umbral.
    umbral: Decimal | None
    # Qué indicador decidió el nivel: con dos lados, cuál de los dos manda.
    fuente: str | None


@dataclass(frozen=True, slots=True)
class Riesgos:
    version: int
    items: tuple[Riesgo, ...]


def cargar_config_riesgos(data: Mapping) -> ConfigRiesgos:
    """Valida y congela `riesgos.v*.yaml`. Cualquier defecto aborta el arranque."""
    if not isinstance(data, Mapping):
        raise ConfigRiesgosInvalida("la config de riesgos debe ser un mapa")
    version = data.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ConfigRiesgosInvalida("`version` debe ser un entero >= 1")

    crudos = data.get("riesgos")
    if not isinstance(crudos, Sequence) or isinstance(crudos, (str, bytes)) or not crudos:
        raise ConfigRiesgosInvalida("`riesgos` debe ser una lista no vacía")

    riesgos = tuple(_cargar_riesgo(r, i) for i, r in enumerate(crudos))
    codigos = [r.codigo for r in riesgos]
    repetidos = {c for c in codigos if codigos.count(c) > 1}
    if repetidos:
        raise ConfigRiesgosInvalida(f"códigos de riesgo repetidos: {sorted(repetidos)}")
    return ConfigRiesgos(version=version, riesgos=riesgos)


def _cargar_riesgo(raw, indice: int) -> DefinicionRiesgo:
    if not isinstance(raw, Mapping):
        raise ConfigRiesgosInvalida(f"riesgo #{indice}: debe ser un mapa")
    codigo = raw.get("codigo")
    if not isinstance(codigo, str) or not codigo.strip():
        raise ConfigRiesgosInvalida(f"riesgo #{indice}: `codigo` obligatorio")
    tipo = raw.get("tipo")
    if tipo not in TIPOS:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `tipo` debe ser uno de {list(TIPOS)}, no {tipo!r}"
        )
    if tipo == TIPO_UMBRAL:
        return _cargar_umbral(raw, codigo)
    if tipo == TIPO_BANDERA:
        return _cargar_bandera(raw, codigo)
    return _cargar_calibracion(raw, codigo)


def _cargar_umbral(raw: Mapping, codigo: str) -> DefinicionRiesgo:
    indicadores = raw.get("indicadores")
    if (
        not isinstance(indicadores, Sequence)
        or isinstance(indicadores, (str, bytes))
        or not indicadores
        or not all(isinstance(n, str) and n.strip() for n in indicadores)
    ):
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `indicadores` debe ser una lista no vacía de nombres"
        )
    peor = raw.get("peor", PEOR_MAYOR)
    if peor not in PEORES:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `peor` debe ser uno de {list(PEORES)}, no {peor!r}"
        )
    alto = _decimal(raw, "alto", codigo)
    medio = _decimal(raw, "medio", codigo)
    # Bandas coherentes con la dirección declarada. Al revés, `medio` sería
    # inalcanzable y el riesgo saltaría de `bajo` a `alto` sin escalón.
    if peor == PEOR_MAYOR and not alto > medio:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: con `peor: mayor`, `alto` ({alto}) debe superar a "
            f"`medio` ({medio})"
        )
    if peor == PEOR_MENOR and not alto < medio:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: con `peor: menor`, `alto` ({alto}) debe ser menor "
            f"que `medio` ({medio})"
        )
    return DefinicionRiesgo(
        codigo=codigo,
        tipo=TIPO_UMBRAL,
        indicadores=tuple(indicadores),
        peor=peor,
        alto=alto,
        medio=medio,
    )


def _cargar_bandera(raw: Mapping, codigo: str) -> DefinicionRiesgo:
    bandera = raw.get("bandera")
    if bandera not in BANDERAS:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `bandera` debe ser una de {list(BANDERAS)}, "
            f"no {bandera!r}"
        )
    return DefinicionRiesgo(
        codigo=codigo,
        tipo=TIPO_BANDERA,
        bandera=bandera,
        nivel_si=_nivel(raw, "si", codigo),
        nivel_si_no=_nivel(raw, "si_no", codigo),
    )


def _cargar_calibracion(raw: Mapping, codigo: str) -> DefinicionRiesgo:
    hasta = raw.get("calibrado_hasta_version")
    if not isinstance(hasta, int) or isinstance(hasta, bool) or hasta < 0:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `calibrado_hasta_version` debe ser un entero >= 0"
        )
    return DefinicionRiesgo(
        codigo=codigo,
        tipo=TIPO_CALIBRACION,
        calibrado_hasta_version=hasta,
        nivel_sin_calibrar=_nivel(raw, "sin_calibrar", codigo),
        nivel_calibrado=_nivel(raw, "calibrado", codigo),
    )


def _nivel(raw: Mapping, clave: str, codigo: str) -> str:
    valor = raw.get(clave)
    if valor not in NIVELES:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `{clave}` debe ser uno de {list(NIVELES)}, "
            f"no {valor!r}"
        )
    return valor


def _decimal(raw: Mapping, clave: str, codigo: str) -> Decimal:
    """Los cortes se declaran como STRING y se leen como Decimal.

    Igual que los umbrales del ruleset: un `80.5` en YAML es un float binario y
    el corte dejaría de ser exactamente el que dice el comentario.
    """
    valor = raw.get(clave)
    if not isinstance(valor, str):
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `{clave}` debe ser un string decimal "
            f'(p. ej. "80"), no {valor!r}'
        )
    try:
        return Decimal(valor)
    except InvalidOperation as exc:
        raise ConfigRiesgosInvalida(
            f"riesgo `{codigo}`: `{clave}` no es un decimal válido: {valor!r}"
        ) from exc


def evaluar_riesgos(
    *,
    config: ConfigRiesgos,
    vista: Mapping[str, Decimal],
    official_stale: bool,
    ruleset_version: int,
) -> Riesgos:
    """Nivel de cada riesgo en esta revisión, ordenado por gravedad.

    `vista` son los indicadores VIGENTES: uno que no esté no se sustituye por su
    último valor conocido. Ese es el motivo de que un riesgo pueda salir sin
    nivel — y salir sin nivel es información, no un hueco.
    """
    banderas = {BANDERA_OFICIAL_RANCIA: official_stale}
    items = [
        _evaluar(definicion, vista, banderas, ruleset_version)
        for definicion in config.riesgos
    ]
    # `sorted` es estable, así que dentro de un mismo nivel se conserva el orden
    # del YAML: quien escribe la config decide los desempates.
    items.sort(key=lambda r: _ORDEN[r.nivel])
    return Riesgos(version=config.version, items=tuple(items))


def _evaluar(
    definicion: DefinicionRiesgo,
    vista: Mapping[str, Decimal],
    banderas: Mapping[str, bool],
    ruleset_version: int,
) -> Riesgo:
    if definicion.tipo == TIPO_UMBRAL:
        return _evaluar_umbral(definicion, vista)
    if definicion.tipo == TIPO_BANDERA:
        activa = banderas[definicion.bandera]
        return Riesgo(
            codigo=definicion.codigo,
            nivel=definicion.nivel_si if activa else definicion.nivel_si_no,
            valor=None,
            umbral=None,
            fuente=definicion.bandera,
        )
    sin_calibrar = ruleset_version > definicion.calibrado_hasta_version
    return Riesgo(
        codigo=definicion.codigo,
        nivel=(
            definicion.nivel_sin_calibrar
            if sin_calibrar
            else definicion.nivel_calibrado
        ),
        valor=Decimal(ruleset_version),
        umbral=Decimal(definicion.calibrado_hasta_version),
        fuente=None,
    )


def _evaluar_umbral(definicion: DefinicionRiesgo, vista: Mapping[str, Decimal]) -> Riesgo:
    presentes = [
        (nombre, vista[nombre]) for nombre in definicion.indicadores if nombre in vista
    ]
    if not presentes:
        return Riesgo(
            codigo=definicion.codigo,
            nivel=None,
            valor=None,
            umbral=definicion.alto,
            fuente=None,
        )
    # El peor lado manda: el libro está concentrado si lo está CUALQUIERA de los
    # dos, y quedarse con uno escondería la mitad del riesgo.
    escoger = max if definicion.peor == PEOR_MAYOR else min
    fuente, valor = escoger(presentes, key=lambda par: par[1])

    if definicion.peor == PEOR_MAYOR:
        nivel = (
            NIVEL_ALTO
            if valor >= definicion.alto
            else NIVEL_MEDIO
            if valor >= definicion.medio
            else NIVEL_BAJO
        )
    else:
        nivel = (
            NIVEL_ALTO
            if valor <= definicion.alto
            else NIVEL_MEDIO
            if valor <= definicion.medio
            else NIVEL_BAJO
        )
    return Riesgo(
        codigo=definicion.codigo,
        nivel=nivel,
        valor=valor,
        umbral=definicion.alto,
        fuente=fuente,
    )
