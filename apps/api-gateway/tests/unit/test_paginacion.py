"""Regla transversal del contrato: rango acotado y paginación acotada.

El tope se mide en FILAS desde el 2026-09-08, no en días de calendario. Lo que
se fija aquí es que el cambio **no relaja el peor caso**: 90 días a `5m` seguía
siendo el máximo que el contrato permitía y lo sigue siendo. Lo que se desbloquea
son las escalas anchas, que costaban dos órdenes de magnitud menos y estaban
prohibidas por medir el eje equivocado.
"""

from datetime import date, datetime, timedelta

import pytest

from api_gateway.domain.errores import ParametroInvalido, RangoInvalido
from api_gateway.domain.paginacion import (
    FILAS_MAX,
    INTERVALOS,
    Pagina,
    meta_pagina,
    validar_pagina,
    validar_rango,
)


def test_rango_de_90_dias_exactos_es_valido():
    validar_rango(date(2026, 1, 1), date(2026, 4, 1))  # 90 días


def test_rango_de_91_dias_es_rechazado():
    with pytest.raises(RangoInvalido):
        validar_rango(date(2026, 1, 1), date(2026, 4, 2))


# -- El tope por filas (endpoints con `interval`) -----------------------------

DESDE = datetime(2026, 1, 1)


def hasta(dias: int) -> datetime:
    return DESDE + timedelta(days=dias)


def test_el_peor_caso_de_antes_SIGUE_siendo_el_peor_caso():
    """90 d a 5 m son 25.920 buckets: el máximo que el contrato ya permitía."""
    validar_rango(DESDE, hasta(90), INTERVALOS["5m"])
    with pytest.raises(RangoInvalido):
        validar_rango(DESDE, hasta(91), INTERVALOS["5m"])


def test_nueve_meses_a_un_dia_dejan_de_estar_prohibidos():
    """279 filas y 38,9 ms en la base, contra 25.920 que sí se permitían.

    Es el caso que motivó el cambio: los 9 meses de brecha derivada estaban en
    la base y eran inalcanzables desde el cliente.
    """
    validar_rango(DESDE, hasta(279), INTERVALOS["1d"])


@pytest.mark.parametrize(
    "dias, intervalo",
    [(365, "1d"), (279, "1h"), (90, "5m"), (180, "15m")],
)
def test_escalas_anchas_permitidas(dias, intervalo):
    validar_rango(DESDE, hasta(dias), INTERVALOS[intervalo])


def test_una_escala_fina_sobre_un_rango_largo_SIGUE_bloqueada():
    """400 d a 15 m son 38.400 buckets. El tope no es «rango largo, adelante»:
    es el mismo presupuesto de filas, repartido según lo que cuesta cada
    bucket."""
    with pytest.raises(RangoInvalido):
        validar_rango(DESDE, hasta(400), INTERVALOS["15m"])


def test_el_error_dice_FILAS_y_no_dias():
    # Quien recibe el 422 tiene que poder deducir la salida: ensanchar el bucket
    # o acortar el rango. Un mensaje que hable de días no lo permite.
    with pytest.raises(RangoInvalido, match=r"filas"):
        validar_rango(DESDE, hasta(120), INTERVALOS["5m"])


def test_la_cota_es_superior_no_el_dato_real():
    # Se cuentan los buckets POSIBLES, no los que tengan dato: un guardia nunca
    # puede subestimar el coste de lo que aún no ha ejecutado.
    justo = timedelta(minutes=5) * FILAS_MAX
    validar_rango(DESDE, DESDE + justo, INTERVALOS["5m"])
    with pytest.raises(RangoInvalido):
        validar_rango(DESDE, DESDE + justo + timedelta(minutes=1), INTERVALOS["5m"])


def test_sin_intervalo_el_tope_sigue_siendo_en_dias():
    """Tasas oficiales por fecha-valor y señales: no hay bucket que contar."""
    validar_rango(date(2026, 1, 1), date(2026, 4, 1))
    with pytest.raises(RangoInvalido):
        validar_rango(date(2026, 1, 1), date(2026, 10, 1))


def test_el_rango_invertido_se_rechaza_ANTES_de_contar_filas():
    with pytest.raises(RangoInvalido, match=r"invertido"):
        validar_rango(hasta(10), DESDE, INTERVALOS["1d"])


def test_rango_invertido_es_rechazado():
    with pytest.raises(RangoInvalido):
        validar_rango(date(2026, 2, 1), date(2026, 1, 1))


def test_pagina_fuera_de_limites_es_rechazada():
    with pytest.raises(ParametroInvalido):
        validar_pagina(0, 100)
    with pytest.raises(ParametroInvalido):
        validar_pagina(1, 501)
    with pytest.raises(ParametroInvalido):
        validar_pagina(1, 0)


def test_offset_base_1():
    assert validar_pagina(3, 50).offset == 100


def test_meta_pagina_has_more():
    pagina = Pagina(numero=1, tamano=10)
    assert meta_pagina(pagina, items_devueltos=10, total=25)["has_more"] is True
    ultima = Pagina(numero=3, tamano=10)
    assert meta_pagina(ultima, items_devueltos=5, total=25)["has_more"] is False
