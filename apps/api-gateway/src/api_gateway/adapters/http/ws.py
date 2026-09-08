"""Canal WSS `/ws/v1?token=<access_token>` (PRD api-streaming, api-contracts).

El navegador no puede fijar `Authorization` en el handshake WebSocket: el
access token viaja en la query y se redacta en logs (filtro en __main__).
Cierres: 4401 sin token/expirado/inválido · 4403 sin permiso `stream:events` ·
1008 límite de conexiones. Mensajes del cliente:
`{"action": "subscribe"|"unsubscribe", "topics": [...]}`; el servidor emite
`subscribed`/`unsubscribed`, `error`, `ping` (cada N s) y los eventos
`{"topic", "event_id", "occurred_at", "data"}`.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api_gateway.domain.errores import (
    ErrorAutenticacion,
    LimiteWss,
    ParametroInvalido,
    PermisoInsuficiente,
)

logger = logging.getLogger(__name__)

router = APIRouter()

CIERRE_NO_AUTENTICADO = 4401
CIERRE_SIN_PERMISO = 4403
CIERRE_LIMITE = 1008  # policy violation (RFC 6455)


class _Canal:
    """Adapta el WebSocket de Starlette al protocolo CanalWss de la aplicación."""

    def __init__(self, websocket: WebSocket) -> None:
        self._ws = websocket

    async def enviar_json(self, mensaje: dict) -> None:
        await self._ws.send_json(mensaje)

    async def cerrar(self, codigo: int, razon: str) -> None:
        await self._ws.close(code=codigo, reason=razon)


@router.websocket("/ws/v1")
async def canal_streaming(websocket: WebSocket) -> None:
    estado = websocket.app.state

    # El handshake se ACEPTA antes de validar, y no es un descuido.
    #
    # Cerrar un WebSocket de Starlette sin haberlo aceptado no envía un frame de
    # cierre: aborta el handshake con un HTTP 403, y el código se pierde por el
    # camino. En el navegador eso llega como `onclose` con 1006 —cierre anormal,
    # sin motivo—, así que el 4401 y el 4403 de este contrato eran inalcanzables
    # para el único cliente que existe. El SPA tiene una política por código
    # (`ws/politicas.ts`): con 4401 refresca el token y reconecta, con 4403 se
    # detiene porque reintentar no lo va a arreglar. Con 1006 caía en el `default`
    # y reintentaba con el MISMO token caducado hasta que algo ajeno lo refrescara.
    #
    # Aceptar primero no relaja nada: el token se valida antes de registrar la
    # conexión en el gestor y antes de enviar un solo byte de dato. Lo único que
    # cambia es que el cierre puede llevar su motivo.
    await websocket.accept()

    token = websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=CIERRE_NO_AUTENTICADO, reason="token requerido")
        return
    try:
        usuario = await estado.validador.validar(token)
    except ErrorAutenticacion:
        await websocket.close(code=CIERRE_NO_AUTENTICADO, reason="token inválido")
        return
    try:
        usuario.exigir("stream:events")
    except PermisoInsuficiente:
        await websocket.close(
            code=CIERRE_SIN_PERMISO, reason="permiso stream:events requerido"
        )
        return

    canal = _Canal(websocket)
    try:
        estado.gestor.conectar(usuario, canal)
    except LimiteWss as exc:
        await websocket.close(code=CIERRE_LIMITE, reason=str(exc))
        return

    async def _cerrar_al_expirar() -> None:
        # api-contracts: cierre 4401 cuando expira el access token.
        await asyncio.sleep(max(0.0, usuario.segundos_hasta_expirar()))
        await canal.cerrar(CIERRE_NO_AUTENTICADO, "token expirado")

    async def _ping_periodico() -> None:
        intervalo = estado.settings.wss_ping_segundos
        while True:
            await asyncio.sleep(intervalo)
            await canal.enviar_json({"type": "ping"})

    tareas = [
        asyncio.create_task(_cerrar_al_expirar()),
        asyncio.create_task(_ping_periodico()),
    ]
    try:
        while True:
            crudo = await websocket.receive_text()
            await _manejar_mensaje(estado.gestor, canal, crudo)
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # receive tras el cierre (p. ej. expiración del token): fin normal.
        pass
    finally:
        for tarea in tareas:
            tarea.cancel()
        estado.gestor.desconectar(canal)


async def _manejar_mensaje(gestor, canal: _Canal, crudo: str) -> None:
    try:
        mensaje = json.loads(crudo)
        if not isinstance(mensaje, dict):
            raise ValueError
    except ValueError:
        await canal.enviar_json(
            {"type": "error", "detail": "Mensaje ilegible; se espera JSON."}
        )
        return
    accion = mensaje.get("action")
    topicos = mensaje.get("topics", [])
    if not isinstance(topicos, list) or not all(
        isinstance(t, str) for t in topicos
    ):
        await canal.enviar_json(
            {"type": "error", "detail": "'topics' debe ser una lista de strings."}
        )
        return
    try:
        if accion == "subscribe":
            activos = gestor.suscribir(canal, topicos)
            await canal.enviar_json(
                {"type": "subscribed", "topics": sorted(activos)}
            )
        elif accion == "unsubscribe":
            activos = gestor.desuscribir(canal, topicos)
            await canal.enviar_json(
                {"type": "unsubscribed", "topics": sorted(activos)}
            )
        else:
            await canal.enviar_json(
                {
                    "type": "error",
                    "detail": "Acción no soportada; use subscribe/unsubscribe.",
                }
            )
    except (ParametroInvalido, LimiteWss) as exc:
        await canal.enviar_json({"type": "error", "detail": str(exc)})
