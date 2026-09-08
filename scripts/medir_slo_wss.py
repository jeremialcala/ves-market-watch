#!/usr/bin/env python3
"""Mide el SLO de push del WSS: <= 1 s desde la publicación interna del indicador.

SLO declarado en `docs/01-requirements/api-streaming.md`.

Qué se mide, exactamente
------------------------
    latencia = t(el cliente recibe el frame) - occurred_at del sobre

`occurred_at` lo pone el productor al publicar (`indicator_engine/adapters/amqp/
publisher.py`: `datetime.now(UTC)` en el momento del `publish`), y el gateway lo
propaga tal cual al push del WSS. O sea que el intervalo cubre la cadena
completa —RabbitMQ, el consumidor del gateway, el fan-out a suscriptores y la
red— que es lo que el SLO quiere acotar.

**Los dos relojes son el mismo.** Productor y medidor corren sobre el kernel de
esta máquina, así que no hay deriva que corregir. Contra un despliegue con el
motor en otro host, esta medición dejaría de ser válida sin sincronizar relojes,
y conviene saberlo antes de reutilizarla.

Cadencia
--------
Los indicadores se recalculan cuando entra un snapshot P2P, o sea ~1/min. Para
juntar muestra hay que esperar: con `--minutos 20` salen unas 20 ventanas de
`indicators`, y cada una trae varios eventos. Un p95 con menos de 10 muestras no
dice gran cosa y el script lo advierte en vez de imprimirlo como si tal cosa.

Uso
---
    python scripts/medir_slo_wss.py --minutos 20
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from statistics import median

RAIZ = Path(__file__).resolve().parent.parent
BASE = os.environ.get("GATEWAY_BASE", "http://localhost:8800")
DOMINIO = os.environ.get("AUTH0_DOMAIN", "auth.higerotech.com")
AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "https://api.vesmarketwatch/")
SLO = 1.0
TOPICOS = ["indicators", "signals", "analysis", "rates.official", "p2p.snapshot"]


def cargar_env() -> None:
    ruta = RAIZ / ".env"
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, _, valor = linea.partition("=")
            os.environ.setdefault(clave.strip(), valor.strip().strip("'\""))


def obtener_token() -> str:
    cid = os.environ.get("AUTH0_M2M_CLIENT_ID")
    sec = os.environ.get("AUTH0_M2M_CLIENT_SECRET")
    if not cid or not sec:
        sys.exit("ERROR: faltan AUTH0_M2M_CLIENT_ID/SECRET en el `.env` o el entorno.")
    cuerpo = json.dumps(
        {
            "grant_type": "client_credentials",
            "client_id": cid,
            "client_secret": sec,
            "audience": AUDIENCE,
        }
    ).encode()
    peticion = urllib.request.Request(
        f"https://{DOMINIO}/oauth/token",
        data=cuerpo,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(
            peticion, timeout=20, context=ssl.create_default_context()
        ) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as exc:
        sys.exit(f"ERROR: el tenant rechazó las credenciales M2M (HTTP {exc.code})")


def percentil(datos: list[float], p: float) -> float:
    d = sorted(datos)
    k = (len(d) - 1) * p / 100
    lo = int(k)
    hi = min(lo + 1, len(d) - 1)
    return d[lo] + (d[hi] - d[lo]) * (k - lo)


async def escuchar(segundos: float) -> tuple[dict[str, list[float]], Counter]:
    """Escucha hasta agotar el tiempo, reconectando cuando caduca el token.

    **El token M2M vive 15 minutos** y el gateway cierra la conexión con
    `4401 token expirado` en cuanto vence — comprobado en vivo, y es el control
    de T11 haciendo su trabajo sobre una conexión ya establecida, no solo en el
    handshake. Una medición de más de un cuarto de hora tiene que renovar.

    La primera versión de este script no lo hacía: la excepción subía hasta
    `main` y **se perdían las muestras ya recogidas**. Medir 20 minutos para no
    poder decir nada es peor que medir 5 y decirlo.
    """
    import websockets

    latencias: dict[str, list[float]] = {}
    tipos: Counter = Counter()
    limite = time.monotonic() + segundos
    reconexiones = 0

    while time.monotonic() < limite:
        token = await asyncio.to_thread(obtener_token)
        url = f"{BASE.replace('http', 'ws', 1)}/ws/v1?token={token}"
        try:
            async with websockets.connect(
                url, ping_interval=20, max_size=8 * 1024 * 1024
            ) as ws:
                await ws.send(json.dumps({"action": "subscribe", "topics": TOPICOS}))
                if not reconexiones:
                    print(f"suscrito a {', '.join(TOPICOS)}; "
                          f"escuchando {segundos / 60:.0f} min...")
                while time.monotonic() < limite:
                    espera = limite - time.monotonic()
                    try:
                        crudo = await asyncio.wait_for(ws.recv(), timeout=espera)
                    except (asyncio.TimeoutError, TimeoutError):
                        return latencias, tipos
                    llegada = datetime.now(UTC)
                    try:
                        msg = json.loads(crudo)
                    except json.JSONDecodeError:
                        tipos["ilegible"] += 1
                        continue
                    # Confirmaciones, pings y errores no son push de datos.
                    if "occurred_at" not in msg or "topic" not in msg:
                        tipos[msg.get("type") or msg.get("action") or "control"] += 1
                        continue
                    try:
                        emitido = datetime.fromisoformat(msg["occurred_at"])
                    except ValueError:
                        tipos["occurred_at ilegible"] += 1
                        continue
                    if emitido.tzinfo is None:
                        emitido = emitido.replace(tzinfo=UTC)
                    latencias.setdefault(msg["topic"], []).append(
                        (llegada - emitido).total_seconds()
                    )
                    tipos[f"evento:{msg['topic']}"] += 1
        except websockets.exceptions.ConnectionClosed as exc:
            if time.monotonic() >= limite:
                break
            reconexiones += 1
            tipos[f"reconexion ({exc.rcvd.code if exc.rcvd else '?'})"] += 1
            print(f"  conexión cerrada ({exc.rcvd.reason if exc.rcvd else exc}); "
                  f"reconectando con token nuevo [{reconexiones}]")
    return latencias, tipos


def informar(latencias: dict[str, list[float]]) -> int:
    todas = [x for v in latencias.values() for x in v]
    if not todas:
        print("\nSIN MUESTRA: no llegó ni un evento. No se puede decir que cumple.")
        return 1

    print(f"\n{'tópico':<18}{'n':>5}{'p50':>10}{'p95':>10}{'max':>10}")
    for topico, datos in sorted(latencias.items(), key=lambda kv: -len(kv[1])):
        print(
            f"{topico:<18}{len(datos):>5}{median(datos) * 1000:>9.0f}m"
            f"{percentil(datos, 95) * 1000:>9.0f}m{max(datos) * 1000:>9.0f}m"
        )
    p95 = percentil(todas, 95)
    fuera = sum(1 for x in todas if x > SLO)
    print(
        f"{'-- agregado --':<18}{len(todas):>5}{median(todas) * 1000:>9.0f}m"
        f"{p95 * 1000:>9.0f}m{max(todas) * 1000:>9.0f}m"
    )
    print(
        f"\nSLO push WSS <= {SLO:.0f} s:  p95 = {p95 * 1000:.0f} ms  ->  "
        f"{'CUMPLE' if p95 <= SLO else 'INCUMPLE'}   ({fuera}/{len(todas)} por encima)"
    )
    if len(todas) < 10:
        print(
            f"AVISO: solo {len(todas)} muestras. Un p95 con esto es orientativo, "
            "no un veredicto: alarga `--minutos`."
        )
    return 0 if p95 <= SLO else 1


def main() -> int:
    cargar_env()
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--minutos", type=float, default=20.0)
    args = p.parse_args()

    # Pase lo que pase, se reporta lo medido. Perder 20 minutos de muestra por
    # una excepción al final es exactamente lo que hizo la primera versión.
    try:
        latencias, tipos = asyncio.run(obtener_token_y_escuchar(args.minutos))
    except KeyboardInterrupt:
        print("\ninterrumpido antes de reunir muestra.")
        return 1
    print(f"\nmensajes por tipo: {dict(tipos)}")
    return informar(latencias)


async def obtener_token_y_escuchar(minutos: float):
    return await escuchar(minutos * 60)


if __name__ == "__main__":
    sys.exit(main())
