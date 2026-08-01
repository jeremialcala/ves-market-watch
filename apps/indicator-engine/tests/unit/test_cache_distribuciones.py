"""Cache con TTL de las distribuciones (RF-6, ADR-0019 D.3).

Reloj inyectado — nada de `sleep`: el TTL es de 15 minutos y un test no puede
esperarlos. Lo que se fija es la política de degradación: qué se sirve cuando la
consulta falla, y que degradar al respaldo sea siempre VISIBLE en el payload
(devolver `{}` es lo que fuerza `scale.source: "ruleset"`).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from indicator_engine.adapters.timescale.distribuciones import DistribucionesConTTL
from indicator_engine.domain.analisis import Distribucion

NOMBRES = ["p2p_spread_pct", "p2p_ratio_oferta_demanda"]
PERCENTILES = [Decimal("0.1"), Decimal("0.5"), Decimal("0.9")]
T0 = datetime(2026, 7, 31, 20, 0, tzinfo=UTC)


def distribucion(muestras: int) -> Distribucion:
    return Distribucion(
        muestras=muestras,
        minimo=Decimal("0"),
        maximo=Decimal("10"),
        cortes=(Decimal("2"), Decimal("5"), Decimal("8")),
        calculada_en=T0,
    )


class RepoFalso:
    """Cuenta consultas y puede fallar a demanda."""

    def __init__(self, muestras: int = 1000) -> None:
        self.llamadas = 0
        self.falla = False
        self.demora_s = 0.0
        self.muestras = muestras

    async def distribuciones(self, nombres, moneda, desde, percentiles):
        self.llamadas += 1
        if self.demora_s:
            await asyncio.sleep(self.demora_s)
        if self.falla:
            raise RuntimeError("timescale caída")
        return {n: distribucion(self.muestras) for n in nombres}


class Reloj:
    def __init__(self) -> None:
        self.ahora = T0

    def __call__(self) -> datetime:
        return self.ahora

    def avanzar(self, minutos: int) -> None:
        self.ahora += timedelta(minutes=minutos)


def cache(repo: RepoFalso, reloj: Reloj, **kwargs) -> DistribucionesConTTL:
    return DistribucionesConTTL(
        repo, ttl=timedelta(minutes=15), reloj=reloj, **kwargs
    )


async def consultar(c: DistribucionesConTTL, desde: datetime | None = None) -> dict:
    return await c.distribuciones(NOMBRES, "VES", desde or T0, PERCENTILES)


async def test_dentro_del_ttl_no_vuelve_a_consultar():
    """El engine procesa ~2 snapshots/min y la consulta barre ~1,5 M filas: sin
    esto correría en cada revisión."""
    repo, reloj = RepoFalso(), Reloj()
    c = cache(repo, reloj)
    await consultar(c)
    reloj.avanzar(14)
    await consultar(c)
    assert repo.llamadas == 1


async def test_vencido_el_ttl_refresca():
    repo, reloj = RepoFalso(), Reloj()
    c = cache(repo, reloj)
    await consultar(c)
    reloj.avanzar(16)
    await consultar(c)
    assert repo.llamadas == 2


async def test_la_ventana_no_entra_en_la_clave_de_cache():
    """`desde` cambia en cada snapshot: si entrara en la clave, el TTL no
    serviría de nada. El desfase se declara con `scale.computed_at`."""
    repo, reloj = RepoFalso(), Reloj()
    c = cache(repo, reloj)
    await consultar(c, desde=T0)
    await consultar(c, desde=T0 + timedelta(seconds=30))
    assert repo.llamadas == 1


async def test_un_fallo_con_cache_previa_sirve_la_entrada_vencida():
    """Una escala de hace 40 min sigue siendo real, y `computed_at` lo dice:
    mejor eso que degradar al respaldo."""
    repo, reloj = RepoFalso(muestras=4000), Reloj()
    c = cache(repo, reloj)
    await consultar(c)
    repo.falla = True
    reloj.avanzar(40)
    servido = await consultar(c)
    assert servido["p2p_spread_pct"].muestras == 4000


async def test_un_fallo_sin_cache_previa_degrada_de_forma_visible():
    """`{}` ⇒ el dominio elige el respaldo del ruleset, y eso viaja en el
    payload como `scale.source`. Nunca una degradación silenciosa."""
    repo, reloj = RepoFalso(), Reloj()
    repo.falla = True
    assert await consultar(cache(repo, reloj)) == {}


async def test_el_timeout_no_puede_retrasar_el_procesamiento_del_snapshot():
    repo, reloj = RepoFalso(), Reloj()
    repo.demora_s = 0.2
    c = cache(repo, reloj, timeout_s=0.01)
    assert await consultar(c) == {}


async def test_monedas_distintas_no_comparten_entrada():
    repo, reloj = RepoFalso(), Reloj()
    c = cache(repo, reloj)
    await c.distribuciones(NOMBRES, "VES", T0, PERCENTILES)
    await c.distribuciones(NOMBRES, "COP", T0, PERCENTILES)
    assert repo.llamadas == 2


@pytest.mark.parametrize("orden", [NOMBRES, list(reversed(NOMBRES))])
async def test_el_orden_de_los_nombres_no_parte_la_cache(orden):
    repo, reloj = RepoFalso(), Reloj()
    c = cache(repo, reloj)
    await c.distribuciones(NOMBRES, "VES", T0, PERCENTILES)
    await c.distribuciones(orden, "VES", T0, PERCENTILES)
    assert repo.llamadas == 1
