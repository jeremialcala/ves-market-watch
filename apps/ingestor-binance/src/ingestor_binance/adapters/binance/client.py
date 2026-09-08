"""Cliente del endpoint público de búsqueda P2P de Binance (ADR-0005).

Polling educado: User-Agent identificable, presupuesto de requests/min,
backoff exponencial con jitter ante 429/5xx, TLS verificado (default estricto
de httpx — nunca se desactiva), timeout y tope de bytes por respuesta
(escenarios negativos 3, 4 y 5 del PRD). Cada página se valida contra el
schema de la fuente antes de tocar el dominio (escenario 1, A10).
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from datetime import UTC, datetime
from functools import partial
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
        paginas_en_paralelo: int = 1,
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
        # 1 = comportamiento secuencial original. El default del servicio lo
        # sube (ADR-0026); aquí se queda en 1 para que construir el adaptador a
        # mano no cambie de semántica sin pedirlo.
        self._concurrencia = max(1, paginas_en_paralelo)
        self._timeout = timeout_seconds
        self._max_bytes = max_response_bytes
        schema = json.loads(Path(schema_fuente).read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self._validador = Draft202012Validator(schema)

    async def fetch_ads(self, lado: Lado) -> CapturaP2P:
        """Captura el top-K paginado, en lotes de `_concurrencia` páginas.

        **Por qué en lotes y no las N páginas a la vez** (ADR-0026, que enmienda
        ADR-0005): el SLO `consulta→evento <= 5 s (p95)` se incumplía en 7,16 s
        porque las 10 páginas iban en fila y la latencia era la de Binance
        multiplicada por diez.

        Lo que NO cambia: **las peticiones por minuto son las mismas**. Siguen
        siendo 10 por lado, una vez por ciclo, y cada una consume su unidad del
        `PresupuestoDeRequests` —la ventana deslizante de 60 s de ADR-0005— igual
        que antes. Lo único que cambia es que salen en ráfaga en vez de en fila.

        Lo que sí cambia, y por eso el lote es acotado: **el pico instantáneo**.
        Diez peticiones simultáneas son un patrón más agresivo que diez
        espaciadas, y es justo lo que puede disparar T7 (baneo). Con lotes de 4
        el pico queda contenido y la latencia baja a un tercio.

        Y una consecuencia que conviene tener escrita: la salida temprana
        —«si una página vuelve corta, no hay más anuncios»— ahora se evalúa al
        cerrar el lote, no en cada página. En un mercado fino eso gasta hasta
        `concurrencia - 1` peticiones de más. Con 40/min de presupuesto y 20
        gastadas por ciclo, cabe de sobra.
        """
        anuncios: list[dict] = []
        paginas_fallidas = 0

        async with httpx.AsyncClient(
            timeout=self._timeout, headers={"User-Agent": _USER_AGENT}
        ) as cliente:
            pagina = 1
            while pagina <= self._paginas:
                lote: list[int] = []
                sin_presupuesto = False
                for p in range(pagina, min(pagina + self._concurrencia, self._paginas + 1)):
                    if not self._presupuesto.permite():
                        # Polling educado: sin presupuesto no se insiste; lo que
                        # falte del top-K queda como captura parcial.
                        logger.warning(
                            "presupuesto de requests agotado en página %d (%s)", p, lado
                        )
                        paginas_fallidas += self._paginas - p + 1
                        sin_presupuesto = True
                        break
                    lote.append(p)

                # `gather` conserva el orden de entrada, así que los anuncios se
                # concatenan por página como en la versión secuencial. El orden
                # importa: la lista viene ordenada por precio.
                resultados = await asyncio.gather(
                    *(
                        con_backoff(
                            partial(self._pedir_pagina, cliente, lado, p),
                            max_intentos=self._max_retries,
                        )
                        for p in lote
                    ),
                    return_exceptions=True,
                )

                agotado = False
                for p, resultado in zip(lote, resultados):
                    if isinstance(resultado, ErrorReintentable):
                        logger.warning("página %d (%s) agotó reintentos: %s", p, lado, resultado)
                        paginas_fallidas += 1
                        continue
                    if isinstance(resultado, httpx.HTTPError):
                        logger.warning("página %d (%s) falló sin reintento: %s", p, lado, resultado)
                        paginas_fallidas += 1
                        continue
                    if isinstance(resultado, BaseException):
                        # Schema inválido o tope de bytes: se propagan como en la
                        # versión secuencial, que el caso de uso los distingue.
                        raise resultado

                    self._validar_pagina(resultado)
                    anuncios.extend(resultado["data"])
                    if len(resultado["data"]) < self._rows:
                        agotado = True  # no hay más anuncios publicados
                        break

                if agotado or sin_presupuesto:
                    break
                pagina += self._concurrencia

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
