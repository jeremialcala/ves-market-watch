"""Material de autenticación de tests: par RSA único + JWKS + firma de tokens.

Vive en su propio módulo (no en conftest.py) a propósito: pytest importa el
conftest dos veces (como plugin `conftest` y como `tests.conftest`), y un par
de claves generado a nivel de módulo existiría por duplicado — la app
validaría con una clave y los tests firmarían con la otra. `sys.modules`
garantiza una sola instancia de este módulo.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ISSUER_TEST = "https://vmw-test.local/"
AUDIENCE_TEST = "https://api.vesmarketwatch/"
KID_TEST = "vmw-test-key"

PERMISOS_TODOS = [
    "read:rates",
    "read:indicators",
    "read:signals",
    "read:depth",
    "stream:events",
]

_CLAVE_PRIVADA = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PEM_PRIVADO = _CLAVE_PRIVADA.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)


def jwks_de_test() -> dict:
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        _CLAVE_PRIVADA.public_key(), as_dict=True
    )
    return {"keys": [{**jwk, "kid": KID_TEST, "alg": "RS256", "use": "sig"}]}


def firmar_token(
    sub: str = "auth0|tester",
    permisos: list[str] | None = None,
    exp_en: timedelta = timedelta(minutes=10),
    issuer: str = ISSUER_TEST,
    audience: str = AUDIENCE_TEST,
    kid: str = KID_TEST,
    alg: str = "RS256",
    scope: str | None = None,
    sin_permissions: bool = False,
) -> str:
    ahora = datetime.now(UTC)
    claims: dict = {
        "iss": issuer,
        "aud": audience,
        "sub": sub,
        "iat": int(ahora.timestamp()),
        "exp": int((ahora + exp_en).timestamp()),
    }
    if not sin_permissions:
        claims["permissions"] = PERMISOS_TODOS if permisos is None else permisos
    if scope is not None:
        claims["scope"] = scope
    clave = _PEM_PRIVADO if alg == "RS256" else "secreto-hs256-de-prueba-suficiente"
    return jwt.encode(claims, clave, algorithm=alg, headers={"kid": kid})
