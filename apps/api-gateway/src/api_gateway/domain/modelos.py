"""Entidades del dominio del gateway (ADR-0012: Resource Server)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from api_gateway.domain.errores import PermisoInsuficiente


@dataclass(frozen=True, slots=True)
class Usuario:
    """Identidad autenticada, proyectada del access token de Auth0.

    `permisos` viene del claim `permissions` (RBAC `access_token_authz`) con
    fallback al claim `scope`. `exp` permite cerrar la conexión WSS cuando el
    token expira (código 4401, api-contracts).
    """

    sub: str
    permisos: frozenset[str]
    exp: datetime

    def exigir(self, permiso: str) -> None:
        if permiso not in self.permisos:
            raise PermisoInsuficiente(permiso)

    def segundos_hasta_expirar(self, ahora: datetime | None = None) -> float:
        ahora = ahora or datetime.now(UTC)
        return (self.exp - ahora).total_seconds()
