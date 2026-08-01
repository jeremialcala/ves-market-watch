"""Repositorio de la brecha histórica derivada (ADR-0013 RF-7).

Escribe en `indicators`, la misma tabla que el motor. Tres decisiones que hacen
que eso no corrompa el estado del motor:

1. **`frontera_serie_viva` corta el backfill.** Ver `derivar_brechas.py`: las
   marcas de tiempo de las dos series no coinciden, así que el `ON CONFLICT` no
   basta y hay que no escribir en el tramo del motor, no confiar en que colisione.
2. **`calc_version = 0`**, sentinela de «derivado». `WHERE calc_version = 1`
   sigue devolviendo solo lo que calculó el motor.
3. **`metadata` con la procedencia y el sesgo medido.** La fila se puede auditar
   sin saber esta historia.

Consultas parametrizadas (A05).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Sequence

import asyncpg

from ingestor_historico.application.ports import PuntoDerivable, ResumenPersistencia
from ingestor_historico.domain.brechas import (
    CALC_VERSION_DERIVADO,
    INDICADOR_ABS,
    INDICADOR_PCT,
    MONEDA,
    BrechaDerivada,
)

# La tasa oficial VIGENTE en el instante del snapshot: el último `captured_at`
# anterior o igual. El LATERAL evita traerse la tabla de tasas entera y es el
# mismo patrón con el que se midió el sesgo antes de decidir el diseño.
_PUNTOS = """
    SELECT s.captured_at,
           s.base_weighted_avg,
           o.rate
      FROM historical_market_snapshots s
      LEFT JOIN LATERAL (
           SELECT rate
             FROM official_rates
            WHERE currency = 'USD' AND status = 'valid'
              AND captured_at <= s.captured_at
            ORDER BY captured_at DESC
            LIMIT 1) o ON TRUE
     WHERE ($1::timestamptz IS NULL OR s.captured_at < $1)
     ORDER BY s.captured_at
"""

_FRONTERA = """
    SELECT min(as_of) FROM indicators
     WHERE indicator = $1 AND currency = $2 AND calc_version <> $3
"""

_INSERT = """
    INSERT INTO indicators (as_of, indicator, currency, value, calc_version, metadata)
    SELECT u.as_of, u.indicador, u.moneda, u.valor, u.calc, $6::jsonb
      FROM UNNEST($1::timestamptz[], $2::text[], $3::text[],
                  $4::numeric[], $5::int[])
        AS u(as_of, indicador, moneda, valor, calc)
    ON CONFLICT (as_of, indicator, currency) DO NOTHING
"""

TAMANO_LOTE = 2_000


class TimescaleRepositorioBrechas:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleRepositorioBrechas":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def frontera_serie_viva(
        self, indicador: str, moneda: str
    ) -> datetime | None:
        return await self._pool.fetchval(
            _FRONTERA, indicador, moneda, CALC_VERSION_DERIVADO
        )

    async def puntos_derivables(
        self, hasta_exclusive: datetime | None
    ) -> list[PuntoDerivable]:
        filas = await self._pool.fetch(_PUNTOS, hasta_exclusive)
        return [
            PuntoDerivable(
                as_of=f["captured_at"],
                precio_p2p=f["base_weighted_avg"],
                tasa_oficial=f["rate"],
            )
            for f in filas
        ]

    async def guardar_brechas(
        self, brechas: Sequence[BrechaDerivada], metadata: dict
    ) -> ResumenPersistencia:
        payload = json.dumps(metadata, ensure_ascii=False)
        # Dos filas por punto: el porcentaje y el absoluto.
        filas = [
            (b.as_of, nombre, valor)
            for b in brechas
            for nombre, valor in ((INDICADOR_PCT, b.pct), (INDICADOR_ABS, b.abs))
        ]
        insertadas = 0
        async with self._pool.acquire() as conexion:
            async with conexion.transaction():
                for inicio in range(0, len(filas), TAMANO_LOTE):
                    lote = filas[inicio : inicio + TAMANO_LOTE]
                    estado = await conexion.execute(
                        _INSERT,
                        [f[0] for f in lote],
                        [f[1] for f in lote],
                        [MONEDA] * len(lote),
                        [f[2] for f in lote],
                        [CALC_VERSION_DERIVADO] * len(lote),
                        payload,
                    )
                    insertadas += int(estado.rsplit(" ", 1)[-1])
        return ResumenPersistencia(
            insertados=insertadas, duplicados=len(filas) - insertadas
        )
