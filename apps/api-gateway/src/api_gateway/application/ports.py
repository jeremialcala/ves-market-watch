"""Puertos del gateway (Clean Architecture): la aplicación depende de estas
interfaces; los adaptadores (JWKS/Auth0, asyncpg, aio-pika, FastAPI) las
implementan desde el borde."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Protocol

from api_gateway.domain.modelos import Usuario


class TokenValidator(ABC):
    """Valida un access token de Auth0 (RS256 vía JWKS — ADR-0012, T11)."""

    @abstractmethod
    async def validar(self, token: str) -> Usuario:
        """Devuelve el Usuario del token o lanza ErrorAutenticacion."""

    @abstractmethod
    def estado(self) -> str:
        """'ok' | 'degraded' — salud del validador para /health (sin llamar a Auth0)."""

    async def precargar(self) -> None:
        """Prepara lo que necesite antes de la primera validación (best-effort).

        No es abstracto: un validador que no dependa de la red —los dobles de
        test— no tiene nada que precargar y no debería verse obligado a decirlo.
        """


class AlertNotifier(Protocol):
    """Canal de alertas de operación — mismo puerto que el indicator-engine.

    El gateway alerta las transiciones del bus: sin bus no hay push WSS y el
    síntoma para el cliente es «datos que no se mueven», silencioso salvo que
    alguien mire `/health` a mano.
    """

    async def alertar(self, mensaje: str) -> None: ...


class LecturaRepository(ABC):
    """Acceso de SOLO lectura a TimescaleDB (rol de mínimo privilegio, A01).

    Los valores numéricos se devuelven como string exacto (convención del
    contrato: decimales nunca float).
    """

    @abstractmethod
    async def tasa_oficial_vigente(self, currency: str) -> dict | None: ...

    @abstractmethod
    async def historial_tasa_oficial(
        self, currency: str, desde: date, hasta: date, offset: int, limite: int
    ) -> tuple[list[dict], int]:
        """(filas, total) — una fila por value_date (última captura valid)."""

    @abstractmethod
    async def indicadores_vigentes(
        self, nombres: list[str], currency: str
    ) -> dict[str, dict]:
        """Última fila por indicador: {nombre: {value, as_of, calc_version}}."""

    @abstractmethod
    async def historial_indicadores(
        self,
        desde: datetime,
        hasta: datetime,
        intervalo: str,
        indicador: str | None,
        moneda: str | None,
        offset: int,
        limite: int,
    ) -> tuple[list[dict], int]:
        """Serie agregada por time_bucket (último valor del bucket), formato
        largo; filtros opcionales por indicador canónico y moneda."""

    @abstractmethod
    async def snapshot_p2p_reciente(self, side: str) -> dict | None:
        """{captured_at, items} del último snapshot crudo del lado (BUY/SELL)."""

    @abstractmethod
    async def senales(
        self,
        desde: datetime,
        hasta: datetime,
        tipo: str | None,
        offset: int,
        limite: int,
    ) -> tuple[list[dict], int]: ...

    @abstractmethod
    async def analisis_vigente(self, currency: str) -> dict | None:
        """Última revisión de `indicator_analysis` por (currency, as_of DESC):
        {as_of, payload}. El payload es el documento publicado tal cual (RF-6)."""

    @abstractmethod
    async def ping(self) -> bool: ...
