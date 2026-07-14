"""Parseo adaptativo de exports de mercado (funciones puras, sin I/O).

El export de referencia trae columnas `ID, BaseWeightedAverage,
AverageRatePerBank, TotalOrderSize, CreatedAt, VolumePerBank`, pero el
proceso debe adaptarse a la información que recibe (PRD RF-2): las columnas
se detectan por heurísticas sobre los nombres y sobre una fila de muestra,
los mapas por banco aceptan cualquier conjunto de bancos y las columnas no
reconocidas se conservan crudas en `extra`.

Sanitización (A05): todo valor se valida/convierte antes de entrar al
dominio; una fila ilegible se descarta con motivo, nunca aborta la carga.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo
from decimal import Decimal, InvalidOperation

from ingestor_historico.domain.models import DatoBanco, SnapshotHistorico


class FormatoNoSoportado(ValueError):
    """El archivo no parece un export de mercado (sin columna de precio)."""


class FilaInvalida(ValueError):
    """Una fila individual no pudo normalizarse; `motivo` la clasifica."""

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


# --- valores escalares ------------------------------------------------------

_MESES_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

# «December 2, 2025, 5:20 PM» — formato del export de referencia. Se parsea
# con tabla propia de meses para no depender del locale del sistema.
_RE_FECHA_EN = re.compile(
    r"^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)\s*$",
    re.IGNORECASE,
)

_RE_OBJECTID = re.compile(r"^[0-9a-f]{24}$", re.IGNORECASE)


def parse_numero(texto: str | None) -> Decimal | None:
    """Número con separador de miles por coma («1,057,013.1») o simple."""
    if texto is None:
        return None
    limpio = str(texto).strip().replace(",", "").replace(" ", "")
    if not limpio:
        return None
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


def parse_fecha(texto: str | None, tz: tzinfo) -> datetime | None:
    """ISO 8601 o el formato inglés del export; naive → se asume `tz`."""
    if not texto or not str(texto).strip():
        return None
    crudo = str(texto).strip()

    try:
        fecha = datetime.fromisoformat(crudo.replace("Z", "+00:00"))
        return fecha if fecha.tzinfo else fecha.replace(tzinfo=tz)
    except ValueError:
        pass

    m = _RE_FECHA_EN.match(crudo)
    if not m:
        return None
    mes = _MESES_EN.get(m.group(1).lower())
    if mes is None:
        return None
    hora = int(m.group(4)) % 12
    if m.group(7).upper() == "PM":
        hora += 12
    try:
        return datetime(
            int(m.group(3)), mes, int(m.group(2)),
            hora, int(m.group(5)), int(m.group(6) or 0), tzinfo=tz,
        )
    except ValueError:
        return None


def fecha_desde_objectid(source_id: str | None) -> datetime | None:
    """Fallback: un ObjectId de Mongo lleva su timestamp de creación (UTC)."""
    if not source_id or not _RE_OBJECTID.match(source_id.strip()):
        return None
    return datetime.fromtimestamp(int(source_id.strip()[:8], 16), tz=UTC)


# --- mapas por banco --------------------------------------------------------

# «{:Banesco 396.79, :Mercantil 396.32 (lower liquidity),
#   :SpecificBank 326.25 (only 94737 available)}»
_RE_ENTRADA_BANCO = re.compile(
    r":([^\s,{}]+)\s+([\d.,]+)\s*(?:\(([^)]*)\))?"
)
_RE_DISPONIBLE = re.compile(r"only\s+([\d.,]+)\s+available", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class EntradaBanco:
    valor: Decimal | None
    liquidez_baja: bool
    disponible: Decimal | None


def parse_mapa_bancos(texto: str | None) -> dict[str, EntradaBanco]:
    """Mapa banco → valor con anotaciones opcionales entre paréntesis."""
    if not texto:
        return {}
    entradas: dict[str, EntradaBanco] = {}
    for nombre, valor, anotacion in _RE_ENTRADA_BANCO.findall(str(texto)):
        anotacion = anotacion or ""
        disponible = None
        if m := _RE_DISPONIBLE.search(anotacion):
            disponible = parse_numero(m.group(1))
        entradas[nombre] = EntradaBanco(
            valor=parse_numero(valor),
            liquidez_baja="lower liquidity" in anotacion.lower(),
            disponible=disponible,
        )
    return entradas


def es_mapa_bancos(valor: str | None) -> bool:
    return bool(valor) and str(valor).strip().startswith("{:")


# --- detección de columnas --------------------------------------------------

@dataclass(frozen=True, slots=True)
class MapeoColumnas:
    id: str | None
    fecha: str | None
    precio: str
    volumen_total: str | None
    mapa_tasas: str | None
    mapa_volumenes: str | None
    extra: tuple[str, ...]


def _norm(nombre: str) -> str:
    return re.sub(r"[^a-z0-9]", "", nombre.lower())


def _buscar(candidatas: list[str], *grupos_keywords: tuple[str, ...]) -> str | None:
    """Primera columna cuyo nombre normalizado contiene una keyword; los
    grupos se evalúan en orden de prioridad (el primero que matchee gana)."""
    for keywords in grupos_keywords:
        for col in candidatas:
            if any(k in _norm(col) for k in keywords):
                return col
    return None


def detectar_columnas(
    cabeceras: list[str], fila_muestra: dict[str, str]
) -> MapeoColumnas:
    """Heurística de mapeo: nombres de columna + contenido de una fila.

    Requiere al menos una columna de precio; la fecha puede faltar si hay un
    ID tipo ObjectId del que derivarla (fallback por fila).
    """
    mapas = [c for c in cabeceras if es_mapa_bancos(fila_muestra.get(c))]
    escalares = [c for c in cabeceras if c not in mapas]

    col_id = next((c for c in escalares if _norm(c) in ("id", "_id")), None)
    restantes = [c for c in escalares if c != col_id]

    mapa_tasas = _buscar(mapas, ("rate", "tasa", "price", "precio", "average", "promedio"))
    mapa_volumenes = _buscar(
        [c for c in mapas if c != mapa_tasas],
        ("volume", "volumen", "size", "amount", "monto"),
    )
    if mapa_tasas is None and len(mapas) == 1 and mapa_volumenes is None:
        mapa_tasas = mapas[0]  # un solo mapa sin keyword: se asume tasas

    fecha = _buscar(
        restantes,
        ("createdat", "capturedat", "fecha", "date", "timestamp", "time"),
    )
    restantes = [c for c in restantes if c != fecha]

    precio = _buscar(
        restantes,
        ("weightedaverage", "baseweighted"),
        ("precio", "price", "average", "promedio", "rate", "tasa"),
    )
    if precio is None or parse_numero(fila_muestra.get(precio)) is None:
        raise FormatoNoSoportado(
            "el archivo no tiene una columna de precio reconocible; "
            f"cabeceras: {', '.join(cabeceras)}"
        )
    restantes = [c for c in restantes if c != precio]

    volumen_total = _buscar(
        restantes,
        ("totalordersize", "totalorder", "totalsize", "totalvolume",
         "volumentotal", "ordersize", "volumen", "volume"),
    )
    restantes = [c for c in restantes if c != volumen_total]

    extra = tuple(restantes) + tuple(
        c for c in mapas if c not in (mapa_tasas, mapa_volumenes)
    )
    return MapeoColumnas(
        id=col_id,
        fecha=fecha,
        precio=precio,
        volumen_total=volumen_total,
        mapa_tasas=mapa_tasas,
        mapa_volumenes=mapa_volumenes,
        extra=extra,
    )


# --- fila → snapshot --------------------------------------------------------

def parsear_fila(
    fila: dict[str, str],
    mapeo: MapeoColumnas,
    tz: tzinfo,
    source_id_por_defecto: str,
) -> SnapshotHistorico:
    source_id = (fila.get(mapeo.id) or "").strip() if mapeo.id else ""
    if not source_id:
        source_id = source_id_por_defecto

    capturado_en = parse_fecha(fila.get(mapeo.fecha) if mapeo.fecha else None, tz)
    if capturado_en is None:
        capturado_en = fecha_desde_objectid(source_id)
    if capturado_en is None:
        raise FilaInvalida("fecha ilegible")

    precio = parse_numero(fila.get(mapeo.precio))
    if precio is None or precio <= 0:
        raise FilaInvalida("precio ilegible o no positivo")

    tasas = parse_mapa_bancos(fila.get(mapeo.mapa_tasas) if mapeo.mapa_tasas else None)
    volumenes = parse_mapa_bancos(
        fila.get(mapeo.mapa_volumenes) if mapeo.mapa_volumenes else None
    )
    bancos = {
        nombre: DatoBanco(
            tasa=tasas[nombre].valor if nombre in tasas else None,
            volumen=volumenes[nombre].valor if nombre in volumenes else None,
            liquidez_baja=(
                (nombre in tasas and tasas[nombre].liquidez_baja)
                or (nombre in volumenes and volumenes[nombre].liquidez_baja)
            ),
            disponible=(
                tasas[nombre].disponible
                if nombre in tasas and tasas[nombre].disponible is not None
                else (volumenes[nombre].disponible if nombre in volumenes else None)
            ),
        )
        for nombre in tasas.keys() | volumenes.keys()
    }

    extra = {
        col: fila[col]
        for col in mapeo.extra
        if fila.get(col) not in (None, "")
    }
    return SnapshotHistorico(
        source_id=source_id,
        capturado_en=capturado_en,
        precio_promedio=precio,
        volumen_total=parse_numero(
            fila.get(mapeo.volumen_total) if mapeo.volumen_total else None
        ),
        bancos=bancos,
        extra=extra,
    )
