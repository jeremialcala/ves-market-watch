"""Cortes de nivel de los riesgos de la vista de Análisis.

Lo que se defiende aquí, por orden de importancia:

1. **Un riesgo sin dato NO baja a `bajo`.** Es el único error de este módulo que
   hace daño de verdad: un panel de riesgos que dice «bajo» porque le falta el
   indicador tranquiliza sobre algo que nadie ha mirado.
2. **Manda el peor lado.** El libro está concentrado si lo está cualquiera de
   los dos, y quedarse con `buy` escondería la mitad del riesgo.
3. **La config torcida aborta el arranque.** Mismo criterio que el ruleset: unos
   cortes incoherentes producen niveles plausibles y falsos.
4. **El corte de `calidad_snapshot` es EL MISMO** con el que el motor degrada la
   confianza. Si alguien mueve uno sin el otro, el producto tendría dos
   definiciones de «snapshot malo» — y este test se rompe.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
import yaml

from indicator_engine.config import RIESGOS_POR_DEFECTO
from indicator_engine.domain.calculos import UMBRAL_CONFIANZA_OUTLIERS_PCT
from indicator_engine.domain.riesgos import (
    NIVEL_ALTO,
    NIVEL_BAJO,
    NIVEL_MEDIO,
    ConfigRiesgosInvalida,
    cargar_config_riesgos,
    evaluar_riesgos,
)

CONFIG_MINIMA = {
    "version": 1,
    "riesgos": [
        {
            "codigo": "libro_concentrado",
            "tipo": "umbral_indicador",
            "indicadores": ["p2p_merchants_pct_buy", "p2p_merchants_pct_sell"],
            "peor": "mayor",
            "alto": "80",
            "medio": "72",
        },
        {
            "codigo": "oficial_rancia",
            "tipo": "bandera",
            "bandera": "official_stale",
            "si": "alto",
            "si_no": "bajo",
        },
        {
            "codigo": "umbrales_sin_recalibrar",
            "tipo": "calibracion",
            "calibrado_hasta_version": 0,
            "sin_calibrar": "medio",
            "calibrado": "bajo",
        },
    ],
}


def evaluar(vista, *, stale=False, ruleset_version=1, config=None):
    cfg = cargar_config_riesgos(config or CONFIG_MINIMA)
    riesgos = evaluar_riesgos(
        config=cfg,
        vista={k: Decimal(v) for k, v in vista.items()},
        official_stale=stale,
        ruleset_version=ruleset_version,
    )
    return {r.codigo: r for r in riesgos.items}


class TestSinDato:
    def test_un_riesgo_sin_su_indicador_NO_baja_a_bajo(self):
        # El fallo que este módulo no se puede permitir: tranquilizar sin dato.
        riesgo = evaluar({})["libro_concentrado"]
        assert riesgo.nivel is None
        assert riesgo.valor is None

    def test_pero_sigue_publicando_su_umbral(self):
        # Que no se pueda medir no borra el corte: la tarjeta puede seguir
        # diciendo a partir de cuánto sería alto.
        assert evaluar({})["libro_concentrado"].umbral == Decimal("80")

    def test_con_un_solo_lado_presente_se_usa_ese(self):
        riesgo = evaluar({"p2p_merchants_pct_sell": "85"})["libro_concentrado"]
        assert riesgo.nivel == NIVEL_ALTO
        assert riesgo.fuente == "p2p_merchants_pct_sell"


class TestPeorLado:
    def test_manda_el_lado_peor_no_el_primero(self):
        riesgo = evaluar(
            {"p2p_merchants_pct_buy": "60.50", "p2p_merchants_pct_sell": "84"}
        )["libro_concentrado"]
        assert riesgo.nivel == NIVEL_ALTO
        assert riesgo.valor == Decimal("84")
        assert riesgo.fuente == "p2p_merchants_pct_sell"

    def test_con_peor_menor_manda_el_minimo(self):
        config = {
            "version": 1,
            "riesgos": [
                {
                    "codigo": "libro_concentrado",
                    "tipo": "umbral_indicador",
                    "indicadores": ["a", "b"],
                    "peor": "menor",
                    "alto": "10",
                    "medio": "20",
                }
            ],
        }
        riesgo = evaluar({"a": "50", "b": "5"}, config=config)["libro_concentrado"]
        assert riesgo.nivel == NIVEL_ALTO
        assert riesgo.fuente == "b"


class TestCortes:
    @pytest.mark.parametrize(
        "valor, esperado",
        [
            ("95", NIVEL_ALTO),
            ("80", NIVEL_ALTO),  # el corte es inclusivo
            ("79.99", NIVEL_MEDIO),
            ("72", NIVEL_MEDIO),
            ("71.99", NIVEL_BAJO),
            ("60.50", NIVEL_BAJO),  # el valor real del 2026-09-07
            ("0", NIVEL_BAJO),
        ],
    )
    def test_cada_banda_con_sus_bordes(self, valor, esperado):
        vista = {"p2p_merchants_pct_buy": valor}
        assert evaluar(vista)["libro_concentrado"].nivel == esperado

    def test_el_valor_real_de_hoy_NO_es_alto(self):
        # La tarjeta lo pintaba en `alto` a mano. Con 60,50 % contra un umbral
        # declarado de 80 %, el dato dice `bajo` — y por eso se conecta.
        assert evaluar({"p2p_merchants_pct_buy": "60.50"})["libro_concentrado"].nivel == (
            NIVEL_BAJO
        )


class TestBanderaYCalibracion:
    def test_la_oficial_rancia_es_binaria(self):
        assert evaluar({}, stale=True)["oficial_rancia"].nivel == NIVEL_ALTO
        assert evaluar({}, stale=False)["oficial_rancia"].nivel == NIVEL_BAJO

    def test_la_bandera_no_lleva_umbral_porque_no_tiene(self):
        riesgo = evaluar({}, stale=True)["oficial_rancia"]
        assert riesgo.umbral is None
        assert riesgo.valor is None
        assert riesgo.fuente == "official_stale"

    def test_un_ruleset_por_delante_de_la_calibracion_es_riesgo(self):
        riesgo = evaluar({}, ruleset_version=1)["umbrales_sin_recalibrar"]
        assert riesgo.nivel == NIVEL_MEDIO
        assert riesgo.valor == Decimal(1)
        assert riesgo.umbral == Decimal(0)

    def test_al_recalibrar_el_riesgo_baja_solo(self):
        config = {**CONFIG_MINIMA}
        config["riesgos"] = [
            {**r, "calibrado_hasta_version": 2}
            if r["codigo"] == "umbrales_sin_recalibrar"
            else r
            for r in CONFIG_MINIMA["riesgos"]
        ]
        riesgo = evaluar({}, ruleset_version=2, config=config)[
            "umbrales_sin_recalibrar"
        ]
        assert riesgo.nivel == NIVEL_BAJO


class TestOrden:
    def test_se_publica_lo_mas_grave_primero_y_lo_no_evaluable_al_final(self):
        cfg = cargar_config_riesgos(CONFIG_MINIMA)
        riesgos = evaluar_riesgos(
            config=cfg,
            vista={},  # libro_concentrado se queda sin evaluar
            official_stale=True,  # oficial_rancia -> alto
            ruleset_version=1,  # umbrales_sin_recalibrar -> medio
        )
        assert [r.codigo for r in riesgos.items] == [
            "oficial_rancia",
            "umbrales_sin_recalibrar",
            "libro_concentrado",
        ]

    def test_dentro_del_mismo_nivel_se_conserva_el_orden_del_yaml(self):
        config = {
            "version": 1,
            "riesgos": [
                {
                    "codigo": "libro_concentrado",
                    "tipo": "umbral_indicador",
                    "indicadores": ["x"],
                    "alto": "80",
                    "medio": "72",
                },
                {
                    "codigo": "calidad_snapshot",
                    "tipo": "umbral_indicador",
                    "indicadores": ["y"],
                    "alto": "30",
                    "medio": "3",
                },
            ],
        }
        cfg = cargar_config_riesgos(config)
        riesgos = evaluar_riesgos(
            config=cfg,
            vista={"x": Decimal("0"), "y": Decimal("0")},  # los dos `bajo`
            official_stale=False,
            ruleset_version=1,
        )
        assert [r.codigo for r in riesgos.items] == [
            "libro_concentrado",
            "calidad_snapshot",
        ]


class TestConfigInvalida:
    @pytest.mark.parametrize(
        "mutacion, fragmento",
        [
            ({"version": 0}, "version"),
            ({"version": "1"}, "version"),
            ({"riesgos": []}, "no vacía"),
            ({"riesgos": "libro"}, "no vacía"),
        ],
    )
    def test_la_raiz_mal_formada_no_arranca(self, mutacion, fragmento):
        with pytest.raises(ConfigRiesgosInvalida, match=fragmento):
            cargar_config_riesgos({**CONFIG_MINIMA, **mutacion})

    def test_tipo_desconocido(self):
        with pytest.raises(ConfigRiesgosInvalida, match="tipo"):
            cargar_config_riesgos(
                {"version": 1, "riesgos": [{"codigo": "x", "tipo": "adivinanza"}]}
            )

    def test_codigos_repetidos(self):
        with pytest.raises(ConfigRiesgosInvalida, match="repetidos"):
            cargar_config_riesgos(
                {
                    "version": 1,
                    "riesgos": [
                        CONFIG_MINIMA["riesgos"][1],
                        CONFIG_MINIMA["riesgos"][1],
                    ],
                }
            )

    def test_un_corte_float_no_se_acepta(self):
        # 80.5 en YAML es un float binario: el corte dejaría de ser el que dice
        # el comentario. Mismo criterio que los umbrales del ruleset.
        with pytest.raises(ConfigRiesgosInvalida, match="string decimal"):
            cargar_config_riesgos(
                {
                    "version": 1,
                    "riesgos": [
                        {**CONFIG_MINIMA["riesgos"][0], "alto": 80.5},
                    ],
                }
            )

    def test_bandas_incoherentes_con_la_direccion(self):
        # Con `alto` por debajo de `medio`, `medio` sería inalcanzable y el
        # riesgo saltaría de bajo a alto sin escalón.
        with pytest.raises(ConfigRiesgosInvalida, match="debe superar"):
            cargar_config_riesgos(
                {
                    "version": 1,
                    "riesgos": [{**CONFIG_MINIMA["riesgos"][0], "alto": "60"}],
                }
            )

    def test_bandera_desconocida(self):
        with pytest.raises(ConfigRiesgosInvalida, match="bandera"):
            cargar_config_riesgos(
                {
                    "version": 1,
                    "riesgos": [
                        {**CONFIG_MINIMA["riesgos"][1], "bandera": "la_luna_llena"}
                    ],
                }
            )

    def test_nivel_desconocido(self):
        with pytest.raises(ConfigRiesgosInvalida, match="si_no"):
            cargar_config_riesgos(
                {
                    "version": 1,
                    "riesgos": [{**CONFIG_MINIMA["riesgos"][1], "si_no": "regular"}],
                }
            )


class TestConfigDelRepo:
    """El YAML que el motor carga de verdad, no un fixture."""

    @pytest.fixture
    def config(self):
        ruta = Path(RIESGOS_POR_DEFECTO)
        return cargar_config_riesgos(yaml.safe_load(ruta.read_text(encoding="utf-8")))

    def test_carga_y_declara_los_cuatro_riesgos(self, config):
        assert config.version == 1
        assert {r.codigo for r in config.riesgos} == {
            "libro_concentrado",
            "calidad_snapshot",
            "oficial_rancia",
            "umbrales_sin_recalibrar",
        }

    def test_el_corte_de_snapshot_ES_el_de_la_confianza(self, config):
        # Canario: si alguien mueve uno sin el otro, el producto tendría dos
        # definiciones de «snapshot malo» y las señales se suprimirían en un
        # punto distinto del que la vista llama `alto`.
        snapshot = next(r for r in config.riesgos if r.codigo == "calidad_snapshot")
        assert snapshot.alto == UMBRAL_CONFIANZA_OUTLIERS_PCT

    def test_pide_los_indicadores_que_el_panel_no_trae(self, config):
        # `merchants_pct` no es uno de los seis medidores: sin esto, el caso de
        # uso no lo pediría y el riesgo saldría siempre sin evaluar.
        assert "p2p_merchants_pct_buy" in config.nombres_indicadores
        assert "p2p_merchants_pct_sell" in config.nombres_indicadores
