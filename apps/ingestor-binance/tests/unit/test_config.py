"""Configuración del servicio desde el entorno.

Estaba al 0 % y contiene el fail-fast de ADR-0011, que es lo único que impide
arrancar sin la clave de pseudonimización: sin ella no hay `merchant_ref` y el
contrato `p2p-snapshot` v1.1 se degradaría en silencio.
"""

import pytest

from ingestor_binance.config import Settings

CLAVE = "0" * 64


def test_sin_la_clave_de_pseudonimizacion_el_servicio_no_arranca():
    """ADR-0011: fallar al arrancar, no al publicar.

    Sin `MERCHANT_HMAC_KEY` el pseudónimo no se puede calcular. Si el arranque
    fuera tolerante, el servicio publicaría snapshots sin `merchant_ref` —forma
    válida para el schema, porque el campo es opcional— y la degradación solo se
    notaría al intentar correlacionar anunciantes semanas después.
    """
    with pytest.raises(ValueError) as fallo:
        Settings.from_env({})

    # El mensaje dice qué falta Y cómo generarla: el que arranca el servicio a
    # las 3 de la mañana no debería tener que leer el ADR para desbloquearse.
    assert "MERCHANT_HMAC_KEY" in str(fallo.value)
    assert "openssl rand -hex 32" in str(fallo.value)


def test_una_clave_vacia_cuenta_como_ausente():
    """`MERCHANT_HMAC_KEY=` en un `.env` es el error fácil de cometer, y con un
    `in env` en vez de un `if not` pasaría el filtro: el HMAC se calcularía con
    clave vacía, que es un hash público disfrazado de pseudónimo."""
    with pytest.raises(ValueError):
        Settings.from_env({"MERCHANT_HMAC_KEY": ""})


def test_los_defaults_son_los_del_polling_educado():
    """Los valores por defecto NO son arbitrarios: son el contrato de ADR-0005
    con Binance. Si alguien los sube sin pensarlo, el servicio deja de ser
    educado sin que ninguna prueba se entere."""
    ajustes = Settings.from_env({"MERCHANT_HMAC_KEY": CLAVE})

    assert ajustes.fetch_interval_seconds == 60
    assert ajustes.request_budget_per_min == 20
    assert ajustes.max_retries == 3
    assert ajustes.breaker_threshold == 5
    assert ajustes.breaker_cooldown_seconds == 300
    # Tope de respuesta: corta una respuesta gigante o maliciosa (DoS).
    assert ajustes.max_response_bytes == 2 * 1024 * 1024


def test_el_entorno_manda_sobre_los_defaults_y_con_el_tipo_correcto():
    ajustes = Settings.from_env(
        {
            "MERCHANT_HMAC_KEY": CLAVE,
            "FETCH_INTERVAL_SECONDS": "30",
            "TOP_K": "200",
            "OUTLIER_MAD_K": "2.5",
            "AMQP_EXCHANGE": "otro.exchange",
        }
    )

    # El entorno llega siempre como texto: si algo quedara sin convertir, el
    # fallo aparecería mucho más tarde y en otro sitio.
    assert ajustes.fetch_interval_seconds == 30 and isinstance(
        ajustes.fetch_interval_seconds, int
    )
    assert ajustes.top_k == 200
    assert ajustes.outlier_mad_k == 2.5 and isinstance(ajustes.outlier_mad_k, float)
    assert ajustes.amqp_exchange == "otro.exchange"
    assert ajustes.merchant_hmac_key == CLAVE


def test_el_schema_de_la_fuente_apunta_a_un_fichero_que_existe():
    """El default se resuelve desde la ruta del módulo. Si alguien mueve el
    paquete, el servicio arranca y falla al validar la primera página."""
    from pathlib import Path

    ajustes = Settings.from_env({"MERCHANT_HMAC_KEY": CLAVE})

    assert Path(ajustes.schema_fuente).is_file()
