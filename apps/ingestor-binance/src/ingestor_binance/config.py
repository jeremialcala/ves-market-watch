"""Configuración del servicio desde variables de entorno.

Los secretos (AMQP_URL, DATABASE_URL) llegan por entorno inyectado desde el
secret store del despliegue — nunca hardcodeados (A02).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_RAIZ_APP = Path(__file__).resolve().parents[2]

SCHEMA_FUENTE_POR_DEFECTO = _RAIZ_APP / "schemas" / "binance-adv-search.response.json"


@dataclass(frozen=True, slots=True)
class Settings:
    binance_p2p_url: str
    asset: str
    fiat: str
    fetch_interval_seconds: int
    top_k: int
    rows_per_page: int
    max_retries: int
    request_budget_per_min: int
    breaker_threshold: int
    breaker_cooldown_seconds: int
    max_response_bytes: int
    outlier_mad_k: float
    schema_fuente: str
    # Clave dedicada del pseudónimo merchant_ref (ADR-0011). Restringido, sin
    # rotación programada: rotarla rompe la correlación histórica a propósito.
    merchant_hmac_key: str
    amqp_url: str
    amqp_exchange: str
    database_url: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        merchant_hmac_key = env.get("MERCHANT_HMAC_KEY", "")
        if not merchant_hmac_key:
            # Fail fast (ADR-0011): sin la clave no hay merchant_ref, y un
            # arranque silencioso degradaría el contrato v1.1 sin aviso.
            raise ValueError(
                "MERCHANT_HMAC_KEY no configurada: aprovisionarla desde el secret "
                "store (ADR-0011). Para desarrollo: openssl rand -hex 32"
            )
        return cls(
            binance_p2p_url=env.get(
                "BINANCE_P2P_URL",
                "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
            ),
            asset=env.get("ASSET", "USDT"),
            fiat=env.get("FIAT", "VES"),
            fetch_interval_seconds=int(env.get("FETCH_INTERVAL_SECONDS", "60")),
            top_k=int(env.get("TOP_K", "100")),
            rows_per_page=int(env.get("ROWS_PER_PAGE", "20")),
            max_retries=int(env.get("MAX_RETRIES", "3")),
            request_budget_per_min=int(env.get("REQUEST_BUDGET_PER_MIN", "20")),
            breaker_threshold=int(env.get("BREAKER_THRESHOLD", "5")),
            breaker_cooldown_seconds=int(env.get("BREAKER_COOLDOWN_SECONDS", "300")),
            max_response_bytes=int(env.get("MAX_RESPONSE_BYTES", str(2 * 1024 * 1024))),
            outlier_mad_k=float(env.get("OUTLIER_MAD_K", "3.5")),
            schema_fuente=env.get("SCHEMA_FUENTE", str(SCHEMA_FUENTE_POR_DEFECTO)),
            merchant_hmac_key=merchant_hmac_key,
            amqp_url=env.get("AMQP_URL", "amqp://guest:guest@127.0.0.1/"),
            amqp_exchange=env.get("AMQP_EXCHANGE", "market.events"),
            # Defaults alineados con el docker-compose.yml de la raíz (dev).
            database_url=env.get(
                "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
            ),
        )
