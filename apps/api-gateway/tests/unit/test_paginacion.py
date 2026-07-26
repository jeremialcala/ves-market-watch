"""Regla transversal del contrato: rango ≤ 90 días y paginación acotada."""

from datetime import date

import pytest

from api_gateway.domain.errores import ParametroInvalido, RangoInvalido
from api_gateway.domain.paginacion import (
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
