"""Cliente HTTP del sitio BCV con TLS anclado (ADR-0006).

La verificación TLS usa un bundle de CA explícito y versionado
(`certs/bcv-ca-bundle.pem`) que ancla la cadena real del certificado del BCV.
El sitio envía históricamente una cadena incompleta/incorrecta, por lo que el
truststore del sistema puede fallar; el bundle la completa SIN desactivar la
verificación. No existe ninguna ruta de código con `verify=False`.
"""

from __future__ import annotations

import ssl
from datetime import UTC, datetime
from pathlib import Path

import httpx

from ingestor_bcv.application.ports import CapturaOficial
from ingestor_bcv.adapters.bcv.parser import parsear_pagina

_USER_AGENT = "ves-market-watch/ingestor-bcv (+https://github.com/jeremialcala/ves-market-watch)"


class FuenteBcv:
    """Adaptador del puerto `OfficialRateSource` contra bcv.org.ve."""

    def __init__(self, url: str, ca_bundle: str, timeout_seconds: float = 30.0) -> None:
        self._url = url
        self._timeout = timeout_seconds
        self._ssl_context = _crear_contexto_ssl(ca_bundle)

    async def fetch_rates(self) -> CapturaOficial:
        async with httpx.AsyncClient(
            verify=self._ssl_context,
            timeout=self._timeout,
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
        ) as cliente:
            respuesta = await cliente.get(self._url)
            respuesta.raise_for_status()

        fecha_valor, tasas = parsear_pagina(respuesta.text)
        return CapturaOficial(
            fecha_valor=fecha_valor,
            tasas=tasas,
            capturada_en=datetime.now(UTC),
        )


def _crear_contexto_ssl(ca_bundle: str) -> ssl.SSLContext:
    """Contexto TLS verificado. `"system"` usa el truststore del sistema;
    cualquier otro valor es la ruta del bundle anclado (falla rápido si no existe)."""
    if ca_bundle == "system":
        return ssl.create_default_context()

    ruta = Path(ca_bundle)
    if not ruta.is_file():
        raise FileNotFoundError(
            f"Bundle de CA del BCV no encontrado: {ruta}. "
            "Ver certs/README.md para (re)generarlo. La verificación TLS "
            "nunca se desactiva (ADR-0006)."
        )
    return ssl.create_default_context(cafile=str(ruta))
