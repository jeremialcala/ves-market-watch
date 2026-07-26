"""Tests del contexto TLS anclado (ADR-0006) — sin red."""

from pathlib import Path

import pytest

from ingestor_bcv.adapters.bcv.client import _crear_contexto_ssl

BUNDLE = Path(__file__).parents[2] / "certs" / "bcv-ca-bundle.pem"


def test_bundle_versionado_carga_y_ancla_cas():
    contexto = _crear_contexto_ssl(str(BUNDLE))
    # Intermedia Sectigo DV R36 + raíz R46 (y variantes cross-firmadas).
    assert contexto.cert_store_stats()["x509_ca"] >= 2


def test_bundle_inexistente_falla_rapido_sin_degradar_tls():
    with pytest.raises(FileNotFoundError, match="ADR-0006"):
        _crear_contexto_ssl("no/existe/bundle.pem")


def test_modo_system_usa_truststore_del_sistema():
    contexto = _crear_contexto_ssl("system")
    assert contexto.verify_mode is not None
