"""Adaptador del puerto `AlertNotifier`: alerta por log en nivel CRITICAL.

El log es el canal disponible en compose/dev y es grep-able (`ALERTA:`);
sustituirlo por correo/webhook no toca la aplicación, solo el wiring de
`create_app`. Mismo criterio que el `LoggingAlertNotifier` del indicator-engine.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class LoggingAlertNotifier:
    async def alertar(self, mensaje: str) -> None:
        logger.critical("ALERTA: %s", mensaje)
