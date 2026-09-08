"""Dominio de la carga histórica de tasas oficiales del BCV.

Puro y sin IO. Normaliza una fila del export `bcv_fx_historico.csv` —producido
por un pipeline externo que lee los XLS publicados por el BCV— a lo que la tabla
`official_rates` espera.

Las tres decisiones que definen esta carga, todas verificadas contra la serie
viva antes de escribirla:

1. **`rate` sale de `bs_ask_bsd`, no de `bs_bid_bsd`.** Contrastado el
   2026-08-01 sobre las cinco monedas que el sistema ya captura: el valor que el
   `ingestor-bcv` raspa de la web coincide **a ocho decimales** con la columna
   ASK, no con la BID. Cargar la BID metería un escalón falso justo en la unión
   entre el histórico y la serie viva, y ese escalón contaminaría toda brecha
   calculada a caballo de la frontera.

2. **La columna `_bsd`, no la cruda.** Venezuela redenominó el bolívar el
   2021-10-01 dividiendo entre 1.000.000. El export lo declara en
   `escala_monetaria` y publica las dos versiones; solo la `_bsd` es
   **comparable a lo largo de todo el periodo**. Con la cruda, la serie daría un
   salto de seis órdenes de magnitud en octubre de 2021 que no ocurrió.

3. **`captured_at` es la hora de PUBLICACIÓN del BCV**, no la de esta carga.
   Es el instante verdadero más cercano y el único que deja la serie en orden
   cronológico correcto. Las fechas del export son naive y vienen en hora de
   Venezuela: la zona se inyecta (`TZ_ORIGEN`, UTC−4 por defecto).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, tzinfo
from decimal import Decimal, InvalidOperation
from typing import Mapping

# Procedencia. Nada consulta `official_rates` filtrando por `source`, así que
# marcarla distinto es gratis y deja el origen a la vista: estas filas NO las
# capturó el scraper, vienen de los XLS del propio BCV.
FUENTE = "BCV-historico"

# Las dos jornadas cuyo XLS no traía hora de publicación (2020-04-14 y
# 2026-06-25, todas sus monedas). La FECHA es real; la hora no se sabe, así que
# se usa el arranque del día y la fila lo declara con esta fuente distinta.
# Descartarlas dejaría dos huecos en una serie diaria por lo demás completa, y
# un hueco se lee como «el BCV no publicó», que sería falso.
FUENTE_SIN_HORA = "BCV-historico-sin-hora"

# `official_rates.rate` es numeric(20,8) con CHECK (rate > 0).
_MAX_RATE = Decimal(10) ** 12
_CUANTO = Decimal("0.00000001")

_COLUMNAS = (
    "fecha_operacion",
    "fecha_valor",
    "publicado_en",
    "moneda",
    "bs_ask_bsd",
)

_ISO4217 = re.compile(r"^[A-Z]{3}$")


class FormatoOficialNoSoportado(Exception):
    """Al CSV le faltan columnas imprescindibles — se aborta antes de tocar nada."""


class FilaOficialInvalida(Exception):
    """Una fila irrecuperable. Se descarta con motivo, sin abortar la carga."""

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


@dataclass(frozen=True, slots=True)
class TasaOficialHistorica:
    moneda: str
    valor: Decimal
    fecha_valor: date
    publicado_en: datetime  # siempre timezone-aware
    fuente: str
    archivo_fuente: str

    @property
    def hora_conocida(self) -> bool:
        return self.fuente == FUENTE


def verificar_columnas(cabeceras: list[str]) -> None:
    faltan = [c for c in _COLUMNAS if c not in cabeceras]
    if faltan:
        raise FormatoOficialNoSoportado(
            "faltan columnas obligatorias: " + ", ".join(faltan)
        )


def parsear_fila(fila: Mapping[str, str], tz: tzinfo) -> TasaOficialHistorica:
    moneda = (fila.get("moneda") or "").strip().upper()
    if not _ISO4217.match(moneda):
        # El export trae algún código no ISO (p. ej. `MXP`, en desuso). Se
        # aceptan igual mientras tengan forma de código: son los que el BCV
        # publicó, y reescribirlos sería corregir la fuente por nuestra cuenta.
        raise FilaOficialInvalida("moneda ausente o con forma inesperada")

    valor = _decimal(fila.get("bs_ask_bsd"))
    if valor is None:
        raise FilaOficialInvalida("bs_ask_bsd ausente o no numérico")
    valor = valor.quantize(_CUANTO)
    if valor <= 0:
        # El CHECK de la tabla lo rechazaría; se descarta con motivo en vez de
        # reventar el lote entero.
        raise FilaOficialInvalida("bs_ask_bsd no positivo tras cuantizar a 8 decimales")
    if valor >= _MAX_RATE:
        raise FilaOficialInvalida("bs_ask_bsd fuera del rango de numeric(20,8)")

    fecha_valor = _fecha(fila.get("fecha_valor"))
    if fecha_valor is None:
        raise FilaOficialInvalida("fecha_valor ausente o no parseable")

    publicado, hora_conocida = _publicado_en(fila, tz)
    if publicado is None:
        raise FilaOficialInvalida("sin publicado_en ni fecha_operacion parseables")

    return TasaOficialHistorica(
        moneda=moneda,
        valor=valor,
        fecha_valor=fecha_valor,
        publicado_en=publicado,
        fuente=FUENTE if hora_conocida else FUENTE_SIN_HORA,
        archivo_fuente=(fila.get("archivo_fuente") or "").strip(),
    )


def _publicado_en(
    fila: Mapping[str, str], tz: tzinfo
) -> tuple[datetime | None, bool]:
    """(instante, ¿la hora es real?).

    Con `publicado_en` presente la hora es dato de la fuente. Sin él se cae a
    `fecha_operacion` a las 00:00 —la fecha sí es real— y se devuelve `False`
    para que la fila quede marcada y nadie lea esa hora como medida.
    """
    exacto = _timestamp(fila.get("publicado_en"), tz)
    if exacto is not None:
        return exacto, True
    operacion = _fecha(fila.get("fecha_operacion"))
    if operacion is None:
        return None, False
    return datetime.combine(operacion, time.min, tzinfo=tz), False


def _decimal(texto: str | None) -> Decimal | None:
    if not texto or not texto.strip():
        return None
    try:
        return Decimal(texto.strip())
    except InvalidOperation:
        return None


def _fecha(texto: str | None) -> date | None:
    if not texto or not texto.strip():
        return None
    try:
        return date.fromisoformat(texto.strip()[:10])
    except ValueError:
        return None


def _timestamp(texto: str | None, tz: tzinfo) -> datetime | None:
    if not texto or not texto.strip():
        return None
    try:
        naive = datetime.fromisoformat(texto.strip())
    except ValueError:
        return None
    # El export es naive y en hora de Venezuela; si alguna vez trajera offset,
    # se respeta el suyo en vez de reinterpretarlo.
    return naive if naive.tzinfo is not None else naive.replace(tzinfo=tz)
