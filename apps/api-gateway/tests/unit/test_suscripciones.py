"""Política WSS: whitelist de tópicos y límites por usuario; push best-effort."""

from datetime import UTC, datetime, timedelta

import pytest

from api_gateway.application.suscripciones import (
    EVENTO_A_TOPICO,
    TOPICOS_PERMITIDOS,
    GestorSuscripciones,
)
from api_gateway.domain.errores import LimiteWss, ParametroInvalido
from api_gateway.domain.modelos import Usuario


def usuario(sub: str = "auth0|u1") -> Usuario:
    return Usuario(
        sub=sub,
        permisos=frozenset({"stream:events"}),
        exp=datetime.now(UTC) + timedelta(minutes=10),
    )


class CanalFake:
    def __init__(self, falla: bool = False) -> None:
        self.enviados: list[dict] = []
        self.falla = falla

    async def enviar_json(self, mensaje: dict) -> None:
        if self.falla:
            raise ConnectionError("canal roto")
        self.enviados.append(mensaje)

    async def cerrar(self, codigo: int, razon: str) -> None:  # pragma: no cover
        pass


@pytest.fixture
def gestor() -> GestorSuscripciones:
    return GestorSuscripciones(max_conexiones=2, max_suscripciones=3)


def test_limite_de_conexiones_por_usuario(gestor):
    gestor.conectar(usuario(), CanalFake())
    gestor.conectar(usuario(), CanalFake())
    with pytest.raises(LimiteWss):
        gestor.conectar(usuario(), CanalFake())
    gestor.conectar(usuario("auth0|otro"), CanalFake())  # otro sub no cuenta


def test_topico_fuera_de_la_whitelist_es_rechazado(gestor):
    canal = CanalFake()
    gestor.conectar(usuario(), canal)
    with pytest.raises(ParametroInvalido):
        gestor.suscribir(canal, ["signals", "interno.privado"])


def test_limite_de_suscripciones_por_usuario_entre_conexiones(gestor):
    canal_a, canal_b = CanalFake(), CanalFake()
    gestor.conectar(usuario(), canal_a)
    gestor.conectar(usuario(), canal_b)
    gestor.suscribir(canal_a, ["signals", "indicators"])
    gestor.suscribir(canal_b, ["rates.official"])
    with pytest.raises(LimiteWss):
        gestor.suscribir(canal_b, ["p2p.snapshot"])


def test_resuscribir_el_mismo_topico_no_consume_cupo(gestor):
    canal = CanalFake()
    gestor.conectar(usuario(), canal)
    gestor.suscribir(canal, ["signals"])
    activos = gestor.suscribir(canal, ["signals"])
    assert activos == {"signals"}


async def test_difundir_solo_a_suscritos(gestor):
    suscrito, otro = CanalFake(), CanalFake()
    gestor.conectar(usuario(), suscrito)
    gestor.conectar(usuario("auth0|otro"), otro)
    gestor.suscribir(suscrito, ["signals"])
    gestor.suscribir(otro, ["indicators"])
    entregados = await gestor.difundir("signals", {"topic": "signals"})
    assert entregados == 1
    assert suscrito.enviados and not otro.enviados


async def test_canal_roto_se_desconecta_sin_bloquear_al_resto(gestor):
    roto, sano = CanalFake(falla=True), CanalFake()
    gestor.conectar(usuario(), roto)
    gestor.conectar(usuario("auth0|otro"), sano)
    gestor.suscribir(roto, ["signals"])
    gestor.suscribir(sano, ["signals"])
    entregados = await gestor.difundir("signals", {"topic": "signals"})
    assert entregados == 1
    assert sano.enviados
    # el canal roto quedó fuera: un nuevo push no lo intenta
    assert await gestor.difundir("signals", {"topic": "signals"}) == 1


def test_desuscribir_libera_cupo(gestor):
    canal = CanalFake()
    gestor.conectar(usuario(), canal)
    gestor.suscribir(canal, ["signals", "indicators", "p2p.snapshot"])
    gestor.desuscribir(canal, ["signals"])
    gestor.suscribir(canal, ["rates.official"])  # no lanza


def test_analysis_esta_en_la_whitelist_y_mapea_su_routing_key(gestor):
    """Alta del tópico del análisis (RF-6): sin los dos lados —whitelist y
    mapeo— el cliente se suscribiría a algo que nunca recibiría nada."""
    canal = CanalFake()
    gestor.conectar(usuario(), canal)
    assert "analysis" in gestor.suscribir(canal, ["analysis"])
    assert "analysis" in TOPICOS_PERMITIDOS
    assert EVENTO_A_TOPICO["analysis.updated"] == "analysis"


def test_el_limite_de_suscripciones_cubre_los_cinco_topicos():
    """WSS_MAX_SUSCRIPCIONES por defecto es 10 ≥ 5: el alta no obliga a subirlo."""
    gestor = GestorSuscripciones(max_conexiones=2, max_suscripciones=10)
    canal = CanalFake()
    gestor.conectar(usuario(), canal)
    assert gestor.suscribir(canal, sorted(TOPICOS_PERMITIDOS)) == set(
        TOPICOS_PERMITIDOS
    )
