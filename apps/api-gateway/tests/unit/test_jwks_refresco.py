"""Refresco del JWKS: qué pasa cuando Auth0 no contesta.

Esto no estaba cubierto y costó una caída. El 2026-08-06, en un arranque en
frío, una sola descarga fallida del JWKS —un `ConnectError` sin mensaje, DNS
todavía sin resolver— dejó **2 224 peticiones con 401 durante 57 segundos**, con
tokens perfectamente válidos, porque el mínimo entre descargas se le cobraba
igual a un intento que nunca llegó.
"""

import asyncio
import logging

import httpx
import pytest

from api_gateway.adapters.auth import jwks as modulo
from api_gateway.adapters.auth.jwks import (
    _MIN_ENTRE_FETCHES_S,
    ValidadorTokenAuth0,
)
from api_gateway.domain.errores import ErrorAutenticacion
from tests.conftest import AUDIENCE_TEST, ISSUER_TEST, jwks_de_test
from tests.soporte_auth import KID_TEST


class _Respuesta:
    def __init__(self, cuerpo: dict) -> None:
        self._cuerpo = cuerpo

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._cuerpo


class ClienteFalso:
    """Sustituye a `httpx.AsyncClient`: cuenta descargas y falla a demanda."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    guion: list = []
    descargas: int = 0

    async def __aenter__(self) -> "ClienteFalso":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def get(self, url: str):
        ClienteFalso.descargas += 1
        siguiente = (
            ClienteFalso.guion.pop(0) if ClienteFalso.guion else jwks_de_test()
        )
        if isinstance(siguiente, Exception):
            raise siguiente
        return _Respuesta(siguiente)


@pytest.fixture
def reloj(monkeypatch):
    """Reloj monotónico controlado: las esperas se comprueban, no se duermen."""
    actual = {"t": 1_000.0}
    monkeypatch.setattr(modulo.time, "monotonic", lambda: actual["t"])
    return actual


@pytest.fixture
def validador(monkeypatch):
    ClienteFalso.guion = []
    ClienteFalso.descargas = 0
    monkeypatch.setattr(modulo.httpx, "AsyncClient", ClienteFalso)
    return ValidadorTokenAuth0(
        jwks_uri="https://vmw-test.local/jwks.json",
        issuer=ISSUER_TEST,
        audience=AUDIENCE_TEST,
    )


async def test_un_fetch_fallido_no_consume_el_minuto_de_gracia(validador, reloj):
    """El defecto del 2026-08-06, fijado.

    El mínimo entre descargas existe para no martillear a Auth0 con tokens de
    `kid` basura. Una descarga que NO llegó no ha protegido a nadie de nada, así
    que no puede cobrarse ese minuto: se reintenta al segundo.
    """
    ClienteFalso.guion = [httpx.ConnectError("")]

    with pytest.raises(ErrorAutenticacion):
        await validador._clave(KID_TEST)
    assert ClienteFalso.descargas == 1

    reloj["t"] += 1.5  # más que la espera inicial de 1 s, MUCHO menos que 60
    clave = await validador._clave(KID_TEST)

    assert clave is not None
    assert ClienteFalso.descargas == 2


async def test_la_espera_tras_fallo_crece_hasta_el_minimo(validador, reloj):
    """Reintentar al segundo indefinidamente sería la otra cara del mismo error.

    Si Auth0 está caído de verdad, la espera tiene que ceder terreno hasta el
    mismo minuto que protege el camino correcto.
    """
    ClienteFalso.guion = [httpx.ConnectError("") for _ in range(8)]
    esperas = []

    for _ in range(8):
        with pytest.raises(ErrorAutenticacion):
            await validador._clave(KID_TEST)
        esperas.append(validador._proximo_fetch - reloj["t"])
        reloj["t"] = validador._proximo_fetch  # justo cuando vuelve a estar permitido

    assert esperas[:4] == [1.0, 2.0, 4.0, 8.0]
    assert esperas[-1] == _MIN_ENTRE_FETCHES_S
    assert max(esperas) == _MIN_ENTRE_FETCHES_S


async def test_una_descarga_correcta_si_impone_el_minuto_completo(validador, reloj):
    """El control original sigue en pie: con el JWKS ya traído, un `kid` que no
    está no vuelve a preguntar a Auth0 hasta pasado el minuto."""
    await validador._clave(KID_TEST)
    assert ClienteFalso.descargas == 1

    reloj["t"] += 30
    with pytest.raises(ErrorAutenticacion):
        await validador._clave("kid-que-no-existe")
    assert ClienteFalso.descargas == 1  # no se preguntó

    reloj["t"] += 31
    with pytest.raises(ErrorAutenticacion):
        await validador._clave("kid-que-no-existe")
    assert ClienteFalso.descargas == 2  # pasado el minuto, sí


async def test_una_rafaga_con_kid_nuevo_dispara_UNA_sola_descarga(validador, reloj):
    """Sin candado, las 2 224 peticiones de aquella mañana habrían sido 2 224
    intentos de descarga —o, peor, ninguno útil: la primera marcaba la pausa y
    todas las demás la encontraban ya puesta."""
    resultados = await asyncio.gather(
        *(validador._clave(KID_TEST) for _ in range(25))
    )

    assert all(r is not None for r in resultados)
    assert ClienteFalso.descargas == 1


async def test_el_motivo_dice_si_hubo_refresco_o_no(validador, reloj, caplog):
    """El log que mandó a buscar una rotación de claves inexistente.

    «kid desconocido tras refrescar» se emitía también cuando el refresco se
    había saltado por la pausa. Los tres casos son distintos y ahora se dicen
    distintos.
    """
    with caplog.at_level(logging.INFO, logger=modulo.__name__):
        # 1) se refrescó y aun así no está
        with pytest.raises(ErrorAutenticacion):
            await validador._clave("kid-ausente")
        assert "tras refrescar el JWKS" in caplog.records[-1].getMessage()

        # 2) no se refrescó: la pausa sigue corriendo
        with pytest.raises(ErrorAutenticacion):
            await validador._clave("kid-ausente")
        assert "refresco en pausa" in caplog.records[-1].getMessage()

    # 3) se intentó refrescar y la descarga falló
    reloj["t"] += _MIN_ENTRE_FETCHES_S + 1
    ClienteFalso.guion = [httpx.ConnectError("")]
    with caplog.at_level(logging.INFO, logger=modulo.__name__):
        with pytest.raises(ErrorAutenticacion):
            await validador._clave("kid-ausente")
    assert "el refresco del JWKS falló" in caplog.records[-1].getMessage()


async def test_el_aviso_de_fallo_nombra_el_tipo_cuando_no_hay_mensaje(
    validador, reloj, caplog
):
    """`ConnectError("")` se logueaba como «fetch de JWKS falló: » a secas, y un
    log sin síntoma no sirve para nada a las 4 de la mañana."""
    ClienteFalso.guion = [httpx.ConnectError("")]

    with caplog.at_level(logging.WARNING, logger=modulo.__name__):
        with pytest.raises(ErrorAutenticacion):
            await validador._clave(KID_TEST)

    aviso = next(r.getMessage() for r in caplog.records if "fetch de JWKS" in r.getMessage())
    assert "ConnectError" in aviso
    assert "sin detalle" in aviso
    assert "siguiente intento en 1 s" in aviso


async def test_sin_claves_el_health_no_dice_ok(validador, reloj):
    """Un gateway que no ha podido cargar el JWKS no puede autenticar a nadie.

    Antes decía `auth: ok` porque la bandera de fallo arranca en `False`: una
    caída total de 57 s no dejó rastro en el health.
    """
    assert validador.estado() == "degraded"

    ClienteFalso.guion = [httpx.ConnectError("")]
    await validador.precargar()
    assert validador.estado() == "degraded"

    await validador.precargar()
    assert validador.estado() == "ok"


async def test_precargar_deja_las_claves_listas_antes_del_primer_token(
    validador, reloj
):
    """El arranque en frío deja de pagarlo la primera petición."""
    await validador.precargar()
    assert ClienteFalso.descargas == 1

    await validador._clave(KID_TEST)

    assert ClienteFalso.descargas == 1  # ya estaban


async def test_precargar_no_impide_arrancar_si_auth0_no_responde(validador, reloj):
    """Best-effort: el REST autenticado no funcionará, pero `/health` lo dice y
    el servicio levanta para poder diagnosticarlo."""
    ClienteFalso.guion = [httpx.ConnectError("")]

    await validador.precargar()  # no lanza

    assert validador.estado() == "degraded"


async def test_un_validador_estatico_no_toca_la_red(reloj, monkeypatch):
    """El doble de test no debe salir a internet ni al precargar."""
    monkeypatch.setattr(modulo.httpx, "AsyncClient", ClienteFalso)
    ClienteFalso.descargas = 0
    validador = ValidadorTokenAuth0(
        jwks_uri="https://vmw-test.local/jwks.json",
        issuer=ISSUER_TEST,
        audience=AUDIENCE_TEST,
        jwks_estatico=jwks_de_test(),
    )

    await validador.precargar()

    assert ClienteFalso.descargas == 0
    assert validador.estado() == "ok"
