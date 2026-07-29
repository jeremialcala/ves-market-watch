"""Configuración del servicio desde variables de entorno.

Los secretos (DATABASE_URL, AMQP_URL) llegan por entorno inyectado desde el
secret store del despliegue — nunca hardcodeados (A02). La config de Auth0 es
pública por diseño (ADR-0012): el gateway no tiene secretos de firma propios.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_RAIZ_REPO = Path(__file__).resolve().parents[4]

SCHEMAS_POR_DEFECTO = _RAIZ_REPO / "schemas"


@dataclass(frozen=True, slots=True)
class Settings:
    # Auth0 (Resource Server, ADR-0012). Valores públicos del tenant.
    auth0_issuer: str
    auth0_audience: str
    jwks_uri: str
    # Infraestructura.
    database_url: str
    amqp_url: str
    amqp_exchange: str
    schemas_dir: str
    # HTTP.
    http_host: str
    http_port: int
    # CORS: orígenes browser permitidos (allowlist — el SPA en dev y en nginx).
    allowed_origins: tuple[str, ...]
    # Rate limiting por token (ventana fija de 60 s).
    rate_limit_per_min: int
    # Frescura de la tasa oficial (ADR-0007: 6 h).
    stale_threshold_hours: int
    # Antigüedad máx. (min) de los indicadores P2P para servirse como vigentes.
    p2p_frescura_min: int
    # Límites WSS (PRD api-streaming / api-contracts).
    wss_max_conexiones: int
    wss_max_suscripciones: int
    wss_ping_segundos: int
    # Profundidad P2P: ancho de banda de precio (%) y niveles servidos.
    depth_band_pct: str
    depth_niveles: int

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        issuer = env.get("AUTH0_ISSUER", "https://dev-higerotech.us.auth0.com/")
        return cls(
            auth0_issuer=issuer,
            auth0_audience=env.get("AUTH0_AUDIENCE", "https://api.vesmarketwatch/"),
            jwks_uri=env.get("JWKS_URI", issuer.rstrip("/") + "/.well-known/jwks.json"),
            # Defaults alineados con el docker-compose.yml de la raíz (dev).
            database_url=env.get(
                "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
            ),
            amqp_url=env.get("AMQP_URL", "amqp://guest:guest@127.0.0.1/"),
            amqp_exchange=env.get("AMQP_EXCHANGE", "market.events"),
            schemas_dir=env.get("SCHEMAS_DIR", str(SCHEMAS_POR_DEFECTO)),
            http_host=env.get("HTTP_HOST", "127.0.0.1"),
            http_port=int(env.get("HTTP_PORT", "8000")),
            allowed_origins=tuple(
                origen.strip()
                for origen in env.get(
                    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8080"
                ).split(",")
                if origen.strip()
            ),
            rate_limit_per_min=int(env.get("RATE_LIMIT_PER_MIN", "120")),
            stale_threshold_hours=int(env.get("STALE_THRESHOLD_HOURS", "6")),
            p2p_frescura_min=int(env.get("P2P_FRESCURA_MIN", "20")),
            wss_max_conexiones=int(env.get("WSS_MAX_CONEXIONES", "5")),
            wss_max_suscripciones=int(env.get("WSS_MAX_SUSCRIPCIONES", "10")),
            wss_ping_segundos=int(env.get("WSS_PING_SEGUNDOS", "30")),
            depth_band_pct=env.get("DEPTH_BAND_PCT", "0.5"),
            depth_niveles=int(env.get("DEPTH_NIVELES", "10")),
        )
