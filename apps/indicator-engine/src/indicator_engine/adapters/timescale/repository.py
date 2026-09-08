"""Repositorio de indicadores en PostgreSQL + TimescaleDB (ADR-0002).

Esquema en `db/migrations/001_indicators.sql`. Consultas parametrizadas (A05).
Mínimo privilegio del rol (A01): INSERT/SELECT sobre `indicators`,
`processed_events`, `signals` e `indicator_analysis`, y **SELECT sobre
`official_rates`** — solo lectura, y solo de `value_date`: la vigencia de la
tasa la manda su fecha-valor y ese dato no vive en `indicators`
(`domain/vigencia.py`). El motor no escribe nunca en esa tabla, que es del
ingestor-bcv.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Sequence

import asyncpg

from indicator_engine.domain.analisis import Analisis, Distribucion
from indicator_engine.domain.comparativas import Agregado
from indicator_engine.domain.models import Indicador
from indicator_engine.domain.reglas import Senal


class TimescaleIndicatorRepository:
    """Adaptador del puerto `IndicatorRepository` sobre asyncpg."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleIndicatorRepository":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    @property
    def pool(self) -> asyncpg.Pool:
        """El pool, para montar sobre él otros adaptadores del mismo servicio
        (p. ej. `TimescaleDistribucionRepository`) sin abrir una segunda conexión."""
        return self._pool

    async def close(self) -> None:
        await self._pool.close()

    async def ya_procesado(self, event_id: str) -> bool:
        fila = await self._pool.fetchrow(
            "SELECT 1 FROM processed_events WHERE event_id = $1::uuid", event_id
        )
        return fila is not None

    async def marcar_procesado(self, event_id: str, event_type: str) -> None:
        await self._pool.execute(
            """
            INSERT INTO processed_events (event_id, event_type)
            VALUES ($1::uuid, $2)
            ON CONFLICT (event_id) DO NOTHING
            """,
            event_id,
            event_type,
        )

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        fila = await self._pool.fetchrow(
            """
            SELECT as_of, indicator, currency, value, calc_version
            FROM indicators
            WHERE indicator = $1 AND currency = $2
            ORDER BY as_of DESC
            LIMIT 1
            """,
            nombre,
            moneda,
        )
        if fila is None:
            return None
        return Indicador(
            nombre=fila["indicator"],
            moneda=fila["currency"],
            valor=fila["value"],
            as_of=fila["as_of"],
            calc_version=fila["calc_version"],
        )

    async def fecha_valor_oficial(self, moneda: str) -> date | None:
        """La fecha-valor de la última tasa VÁLIDA.

        `status = 'valid'` no es opcional: una tasa retenida por variación
        sospechosa (T1, ADR-0007) no rige nada, y tomarla como vigencia haría
        que una lectura bloqueada por seguridad pareciera dato bueno.

        Se ordena por `value_date` y no por `captured_at`: son dos ejes del
        modelo bitemporal (ADR-0009) y aquí interesa la vigencia, no cuándo se
        vio. Un resondeo tardío de una tasa antigua no debe adelantar a la del
        día siguiente ya capturada.
        """
        fila = await self._pool.fetchrow(
            """
            SELECT value_date
            FROM official_rates
            WHERE currency = $1 AND status = 'valid'
            ORDER BY value_date DESC, captured_at DESC
            LIMIT 1
            """,
            moneda,
        )
        return None if fila is None else fila["value_date"]

    async def indicador_asof(
        self, nombre: str, moneda: str, momento
    ) -> Indicador | None:
        fila = await self._pool.fetchrow(
            """
            SELECT as_of, indicator, currency, value, calc_version
            FROM indicators
            WHERE indicator = $1 AND currency = $2 AND as_of <= $3
            ORDER BY as_of DESC
            LIMIT 1
            """,
            nombre,
            moneda,
            momento,
        )
        if fila is None:
            return None
        return Indicador(
            nombre=fila["indicator"],
            moneda=fila["currency"],
            valor=fila["value"],
            as_of=fila["as_of"],
            calc_version=fila["calc_version"],
        )

    async def guardar(self, indicadores: list[Indicador]) -> None:
        # ON CONFLICT DO NOTHING: la reentrega de un evento (at-least-once)
        # no duplica filas — la PK (as_of, indicator, currency) es determinista.
        await self._pool.executemany(
            """
            INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (as_of, indicator, currency) DO NOTHING
            """,
            [
                (i.as_of, i.nombre, i.moneda, i.valor, i.calc_version)
                for i in indicadores
            ],
        )

    async def senal_reciente(self, tipo: str, moneda: str, desde: datetime) -> bool:
        fila = await self._pool.fetchrow(
            """
            SELECT 1 FROM signals
            WHERE type = $1 AND currency = $2 AND as_of >= $3
            LIMIT 1
            """,
            tipo,
            moneda,
            desde,
        )
        return fila is not None

    async def guardar_senales(self, senales: list[Senal]) -> None:
        if not senales:
            return
        # emitted_at lo pone el DEFAULT now() de la tabla; ON CONFLICT DO NOTHING
        # es defensa en profundidad (el dedup real es cooldown + idempotencia del
        # snapshot). evidence = {rule, inputs} como JSONB.
        await self._pool.executemany(
            """
            INSERT INTO signals
                (as_of, type, direction, currency, rule, calc_version, triggered_by, evidence)
            VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    s.as_of,
                    s.tipo,
                    s.direccion,
                    s.moneda,
                    s.regla,
                    s.calc_version,
                    s.triggered_by,
                    json.dumps(
                        {
                            "rule": s.regla,
                            "inputs": {k: format(v, "f") for k, v in s.inputs.items()},
                        }
                    ),
                )
                for s in senales
            ],
        )

    async def guardar_analisis(self, analisis: Analisis, payload: dict) -> None:
        # payload verbatim: el documento ES el contrato, así el GET del gateway
        # devuelve exactamente lo publicado y los decimales siguen siendo strings
        # exactos sin round-trip por numeric (ADR-0017/ADR-0019).
        # ON CONFLICT DO NOTHING: la reentrega del snapshot (at-least-once) no
        # duplica — la PK (as_of, currency, triggered_by) es determinista.
        await self._pool.execute(
            """
            INSERT INTO indicator_analysis
                (as_of, currency, triggered_by, calc_version, analysis_version,
                 ruleset_version, confidence, official_stale, scale_source, payload)
            VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)
            ON CONFLICT (as_of, currency, triggered_by) DO NOTHING
            """,
            analisis.as_of,
            analisis.moneda,
            analisis.triggered_by,
            analisis.calc_version,
            analisis.analysis_version,
            analisis.ruleset_version,
            analisis.confianza,
            analisis.official_stale,
            analisis.fuente_escala,
            json.dumps(payload, ensure_ascii=False),
        )


_OCHO_DECIMALES = Decimal("0.00000001")


def _a_ocho(valor: Decimal | None) -> Decimal | None:
    """Misma escala que `indicators.value` (numeric(24,8))."""
    return None if valor is None else valor.quantize(_OCHO_DECIMALES)


class TimescaleDistribucionRepository:
    """Adaptador del puerto `DistribucionRepository` sobre asyncpg.

    Una sola consulta para los seis medidores: la forma multi-fracción de
    `percentile_disc` devuelve todos los cortes en un array por indicador, así
    que un refresco es un round trip y no seis.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    # percentile_disc, NUNCA percentile_cont — y es de fondo, no de estilo:
    # PostgreSQL no tiene sobrecarga `numeric` de percentile_cont (sus firmas son
    # double precision e interval), así que sobre `value numeric(24,8)` haría un
    # cast implícito a float y devolvería float8. Eso metería un float justo en el
    # número que acaba en la UI, contra ADR-0017. percentile_disc es polimórfico
    # (anyelement → anyelement), devuelve numeric exacto Y el corte es un valor
    # realmente observado en la serie. NO CAMBIAR SIN RELEER ADR-0017.
    # El WHERE lo sirve entero indicators_name_currency_time_idx (001:21-22).
    _SQL = """
        SELECT indicator,
               count(*)                                                    AS muestras,
               min(value)                                                  AS minimo,
               max(value)                                                  AS maximo,
               percentile_disc($4::float8[]) WITHIN GROUP (ORDER BY value) AS cortes
        FROM indicators
        WHERE indicator = ANY($1::text[])
          AND currency  = $2
          AND as_of    >= $3
        GROUP BY indicator
    """

    # Una consulta para todos los indicadores Y todas las ventanas: el join
    # sobre el array de ventanas convierte N×M round trips en uno.
    #
    # LA MEDIA SE PROMEDIA POR HORA, NO POR MUESTRA, y no es un refinamiento:
    # el histórico derivado tiene una fila cada 10 min y el motor una cada ~30 s,
    # así que un `avg()` plano pondera 6× el tramo reciente. Medido sobre la
    # brecha de venta a 90 días: media plana 20,37 % contra 25,79 % ponderada por
    # tiempo — 5,4 puntos de sesgo hacia el tramo más muestreado. La hora es el
    # bucket adecuado porque ambas series tienen al menos una muestra en cada una.
    #
    # Los EXTREMOS siguen siendo por muestra: son valores realmente observados y
    # promediarlos por hora escondería justo el pico que interesa.
    #
    # `avg`/`max`/`min` sobre `numeric` devuelven `numeric` exacto — nada de
    # float en un número que acaba en la UI (ADR-0017).
    #
    # `dias_cubiertos` mide HASTA DÓNDE LLEGA la serie dentro de la ventana, no
    # cuántos días tienen dato: lo que invalida una media de 30 días es que la
    # serie empiece hace 12, no que falte una tarde. Se acota a la ventana para
    # que una serie más larga no declare cobertura de más.
    _SQL_AGREGADOS = """
        WITH por_hora AS (
            SELECT v.dias                      AS ventana_dias,
                   i.indicator,
                   time_bucket('1 hour', i.as_of) AS hora,
                   avg(i.value)                AS media_hora,
                   max(i.value)                AS maximo_hora,
                   min(i.value)                AS minimo_hora,
                   count(*)                    AS muestras_hora,
                   min(i.as_of)                AS primera
            FROM unnest($3::int[]) AS v(dias)
            JOIN indicators i
              ON i.indicator = ANY($1::text[])
             AND i.currency  = $2
             AND i.as_of    >= $4::timestamptz - make_interval(days => v.dias)
             AND i.as_of    <= $4::timestamptz
            GROUP BY v.dias, i.indicator, time_bucket('1 hour', i.as_of)
        )
        SELECT ventana_dias,
               indicator,
               avg(media_hora)                 AS media,
               max(maximo_hora)                AS maximo,
               min(minimo_hora)                AS minimo,
               -- ::bigint NO es cosmético: sum() sobre bigint devuelve NUMERIC
               -- en PostgreSQL, y ese Decimal reventaba el json.dumps del
               -- payload al persistir el análisis.
               sum(muestras_hora)::bigint      AS muestras,
               LEAST(ventana_dias,
                     ($4::timestamptz)::date - min(primera)::date) AS dias_cubiertos
        FROM por_hora
        GROUP BY ventana_dias, indicator
    """

    async def agregados(
        self,
        nombres: Sequence[str],
        moneda: str,
        ventanas_dias: Sequence[int],
        ahora: datetime,
    ) -> dict[str, dict[int, Agregado]]:
        filas = await self._pool.fetch(
            self._SQL_AGREGADOS, list(nombres), moneda, list(ventanas_dias), ahora
        )
        resultado: dict[str, dict[int, Agregado]] = {}
        for fila in filas:
            resultado.setdefault(fila["indicator"], {})[fila["ventana_dias"]] = Agregado(
                ventana_dias=fila["ventana_dias"],
                # `avg()` sobre numeric devuelve ~16 decimales; el resto del
                # contrato va a 8 y una media con 16 solo aparenta precisión.
                media=_a_ocho(fila["media"]),
                maximo=_a_ocho(fila["maximo"]),
                minimo=_a_ocho(fila["minimo"]),
                muestras=int(fila["muestras"]),
                dias_cubiertos=max(0, int(fila["dias_cubiertos"])),
            )
        return resultado

    async def distribuciones(
        self,
        nombres: Sequence[str],
        moneda: str,
        desde: datetime,
        percentiles: Sequence[Decimal],
    ) -> dict[str, Distribucion]:
        # Las fracciones son argumento de percentile_disc (qué corte pedir), no
        # un valor de mercado: float8 aquí no toca ningún número de la UI.
        fracciones = [float(p) for p in percentiles]
        filas = await self._pool.fetch(
            self._SQL, list(nombres), moneda, desde, fracciones
        )
        calculada_en = datetime.now(UTC)
        return {
            fila["indicator"]: Distribucion(
                muestras=fila["muestras"],
                minimo=fila["minimo"],
                maximo=fila["maximo"],
                cortes=tuple(fila["cortes"] or ()),
                calculada_en=calculada_en,
            )
            for fila in filas
        }
