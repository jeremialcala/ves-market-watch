"""Repositorio de snapshots históricos en TimescaleDB (ADR-0002, ADR-0013).

Esquema en `db/migrations/001_historical_snapshots.sql`. Idempotencia por
PK (captured_at, source_id) con ON CONFLICT DO NOTHING: recargar el mismo
export no duplica filas. Consultas parametrizadas (A05).
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Sequence

import asyncpg

from ingestor_historico.application.ports import ResumenPersistencia
from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico

_COLUMNAS = """
    INSERT INTO historical_market_snapshots
        (captured_at, source_id, base_weighted_avg, total_order_size,
         banks, extra, source_file)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
"""

# `xmax = 0` distingue una fila recién insertada de una actualizada: sin esto,
# el command tag las cuenta juntas y el resumen mentiría.
_RETORNO = " RETURNING (xmax = 0) AS insertado"

_INSERT = _COLUMNAS + "ON CONFLICT (captured_at, source_id) DO NOTHING" + _RETORNO

# Reparación explícita, no el camino normal. La tabla es inmutable por diseño
# (ADR-0013) y esto es la única excepción: rellenar un campo que quedó vacío por
# un defecto del parseo, nunca reescribir uno que ya tiene valor.
#
# La guarda vive en SQL y no en Python a propósito: es la base la que decide si
# una fila concreta califica, mirando lo que REALMENTE tiene guardado. Solo pasa
# si lo almacenado no trae ningún volumen y lo nuevo sí aporta alguno; en
# cualquier otro caso la fila se queda intacta y cuenta como duplicada.
_INSERT_RELLENANDO = (
    _COLUMNAS
    + """
    ON CONFLICT (captured_at, source_id) DO UPDATE
       SET banks = EXCLUDED.banks,
           extra = EXCLUDED.extra
     WHERE NOT EXISTS (
             SELECT 1 FROM jsonb_each(historical_market_snapshots.banks) b
              WHERE b.value->>'volume' IS NOT NULL)
       AND EXISTS (
             SELECT 1 FROM jsonb_each(EXCLUDED.banks) b
              WHERE b.value->>'volume' IS NOT NULL)
    """
    + _RETORNO
)


def _banks_json(snapshot: SnapshotHistorico) -> str:
    return json.dumps(
        {
            banco: {
                "rate": float(dato.tasa) if dato.tasa is not None else None,
                "volume": float(dato.volumen) if dato.volumen is not None else None,
                "low_liquidity": dato.liquidez_baja,
                "available": (
                    float(dato.disponible) if dato.disponible is not None else None
                ),
            }
            for banco, dato in snapshot.bancos.items()
        },
        ensure_ascii=False,
    )


class TimescaleRepositorioHistorico:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleRepositorioHistorico":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def guardar_lote(
        self,
        snapshots: Sequence[SnapshotHistorico],
        archivo_origen: str,
        rellenar_vacios: bool = False,
    ) -> ResumenPersistencia:
        sql = _INSERT_RELLENANDO if rellenar_vacios else _INSERT
        insertados = actualizados = 0
        async with self._pool.acquire() as conexion:
            async with conexion.transaction():
                for snapshot in snapshots:
                    fila = await conexion.fetchrow(
                        sql,
                        snapshot.capturado_en,
                        snapshot.source_id,
                        snapshot.precio_promedio,
                        snapshot.volumen_total,
                        _banks_json(snapshot),
                        json.dumps(dict(snapshot.extra), ensure_ascii=False),
                        archivo_origen,
                    )
                    # Sin fila devuelta: el conflicto no disparó nada (DO NOTHING,
                    # o el WHERE de la reparación descartó esta fila).
                    if fila is None:
                        continue
                    if fila["insertado"]:
                        insertados += 1
                    else:
                        actualizados += 1
        return ResumenPersistencia(
            insertados=insertados,
            duplicados=len(snapshots) - insertados - actualizados,
            actualizados=actualizados,
        )

    async def leer_puntos(
        self, desde: datetime | None, hasta: datetime | None
    ) -> list[PuntoSerie]:
        filas = await self._pool.fetch(
            """
            SELECT captured_at, base_weighted_avg, banks
            FROM historical_market_snapshots
            WHERE ($1::timestamptz IS NULL OR captured_at >= $1)
              AND ($2::timestamptz IS NULL OR captured_at <= $2)
            ORDER BY captured_at
            """,
            desde,
            hasta,
        )
        return [
            PuntoSerie(
                capturado_en=fila["captured_at"],
                precio=Decimal(str(fila["base_weighted_avg"])),
                tasas_por_banco={
                    banco: Decimal(str(dato["rate"]))
                    for banco, dato in json.loads(fila["banks"]).items()
                    if dato.get("rate") is not None
                },
            )
            for fila in filas
        ]
