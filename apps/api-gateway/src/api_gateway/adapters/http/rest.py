"""Rutas REST `/api/v1` (contrato: `docs/openapi.yaml`).

Cadena por endpoint: Bearer → validación del token (401) → permiso (403) →
rate limit por `sub` (429, headers X-RateLimit-*) → caso de uso. Los valores
decimales ya vienen como string exacto desde el repositorio; los handlers
devuelven dicts planos para que las cabeceras de la dependencia lleguen a la
respuesta final.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from api_gateway.adapters.http.problem import NoEncontrado
from api_gateway.domain.errores import ErrorAutenticacion
from api_gateway.domain.modelos import Usuario
from api_gateway.domain.paginacion import validar_pagina, validar_rango

router = APIRouter(prefix="/api/v1")

_MONEDA = Query(default="USD", pattern=r"^[A-Z]{3}$")
# Los indicadores P2P se persisten bajo el fiat del par (VES), no bajo la
# pierna oficial (ADR-0014).
_MONEDA_P2P = Query(default="VES", pattern=r"^[A-Z]{3}$")


def _protegido(permiso: str):
    async def dependencia(request: Request, response: Response) -> Usuario:
        autorizacion = request.headers.get("authorization", "")
        esquema, _, token = autorizacion.partition(" ")
        if esquema.lower() != "bearer" or not token.strip():
            raise ErrorAutenticacion("Access token ausente o inválido.")
        usuario = await request.app.state.validador.validar(token.strip())
        usuario.exigir(permiso)
        cuota = request.app.state.limitador.consumir(usuario.sub)
        response.headers.update(cuota.como_headers())
        return usuario

    return Depends(dependencia)


def _utc(valor: datetime) -> datetime:
    return valor.replace(tzinfo=UTC) if valor.tzinfo is None else valor


# -- rates -------------------------------------------------------------------


@router.get("/rates/official/current")
async def tasa_oficial_vigente(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:rates")],
    currency: str = _MONEDA,
) -> dict:
    resultado = await request.app.state.consultas.tasa_vigente.ejecutar(currency)
    if resultado is None:
        raise NoEncontrado(f"Sin tasa oficial registrada para {currency}.")
    return resultado


@router.get("/rates/official/history")
async def historial_tasa_oficial(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:rates")],
    desde: date = Query(alias="from"),
    hasta: date = Query(alias="to"),
    currency: str = _MONEDA,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> dict:
    validar_rango(desde, hasta)
    pagina = validar_pagina(page, page_size)
    return await request.app.state.consultas.historial_tasa.ejecutar(
        currency, desde, hasta, pagina
    )


@router.get("/rates/p2p/current")
async def referencia_p2p(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:rates")],
    side: Literal["buy", "sell"] = Query(),
) -> dict:
    resultado = await request.app.state.consultas.referencia_p2p.ejecutar(side)
    if resultado is None:
        raise NoEncontrado(f"Sin referencia P2P fresca para el lado {side}.")
    return resultado


# -- indicators --------------------------------------------------------------


@router.get("/indicators/current")
async def indicadores_vigentes(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:indicators")],
    currency: str = _MONEDA,
) -> dict:
    resultado = await request.app.state.consultas.indicadores.ejecutar(currency)
    if resultado is None:
        raise NoEncontrado(f"Sin indicadores calculados para {currency}.")
    return resultado


@router.get("/indicators/history")
async def historial_indicadores(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:indicators")],
    desde: datetime = Query(alias="from"),
    hasta: datetime = Query(alias="to"),
    interval: Literal["5m", "15m", "1h", "1d"] = Query(default="1h"),
    indicator: str | None = Query(default=None, min_length=1, max_length=80),
    currency: str | None = Query(default=None, pattern=r"^[A-Z]{3}$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> dict:
    desde, hasta = _utc(desde), _utc(hasta)
    validar_rango(desde, hasta)
    pagina = validar_pagina(page, page_size)
    return await request.app.state.consultas.historial_indicadores.ejecutar(
        desde, hasta, interval, pagina, indicator, currency
    )


# -- analysis ----------------------------------------------------------------


@router.get("/analysis/current")
async def analisis_vigente(
    request: Request,
    # Permiso `read:indicators` REUTILIZADO a propósito: el análisis es la
    # lectura de esos mismos indicadores. Un `read:analysis` nuevo exigiría
    # aprovisionarlo en el tenant Auth0 y daría 403 a todo token ya emitido
    # (decisión registrada en ADR-0019).
    _usuario: Annotated[Usuario, _protegido("read:indicators")],
    currency: str = _MONEDA_P2P,
) -> dict:
    resultado = await request.app.state.consultas.analisis.ejecutar(currency)
    if resultado is None:
        raise NoEncontrado(f"Sin análisis vigente para {currency}.")
    return resultado


# -- market ------------------------------------------------------------------


@router.get("/market/depth")
async def profundidad(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:depth")],
    side: Literal["buy", "sell"] = Query(),
) -> dict:
    resultado = await request.app.state.consultas.profundidad.ejecutar(side)
    if resultado is None:
        raise NoEncontrado(f"Sin snapshot P2P registrado para el lado {side}.")
    return resultado


# -- signals -----------------------------------------------------------------


@router.get("/signals")
async def senales(
    request: Request,
    _usuario: Annotated[Usuario, _protegido("read:signals")],
    desde: datetime = Query(alias="from"),
    hasta: datetime = Query(alias="to"),
    type_: str | None = Query(default=None, alias="type"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> dict:
    desde, hasta = _utc(desde), _utc(hasta)
    validar_rango(desde, hasta)
    pagina = validar_pagina(page, page_size)
    return await request.app.state.consultas.senales.ejecutar(
        desde, hasta, type_, pagina
    )


# -- system ------------------------------------------------------------------


@router.get("/health")
async def salud(request: Request, response: Response) -> dict:
    """Público (sin token): estado agregado sin detalles internos."""
    estado = request.app.state
    db = "ok" if await estado.repositorio.ping() else "down"
    consumidor = getattr(estado, "consumidor", None)
    broker = (
        "ok" if consumidor is not None and consumidor.conectado() else "down"
    )
    componentes = {"database": db, "broker": broker, "auth": estado.validador.estado()}
    if db == "down":
        status, codigo = "down", 503
    elif any(v != "ok" for v in componentes.values()):
        status, codigo = "degraded", 200
    else:
        status, codigo = "ok", 200
    response.status_code = codigo
    return {"status": status, "components": componentes}
