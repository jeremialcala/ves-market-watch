"""Cableado de los riesgos en el caso de uso.

El dominio ya está probado con la vista servida (`test_riesgos.py`) y el payload
contra el schema (`contract/test_analysis_event_schema.py`). Lo que se fija aquí
es el tramo de aplicación, donde vive la decisión que puede romperse **en
silencio**: si `nombres_requeridos` no pide `merchants_pct`, ese indicador no
llega a la vista y `libro_concentrado` sale sin evaluar para siempre — sin error,
sin log, sin test rojo. Solo una tarjeta que nunca dice nada.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import yaml

from indicator_engine.application.analizar_revision import AnalizarRevision
from indicator_engine.domain.analisis import Distribucion, cargar_config_analisis
from indicator_engine.domain.reglas import cargar_ruleset
from indicator_engine.domain.riesgos import cargar_config_riesgos

CONFIG_DIR = Path(__file__).parents[2] / "config"
AS_OF = datetime(2026, 9, 7, 2, 55, tzinfo=UTC)
TRIGGERED_BY = "3b8d5a10-19c7-4e2f-bb64-0c9a71e5d833"

VISTA = {
    "p2p_brecha_pct_buy": Decimal("17.64"),
    "p2p_spread_pct": Decimal("0.56"),
    "p2p_ratio_oferta_demanda": Decimal("0.59"),
    "p2p_drenaje_oferta_6h_pct": Decimal("29.86"),
    "p2p_outliers_pct_buy": Decimal("0.00"),
    "p2p_merchants_pct_buy": Decimal("60.50"),
    "p2p_merchants_pct_sell": Decimal("71.00"),
}


def _yaml(nombre: str):
    return yaml.safe_load((CONFIG_DIR / nombre).read_text(encoding="utf-8"))


class DistribucionesFalsas:
    async def distribuciones(self, nombres, moneda, desde, fracciones):
        return {
            nombre: Distribucion(
                muestras=4187,
                minimo=Decimal("8.41"),
                maximo=Decimal("31.07"),
                cortes=(Decimal("10.55"), Decimal("15.90"), Decimal("24.18")),
                calculada_en=AS_OF,
            )
            for nombre in nombres
        }


class RepoFalso:
    def __init__(self):
        self.guardados = []

    async def guardar_analisis(self, analisis, payload):
        self.guardados.append(payload)


class PublisherFalso:
    def __init__(self):
        self.publicados = []

    async def publish_analysis_updated(self, evento):
        self.publicados.append(evento)


def _caso(*, con_riesgos: bool = True) -> tuple[AnalizarRevision, PublisherFalso]:
    publisher = PublisherFalso()
    caso = AnalizarRevision(
        config=cargar_config_analisis(_yaml("analisis.v1.yaml")),
        ruleset=cargar_ruleset(_yaml("senales.v1.yaml")),
        distribuciones=DistribucionesFalsas(),
        repository=RepoFalso(),
        publisher=publisher,
        config_riesgos=(
            cargar_config_riesgos(_yaml("riesgos.v1.yaml")) if con_riesgos else None
        ),
    )
    return caso, publisher


async def _ejecutar(caso, vista=VISTA, *, official_stale=False) -> dict:
    return await caso.ejecutar(
        vista=vista,
        as_of_por_indicador={n: AS_OF for n in vista},
        as_of=AS_OF,
        moneda="VES",
        triggered_by=TRIGGERED_BY,
        calc_version=1,
        confianza_baja=False,
        official_stale=official_stale,
    )


def test_la_vista_requerida_incluye_los_indicadores_de_los_riesgos():
    """`merchants_pct` NO es uno de los seis medidores del panel.

    Sin esta unión no llegaría a la vista vigente y el riesgo saldría siempre sin
    evaluar — el fallo silencioso que motiva este archivo.
    """
    caso, _ = _caso()
    nombres = caso.nombres_requeridos()
    assert "p2p_merchants_pct_buy" in nombres
    assert "p2p_merchants_pct_sell" in nombres


def test_sin_config_de_riesgos_no_se_piden_esos_indicadores():
    caso, _ = _caso(con_riesgos=False)
    assert "p2p_merchants_pct_buy" not in caso.nombres_requeridos()


async def test_el_evento_publicado_lleva_los_riesgos_evaluados():
    caso, publisher = _caso()
    evento = await _ejecutar(caso)

    riesgos = evento["payload"]["risks"]
    assert riesgos["version"] == 1
    por_codigo = {r["code"]: r for r in riesgos["items"]}
    assert set(por_codigo) == {
        "libro_concentrado",
        "calidad_snapshot",
        "oficial_rancia",
        "umbrales_sin_recalibrar",
    }
    # Se publica lo mismo que se guarda: el documento ES el contrato.
    assert publisher.publicados[0]["payload"]["risks"] == riesgos


async def test_con_valores_como_los_del_2026_09_07_el_libro_no_esta_en_alto():
    """La tarjeta lo pintaba `alto` a mano; el dato dice `bajo`.

    El peor lado (71,00 %) no alcanza ni el corte de `medio`, que está en 72. Y
    aun así manda sobre el buy de 60,50: el nivel sale del lado peor, no del que
    la vista tuviera más a mano.
    """
    caso, _ = _caso()
    evento = await _ejecutar(caso)

    libro = next(
        r for r in evento["payload"]["risks"]["items"] if r["code"] == "libro_concentrado"
    )
    assert libro["level"] == "bajo"
    assert libro["value"] == "71.00"
    assert libro["source"] == "p2p_merchants_pct_sell"
    # El umbral viaja aunque el riesgo esté bajo: la tarjeta rotula el corte
    # real, no una copia suya que puede quedarse atrás.
    assert libro["threshold"] == "80"


async def test_la_rancidez_de_la_oficial_sigue_a_su_bandera():
    caso, _ = _caso()
    evento = await _ejecutar(caso, official_stale=True)
    rancia = next(
        r for r in evento["payload"]["risks"]["items"] if r["code"] == "oficial_rancia"
    )
    assert rancia["level"] == "alto"
    # Y va la primera: la lista se publica ordenada por gravedad.
    assert evento["payload"]["risks"]["items"][0]["code"] == "oficial_rancia"


async def test_sin_config_de_riesgos_el_analisis_se_publica_igual():
    """Aditivo de verdad: el resto de la vista no depende de este bloque."""
    caso, _ = _caso(con_riesgos=False)
    evento = await _ejecutar(caso)
    assert "risks" not in evento["payload"]
    assert evento["payload"]["indicators"]  # el panel sigue entero
