"""Tests del caso de uso ProcesarSnapshotP2P con adaptadores en memoria."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from indicator_engine.adapters.memory import (
    CollectingEventPublisher,
    InMemoryDistribucionRepository,
    InMemoryIndicatorRepository,
)
from indicator_engine.application.analizar_revision import AnalizarRevision
from indicator_engine.application.ports import SnapshotP2PRecibido
from indicator_engine.application.process_p2p_snapshot import ProcesarSnapshotP2P
from indicator_engine.domain.analisis import (
    ConfigAnalisis,
    Distribucion,
    cargar_config_analisis,
)
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


# `AHORA` es el 20/7 a las 16:00 UTC = mediodía en Caracas: una tasa con
# fecha-valor de ese mismo día está vigente.
FECHA_VALOR_VIGENTE = date(2026, 7, 20)


def _con_oficial(repo, valor: str = "736.9339", hace: timedelta = timedelta(hours=1),
                 fecha_valor: date = FECHA_VALOR_VIGENTE) -> None:
    """Deja el repo con una tasa oficial COHERENTE: cuánto vale y para cuándo rige.

    Las dos cosas juntas porque son los dos ejes del mismo hecho (ADR-0009): el
    indicador guarda el valor y su instante de cambio, y `official_rates` la
    fecha-valor. Declarar solo el primero describe un mundo imposible —una tasa
    sin vigencia— y el motor lo trata, con razón, como si no hubiera tasa.
    """
    repo.indicadores.append(_oficial(valor, hace))
    repo.fechas_valor["USD"] = fecha_valor


async def test_la_brecha_del_finde_NO_marca_la_oficial_rancia():
    """El defecto que ADR-0022 corrige, en el caso de uso completo.

    La tasa cambió por última vez hace tres días (viernes por la tarde) pero su
    fecha-valor es el lunes: está vigente. La regla vieja comparaba contra
    `oficial.as_of` —cuándo CAMBIÓ el indicador— y encendía la bandera todos los
    fines de semana, suprimiendo con ella la atribución de la brecha.
    """
    repo, _, caso = _armar()
    _con_oficial(repo, hace=timedelta(days=3), fecha_valor=date(2026, 7, 21))

    resultado = await caso.ejecutar(_snapshot("BUY", ["858", "860", "862"]))

    assert not resultado.official_stale


async def test_la_brecha_marca_rancia_si_la_fecha_valor_ya_paso():
    repo, _, caso = _armar()
    # Cambio RECIENTE, pero rige para ayer: el BCV no publicó la de hoy. La
    # regla vieja, que solo miraba la antigüedad, no lo habría visto.
    _con_oficial(repo, hace=timedelta(minutes=5), fecha_valor=date(2026, 7, 19))

    resultado = await caso.ejecutar(_snapshot("BUY", ["858", "860", "862"]))

    assert resultado.official_stale


async def test_primer_snapshot_produce_referencia_y_brecha():
    repo, publisher, caso = _armar()
    _con_oficial(repo)

    resultado = await caso.ejecutar(_snapshot("BUY", ["858", "860", "862"]))

    nombres = {i.nombre for i in resultado.indicadores}
    assert {
        "p2p_mediana_buy",
        "p2p_vwap_buy",
        "p2p_mejor_precio_buy",
        "p2p_mejor_precio_filtrado_buy",
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
    await caso.ejecutar(_snapshot("BUY"))
    n_indicadores = len(repo.indicadores)

    resultado = await caso.ejecutar(_snapshot("BUY"))

    assert resultado.duplicado
    assert len(repo.indicadores) == n_indicadores
    assert len(publisher.eventos) == 1


# --- señales (RF-4) -------------------------------------------------------

async def test_senal_se_emite_persiste_y_publica():
    repo, publisher, caso = _armar_con_ruleset()
    _con_oficial(repo)

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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)
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
    _con_oficial(repo)

    resultado = await caso.ejecutar(_snapshot("BUY"))

    assert resultado.senales == []
    assert publisher.senales == []


# -- análisis de la revisión (RF-6) ------------------------------------------


def _config_analisis(muestras_minimas: int = 200) -> ConfigAnalisis:
    """Config mínima con los dos medidores que el snapshot de test produce."""
    return cargar_config_analisis(
        {
            "version": 1,
            "ventana_dias": 90,
            "muestras_minimas": muestras_minimas,
            "percentiles": [10, 50, 90],
            "anclas": ["0.10", "0.50", "0.90"],
            "indicadores": [
                {
                    "nombre": "p2p_mediana_buy",
                    "dominio_respaldo": {"minimo": "0", "maximo": "2000"},
                },
                {
                    "nombre": "p2p_outliers_pct_buy",
                    "dominio_respaldo": {"minimo": "0", "maximo": "100"},
                },
            ],
        }
    )


def _armar_con_analisis(rules=REGLA_MEDIANA, distribuciones=None, publisher=None):
    repo = InMemoryIndicatorRepository()
    publisher = publisher or CollectingEventPublisher()
    ruleset = cargar_ruleset({"version": 1, "cooldown_min": 60, "rules": rules})
    analisis = AnalizarRevision(
        config=_config_analisis(),
        ruleset=ruleset,
        distribuciones=InMemoryDistribucionRepository(distribuciones),
        repository=repo,
        publisher=publisher,
    )
    caso = ProcesarSnapshotP2P(
        publisher, repo, calc_version=1, ruleset=ruleset, analisis=analisis
    )
    return repo, publisher, caso


async def test_el_analisis_se_publica_y_persiste_tras_los_indicadores():
    repo, publisher, caso = _armar_con_analisis()
    await caso.ejecutar(_snapshot())

    assert len(publisher.analisis) == 1
    evento = publisher.analisis[0]
    assert evento["event_type"] == "analysis.updated"
    payload = evento["payload"]
    assert payload["currency"] == "VES"
    assert payload["triggered_by"] == "11111111-1111-1111-1111-111111111111"
    # Los dos medidores de la config, con su valor del lote.
    assert {i["indicator"] for i in payload["indicators"]} == {
        "p2p_mediana_buy",
        "p2p_outliers_pct_buy",
    }
    # Se persiste el PAYLOAD, no el sobre: el GET del gateway sirve el documento.
    assert len(repo.analisis) == 1
    _, guardado = repo.analisis[0]
    assert guardado == payload


async def test_sin_config_de_analisis_el_motor_se_comporta_igual():
    repo, publisher, caso = _armar_con_ruleset()
    resultado = await caso.ejecutar(_snapshot())

    assert publisher.analisis == []
    assert repo.analisis == []
    # …y todo lo demás sigue exactamente igual.
    assert len(publisher.eventos) == 1
    assert len(resultado.senales) == 1


async def test_un_fallo_del_analisis_no_manda_el_snapshot_a_la_dlq():
    """El análisis es una lectura del panel, no el cálculo: si revienta, los
    indicadores y las señales siguen publicados y el evento queda procesado."""

    class PublisherQueFallaElAnalisis(CollectingEventPublisher):
        async def publish_analysis_updated(self, evento):
            raise RuntimeError("bus caído justo para este evento")

    publisher = PublisherQueFallaElAnalisis()
    repo, publisher, caso = _armar_con_analisis(publisher=publisher)

    resultado = await caso.ejecutar(_snapshot())  # no lanza

    assert publisher.analisis == []
    assert len(publisher.eventos) == 1  # indicators.updated sí salió
    assert len(resultado.senales) == 1  # la señal también
    assert await repo.ya_procesado("11111111-1111-1111-1111-111111111111")


async def test_con_confianza_baja_se_emite_analisis_marcado_y_no_evaluable():
    """La lectura de cada medidor sigue siendo válida; la proximidad no."""
    repo, publisher, caso = _armar_con_analisis()
    anuncios = _anuncios(["858", "860"]) + tuple(
        AnuncioP2P(
            precio=Decimal("9999"),
            cantidad_disponible=Decimal("100"),
            outlier=True,
            es_merchant=False,
        )
        for _ in range(3)
    )
    await caso.ejecutar(_snapshot(anuncios=anuncios))

    payload = publisher.analisis[0]["payload"]
    assert payload["confidence"] == "low"
    assert payload["indicators"], "los medidores siguen publicando su lectura"
    assert payload["summary"]["rules_evaluable"] == 0
    assert publisher.senales == []  # las señales sí se suprimen


async def test_la_reentrega_no_duplica_el_analisis():
    repo, publisher, caso = _armar_con_analisis()
    await caso.ejecutar(_snapshot())
    await caso.ejecutar(_snapshot())  # mismo event_id
    assert len(repo.analisis) == 1


async def test_la_vista_ampliada_no_cambia_las_senales_emitidas():
    """Blindaje del ÚNICO cambio sobre el camino de emisión en producción.

    El análisis pide más indicadores en la vista vigente que los que referencia
    el ruleset. `evaluar_reglas` solo lee los nombres de sus propias
    condiciones, así que una vista superconjunto no puede cambiar nada — y esto
    lo comprueba lado a lado en vez de confiar en la lectura del código.
    """
    _, sin_analisis, caso_sin = _armar_con_ruleset()
    await caso_sin.ejecutar(_snapshot())

    _, con_analisis, caso_con = _armar_con_analisis()
    await caso_con.ejecutar(_snapshot())

    def resumen(publisher):
        return [
            (e["payload"]["type"], e["payload"]["evidence"]) for e in publisher.senales
        ]

    assert resumen(con_analisis) == resumen(sin_analisis)
    assert resumen(sin_analisis) != []  # el test valdría poco sin señales


async def test_sin_distribucion_la_escala_degrada_al_respaldo_de_forma_visible():
    repo, publisher, caso = _armar_con_analisis(distribuciones=None)
    await caso.ejecutar(_snapshot())

    payload = publisher.analisis[0]["payload"]
    for indicador in payload["indicators"]:
        assert indicador["scale"]["source"] == "ruleset"
        assert indicador["scale"]["samples"] == 0
        assert indicador["band"] == "unscaled"


async def test_con_distribucion_suficiente_la_escala_es_de_percentiles():
    distribuciones = {
        "p2p_mediana_buy": Distribucion(
            muestras=4000,
            minimo=Decimal("800"),
            maximo=Decimal("900"),
            cortes=(Decimal("820"), Decimal("855"), Decimal("880")),
            calculada_en=AHORA,
        ),
    }
    repo, publisher, caso = _armar_con_analisis(distribuciones=distribuciones)
    await caso.ejecutar(_snapshot())

    mediana = next(
        i
        for i in publisher.analisis[0]["payload"]["indicators"]
        if i["indicator"] == "p2p_mediana_buy"
    )
    assert mediana["scale"]["source"] == "percentiles"
    assert [c["key"] for c in mediana["scale"]["cuts"]] == ["p10", "p50", "p90"]
    assert mediana["band"] == "high"  # 860 cae en [p50, p90)
