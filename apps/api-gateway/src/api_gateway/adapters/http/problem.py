"""Errores RFC 7807 (`application/problem+json`) sin detalles internos (A05).

Mapea los errores del dominio a los problemas del contrato (openapi.yaml):
400 parámetro inválido · 401 no autenticado · 403 permiso insuficiente ·
404 sin datos · 422 rango no procesable · 429 rate limit.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from api_gateway.domain.errores import (
    ErrorAutenticacion,
    LimiteExcedido,
    ParametroInvalido,
    PermisoInsuficiente,
    RangoInvalido,
)

_BASE_TIPOS = "https://api.vesmarketwatch/errors/"


class NoEncontrado(Exception):
    """El recurso existe en el contrato pero aún no hay datos que sirvan (404)."""

    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


def problema(
    status: int,
    titulo: str,
    detalle: str | None = None,
    tipo: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    cuerpo: dict = {"title": titulo, "status": status}
    if tipo:
        cuerpo["type"] = _BASE_TIPOS + tipo
    if detalle:
        cuerpo["detail"] = detalle
    return JSONResponse(
        status_code=status,
        content=cuerpo,
        media_type="application/problem+json",
        headers=headers,
    )


def cabeceras_cuota(req: Request) -> dict[str, str] | None:
    """Cabeceras `X-RateLimit-*` si esta petición llegó a consumir cuota.

    El contrato promete la cuota en toda respuesta que la haya gastado, y un 404
    la gasta: el limitador corre en la dependencia, antes de que el handler sepa
    si hay datos. Sin esto, quien sondea un endpoint todavía sin datos consume su
    límite a ciegas y se estrella contra un 429 que no vio venir.

    Devuelve `None` —y no un dict vacío— porque es lo que `JSONResponse` espera
    cuando no hay cabeceras que añadir.

    Los 401 y 403 salen sin cabeceras a propósito, y es correcto: el limitador
    va DESPUÉS de validar el token y el permiso, así que esas peticiones no
    gastan cuota. Prometerles una cifra sería inventarla.
    """
    return getattr(req.state, "cabeceras_cuota", None)


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorAutenticacion)
    async def _401(_req: Request, exc: ErrorAutenticacion) -> JSONResponse:
        return problema(401, "No autenticado", str(exc), "unauthorized")

    @app.exception_handler(PermisoInsuficiente)
    async def _403(_req: Request, exc: PermisoInsuficiente) -> JSONResponse:
        return problema(
            403,
            "Permiso insuficiente",
            f"Se requiere el permiso '{exc.permiso}'.",
            "forbidden",
        )

    @app.exception_handler(NoEncontrado)
    async def _404(req: Request, exc: NoEncontrado) -> JSONResponse:
        return problema(
            404, "Sin datos", exc.detalle, "not-found", cabeceras_cuota(req)
        )

    @app.exception_handler(ParametroInvalido)
    async def _400(req: Request, exc: ParametroInvalido) -> JSONResponse:
        return problema(
            400,
            "Parámetro inválido",
            str(exc),
            "invalid-parameter",
            cabeceras_cuota(req),
        )

    @app.exception_handler(RequestValidationError)
    async def _400_fastapi(
        req: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # El contrato usa 400 para parámetros inválidos (no el 422 default de
        # FastAPI). Solo se expone qué parámetro falló, nunca el traceback.
        parametros = sorted(
            {
                str(error["loc"][-1])
                for error in exc.errors()
                if error.get("loc")
            }
        )
        detalle = (
            f"Parámetros inválidos o ausentes: {', '.join(parametros)}."
            if parametros
            else "Parámetros inválidos."
        )
        return problema(
            400, "Parámetro inválido", detalle, "invalid-parameter", cabeceras_cuota(req)
        )

    @app.exception_handler(RangoInvalido)
    async def _422(req: Request, exc: RangoInvalido) -> JSONResponse:
        return problema(
            422, "Rango no procesable", str(exc), "range-too-large", cabeceras_cuota(req)
        )

    @app.exception_handler(LimiteExcedido)
    async def _429(_req: Request, exc: LimiteExcedido) -> JSONResponse:
        import time

        reintento = max(1, exc.reset_epoch - int(time.time()))
        return problema(
            429,
            "Demasiadas peticiones",
            "Límite de peticiones superado; reintente más tarde.",
            "rate-limited",
            headers={
                "Retry-After": str(reintento),
                "X-RateLimit-Limit": str(exc.limite),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(exc.reset_epoch),
            },
        )
