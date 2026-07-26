"""Integración: anclaje TLS de `FuenteBcv` contra un servidor local (sin docker).

Prueba las dos caras del ADR-0006 con un TLS real de extremo a extremo:
1. Un servidor cuya CA NO está en el bundle anclado debe ser rechazado.
2. Con el bundle apuntando a la CA correcta, el fetch y el parseo funcionan.
"""

import asyncio
import ssl
from datetime import date
from decimal import Decimal

import httpx
import pytest
import trustme

from ingestor_bcv.adapters.bcv.client import FuenteBcv
from ingestor_bcv.config import BUNDLE_CA_POR_DEFECTO

pytestmark = pytest.mark.integration


def _respuesta_http(cuerpo: bytes) -> bytes:
    return (
        b"HTTP/1.1 200 OK\r\n"
        b"Content-Type: text/html; charset=utf-8\r\n"
        b"Content-Length: " + str(len(cuerpo)).encode() + b"\r\n"
        b"Connection: close\r\n\r\n" + cuerpo
    )


@pytest.fixture
async def servidor_tls(bcv_html):
    """Servidor HTTPS local con cert de una CA efímera; sirve la página del BCV."""
    ca = trustme.CA()
    cert = ca.issue_cert("localhost", "127.0.0.1")
    contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    cert.configure_cert(contexto)

    cuerpo = bcv_html.encode("utf-8")

    async def manejar(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            await reader.readuntil(b"\r\n\r\n")
            writer.write(_respuesta_http(cuerpo))
            await writer.drain()
        finally:
            writer.close()

    servidor = await asyncio.start_server(manejar, "127.0.0.1", 0, ssl=contexto)
    puerto = servidor.sockets[0].getsockname()[1]

    yield f"https://127.0.0.1:{puerto}/", ca

    servidor.close()
    await servidor.wait_closed()


async def test_ca_no_anclada_es_rechazada(servidor_tls):
    url, _ = servidor_tls
    # El bundle real del BCV (Sectigo) no confía en la CA efímera del servidor.
    fuente = FuenteBcv(url, ca_bundle=str(BUNDLE_CA_POR_DEFECTO))

    with pytest.raises(httpx.ConnectError, match="CERTIFICATE_VERIFY_FAILED"):
        await fuente.fetch_rates()


async def test_ca_anclada_permite_fetch_y_parseo_completo(servidor_tls, tmp_path):
    url, ca = servidor_tls
    ruta_ca = tmp_path / "ca-efimera.pem"
    ca.cert_pem.write_to_path(ruta_ca)

    captura = await FuenteBcv(url, ca_bundle=str(ruta_ca)).fetch_rates()

    assert captura.fecha_valor == date(2026, 7, 6)
    assert captura.tasas["USD"] == Decimal("667.05000000")
    assert set(captura.tasas) == {"USD", "EUR", "CNY", "TRY", "RUB"}
