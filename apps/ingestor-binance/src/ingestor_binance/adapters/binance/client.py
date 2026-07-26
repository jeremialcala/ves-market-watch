"""Cliente del endpoint público de búsqueda P2P de Binance (ADR-0005).

Polling educado: User-Agent identificable, presupuesto de requests/min,
backoff exponencial con jitter ante 429/5xx, TLS verificado (default estricto
de httpx — nunca se desactiva), timeout y tope de bytes por respuesta
(escenarios negativos 3, 4 y 5 del PRD). Cada página se valida contra el
schema de la fuente antes de tocar el dominio (escenario 1, A10).
"""

from __future__ import annotations

import json
import logging
import math
from datetime import UTC, datetime
from pathlib import Path

import httpx
from jsonschema import Draft202012Validator, ValidationError

from ingestor_binance.adapters.binance.resilience import (
    ErrorReintentable,
    PresupuestoDeRequests,
    con_backoff,
)
from ingestor_binance.application.ports import (
    CapturaP2P,
    EsquemaFuenteInvalido,
    FuenteNoDisponible,
)
from ingestor_binance.domain.models import Lado

logger = logging.getLogger("ingestor_binance")

_USER_AGENT = (
    "ves-market-watch/ingestor-binance "
    "(+https://github.com/jeremialcala/ves-market-watch)"
)


class FuenteBinanceP2P:
    """Adaptador del puerto `P2PMarketSource` contra el endpoint adv/search."""

    def __init__(
        self,
        url: str,
        asset: str,
        fiat: str,
        schema_fuente: str | Path,
        presupuesto: PresupuestoDeRequests,
        top_k: int = 100,
        rows_per_page: int = 20,
        max_retries: int = 3,
        timeout_seconds: float = 15.0,
        max_response_bytes: int = 2 * 1024 * 1024,
    ) -> None:
        self._url = url
        self._asset = asset
        self._fiat = fiat
        self._presupuesto = presupuesto
        self._paginas = math.ceil(top_k / rows_per_page)
        self._rows = rows_per_page
        self._max_retries = max_retries
        self._timeout = timeout_seconds
        self._max_bytes = max_response_bytes
        schema = json.loads(Path(schema_fuente).read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self._validador = Draft202012Validator(schema)

    async def fetch_ads(self, lado: Lado) -> CapturaP2P:
        anuncios: list[dict] = []
        paginas_fallidas = 0

        async with httpx.AsyncClient(
            timeout=self._timeout, headers={"User-Agent": _USER_AGENT}
        ) as cliente:
            for pagina in range(1, self._paginas + 1):
                if not self._presupuesto.permite():
                    # Polling educado: sin presupuesto no se insiste; lo que
                    # falte del top-K queda como captura parcial.
                    logger.warning(
                        "presupuesto de requests agotado en página %d (%s)", pagina, lado
                    )
                    paginas_fallidas += self._paginas - pagina + 1
                    break
                try:
                    datos = await con_backoff(
                        lambda: self._pedir_pagina(cliente, lado, pagina),
                        max_intentos=self._max_retries,
                    )
                except ErrorReintentable as exc:
                    logger.warning("página %d (%s) agotó reintentos: %s", pagina, lado, exc)
                    paginas_fallidas += 1
                    continue
                except httpx.HTTPError as exc:
                    logger.warning("página %d (%s) falló sin reintento: %s", pagina, lado, exc)
                    paginas_fallidas += 1
                    continue

                self._validar_pagina(datos)
                anuncios.extend(datos["data"])
                if len(datos["data"]) < self._rows:
                    break  # no hay más anuncios publicados

        if not anuncios:
            raise FuenteNoDisponible(
                f"ninguna página del top-K respondió para {lado} "
                f"({paginas_fallidas} fallidas)"
            )
        return CapturaP2P(
            lado=lado,
            asset=self._asset,
            fiat=self._fiat,
            anuncios_crudos=anuncios,
            parcial=paginas_fallidas > 0,
            capturada_en=datetime.now(UTC),
        )

    async def _pedir_pagina(
        self, cliente: httpx.AsyncClient, lado: Lado, pagina: int
    ) -> dict:
        cuerpo = {
            "page": pagina,
            "rows": self._rows,
            "asset": self._asset,
            "fiat": self._fiat,
            "tradeType": lado.value,
        }
        try:
            async with cliente.stream("POST", self._url, json=cuerpo) as respuesta:
                if respuesta.status_code == 429 or respuesta.status_code >= 500:
                    raise ErrorReintentable(f"HTTP {respuesta.status_code}")
                respuesta.raise_for_status()

                # Tope de bytes por streaming: una respuesta gigante o maliciosa
                # se corta sin cargarla completa en memoria (escenario 4, DoS).
                bloques: list[bytes] = []
                total = 0
                async for bloque in respuesta.aiter_bytes():
                    total += len(bloque)
                    if total > self._max_bytes:
                        raise FuenteNoDisponible(
                            f"respuesta excede el tope de {self._max_bytes} bytes"
                        )
                    bloques.append(bloque)
        except httpx.TimeoutException as exc:
            raise ErrorReintentable(f"timeout: {exc}") from exc
        except httpx.TransportError as exc:
            raise ErrorReintentable(f"error de red: {exc}") from exc

        try:
            return json.loads(b"".join(bloques))
        except json.JSONDecodeError as exc:
            raise EsquemaFuenteInvalido(f"la respuesta no es JSON: {exc}") from exc

    def _validar_pagina(self, datos: dict) -> None:
        try:
            self._validador.validate(datos)
        except ValidationError as exc:
            raise EsquemaFuenteInvalido(
                f"la respuesta no cumple el schema de la fuente: {exc.message}"
            ) from exc
