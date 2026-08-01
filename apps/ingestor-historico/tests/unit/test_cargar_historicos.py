"""Unit: caso de uso CargarHistoricos contra el fixture real y repos en memoria."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

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


# -- reparación: rellenar campos vacíos sin sobrescribir ---------------------
#
# La tabla es inmutable por diseño (ADR-0013). `--rellenar-vacios` es la única
# excepción y existe por un caso concreto: un defecto del parseo dejó
# `banks[].volume` nulo en 31.461 filas ya cargadas.

CABECERAS_ANIDADO = [
    "ID", "BaseWeightedAverage", "AverageRatePerBank", "InforPerBank", "CreatedAt",
]


def _fila(volumenes: bool):
    fila = {
        "ID": "6955f14de64c795a5f456ffe",
        "BaseWeightedAverage": "556.12",
        "AverageRatePerBank": "{:Banesco 556.12}",
        "CreatedAt": "January 1, 2026, 12:00 AM",
    }
    fila["InforPerBank"] = (
        "{:Banesco {:volume 161309.48, :averageRate 556.12}}" if volumenes else "{}"
    )
    return fila


async def _cargar(repositorio, fila, rellenar=False):
    return await CargarHistoricos(repositorio).ejecutar(
        CABECERAS_ANIDADO, [fila], "export.csv", TZ_CARACAS, rellenar
    )


async def test_sin_el_flag_una_fila_ya_cargada_no_se_toca():
    repositorio = InMemoryRepositorioHistorico()
    await _cargar(repositorio, _fila(volumenes=False))
    resumen = await _cargar(repositorio, _fila(volumenes=True))

    assert (resumen.insertadas, resumen.duplicadas, resumen.actualizadas) == (0, 1, 0)
    guardado = next(iter(repositorio.snapshots.values()))
    assert guardado.bancos["Banesco"].volumen is None


async def test_con_el_flag_se_rellena_el_campo_que_faltaba():
    repositorio = InMemoryRepositorioHistorico()
    await _cargar(repositorio, _fila(volumenes=False))
    resumen = await _cargar(repositorio, _fila(volumenes=True), rellenar=True)

    assert (resumen.insertadas, resumen.duplicadas, resumen.actualizadas) == (0, 0, 1)
    guardado = next(iter(repositorio.snapshots.values()))
    assert guardado.bancos["Banesco"].volumen == Decimal("161309.48")


async def test_el_flag_NO_sobrescribe_un_valor_que_ya_estaba():
    """La guarda es lo que hace la reparación segura: si la fila guardada ya
    tiene volúmenes, se deja intacta aunque el export traiga otros."""
    repositorio = InMemoryRepositorioHistorico()
    await _cargar(repositorio, _fila(volumenes=True))

    otra = _fila(volumenes=True)
    otra["InforPerBank"] = "{:Banesco {:volume 999999.99, :averageRate 556.12}}"
    resumen = await _cargar(repositorio, otra, rellenar=True)

    assert (resumen.duplicadas, resumen.actualizadas) == (1, 0)
    guardado = next(iter(repositorio.snapshots.values()))
    assert guardado.bancos["Banesco"].volumen == Decimal("161309.48")


async def test_el_flag_es_idempotente_la_segunda_pasada_no_actualiza_nada():
    repositorio = InMemoryRepositorioHistorico()
    await _cargar(repositorio, _fila(volumenes=False))
    await _cargar(repositorio, _fila(volumenes=True), rellenar=True)
    resumen = await _cargar(repositorio, _fila(volumenes=True), rellenar=True)

    assert resumen.actualizadas == 0
