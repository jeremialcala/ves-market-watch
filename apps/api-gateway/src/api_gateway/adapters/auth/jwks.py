"""Validación de access tokens de Auth0: RS256 vía JWKS (ADR-0012).

Reglas T11 (confused deputy): solo se acepta RS256, la audiencia debe ser
exactamente la API (`aud`) y el emisor el tenant (`iss`) — un ID token (aud =
client_id) o un token de otro tenant/API falla la validación. El motivo
concreto del rechazo se loguea pero nunca se responde al cliente.

El JWKS se cachea por `kid`; ante un `kid` desconocido se refresca con un
mínimo entre fetches (evita que tokens basura provoquen hammering a Auth0).
`jwks_estatico` permite inyectar claves en tests sin red.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

import httpx
import jwt

from api_gateway.application.ports import TokenValidator
from api_gateway.domain.errores import ErrorAutenticacion
from api_gateway.domain.modelos import Usuario

logger = logging.getLogger(__name__)

_MIN_ENTRE_FETCHES_S = 60


class ValidadorTokenAuth0(TokenValidator):
    def __init__(
        self,
        jwks_uri: str,
        issuer: str,
        audience: str,
        jwks_estatico: dict | None = None,
    ) -> None:
        self._jwks_uri = jwks_uri
        self._issuer = issuer
        self._audience = audience
        self._estatico = jwks_estatico is not None
        self._claves: dict[str, object] = {}
        self._ultimo_fetch = 0.0
        self._ultimo_fetch_fallo = False
        if jwks_estatico is not None:
            self._cargar_jwks(jwks_estatico)

    # -- TokenValidator -----------------------------------------------------

    async def validar(self, token: str) -> Usuario:
        try:
            cabecera = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise self._rechazar(f"cabecera ilegible: {exc}") from exc
        if cabecera.get("alg") != "RS256":
            raise self._rechazar(f"alg no permitido: {cabecera.get('alg')}")
        kid = cabecera.get("kid")
        if not kid:
            raise self._rechazar("token sin kid")
        clave = await self._clave(kid)
        try:
            claims = jwt.decode(
                token,
                key=clave,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
                # Tolerancia estándar a deriva de reloj entre Auth0 y este host
                # (iat/nbf/exp): sin esto, un contenedor con segundos de drift
                # rechaza tokens recién emitidos («not yet valid (iat)»).
                leeway=30,
            )
        except jwt.PyJWTError as exc:
            raise self._rechazar(f"claims/firma inválidos: {exc}") from exc
        permisos = claims.get("permissions")
        if permisos is None:
            permisos = claims.get("scope", "").split()
        return Usuario(
            sub=claims["sub"],
            permisos=frozenset(permisos),
            exp=datetime.fromtimestamp(claims["exp"], UTC),
        )

    def estado(self) -> str:
        return "degraded" if self._ultimo_fetch_fallo else "ok"

    # -- JWKS ---------------------------------------------------------------

    async def _clave(self, kid: str):
        if kid in self._claves:
            return self._claves[kid]
        if self._estatico:
            raise self._rechazar(f"kid desconocido: {kid}")
        ahora = time.monotonic()
        if ahora - self._ultimo_fetch >= _MIN_ENTRE_FETCHES_S:
            self._ultimo_fetch = ahora
            try:
                async with httpx.AsyncClient(timeout=5.0) as cliente:
                    respuesta = await cliente.get(self._jwks_uri)
                    respuesta.raise_for_status()
                    self._cargar_jwks(respuesta.json())
                self._ultimo_fetch_fallo = False
            except (httpx.HTTPError, ValueError) as exc:
                self._ultimo_fetch_fallo = True
                logger.warning("fetch de JWKS falló: %s", exc)
        if kid not in self._claves:
            raise self._rechazar(f"kid desconocido tras refrescar: {kid}")
        return self._claves[kid]

    def _cargar_jwks(self, jwks: dict) -> None:
        for entrada in jwks.get("keys", []):
            try:
                self._claves[entrada["kid"]] = jwt.PyJWK(entrada).key
            except (KeyError, jwt.PyJWKError) as exc:
                logger.warning("clave JWKS ignorada: %s", exc)

    @staticmethod
    def _rechazar(motivo_interno: str) -> ErrorAutenticacion:
        # El motivo se loguea; la respuesta al cliente es siempre genérica (T11).
        logger.info("token rechazado: %s", motivo_interno)
        return ErrorAutenticacion("Access token ausente o inválido.")
