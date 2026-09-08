"""T1 — HTML alterado: el parser no inventa una tasa a partir de basura.

La amenaza T1 del threat model es «tasa oficial falsa entra al sistema» por MITM
o parseo erróneo. El control anclado en TLS (ADR-0006) cubre el transporte; esto
cubre la otra mitad: qué hace el parser cuando el HTML que llega **no es** el que
espera, ya sea porque el BCV cambió el sitio o porque alguien lo manipuló.

La regla es una sola: **ante un dato dudoso, ninguno**. Un bloque que no encaja
se descarta; si al final no queda nada, `ErrorDeParseo` dispara el circuito de
fallos y la tasa pasa a `stale` (ADR-0007). Lo que no puede pasar nunca es que
salga un número que nadie publicó.
"""

from datetime import date
from decimal import Decimal

import pytest

from ingestor_bcv.adapters.bcv.parser import ErrorDeParseo, parsear_pagina

pytestmark = pytest.mark.security

FECHA_OK = (
    '<div class="pull-right dinpro center">Fecha Valor: '
    '<span class="date-display-single" content="2026-07-06T00:00:00-04:00">6/7/2026</span>'
    "</div>"
)


def _bloque(interior: str) -> str:
    return f'<div class="row recuadrotsmc">{interior}</div>'


def _pagina(*bloques: str, fecha: str = FECHA_OK) -> str:
    return f"<html><body>{''.join(bloques)}{fecha}</body></html>"


def test_un_bloque_mutilado_se_descarta_sin_arrastrar_a_los_demas():
    """Media estructura no es media tasa: o están el código y el valor, o nada.

    Si el bloque incompleto abortara el parseo entero, un solo `div` roto en la
    portada del BCV dejaría al sistema sin ninguna tasa. Si en cambio se
    completara con el valor del bloque siguiente, publicaríamos una tasa con la
    moneda equivocada — que es peor.
    """
    pagina = _pagina(
        _bloque("<div><span> USD</span></div>"),  # sin <strong>
        _bloque("<div><strong>861,18</strong></div>"),  # sin <span>
        _bloque("<div><span> EUR</span></div><div><strong>861,1867</strong></div>"),
    )

    fecha_valor, tasas = parsear_pagina(pagina)

    assert fecha_valor == date(2026, 7, 6)
    assert tasas == {"EUR": Decimal("861.1867")}


def test_lo_que_no_es_un_codigo_iso_no_entra():
    """El descubrimiento de monedas es dinámico a propósito —si el BCV agrega una,
    entra sin tocar código—, y por eso el filtro del código es lo único que separa
    «moneda nueva» de «texto inyectado donde va la moneda»."""
    pagina = _pagina(
        _bloque("<div><span> Bs.</span></div><div><strong>1,00</strong></div>"),
        _bloque("<div><span> usd</span></div><div><strong>999,99</strong></div>"),
        _bloque("<div><span> USDT</span></div><div><strong>888,88</strong></div>"),
        _bloque("<div><span> USD</span></div><div><strong>748,7864</strong></div>"),
    )

    _, tasas = parsear_pagina(pagina)

    assert tasas == {"USD": Decimal("748.7864")}


def test_un_valor_no_numerico_no_produce_tasa():
    """Con una sola moneda alterada no queda nada que publicar, y eso es correcto:
    vale más un `ErrorDeParseo` —que deja la tasa anterior vigente y marca stale—
    que una cifra improvisada."""
    pagina = _pagina(
        _bloque("<div><span> USD</span></div><div><strong>consulte al banco</strong></div>")
    )

    with pytest.raises(ErrorDeParseo, match="ninguna tasa"):
        parsear_pagina(pagina)


def test_en_el_fallback_regex_gana_la_primera_aparicion_de_cada_moneda():
    """Escenario de inyección sobre el camino degradado.

    Cuando cambian las clases CSS el parser cae al regex sobre el HTML crudo, que
    es el camino más fácil de envenenar: basta con colar un segundo bloque. Se
    queda con el PRIMERO —el que publica el BCV arriba de la página— en vez de
    dejar que el último escrito pise al legítimo.
    """
    pagina = _pagina(
        _bloque("<div><span> USD</span></div><div><strong>748,7864</strong></div>"),
        _bloque("<div><span> USD</span></div><div><strong>1.500,00</strong></div>"),
    ).replace("recuadrotsmc", "clase-cambiada")

    _, tasas = parsear_pagina(pagina)

    assert tasas == {"USD": Decimal("748.7864")}


def test_una_fecha_valor_corrupta_no_se_da_por_buena():
    """La fecha-valor es la que decide la vigencia (ADR-0022): aceptar una
    corrupta desplazaría qué tasa rige qué día."""
    pagina = _pagina(
        _bloque("<div><span> USD</span></div><div><strong>748,7864</strong></div>"),
        fecha=(
            '<div class="pull-right dinpro center">Fecha Valor: '
            '<span class="date-display-single" content="pendiente">—</span></div>'
        ),
    )

    with pytest.raises(ErrorDeParseo, match="fecha-valor"):
        parsear_pagina(pagina)


def test_una_fecha_con_forma_de_fecha_pero_imposible_tampoco():
    """`2026-13-45` pasa el patrón —cuatro dígitos, dos, dos— y no existe. El
    formato no es validación: lo que decide es que la fecha sea construible."""
    pagina = _pagina(
        _bloque("<div><span> USD</span></div><div><strong>748,7864</strong></div>"),
        fecha=(
            '<div class="otra-clase">Fecha Valor: '
            '<span content="2026-13-45T00:00:00-04:00">—</span></div>'
        ),
    ).replace("date-display-single", "otra-fecha")

    with pytest.raises(ErrorDeParseo, match="fecha-valor"):
        parsear_pagina(pagina)
