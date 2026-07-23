"""Tests del caso de uso ProcesarSnapshotP2P con adaptadores en memoria."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from indicator_engine.adapters.memory import (
    CollectingEventPublisher,
    InMemoryIndicatorRepository,
)
from indicator_engine.application.ports import SnapshotP2PRecibido
from indicator_engine.application.process_p2p_snapshot import ProcesarSnapshotP2P
from indicator_engine.domain.models import AnuncioP2P, Indicador
from indicator_engine.domain.reglas import cargar_ruleset

AHORA = datetime(2026, 7, 20, 16, 0, tzinfo=UTC)

# Regla sintética para probar el WIRING de señales (dispara siempre en un BUY):
# los umbrales reales del backtest se prueban en test_reglas.py.
REGLA_MEDIANA = [
    {
        "type": "prueba_alcista",
        "direction": "alcista",
        "when": [{"indicator": "p2p_mediana_buy", "op": "gt", "value": "0"}],
    }
]


def _anuncios(precios: list[str], cantidad: str = "100") -> tuple[AnuncioP2P, ...]:
    return tuple(
        AnuncioP2P(
            precio=Decimal(p),
            cantidad_disponible=Decimal(cantidad),
            outlier=False,
            es_merchant=False,
        )
        for p in precios
    )


def _snapshot(
    side: str = "BUY",
    precios: list[str] | None = None,
    anuncios: tuple[AnuncioP2P, ...] | None = None,
    event_id: str = "11111111-1111-1111-1111-111111111111",
    capturado_en: datetime = AHORA,
) -> SnapshotP2PRecibido:
    return SnapshotP2PRecibido(
        event_id=event_id,
        side=side,
        asset="USDT",
        fiat="VES",
        capturado_en=capturado_en,
        partial=False,
        anuncios=anuncios or _anuncios(precios or ["858", "860", "862"]),
    )


def _armar():
    repo = InMemoryIndicatorRepository()
    publisher = CollectingEventPublisher()
    caso = ProcesarSnapshotP2P(publisher, repo, calc_version=1)
    return repo, publisher, caso


def _armar_con_ruleset(rules=REGLA_MEDIANA, cooldown=60):
    repo = InMemoryIndicatorRepository()
    publisher = CollectingEventPublisher()
    ruleset = cargar_ruleset({"version": 1, "cooldown_min": cooldown, "rules": rules})
    caso = ProcesarSnapshotP2P(publisher, repo, calc_version=1, ruleset=ruleset)
    return repo, publisher, caso


def _oficial(valor: str = "736.9339", hace: timedelta = timedelta(hours=1)) -> Indicador:
    return Indicador(
        nombre="official_rate",
        moneda="USD",
        valor=Decimal(valor),
        as_of=AHORA - hace,
        calc_version=1,
    )


async def test_primer_snapshot_produce_referencia_y_brecha():
    repo, publisher, caso = _armar()
    repo.indicadores.append(_oficial())

    resultado = await caso.ejecutar(_snapshot("BUY", ["858", "860", "862"]))

    nombres = {i.nombre for i in resultado.indicadores}
    assert {
        "p2p_mediana_buy",
        "p2p_vwap_buy",
        "p2p_mejor_precio_buy",
        "p2p_liquidez_buy",
        "p2p_merchants_pct_buy",
        "p2p_outliers_pct_buy",
        "p2p_brecha_abs_buy",
        "p2p_brecha_pct_buy",
    } == nombres  # sin lado opuesto ni histórico aún: ni spread ni ventanas
    valores = {i.nombre: i.valor for i in resultado.indicadores}
    assert valores["p2p_mediana_buy"] == Decimal("860")
    assert valores["p2p_brecha_abs_buy"] == Decimal("860") - Decimal("736.9339")
    assert not resultado.official_stale
    assert len(publisher.eventos) == 1
    assert publisher.eventos[0]["payload"]["triggered_by"] == (
        "11111111-1111-1111-1111-111111111111"
    )


async def test_sin_tasa_oficial_no_hay_brecha_y_stale_true():
    repo, _, caso = _armar()

    resultado = await caso.ejecutar(_snapshot("BUY"))

    nombres = {i.nombre for i in resultado.indicadores}
    assert "p2p_brecha_abs_buy" not in nombres
    assert resultado.official_stale


async def test_lado_opuesto_fresco_agrega_spread_y_ratio():
    repo, _, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "BUY",
            ["858", "860", "862"],
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(minutes=1),
        )
    )

    resultado = await caso.ejecutar(
        _snapshot("SELL", ["850", "852", "854"], event_id="22222222-2222-2222-2222-222222222222")
    )

    valores = {i.nombre: i.valor for i in resultado.indicadores}
    # spread = (860 − 852) / 852 · 100 — el BUY previo contra este SELL.
    assert valores["p2p_spread_pct"] == Decimal("8") / Decimal("852") * 100
    # ratio = liquidez BUY / liquidez SELL = 300 / 300.
    assert valores["p2p_ratio_oferta_demanda"] == Decimal("1")


async def test_lado_opuesto_viejo_no_produce_spread():
    repo, _, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "BUY",
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(minutes=45),
        )
    )

    resultado = await caso.ejecutar(
        _snapshot("SELL", event_id="22222222-2222-2222-2222-222222222222")
    )

    nombres = {i.nombre for i in resultado.indicadores}
    assert "p2p_spread_pct" not in nombres
    assert "p2p_ratio_oferta_demanda" not in nombres


async def test_momentum_bid_contra_el_historico_de_3h():
    repo, _, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "SELL",
            ["838", "840", "842"],
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(hours=3, minutes=2),
        )
    )

    resultado = await caso.ejecutar(
        _snapshot("SELL", ["850", "852", "854"], event_id="22222222-2222-2222-2222-222222222222")
    )

    valores = {i.nombre: i.valor for i in resultado.indicadores}
    # mediana SELL: 840 hace ~3 h → 852 ahora.
    assert valores["p2p_momentum_bid_3h_pct"] == Decimal("12") / Decimal("840") * 100


async def test_drenaje_oferta_contra_el_historico_de_6h():
    repo, _, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "BUY",
            anuncios=_anuncios(["858", "860", "862"], cantidad="1000"),
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(hours=6, minutes=2),
        )
    )

    resultado = await caso.ejecutar(
        _snapshot(
            "BUY",
            anuncios=_anuncios(["858", "860", "862"], cantidad="400"),
            event_id="22222222-2222-2222-2222-222222222222",
        )
    )

    valores = {i.nombre: i.valor for i in resultado.indicadores}
    # liquidez BUY: 3000 hace ~6 h → 1200 ahora = −60 %.
    assert valores["p2p_drenaje_oferta_6h_pct"] == Decimal("-60")


async def test_hueco_de_captura_omite_la_ventana():
    repo, _, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "SELL",
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(hours=8),  # más viejo que ventana + holgura
        )
    )

    resultado = await caso.ejecutar(
        _snapshot("SELL", event_id="22222222-2222-2222-2222-222222222222")
    )

    assert "p2p_momentum_bid_3h_pct" not in {i.nombre for i in resultado.indicadores}


async def test_confianza_baja_suprime_senales_pero_publica_referencia():
    repo, publisher, caso = _armar()
    repo.indicadores.append(_oficial())
    limpios = _anuncios(["858", "860"])
    marcados = tuple(
        AnuncioP2P(Decimal("9999"), Decimal("100"), outlier=True, es_merchant=False)
        for _ in range(2)
    )

    resultado = await caso.ejecutar(_snapshot("BUY", anuncios=limpios + marcados))

    nombres = {i.nombre for i in resultado.indicadores}
    assert "p2p_mediana_buy" in nombres
    assert "p2p_outliers_pct_buy" in nombres
    assert "p2p_brecha_pct_buy" not in nombres  # señal suprimida, con rastro
    valores = {i.nombre: i.valor for i in resultado.indicadores}
    assert valores["p2p_outliers_pct_buy"] == Decimal("50")
    assert len(publisher.eventos) == 1  # la referencia degradada sí se publica


async def test_evento_duplicado_no_reprocesa():
    repo, publisher, caso = _armar()
    repo.indicadores.append(_oficial())
    await caso.ejecutar(_snapshot("BUY"))
    n_indicadores = len(repo.indicadores)

    resultado = await caso.ejecutar(_snapshot("BUY"))

    assert resultado.duplicado
    assert len(repo.indicadores) == n_indicadores
    assert len(publisher.eventos) == 1


# --- señales (RF-4) -------------------------------------------------------

async def test_senal_se_emite_persiste_y_publica():
    repo, publisher, caso = _armar_con_ruleset()
    repo.indicadores.append(_oficial())

    resultado = await caso.ejecutar(_snapshot("BUY", ["858", "860", "862"]))

    assert len(resultado.senales) == 1
    senal = resultado.senales[0]
    assert senal.tipo == "prueba_alcista"
    assert senal.direccion == "alcista"
    assert senal.regla == "prueba_alcista@v1"
    assert senal.triggered_by == "11111111-1111-1111-1111-111111111111"
    assert senal.inputs["p2p_mediana_buy"] == Decimal("860")
    assert len(repo.senales) == 1  # persistida
    assert len(publisher.senales) == 1  # publicada
    payload = publisher.senales[0]["payload"]
    assert payload["type"] == "prueba_alcista"
    assert payload["evidence"]["inputs"]["p2p_mediana_buy"] == "860"


async def test_cooldown_suprime_la_reemision_del_mismo_tipo():
    repo, publisher, caso = _armar_con_ruleset(cooldown=60)
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "BUY",
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(minutes=30),
        )
    )

    # segundo snapshot dentro de la ventana de cooldown → señal suprimida
    resultado = await caso.ejecutar(
        _snapshot("BUY", event_id="22222222-2222-2222-2222-222222222222", capturado_en=AHORA)
    )

    assert resultado.senales == []
    assert len(publisher.senales) == 1  # solo la primera


async def test_pasado_el_cooldown_se_reemite():
    repo, publisher, caso = _armar_con_ruleset(cooldown=60)
    repo.indicadores.append(_oficial())
    await caso.ejecutar(
        _snapshot(
            "BUY",
            event_id="11111111-1111-1111-1111-111111111111",
            capturado_en=AHORA - timedelta(minutes=90),
        )
    )

    resultado = await caso.ejecutar(
        _snapshot("BUY", event_id="22222222-2222-2222-2222-222222222222", capturado_en=AHORA)
    )

    assert len(resultado.senales) == 1
    assert len(publisher.senales) == 2


async def test_confianza_baja_no_emite_senal():
    repo, publisher, caso = _armar_con_ruleset()
    repo.indicadores.append(_oficial())
    limpios = _anuncios(["858", "860"])
    marcados = tuple(
        AnuncioP2P(Decimal("9999"), Decimal("100"), outlier=True, es_merchant=False)
        for _ in range(2)
    )

    resultado = await caso.ejecutar(_snapshot("BUY", anuncios=limpios + marcados))

    assert resultado.senales == []
    assert publisher.senales == []


async def test_sin_ruleset_no_emite_senales():
    repo, publisher, caso = _armar()  # sin ruleset
    repo.indicadores.append(_oficial())

    resultado = await caso.ejecutar(_snapshot("BUY"))

    assert resultado.senales == []
    assert publisher.senales == []
