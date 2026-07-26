"""Entrypoint: `python -m api_gateway`.

Sirve REST (`/api/v1`) y WSS (`/ws/v1`) con uvicorn. El filtro de logging
redacta el token de la query del handshake WSS en los access logs
(api-contracts: «la URL con el token se redacta en logs»).
"""

from __future__ import annotations

import logging
import re

import uvicorn

from api_gateway.app import create_app
from api_gateway.config import Settings

_PATRON_TOKEN = re.compile(r"token=[^\s&\"']+")


class _RedactarToken(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _PATRON_TOKEN.sub("token=[REDACTADO]", record.msg)
        if record.args:
            record.args = tuple(
                _PATRON_TOKEN.sub("token=[REDACTADO]", arg)
                if isinstance(arg, str)
                else arg
                for arg in record.args
            )
        return True


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    filtro = _RedactarToken()
    for nombre in ("uvicorn.access", "uvicorn.error", "uvicorn"):
        logging.getLogger(nombre).addFilter(filtro)

    settings = Settings.from_env()
    uvicorn.run(
        create_app(settings),
        host=settings.http_host,
        port=settings.http_port,
        log_config=None,  # se hereda el logging configurado arriba (con filtro)
    )


if __name__ == "__main__":
    main()
