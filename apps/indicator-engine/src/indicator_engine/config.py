"""Configuración del servicio desde variables de entorno.

Los secretos (AMQP_URL, DATABASE_URL) llegan por entorno inyectado desde el
secret store del despliegue — nunca hardcodeados (A02).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_RAIZ_REPO = Path(__file__).resolve().parents[4]
_APP_DIR = Path(__file__).resolve().parents[2]

SCHEMAS_POR_DEFECTO = _RAIZ_REPO / "schemas"
RULESET_POR_DEFECTO = _APP_DIR / "config" / "senales.v1.yaml"
ANALISIS_POR_DEFECTO = _APP_DIR / "config" / "analisis.v1.yaml"
LECTURA_POR_DEFECTO = _APP_DIR / "config" / "lectura.v1.yaml"


@dataclass(frozen=True, slots=True)
class Settings:
    amqp_url: str
    amqp_exchange: str
    queue_name: str
    dlx_name: str
    dlq_name: str
    prefetch: int
    database_url: str
    calc_version: int
    # Antigüedad de la tasa oficial a partir de la cual la referencia se
    # considera stale (ADR-0007: 6 h).
    stale_threshold_hours: int
    schemas_dir: str
    # Ruleset de señales (RF-4); si el archivo no existe, el motor no emite señales.
    signals_ruleset_path: str
    # Antigüedad máxima (min) de un indicador para contar como vigente al evaluar reglas.
    signals_max_age_min: int
    # Config del análisis de la revisión (RF-6); sin archivo, análisis deshabilitado.
    # La ventana y el mínimo de muestras NO viven aquí: son parte de la definición
    # publicada (viajan en el payload) y por eso van en el YAML versionado. Aquí
    # solo lo operativo: cada cuánto se refresca la distribución y cuánto se espera.
    analysis_config_path: str
    analysis_cache_ttl_min: int
    analysis_query_timeout_s: float
    # Config de la lectura del mercado (RF-7); sin archivo, el analisis se
    # publica igual pero sin `reading`.
    reading_config_path: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        return cls(
            amqp_url=env.get("AMQP_URL", "amqp://guest:guest@127.0.0.1/"),
            amqp_exchange=env.get("AMQP_EXCHANGE", "market.events"),
            queue_name=env.get("QUEUE_NAME", "indicator-engine.market.events"),
            dlx_name=env.get("DLX_NAME", "market.events.dlx"),
            dlq_name=env.get("DLQ_NAME", "market.events.dlq"),
            prefetch=int(env.get("PREFETCH", "10")),
            # Defaults alineados con el docker-compose.yml de la raíz (dev).
            database_url=env.get(
                "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
            ),
            calc_version=int(env.get("CALC_VERSION", "1")),
            stale_threshold_hours=int(env.get("STALE_THRESHOLD_HOURS", "6")),
            schemas_dir=env.get("SCHEMAS_DIR", str(SCHEMAS_POR_DEFECTO)),
            signals_ruleset_path=env.get(
                "SIGNALS_RULESET_PATH", str(RULESET_POR_DEFECTO)
            ),
            signals_max_age_min=int(env.get("SIGNALS_MAX_AGE_MIN", "20")),
            analysis_config_path=env.get(
                "ANALYSIS_CONFIG_PATH", str(ANALISIS_POR_DEFECTO)
            ),
            analysis_cache_ttl_min=int(env.get("ANALYSIS_CACHE_TTL_MIN", "15")),
            analysis_query_timeout_s=float(env.get("ANALYSIS_QUERY_TIMEOUT_S", "5.0")),
            reading_config_path=env.get(
                "READING_CONFIG_PATH", str(LECTURA_POR_DEFECTO)
            ),
        )
