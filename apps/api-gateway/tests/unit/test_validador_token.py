"""Validación de access tokens (T11): la misma ruta de código que producción
con un JWKS estático de test — sin red ni Auth0."""

from datetime import timedelta

import pytest

from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
from api_gateway.domain.errores import ErrorAutenticacion, PermisoInsuficiente
from tests.conftest import (
    AUDIENCE_TEST,
    ISSUER_TEST,
    firmar_token,
    jwks_de_test,
)


@pytest.fixture
def validador() -> ValidadorTokenAuth0:
    return ValidadorTokenAuth0(
        jwks_uri="https://vmw-test.local/jwks.json",
        issuer=ISSUER_TEST,
        audience=AUDIENCE_TEST,
        jwks_estatico=jwks_de_test(),
    )


async def test_token_valido_produce_usuario_con_permisos(validador):
    usuario = await validador.validar(firmar_token(permisos=["read:rates"]))
    assert usuario.sub == "auth0|tester"
    assert usuario.permisos == frozenset({"read:rates"})
    usuario.exigir("read:rates")
    with pytest.raises(PermisoInsuficiente):
        usuario.exigir("read:signals")


async def test_token_expirado_es_rechazado(validador):
    token = firmar_token(exp_en=timedelta(minutes=-1))
    with pytest.raises(ErrorAutenticacion):
        await validador.validar(token)


async def test_audiencia_de_otro_cliente_es_rechazada(validador):
    """Un ID token lleva aud = client_id, no la API: confused deputy (T11)."""
    token = firmar_token(audience="mi-client-id-spa")
    with pytest.raises(ErrorAutenticacion):
        await validador.validar(token)


async def test_emisor_de_otro_tenant_es_rechazado(validador):
    token = firmar_token(issuer="https://tenant-ajeno.example/")
    with pytest.raises(ErrorAutenticacion):
        await validador.validar(token)


async def test_algoritmo_distinto_de_rs256_es_rechazado(validador):
    token = firmar_token(alg="HS256")
    with pytest.raises(ErrorAutenticacion):
        await validador.validar(token)


async def test_kid_desconocido_es_rechazado(validador):
    token = firmar_token(kid="kid-inexistente")
    with pytest.raises(ErrorAutenticacion):
        await validador.validar(token)


async def test_token_ilegible_es_rechazado(validador):
    with pytest.raises(ErrorAutenticacion):
        await validador.validar("no.es.un.jwt")


async def test_fallback_al_claim_scope_sin_permissions(validador):
    token = firmar_token(sin_permissions=True, scope="read:rates read:depth")
    usuario = await validador.validar(token)
    assert usuario.permisos == frozenset({"read:rates", "read:depth"})


async def test_el_motivo_del_rechazo_no_se_expone(validador):
    """La respuesta es genérica: el porqué solo va al log (T11)."""
    for token in (
        firmar_token(exp_en=timedelta(minutes=-1)),
        firmar_token(audience="otro"),
        firmar_token(kid="nope"),
    ):
        with pytest.raises(ErrorAutenticacion) as exc:
            await validador.validar(token)
        assert str(exc.value) == "Access token ausente o inválido."
