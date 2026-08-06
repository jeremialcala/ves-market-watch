"""Validación de access tokens de Auth0: RS256 vía JWKS (ADR-0012).

Reglas T11 (confused deputy): solo se acepta RS256, la audiencia debe ser
exactamente la API (`aud`) y el emisor el tenant (`iss`) — un ID token (aud =
client_id) o un token de otro tenant/API falla la validación. El motivo
concreto del rechazo se loguea pero nunca se responde al cliente.

El JWKS se cachea por `kid`; ante un `kid` desconocido se refresca con un
mínimo entre fetches (evita que tokens basura provoquen hammering a Auth0). Ese
mínimo cuenta solo para descargas CORRECTAS: un fallo se reintenta con espera
creciente desde 1 s, porque cobrarle el minuto entero a una descarga que no
llegó convierte un parpadeo de red en un minuto sin autenticación. `precargar()`
trae las claves al arrancar para que la primera petición no pague el arranque en
frío. `jwks_estatico` permite inyectar claves en tests sin red.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

import httpx
import jwt

from api_gateway.application.ports import TokenValidator
from api_gateway.domain.errores import ErrorAutenticacion
from api_gateway.domain.modelos import Usuario

logger = logging.getLogger(__name__)

# Mínimo entre descargas CORRECTAS: evita que una lluvia de tokens con `kid`
# basura se convierta en una lluvia de peticiones a Auth0.
_MIN_ENTRE_FETCHES_S = 60
# Espera tras una descarga FALLIDA, duplicándose hasta el mínimo de arriba. Es
# aparte a propósito: ver `_refrescar`.
_ESPERA_INICIAL_TRAS_FALLO_S = 1.0


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
        self._proximo_fetch = 0.0
        self._espera_tras_fallo = _ESPERA_INICIAL_TRAS_FALLO_S
        self._ultimo_fetch_fallo = False
        self._cargado_alguna_vez = jwks_estatico is not None
        # Una ráfaga con un `kid` nuevo no debe disparar N descargas: la primera
        # entra, las demás esperan y reaprovechan el resultado.
        self._candado = asyncio.Lock()
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
        # Sin NINGUNA clave no se puede autenticar a nadie, aunque todavía no
        # haya fallado ningún fetch: eso no es «ok», es el gateway a ciegas.
        if not self._cargado_alguna_vez:
            return "degraded"
        return "degraded" if self._ultimo_fetch_fallo else "ok"

    async def precargar(self) -> None:
        """Trae el JWKS al arrancar. Best-effort: no impide levantar el servicio.

        Sin esto, la primera petición tras un arranque en frío es la que paga la
        resolución DNS y el TLS contra Auth0 — y si falla, se lleva por delante a
        todas las que lleguen mientras dure la espera.
        """
        if self._estatico:
            return
        async with self._candado:
            await self._refrescar()

    # -- JWKS ---------------------------------------------------------------

    async def _clave(self, kid: str):
        clave = self._claves.get(kid)
        if clave is not None:
            return clave
        if self._estatico:
            raise self._rechazar(f"kid desconocido: {kid}")

        async with self._candado:
            # Otra petición pudo refrescar mientras se esperaba el candado.
            clave = self._claves.get(kid)
            if clave is not None:
                return clave
            pausa = self._proximo_fetch - time.monotonic()
            if pausa > 0:
                # El motivo dice que NO se refrescó. Decir «tras refrescar» aquí
                # manda a quien depura a buscar una rotación de claves que no
                # existe: pasó el 2026-08-06 y costó una hora.
                raise self._rechazar(
                    f"kid desconocido y refresco en pausa {pausa:.0f} s: {kid}"
                )
            refrescado = await self._refrescar()

        clave = self._claves.get(kid)
        if clave is not None:
            return clave
        if refrescado:
            raise self._rechazar(f"kid desconocido tras refrescar el JWKS: {kid}")
        raise self._rechazar(f"kid desconocido y el refresco del JWKS falló: {kid}")

    async def _refrescar(self) -> bool:
        """Descarga el JWKS. Devuelve si la descarga fue correcta.

        Llamar con el candado tomado.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as cliente:
                respuesta = await cliente.get(self._jwks_uri)
                respuesta.raise_for_status()
                self._cargar_jwks(respuesta.json())
        except (httpx.HTTPError, ValueError) as exc:
            self._ultimo_fetch_fallo = True
            self._proximo_fetch = time.monotonic() + self._espera_tras_fallo
            # Una descarga FALLIDA no consume el minuto de gracia. Ese mínimo
            # existe para no martillear a Auth0 con `kid` basura, y una descarga
            # que no llegó no ha protegido a nadie de nada. Cobrándole el minuto
            # entero, una caída de DNS de un segundo tumbaba la autenticación 60 s
            # con tokens perfectamente válidos: 2 224 respuestas 401 el
            # 2026-08-06, en un arranque en frío.
            logger.warning(
                # `str(exc)`, no `exc`: una excepción siempre es truthy, así que
                # `exc or "…"` nunca caería al respaldo. Y el caso que hace falta
                # cubrir es justo el de mensaje vacío — `ConnectError("")`, que es
                # lo que dejó el log del 2026-08-06 sin un solo síntoma.
                "fetch de JWKS falló (%s: %s); siguiente intento en %.0f s",
                type(exc).__name__,
                str(exc) or "sin detalle",
                self._espera_tras_fallo,
            )
            self._espera_tras_fallo = min(
                self._espera_tras_fallo * 2, _MIN_ENTRE_FETCHES_S
            )
            return False
        self._ultimo_fetch_fallo = False
        self._cargado_alguna_vez = True
        self._espera_tras_fallo = _ESPERA_INICIAL_TRAS_FALLO_S
        self._proximo_fetch = time.monotonic() + _MIN_ENTRE_FETCHES_S
        return True

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
