"""La IP real del visitante, para la cuota por IP de `/portal/v1` (RF-13).

Detrás de `cloudflared`, `request.client.host` es la IP del conector para todo
el mundo: una cuota «por IP» con ella sería un solo cubo para todos los
visitantes, y el primero que la agotara dejaría el portal en 429 para el resto.
Cloudflare manda la IP del visitante en `CF-Connecting-IP`.

Pero esa cabecera **solo vale si la pone Cloudflare**. Aceptarla venga de donde
venga dejaría a cualquiera elegir su IP, y con ella su cuota: infinita. Por eso
se lee únicamente cuando el socket es de un proxy de confianza
(`TRUSTED_PROXIES`, la red del conector), y si no trae una IP válida se ignora
(ADR-0028 §3).

La IP no se escribe en ningún log ni en la base: es dato personal.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Iterable

from fastapi import Request

Red = ipaddress.IPv4Network | ipaddress.IPv6Network

CABECERA = "cf-connecting-ip"
SIN_IP = "desconocida"


def redes_de_confianza(valores: Iterable[str]) -> tuple[Red, ...]:
    """CIDRs o IPs sueltas (`172.22.0.0/16`, `10.0.0.5`). Un valor mal escrito
    hace fallar el arranque: una lista de confianza a medias es peor que ninguna."""
    return tuple(ipaddress.ip_network(v.strip(), strict=False) for v in valores if v.strip())


def _ip(valor: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(valor.strip())
    except ValueError:
        return None


def ip_cliente(request: Request, redes: tuple[Red, ...]) -> str:
    socket = request.client.host if request.client else ""
    origen = _ip(socket)
    if origen is None:
        return socket or SIN_IP
    if any(origen in red for red in redes):
        visitante = _ip(request.headers.get(CABECERA, ""))
        if visitante is not None:
            return str(visitante)
    return str(origen)
