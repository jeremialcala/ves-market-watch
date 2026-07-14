"""Unit: caso de uso CargarHistoricos contra el fixture real y repos en memoria."""

from __future__ import annotations

from datetime import datetime

import pytest
from conftest import FIXTURES, TZ_CARACAS

from ingestor_historico.adapters.csv_reader import leer_csv
from ingestor_historico.adapters.memory import InMemoryRepositorioHistorico
from ingestor_historico.application.cargar_historicos import CargarHistoricos
from ingestor_historico.domain.parser import FormatoNoSoportado

FIXTURE = FIXTURES / "query_result_muestra.csv"


async def test_carga_completa_del_fixture():
    cabeceras, filas = leer_csv(FIXTURE)
    repositorio = InMemoryRepositorioHistorico()

    resumen = await CargarHistoricos(repositorio).ejecutar(
        cabeceras, filas, FIXTURE.name, TZ_CARACAS
    )

    assert resumen.total_filas == 11
    assert resumen.insertadas == 11
    assert resumen.duplicadas == 0
    assert resumen.descartadas == {}
    assert resumen.desde == datetime(2025, 12, 2, 17, 20, tzinfo=TZ_CARACAS)
    assert resumen.hasta == datetime(2025, 12, 11, 13, 20, tzinfo=TZ_CARACAS)
    assert resumen.bancos == ("Banesco", "Mercantil", "SpecificBank")


async def test_recarga_es_idempotente():
    cabeceras, filas = leer_csv(FIXTURE)
    repositorio = InMemoryRepositorioHistorico()
    caso = CargarHistoricos(repositorio)

    await caso.ejecutar(cabeceras, filas, FIXTURE.name, TZ_CARACAS)
    resumen = await caso.ejecutar(cabeceras, filas, FIXTURE.name, TZ_CARACAS)

    assert resumen.insertadas == 0
    assert resumen.duplicadas == 11
    assert len(repositorio.snapshots) == 11


async def test_filas_corruptas_se_descartan_sin_abortar():
    cabeceras, filas = leer_csv(FIXTURE)
    filas.append(dict(filas[0], ID="ffffffffffffffffffffffff", BaseWeightedAverage="?"))
    filas.append(dict(filas[0], ID="no-id-valido", CreatedAt="fecha rota"))
    repositorio = InMemoryRepositorioHistorico()

    resumen = await CargarHistoricos(repositorio).ejecutar(
        cabeceras, filas, FIXTURE.name, TZ_CARACAS
    )

    assert resumen.insertadas == 11
    assert resumen.descartadas == {
        "precio ilegible o no positivo": 1,
        "fecha ilegible": 1,
    }


async def test_sin_columna_id_usa_hash_determinista():
    cabeceras = ["Fecha", "Precio"]
    filas = [
        {"Fecha": "2025-12-02T17:20:00", "Precio": "396.55"},
        {"Fecha": "2025-12-02T17:30:00", "Precio": "396.60"},
    ]
    repositorio = InMemoryRepositorioHistorico()
    caso = CargarHistoricos(repositorio)

    primero = await caso.ejecutar(cabeceras, filas, "sin_id.csv", TZ_CARACAS)
    segundo = await caso.ejecutar(cabeceras, filas, "sin_id.csv", TZ_CARACAS)

    assert primero.insertadas == 2
    assert segundo.insertadas == 0
    assert segundo.duplicadas == 2


async def test_archivo_vacio_es_rechazado():
    with pytest.raises(FormatoNoSoportado):
        await CargarHistoricos(InMemoryRepositorioHistorico()).ejecutar(
            ["A"], [], "vacio.csv", TZ_CARACAS
        )
