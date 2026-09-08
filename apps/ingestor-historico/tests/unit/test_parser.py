"""Unit: parseo adaptativo de exports (valores, mapas por banco, columnas)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from conftest import TZ_CARACAS

from ingestor_historico.domain.parser import (
    FilaInvalida,
    FormatoNoSoportado,
    detectar_columnas,
    fecha_desde_objectid,
    parse_fecha,
    parse_mapa_bancos,
    parse_numero,
    parsear_fila,
)

CABECERAS_REFERENCIA = [
    "ID", "BaseWeightedAverage", "AverageRatePerBank",
    "TotalOrderSize", "CreatedAt", "VolumePerBank",
]

FILA_REFERENCIA = {
    "ID": "692f5804db32e097a433c45a",
    "BaseWeightedAverage": "396.55",
    "AverageRatePerBank": (
        "{:Banesco 396.79, :Mercantil 396.32, "
        ":SpecificBank 326.25 (only 94737 available)}"
    ),
    "TotalOrderSize": "1,057,013.1",
    "CreatedAt": "December 2, 2025, 5:20 PM",
    "VolumePerBank": (
        "{:Banesco 380657.46, :Mercantil 187042.38, :SpecificBank 94737.37}"
    ),
}


class TestParseNumero:
    def test_separador_de_miles(self):
        assert parse_numero("1,057,013.1") == Decimal("1057013.1")

    def test_simple(self):
        assert parse_numero("396.55") == Decimal("396.55")

    def test_vacio_y_basura(self):
        assert parse_numero("") is None
        assert parse_numero(None) is None
        assert parse_numero("n/a") is None


class TestParseFecha:
    def test_formato_ingles_pm(self):
        fecha = parse_fecha("December 2, 2025, 5:20 PM", TZ_CARACAS)
        assert fecha == datetime(2025, 12, 2, 17, 20, tzinfo=TZ_CARACAS)

    def test_medianoche_12_am(self):
        fecha = parse_fecha("December 3, 2025, 12:00 AM", TZ_CARACAS)
        assert fecha == datetime(2025, 12, 3, 0, 0, tzinfo=TZ_CARACAS)

    def test_mediodia_12_pm(self):
        fecha = parse_fecha("December 3, 2025, 12:10 PM", TZ_CARACAS)
        assert fecha == datetime(2025, 12, 3, 12, 10, tzinfo=TZ_CARACAS)

    def test_iso_con_zulu(self):
        fecha = parse_fecha("2026-06-09T02:45:00Z", TZ_CARACAS)
        assert fecha == datetime(2026, 6, 9, 2, 45, tzinfo=UTC)

    def test_iso_naive_asume_tz(self):
        fecha = parse_fecha("2025-12-02T17:20:00", TZ_CARACAS)
        assert fecha == datetime(2025, 12, 2, 17, 20, tzinfo=TZ_CARACAS)

    def test_ilegible(self):
        assert parse_fecha("ayer por la tarde", TZ_CARACAS) is None
        assert parse_fecha("", TZ_CARACAS) is None


class TestFechaDesdeObjectId:
    def test_timestamp_embebido(self):
        esperado = datetime.fromtimestamp(0x692F5804, tz=UTC)
        assert fecha_desde_objectid("692f5804db32e097a433c45a") == esperado

    def test_no_objectid(self):
        assert fecha_desde_objectid("59eecd7c-4f43-4ee1") is None
        assert fecha_desde_objectid(None) is None


class TestParseMapaBancos:
    def test_mapa_completo_con_anotaciones(self):
        entradas = parse_mapa_bancos(FILA_REFERENCIA["AverageRatePerBank"])
        assert set(entradas) == {"Banesco", "Mercantil", "SpecificBank"}
        assert entradas["Banesco"].valor == Decimal("396.79")
        assert not entradas["Banesco"].liquidez_baja
        assert entradas["SpecificBank"].disponible == Decimal("94737")

    def test_lower_liquidity(self):
        entradas = parse_mapa_bancos(
            "{:Banesco 398.5, :Mercantil 397.04 (lower liquidity)}"
        )
        assert entradas["Mercantil"].liquidez_baja
        assert entradas["Mercantil"].valor == Decimal("397.04")
        assert not entradas["Banesco"].liquidez_baja

    def test_bancos_arbitrarios(self):
        entradas = parse_mapa_bancos("{:BancoNuevo 12.5, :OtroBanco 13.1}")
        assert set(entradas) == {"BancoNuevo", "OtroBanco"}

    def test_vacio(self):
        assert parse_mapa_bancos(None) == {}
        assert parse_mapa_bancos("") == {}


class TestDetectarColumnas:
    def test_export_de_referencia(self):
        mapeo = detectar_columnas(CABECERAS_REFERENCIA, FILA_REFERENCIA)
        assert mapeo.id == "ID"
        assert mapeo.fecha == "CreatedAt"
        assert mapeo.precio == "BaseWeightedAverage"
        assert mapeo.volumen_total == "TotalOrderSize"
        assert mapeo.mapa_tasas == "AverageRatePerBank"
        assert mapeo.mapa_volumenes == "VolumePerBank"
        assert mapeo.extra == ()

    def test_cabeceras_alternativas_en_espanol(self):
        cabeceras = ["Fecha", "Precio Promedio", "Volumen", "Notas"]
        fila = {
            "Fecha": "2025-12-02T17:20:00",
            "Precio Promedio": "396.55",
            "Volumen": "1,057,013.1",
            "Notas": "alta demanda",
        }
        mapeo = detectar_columnas(cabeceras, fila)
        assert mapeo.fecha == "Fecha"
        assert mapeo.precio == "Precio Promedio"
        assert mapeo.volumen_total == "Volumen"
        assert mapeo.extra == ("Notas",)
        assert mapeo.mapa_tasas is None

    def test_archivo_ajeno_es_rechazado(self):
        cabeceras = ["ID", "Name", "Created At", "Updated At"]
        fila = {
            "ID": "59eecd7c-4f43-4ee1-bd72-2d3d73f7eb42",
            "Name": "ASAP A",
            "Created At": "February 3, 2026, 7:56 PM",
            "Updated At": "June 3, 2026, 7:34 PM",
        }
        with pytest.raises(FormatoNoSoportado):
            detectar_columnas(cabeceras, fila)


class TestParsearFila:
    def test_fila_de_referencia(self):
        mapeo = detectar_columnas(CABECERAS_REFERENCIA, FILA_REFERENCIA)
        snapshot = parsear_fila(FILA_REFERENCIA, mapeo, TZ_CARACAS, "fallback")

        assert snapshot.source_id == "692f5804db32e097a433c45a"
        assert snapshot.capturado_en == datetime(
            2025, 12, 2, 17, 20, tzinfo=TZ_CARACAS
        )
        assert snapshot.precio_promedio == Decimal("396.55")
        assert snapshot.volumen_total == Decimal("1057013.1")
        assert set(snapshot.bancos) == {"Banesco", "Mercantil", "SpecificBank"}
        assert snapshot.bancos["Banesco"].tasa == Decimal("396.79")
        assert snapshot.bancos["Banesco"].volumen == Decimal("380657.46")
        assert snapshot.bancos["SpecificBank"].disponible == Decimal("94737")

    def test_fecha_fallback_desde_objectid(self):
        cabeceras = ["ID", "BaseWeightedAverage"]
        fila = {"ID": "692f5804db32e097a433c45a", "BaseWeightedAverage": "396.55"}
        mapeo = detectar_columnas(cabeceras, fila)
        snapshot = parsear_fila(fila, mapeo, TZ_CARACAS, "fallback")
        assert snapshot.capturado_en == datetime.fromtimestamp(0x692F5804, tz=UTC)

    def test_precio_ilegible_descarta(self):
        mapeo = detectar_columnas(CABECERAS_REFERENCIA, FILA_REFERENCIA)
        fila = dict(FILA_REFERENCIA, BaseWeightedAverage="---")
        with pytest.raises(FilaInvalida) as exc:
            parsear_fila(fila, mapeo, TZ_CARACAS, "fallback")
        assert exc.value.motivo == "precio ilegible o no positivo"

    def test_fecha_ilegible_sin_fallback_descarta(self):
        mapeo = detectar_columnas(CABECERAS_REFERENCIA, FILA_REFERENCIA)
        fila = dict(FILA_REFERENCIA, ID="no-es-objectid", CreatedAt="???")
        with pytest.raises(FilaInvalida) as exc:
            parsear_fila(fila, mapeo, TZ_CARACAS, "fallback")
        assert exc.value.motivo == "fecha ilegible"


# -- mapas anidados (formato del export desde julio de 2026) ------------------
#
# `InforPerBank` publica el volumen por banco en un submapa. Su NOMBRE no lleva
# ninguna palabra de volumen, así que la heurística por nombre lo dejaba fuera y
# `banks[].volume` quedaba nulo mientras el dato estaba en el archivo.

ANIDADO = (
    "{:Banesco {:volume 161309.48, :averageRate 556.12}, "
    ":Mercantil {:volume 91118.66, :averageRate 551.32}}"
)


def test_reconoce_un_mapa_anidado_frente_a_uno_plano():
    from ingestor_historico.domain.parser import es_mapa_anidado

    assert es_mapa_anidado(ANIDADO)
    assert not es_mapa_anidado("{:Banesco 556.12, :Mercantil 551.32}")
    assert not es_mapa_anidado("")


def test_extrae_la_clave_pedida_del_submapa():
    from ingestor_historico.domain.parser import parse_mapa_bancos

    volumenes = parse_mapa_bancos(ANIDADO, "volume")
    assert set(volumenes) == {"Banesco", "Mercantil"}
    assert volumenes["Banesco"].valor == Decimal("161309.48")

    tasas = parse_mapa_bancos(ANIDADO, "averageRate")
    assert tasas["Mercantil"].valor == Decimal("551.32")


def test_un_mapa_anidado_sin_clave_no_adivina():
    """Sin saber qué magnitud se quiere, devolver la primera sería inventar. El
    bug original hacía algo peor: el regex plano leía `:volume` y `:averageRate`
    como si fueran NOMBRES DE BANCO."""
    from ingestor_historico.domain.parser import parse_mapa_bancos

    assert parse_mapa_bancos(ANIDADO) == {}


def test_una_clave_ausente_en_el_submapa_no_inventa_entrada():
    from ingestor_historico.domain.parser import parse_mapa_bancos

    assert parse_mapa_bancos(ANIDADO, "disponible") == {}


def test_las_claves_del_submapa_se_pueden_inspeccionar():
    from ingestor_historico.domain.parser import claves_anidadas

    assert claves_anidadas(ANIDADO) == ("volume", "averageRate")
    assert claves_anidadas("{:Banesco 556.12}") == ()


def test_detecta_el_mapa_de_volumenes_por_CONTENIDO_no_por_nombre():
    """El caso real: `InforPerBank` no tiene ninguna keyword de volumen en el
    nombre. Antes acababa en `extra` y el volumen se perdía de `banks`."""
    from ingestor_historico.domain.parser import detectar_columnas

    cabeceras = ["ID", "BaseWeightedAverage", "AverageRatePerBank", "InforPerBank", "CreatedAt"]
    muestra = {
        "ID": "6955f14de64c795a5f456ffe",
        "BaseWeightedAverage": "556.12",
        "AverageRatePerBank": "{:Banesco 556.12, :Mercantil 551.32}",
        "InforPerBank": ANIDADO,
        "CreatedAt": "January 1, 2026, 12:00 AM",
    }
    mapeo = detectar_columnas(cabeceras, muestra)

    assert mapeo.mapa_tasas == "AverageRatePerBank"
    assert mapeo.clave_tasas is None          # el de tasas es plano
    assert mapeo.mapa_volumenes == "InforPerBank"
    assert mapeo.clave_volumenes == "volume"
    assert "InforPerBank" not in mapeo.extra  # ya no cae en el cajón de sastre


def test_el_volumen_anidado_llega_al_snapshot():
    from ingestor_historico.domain.parser import detectar_columnas, parsear_fila

    cabeceras = ["ID", "BaseWeightedAverage", "AverageRatePerBank", "InforPerBank", "CreatedAt"]
    fila = {
        "ID": "6955f14de64c795a5f456ffe",
        "BaseWeightedAverage": "556.12",
        "AverageRatePerBank": "{:Banesco 556.12, :Mercantil 551.32 (lower liquidity)}",
        "InforPerBank": ANIDADO,
        "CreatedAt": "January 1, 2026, 12:00 AM",
    }
    snapshot = parsear_fila(fila, detectar_columnas(cabeceras, fila), UTC, "x")

    assert snapshot.bancos["Banesco"].volumen == Decimal("161309.48")
    assert snapshot.bancos["Banesco"].tasa == Decimal("556.12")
    # Las anotaciones del mapa PLANO se conservan: el anidado añade, no desplaza.
    assert snapshot.bancos["Mercantil"].liquidez_baja


def test_un_mapa_anidado_puede_servir_de_tasas_si_no_hay_uno_plano():
    """Adaptabilidad (RF-2): si un export futuro trae solo el anidado, la tasa
    sale de él en vez de perderse."""
    from ingestor_historico.domain.parser import detectar_columnas

    cabeceras = ["ID", "BaseWeightedAverage", "InforPerBank", "CreatedAt"]
    muestra = {
        "ID": "6955f14de64c795a5f456ffe",
        "BaseWeightedAverage": "556.12",
        "InforPerBank": ANIDADO,
        "CreatedAt": "January 1, 2026, 12:00 AM",
    }
    mapeo = detectar_columnas(cabeceras, muestra)
    assert (mapeo.mapa_volumenes, mapeo.clave_volumenes) == ("InforPerBank", "volume")
