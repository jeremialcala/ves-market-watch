"""Rutas de lectura pública `/portal/v1` (ADR-0028).

Sin token: el portal es público. A cambio, cuota por IP de cliente, con la IP
real solo desde los proxies de confianza (RF-13).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from api_gateway.adapters.http.ip_cliente import ip_cliente

router = APIRouter(prefix="/portal/v1")


async def _cuota_por_ip(request: Request, response: Response) -> None:
    ip = ip_cliente(request, request.app.state.redes_confianza)
    cuota = request.app.state.limitador_portal.consumir(ip)
    cabeceras = cuota.como_headers()
    response.headers.update(cabeceras)
    # También en `request.state`, como en `/api/v1`: si el handler lanza, la
    # respuesta la arma `problem.py` y sin esto perdería las cabeceras.
    request.state.cabeceras_cuota = cabeceras


CuotaPorIp = Annotated[None, Depends(_cuota_por_ip)]
