"""Configuración desde variables de entorno.

DATABASE_URL llega por entorno inyectado (secret store en despliegue, A02).
TZ_ORIGEN es la zona horaria que se asume para fechas naive del export
(el sistema origen exporta en hora de Venezuela, UTC−4).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import timedelta, timezone


def parse_tz(texto: str) -> timezone:
    """Offset tipo «-04:00» / «+05:30» → timezone."""
    m = re.fullmatch(r"([+-])(\d{2}):(\d{2})", texto.strip())
    if not m:
        raise ValueError(f"TZ_ORIGEN inválida: {texto!r} (formato ±HH:MM)")
    delta = timedelta(hours=int(m.group(2)), minutes=int(m.group(3)))
    return timezone(-delta if m.group(1) == "-" else delta)


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    tz_origen: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        return cls(
            # Default alineado con el docker-compose.yml de la raíz (dev).
            database_url=env.get(
                "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5433/ves_market"
            ),
            tz_origen=env.get("TZ_ORIGEN", "-04:00"),
        )
