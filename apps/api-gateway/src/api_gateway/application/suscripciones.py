"""Gestión de suscripciones del canal WSS `/ws/v1`.

Política del contrato (api-contracts / PRD api-streaming): whitelist de
tópicos, ≤ N conexiones y ≤ M suscripciones por usuario (`sub`), push
best-effort — una conexión que falla al enviar se desconecta y no bloquea al
resto. El push retransmite el payload del evento del bus validado contra su
schema; el estado consultable vive en REST (ADR-0016).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from api_gateway.domain.errores import LimiteWss, ParametroInvalido
from api_gateway.domain.modelos import Usuario

logger = logging.getLogger(__name__)

TOPICOS_PERMITIDOS = frozenset(
    {"rates.official", "p2p.snapshot", "indicators", "signals"}
)

# routing key del bus → tópico WSS expuesto al cliente.
EVENTO_A_TOPICO = {
    "official.rate.updated": "rates.official",
    "p2p.snapshot": "p2p.snapshot",
    "indicators.updated": "indicators",
    "signals.emitted": "signals",
}


class CanalWss(Protocol):
    """Lo mínimo que la aplicación necesita de una conexión WebSocket."""

    async def enviar_json(self, mensaje: dict) -> None: ...

    async def cerrar(self, codigo: int, razon: str) -> None: ...


@dataclass
class _Conexion:
    usuario: Usuario
    topicos: set[str] = field(default_factory=set)


class GestorSuscripciones:
    def __init__(self, max_conexiones: int, max_suscripciones: int) -> None:
        self._max_conexiones = max_conexiones
        self._max_suscripciones = max_suscripciones
        self._conexiones: dict[CanalWss, _Conexion] = {}

    # -- ciclo de vida ------------------------------------------------------

    def conectar(self, usuario: Usuario, canal: CanalWss) -> None:
        if self._conexiones_de(usuario.sub) >= self._max_conexiones:
            raise LimiteWss(
                f"Máximo de {self._max_conexiones} conexiones simultáneas por usuario."
            )
        self._conexiones[canal] = _Conexion(usuario=usuario)

    def desconectar(self, canal: CanalWss) -> None:
        self._conexiones.pop(canal, None)

    # -- suscripciones ------------------------------------------------------

    def suscribir(self, canal: CanalWss, topicos: list[str]) -> set[str]:
        conexion = self._exigir_conexion(canal)
        pedidos = set(topicos)
        invalidos = pedidos - TOPICOS_PERMITIDOS
        if invalidos:
            raise ParametroInvalido(
                f"Tópicos no permitidos: {', '.join(sorted(invalidos))}."
            )
        nuevos = pedidos - conexion.topicos
        if self._suscripciones_de(conexion.usuario.sub) + len(nuevos) > (
            self._max_suscripciones
        ):
            raise LimiteWss(
                f"Máximo de {self._max_suscripciones} suscripciones por usuario."
            )
        conexion.topicos |= pedidos
        return set(conexion.topicos)

    def desuscribir(self, canal: CanalWss, topicos: list[str]) -> set[str]:
        conexion = self._exigir_conexion(canal)
        conexion.topicos -= set(topicos)
        return set(conexion.topicos)

    # -- push ---------------------------------------------------------------

    async def difundir(self, topico: str, mensaje: dict) -> int:
        """Envía a toda conexión suscrita; devuelve cuántas recibieron.

        Best-effort: un canal que falla se desconecta (el cliente rehace el
        handshake); nunca se bloquea el push del resto.
        """
        entregados = 0
        for canal, conexion in list(self._conexiones.items()):
            if topico not in conexion.topicos:
                continue
            try:
                await canal.enviar_json(mensaje)
                entregados += 1
            except Exception:  # noqa: BLE001 — el transporte decide el motivo
                logger.info("conexión WSS caída durante push; se descarta")
                self.desconectar(canal)
        return entregados

    # -- métricas / helpers -------------------------------------------------

    def _exigir_conexion(self, canal: CanalWss) -> _Conexion:
        conexion = self._conexiones.get(canal)
        if conexion is None:
            raise ParametroInvalido("Conexión no registrada.")
        return conexion

    def _conexiones_de(self, sub: str) -> int:
        return sum(1 for c in self._conexiones.values() if c.usuario.sub == sub)

    def _suscripciones_de(self, sub: str) -> int:
        return sum(
            len(c.topicos)
            for c in self._conexiones.values()
            if c.usuario.sub == sub
        )
