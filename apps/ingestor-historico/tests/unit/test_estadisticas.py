"""Unit: varianza histórica (funciones puras)."""

from __future__ import annotations

import math
from datetime import datetime
from decimal import Decimal

from conftest import TZ_CARACAS

from ingestor_historico.domain.estadisticas import (
    PuntoSerie,
    resumen_serie,
    retornos_log,
    varianza_historica,
    varianza_por_dia,
)


def _punto(dia: int, hora: int, precio: str, **tasas: str) -> PuntoSerie:
    return PuntoSerie(
        capturado_en=datetime(2025, 12, dia, hora, 0, tzinfo=TZ_CARACAS),
        precio=Decimal(precio),
        tasas_por_banco={b: Decimal(t) for b, t in tasas.items()},
    )


class TestResumenSerie:
    def test_varianza_muestral(self):
        resumen = resumen_serie([1.0, 2.0, 3.0, 4.0])
        assert resumen.n == 4
        assert resumen.media == 2.5
        assert math.isclose(resumen.varianza, 5.0 / 3.0)
        assert math.isclose(resumen.desviacion, math.sqrt(5.0 / 3.0))
        assert (resumen.minimo, resumen.maximo) == (1.0, 4.0)

    def test_un_solo_valor_varianza_cero(self):
        resumen = resumen_serie([396.55])
        assert resumen.n == 1
        assert resumen.varianza == 0.0

    def test_serie_vacia(self):
        assert resumen_serie([]) is None

    def test_coeficiente_variacion(self):
        resumen = resumen_serie([10.0, 10.0, 10.0])
        assert resumen.coeficiente_variacion == 0.0


class TestRetornosLog:
    def test_retorno_simple(self):
        assert retornos_log([100.0, 110.0]) == [math.log(1.1)]

    def test_ignora_no_positivos(self):
        assert retornos_log([100.0, 0.0, 110.0]) == [math.log(1.1)]

    def test_menos_de_dos_valores(self):
        assert retornos_log([100.0]) == []


class TestVarianzaHistorica:
    def test_ordena_y_resume(self):
        puntos = [
            _punto(3, 10, "400", Banesco="401", Mercantil="399"),
            _punto(2, 10, "396", Banesco="397", Mercantil="395"),
            _punto(4, 10, "410", Banesco="411"),
        ]
        resultado = varianza_historica(puntos)
        assert resultado.desde == puntos[1].capturado_en
        assert resultado.hasta == puntos[2].capturado_en
        assert resultado.precio.n == 3
        assert resultado.retornos.n == 2
        assert set(resultado.por_banco) == {"Banesco", "Mercantil"}
        assert resultado.por_banco["Banesco"].n == 3
        assert resultado.por_banco["Mercantil"].n == 2  # falta en un snapshot

    def test_sin_puntos(self):
        assert varianza_historica([]) is None

    def test_por_dia_agrupa_en_fecha_local(self):
        puntos = [
            _punto(2, 9, "396"),
            _punto(2, 18, "398"),
            _punto(3, 9, "400"),
        ]
        resultados = varianza_por_dia(puntos)
        assert [dia.isoformat() for dia, _ in resultados] == ["2025-12-02", "2025-12-03"]
        assert resultados[0][1].precio.n == 2
        assert resultados[1][1].precio.n == 1
