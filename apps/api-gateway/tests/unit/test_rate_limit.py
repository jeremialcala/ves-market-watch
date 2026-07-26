"""Rate limit por token: ventana fija con reloj inyectado (T4)."""

import pytest

from api_gateway.domain.errores import LimiteExcedido
from api_gateway.domain.rate_limit import LimitadorVentanaFija


class RelojFijo:
    def __init__(self, inicio: float = 1_000_000.0) -> None:
        self.ahora = inicio

    def __call__(self) -> float:
        return self.ahora


def test_agota_la_cuota_y_rechaza():
    reloj = RelojFijo()
    limitador = LimitadorVentanaFija(3, reloj=reloj)
    restantes = [limitador.consumir("sub-1").restante for _ in range(3)]
    assert restantes == [2, 1, 0]
    with pytest.raises(LimiteExcedido) as exc:
        limitador.consumir("sub-1")
    assert exc.value.limite == 3


def test_la_ventana_nueva_resetea_la_cuota():
    reloj = RelojFijo()
    limitador = LimitadorVentanaFija(1, reloj=reloj)
    limitador.consumir("sub-1")
    reloj.ahora += 60
    assert limitador.consumir("sub-1").restante == 0


def test_cuotas_independientes_por_clave():
    limitador = LimitadorVentanaFija(1, reloj=RelojFijo())
    limitador.consumir("sub-1")
    limitador.consumir("sub-2")  # no lanza


def test_reset_epoch_apunta_al_fin_de_la_ventana():
    reloj = RelojFijo(120.5)
    cuota = LimitadorVentanaFija(5, reloj=reloj).consumir("s")
    assert cuota.reset_epoch == 180
    assert cuota.como_headers()["X-RateLimit-Reset"] == "180"
