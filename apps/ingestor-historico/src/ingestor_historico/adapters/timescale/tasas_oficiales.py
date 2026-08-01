"""Repositorio de tasas oficiales históricas en TimescaleDB (ADR-0002, ADR-0013).

Escribe en `official_rates`, la misma tabla que alimenta el `ingestor-bcv` en
vivo: es LA tabla de tasas oficiales y la que sirve `/rates/official/history`.
Lo que distingue una fila histórica de una capturada es `source`, que ninguna
consulta filtra — así que marcarla es gratis y deja la procedencia a la vista.

Idempotencia por la PK (captured_at, currency) con ON CONFLICT DO NOTHING:
recargar el mismo export no duplica. Consultas parametrizadas (A05).

**No puede pisar la serie viva.** `historial_tasa_oficial` resuelve cada
`value_date` con `DISTINCT ON ... ORDER BY captured_at DESC`, y la hora de
publicación del BCV es anterior a la de nuestra captura para el mismo día, así
que donde ambas existen sigue ganando la viva. El histórico rellena hacia atrás,
no reescribe hacia delante.
"""

from __future__ import annotations

from typing import Sequence

import asyncpg

from ingestor_historico.application.ports import ResumenPersistencia
from ingestor_historico.domain.tasas_oficiales import TasaOficialHistorica

# `status` = 'valid': el pipeline de origen ya puso en cuarentena lo dudoso
# (BID>ASK, valores ausentes, spreads incoherentes) y esas filas no llegan al
# export. Marcarlas 'suspect' aquí insinuaría una duda que no tenemos.
_INSERT = """
    INSERT INTO official_rates
        (captured_at, currency, rate, value_date, status, source)
    SELECT * FROM UNNEST(
        $1::timestamptz[], $2::text[], $3::numeric[], $4::date[], $5::text[], $6::text[]
    )
    ON CONFLICT (captured_at, currency) DO NOTHING
"""

# Seis años de tasas son ~31 k filas: se insertan por lotes en vez de fila a
# fila. Un lote grande de más solo empeora el pico de memoria del servidor.
TAMANO_LOTE = 2_000


class TimescaleRepositorioTasasOficiales:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleRepositorioTasasOficiales":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def guardar_tasas(
        self, tasas: Sequence[TasaOficialHistorica]
    ) -> ResumenPersistencia:
        insertados = 0
        async with self._pool.acquire() as conexion:
            async with conexion.transaction():
                for inicio in range(0, len(tasas), TAMANO_LOTE):
                    lote = tasas[inicio : inicio + TAMANO_LOTE]
                    estado = await conexion.execute(
                        _INSERT,
                        [t.publicado_en for t in lote],
                        [t.moneda for t in lote],
                        [t.valor for t in lote],
                        [t.fecha_valor for t in lote],
                        ["valid"] * len(lote),
                        [t.fuente for t in lote],
                    )
                    # asyncpg devuelve el command tag: "INSERT 0 <n>".
                    insertados += int(estado.rsplit(" ", 1)[-1])
        return ResumenPersistencia(
            insertados=insertados, duplicados=len(tasas) - insertados
        )
