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


def test_vuelve_a_su_tamano_tras_una_rafaga_de_ips_y_una_ventana():
    """ADR-0028 §Verificación: las claves de ventanas vencidas no se quedan."""
    reloj = RelojFijo()
    limitador = LimitadorVentanaFija(600, reloj=reloj)
    for i in range(5000):
        limitador.consumir(f"198.51.{i // 256}.{i % 256}")
    assert len(limitador) == 5000
    reloj.ahora += 60
    limitador.consumir("203.0.113.7")
    assert len(limitador) == 1


def test_dentro_de_la_misma_ventana_no_poda_lo_vigente():
    reloj = RelojFijo()
    limitador = LimitadorVentanaFija(1, reloj=reloj)
    limitador.consumir("a")
    reloj.ahora += 1
    limitador.consumir("b")
    with pytest.raises(LimiteExcedido):
        limitador.consumir("a")


def test_con_tope_las_claves_no_pasan_de_max():
    limitador = LimitadorVentanaFija(5, reloj=RelojFijo(), max_claves=3)
    for clave in ("a", "b", "c", "d", "e"):
        limitador.consumir(clave)
    assert len(limitador) == 3
    assert limitador.desbordes == 2


def test_con_el_tope_lleno_una_ip_nueva_pasa_sin_contar():
    """Lleno no es motivo para negar el servicio a una IP nueva: la base la
    protege la caché, no la cuota."""
    limitador = LimitadorVentanaFija(1, reloj=RelojFijo(), max_claves=1)
    limitador.consumir("a")
    for _ in range(3):
        assert limitador.consumir("nueva").restante == 1
    assert limitador.desbordes == 3


def test_con_el_tope_lleno_las_claves_vigentes_siguen_limitadas():
    limitador = LimitadorVentanaFija(1, reloj=RelojFijo(), max_claves=1)
    limitador.consumir("a")
    with pytest.raises(LimiteExcedido):
        limitador.consumir("a")


def test_el_tope_se_libera_con_la_ventana_siguiente():
    reloj = RelojFijo()
    limitador = LimitadorVentanaFija(1, reloj=reloj, max_claves=1)
    limitador.consumir("a")
    reloj.ahora += 60
    assert limitador.consumir("b").restante == 0
    assert limitador.desbordes == 0


def test_reset_epoch_apunta_al_fin_de_la_ventana():
    reloj = RelojFijo(120.5)
    cuota = LimitadorVentanaFija(5, reloj=reloj).consumir("s")
    assert cuota.reset_epoch == 180
    assert cuota.como_headers()["X-RateLimit-Reset"] == "180"
