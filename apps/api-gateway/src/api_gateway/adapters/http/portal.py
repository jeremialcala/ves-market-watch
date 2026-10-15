"""Rutas de lectura pública `/portal/v1` (ADR-0028; contrato:
`docs/portal-openapi.yaml`).

Sin token: el portal es público. A cambio:

- **cuota por IP de cliente**, con la IP real solo desde los proxies de
  confianza (RF-13);
- **caché con *single-flight***: el snapshot se calcula como mucho una vez cada
  5 s y las series una vez por minuto, haya uno o mil visitantes (RNF-2);
- **`Cache-Control` público**, para que Cloudflare pueda servirlo desde el borde
  con una *Cache Rule*;
- **ningún parámetro**: lo que hace útil a `/api/v1` para un sistema (rangos,
  paginación) es justo lo que esto no expone. Cualquier parámetro es 422.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from api_gateway.adapters.http.ip_cliente import ip_cliente
from api_gateway.domain.errores import RangoInvalido

router = APIRouter(prefix="/portal/v1")

TTL_SNAPSHOT_S = 5
TTL_SERIES_S = 60
CACHE_SNAPSHOT = "public, max-age=5, stale-while-revalidate=25"
CACHE_SERIES = "public, max-age=60, stale-while-revalidate=240"


async def _cuota_por_ip(request: Request, response: Response) -> None:
    ip = ip_cliente(request, request.app.state.redes_confianza)
    cuota = request.app.state.limitador_portal.consumir(ip)
    cabeceras = cuota.como_headers()
    response.headers.update(cabeceras)
    # También en `request.state`, como en `/api/v1`: si el handler lanza, la
    # respuesta la arma `problem.py` y sin esto perdería las cabeceras.
    request.state.cabeceras_cuota = cabeceras


CuotaPorIp = Annotated[None, Depends(_cuota_por_ip)]


def _sin_parametros(request: Request) -> None:
    if request.query_params:
        raise RangoInvalido(
            "Este recurso no admite parámetros: sirve ventanas fijas. Para rangos "
            "a medida está la API (/api/v1)."
        )


@router.get("/snapshot")
async def snapshot(request: Request, response: Response, _cuota: CuotaPorIp) -> dict:
    _sin_parametros(request)
    estado = request.app.state
    cuerpo = await estado.cache_portal.obtener(
        "snapshot", TTL_SNAPSHOT_S, estado.consultas.snapshot_portal.ejecutar
    )
    response.headers["Cache-Control"] = CACHE_SNAPSHOT
    return cuerpo


@router.get("/dashboard/series")
async def series(request: Request, response: Response, _cuota: CuotaPorIp) -> dict:
    _sin_parametros(request)
    estado = request.app.state
    cuerpo = await estado.cache_portal.obtener(
        "series", TTL_SERIES_S, estado.consultas.series_portal.ejecutar
    )
    response.headers["Cache-Control"] = CACHE_SERIES
    return cuerpo
