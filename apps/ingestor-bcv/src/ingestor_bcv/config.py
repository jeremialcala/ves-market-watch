"""Configuración del servicio desde variables de entorno.

Los secretos (AMQP_URL, DATABASE_URL) llegan por entorno inyectado desde el
secret store del despliegue — nunca hardcodeados (PRD: ASVS V6/V14, A02).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

_RAIZ_APP = Path(__file__).resolve().parents[2]

BUNDLE_CA_POR_DEFECTO = _RAIZ_APP / "certs" / "bcv-ca-bundle.pem"


@dataclass(frozen=True, slots=True)
class Settings:
    bcv_url: str
    # Ruta al bundle de CA anclado (ADR-0006) o "system" para usar el
    # truststore del sistema. Nunca existe una opción para desactivar TLS.
    ca_bundle: str
    fetch_interval_seconds: int
    max_delta_pct: Decimal
    umbral_fallos: int
    # Antigüedad máxima de una sospecha sin revisión humana antes de expirar
    # a `rejected` por timeout (ADR-0007).
    suspect_ttl_horas: int
    amqp_url: str
    amqp_exchange: str
    database_url: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        return cls(
            bcv_url=env.get("BCV_URL", "https://www.bcv.org.ve/"),
            ca_bundle=env.get("BCV_CA_BUNDLE", str(BUNDLE_CA_POR_DEFECTO)),
            fetch_interval_seconds=int(env.get("FETCH_INTERVAL_SECONDS", "1800")),
            max_delta_pct=Decimal(env.get("MAX_DELTA_PCT", "20")),
            umbral_fallos=int(env.get("FAILURE_THRESHOLD", "3")),
            suspect_ttl_horas=int(env.get("SUSPECT_TTL_HOURS", "24")),
            amqp_url=env.get("AMQP_URL", "amqp://guest:guest@127.0.0.1/"),
            amqp_exchange=env.get("AMQP_EXCHANGE", "market.events"),
            # Defaults alineados con el docker-compose.yml de la raíz (dev).
            database_url=env.get(
                "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
            ),
        )
