"""Fábrica de la aplicación FastAPI: wiring de adaptadores y casos de uso.

Los parámetros `validador`/`repositorio`/`notificador`/`con_amqp` permiten
inyectar fakes en tests (unit/contract sin infra). La documentación del contrato
vive en `docs/openapi.yaml` — la autogenerada se deshabilita para no exponer
una segunda fuente de verdad (ni superficie extra).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api_gateway.adapters.alertas import LoggingAlertNotifier
from api_gateway.adapters.amqp.consumer import ConsumidorPushWss
from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
from api_gateway.adapters.http import rest, ws
from api_gateway.adapters.http.problem import registrar_manejadores
from api_gateway.adapters.timescale.repository import TimescaleLecturaRepository
from api_gateway.application.consultas import (
    ConsultarAnalisisVigente,
    ConsultarHistoricoIndicadores,
    ConsultarHistoricoTasaOficial,
    ConsultarIndicadoresVigentes,
    ConsultarProfundidad,
    ConsultarReferenciaP2P,
    ConsultarSenales,
    ConsultarTasaOficialVigente,
)
from api_gateway.application.ports import (
    AlertNotifier,
    LecturaRepository,
    TokenValidator,
)
from api_gateway.application.suscripciones import GestorSuscripciones
from api_gateway.config import Settings
from api_gateway.domain.rate_limit import LimitadorVentanaFija


def create_app(
    settings: Settings,
    *,
    validador: TokenValidator | None = None,
    repositorio: LecturaRepository | None = None,
    notificador: AlertNotifier | None = None,
    con_amqp: bool = True,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.validador = validador or ValidadorTokenAuth0(
            jwks_uri=settings.jwks_uri,
            issuer=settings.auth0_issuer,
            audience=settings.auth0_audience,
        )
        repo_propio = repositorio is None
        app.state.repositorio = repositorio or await TimescaleLecturaRepository.connect(
            settings.database_url
        )
        app.state.limitador = LimitadorVentanaFija(settings.rate_limit_per_min)
        app.state.gestor = GestorSuscripciones(
            max_conexiones=settings.wss_max_conexiones,
            max_suscripciones=settings.wss_max_suscripciones,
        )
        frescura_p2p = timedelta(minutes=settings.p2p_frescura_min)
        repo = app.state.repositorio
        app.state.consultas = SimpleNamespace(
            tasa_vigente=ConsultarTasaOficialVigente(repo),
            historial_tasa=ConsultarHistoricoTasaOficial(repo),
            referencia_p2p=ConsultarReferenciaP2P(repo, frescura_p2p),
            indicadores=ConsultarIndicadoresVigentes(
                repo, frescura_p2p
            ),
            historial_indicadores=ConsultarHistoricoIndicadores(repo),
            profundidad=ConsultarProfundidad(
                repo, Decimal(settings.depth_band_pct), settings.depth_niveles
            ),
            senales=ConsultarSenales(repo),
            analisis=ConsultarAnalisisVigente(repo, frescura_p2p),
        )
        app.state.consumidor = None
        if con_amqp:
            app.state.consumidor = ConsumidorPushWss(
                amqp_url=settings.amqp_url,
                exchange_name=settings.amqp_exchange,
                gestor=app.state.gestor,
                schemas_dir=settings.schemas_dir,
                notifier=notificador or LoggingAlertNotifier(),
            )
            # No lanza: si el bus falta, reintenta en segundo plano y alerta;
            # el REST sirve igual y /health reporta degraded mientras tanto.
            await app.state.consumidor.start()
        try:
            yield
        finally:
            if app.state.consumidor is not None:
                await app.state.consumidor.close()
            if repo_propio:
                await app.state.repositorio.close()

    app = FastAPI(
        title="Criterio API",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    # CORS por allowlist para el SPA (ADR-0017): API solo-GET con bearer, sin
    # cookies → sin credentials. Los X-RateLimit-* se exponen para que el front
    # pueda leerlos. El WSS no pasa por CORS (los navegadores no lo aplican).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET"],
        allow_headers=["Authorization"],
        expose_headers=[
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
        ],
        max_age=600,
    )
    registrar_manejadores(app)
    app.include_router(rest.router)
    app.include_router(ws.router)
    return app
