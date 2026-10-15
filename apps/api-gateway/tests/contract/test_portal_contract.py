"""Contrato de `/portal/v1` contra `docs/portal-openapi.yaml` (ADR-0028 §4).

Todos los objetos del contrato llevan `additionalProperties: false`, así que
esto es también la prueba de la lista blanca (T18): un campo que la
implementación añada sin declararlo hace fallar la validación.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from tests.conftest import APP_DIR
from tests.unit.test_portal import sembrar

PORTAL_OPENAPI = APP_DIR / "docs" / "portal-openapi.yaml"
_DOC = yaml.safe_load(PORTAL_OPENAPI.read_text(encoding="utf-8"))
_REGISTRY = Registry().with_resource(
    "urn:portal", Resource(contents=_DOC, specification=DRAFT202012)
)


def validar(nombre: str, cuerpo: dict) -> None:
    validador = Draft202012Validator(
        {"$ref": f"urn:portal#/components/schemas/{nombre}"}, registry=_REGISTRY
    )
    errores = sorted(validador.iter_errors(cuerpo), key=str)
    assert not errores, f"{nombre}: {[e.message for e in errores][:5]}"


def test_snapshot_completo_cumple_el_contrato(cliente, repositorio):
    sembrar(repositorio)
    validar("PortalSnapshot", cliente.get("/portal/v1/snapshot").json())


def test_snapshot_vacio_cumple_el_contrato(cliente):
    validar("PortalSnapshot", cliente.get("/portal/v1/snapshot").json())


def test_series_cumplen_el_contrato(cliente, repositorio):
    ahora = datetime.now(UTC)
    repositorio.historial_ind = [
        {"as_of": ahora - timedelta(hours=h), "indicator": i, "currency": "VES",
         "value": "12.04000000", "calc_version": 1}
        for h in range(1, 5)
        for i in ("p2p_brecha_pct_buy", "p2p_brecha_pct_sell")
    ]
    validar("PortalSeries", cliente.get("/portal/v1/dashboard/series").json())


def test_un_campo_no_declarado_hace_fallar_el_contrato(cliente, repositorio):
    """La red de la lista blanca funciona: si algo se cuela, esto lo detecta."""
    sembrar(repositorio)
    cuerpo = cliente.get("/portal/v1/snapshot").json()
    cuerpo["p2p"]["buy"]["merchant_ref"] = "ab" * 16
    validador = Draft202012Validator(
        {"$ref": "urn:portal#/components/schemas/PortalSnapshot"}, registry=_REGISTRY
    )
    assert any("merchant_ref" in e.message for e in validador.iter_errors(cuerpo))


def test_cada_ruta_del_router_esta_en_el_contrato():
    """Ni rutas sin contrato ni contrato sin ruta."""
    from api_gateway.adapters.http.portal import router

    assert {r.path for r in router.routes} == set(_DOC["paths"])
