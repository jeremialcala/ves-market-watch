#!/usr/bin/env python3
"""DAST del api-gateway con OWASP ZAP, guiado por el contrato OpenAPI.

Cierra el hueco de Gate 3 (fase 04-testing): el pipeline tenía SAST (CodeQL),
SCA (`pip-audit`/`npm audit`) y secretos (`gitleaks`), que son controles de
Gate 2. No había **nada dinámico** — ningún escaneo contra una instancia
corriendo.

Dos pasadas, porque prueban cosas distintas
-------------------------------------------
- **`--sin-auth`** ejerce el **borde de autenticación**: con el contrato en la
  mano, ZAP pide los 8 endpoints y todos deben responder 401. Es T11 y T15
  medidos desde fuera, con nginx y el proxy por medio, no con el `TestClient`
  in-process. Un 200 aquí es un fallo de seguridad, no un hallazgo menor.
- **`--con-auth`** ejerce el **código de los handlers**: inyección por los
  parámetros de consulta, abuso de rango y paginación (el «fuzzing sistemático
  de paginación» que el plan de pruebas lleva pendiente), manejo de tipos.
  Sin token ZAP no pasa del 401 y no llega a mirar nada de esto.

Correr solo la primera daría una falsa sensación de cobertura: mucho verde
sobre una superficie que nunca se tocó.

El token
--------
Se obtiene **dentro de este script** a partir del `.env` y se pasa al contenedor
por el entorno del subproceso. No aparece en ninguna línea de órdenes, ni en el
historial del shell, ni en `docker inspect` del comando. Sigue siendo visible en
el entorno del contenedor mientras corre: es un access token de vida corta, no
la credencial M2M, y esa distinción es la que hace aceptable el riesgo.

Uso
---
    python scripts/dast.py --sin-auth
    python scripts/dast.py --con-auth
    python scripts/dast.py --ambas          # por defecto

El objetivo por defecto es `http://api-gateway:8000` **dentro de la red del
compose**: así se prueba el gateway como lo ve otro contenedor, sin depender de
que el puerto esté publicado en el host.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
IMAGEN = "ghcr.io/zaproxy/zaproxy:stable"
RED = os.environ.get("DAST_RED", "ves-market-watch_default")
OBJETIVO = os.environ.get("DAST_OBJETIVO", "http://api-gateway:8000")
DOMINIO = os.environ.get("AUTH0_DOMAIN", "auth.higerotech.com")
AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "https://api.vesmarketwatch/")


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
        sys.exit(
            "ERROR: faltan AUTH0_M2M_CLIENT_ID/SECRET (en el `.env` o el entorno).\n"
            "La pasada autenticada sin token mediría el 401, no los handlers."
        )
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
        # Sin cuerpo: el eco del error de Auth0 devuelve el client_secret.
        sys.exit(f"ERROR: el tenant rechazó las credenciales M2M (HTTP {exc.code})")


def escanear(modo: str, salida: Path) -> int:
    salida.mkdir(parents=True, exist_ok=True)
    # ZAP corre como uid 1000 dentro del contenedor y el directorio lo crea el
    # usuario del host —uid 1001 en el runner de Actions—, así que sin esto los
    # informes fallan con «Permission denied» y ZAP los da por escritos. En
    # Docker Desktop para Windows no pasa, por la traducción del sistema de
    # ficheros: el fallo solo aparece en Linux, o sea solo en CI.
    try:
        salida.chmod(0o777)
    except OSError:
        pass  # Windows no lo necesita y puede rechazarlo
    shutil.copy(RAIZ / "apps/api-gateway/docs/openapi.yaml", salida / "openapi.yaml")

    prefijo = "con-auth" if modo == "con-auth" else "sin-auth"
    zap = [
        "zap-api-scan.py",
        "-t", "/zap/wrk/openapi.yaml",
        "-f", "openapi",
        # El primer `servers:` del contrato es el placeholder de producción;
        # sin esto ZAP escanearía un host que no existe.
        "-O", OBJETIVO,
        "-r", f"{prefijo}.html",
        "-J", f"{prefijo}.json",
        "-w", f"{prefijo}.md",
        # `-I` para no romper por avisos: el veredicto lo da `triar_dast.py`
        # contra el umbral del proyecto, no el código de salida de ZAP.
        "-I",
    ]

    entorno = dict(os.environ)
    orden = [
        "docker", "run", "--rm",
        "--network", RED,
        "-v", f"{salida}:/zap/wrk/:rw",
    ]
    print(f"\n{'=' * 70}\nZAP · pasada {prefijo} · objetivo {OBJETIVO}\n{'=' * 70}", flush=True)

    if modo == "con-auth":
        shutil.copy(RAIZ / "scripts/dast_hook.py", salida / "dast_hook.py")
        zap += ["--hook", "/zap/wrk/dast_hook.py"]
        entorno["DAST_TOKEN"] = obtener_token()
        orden += ["-e", "DAST_TOKEN"]  # sin valor: lo toma del entorno del padre
    orden += [IMAGEN] + zap

    codigo = subprocess.run(orden, env=entorno, check=False).returncode

    # Un scan «autenticado» que en realidad recibió 401 sale en verde: ZAP no
    # tiene forma de saber que esperábamos entrar. Se comprueba aquí, contra el
    # propio informe, porque ya pasó una vez.
    if modo == "con-auth":
        _exigir_que_el_token_viajara(salida / f"{prefijo}.json")
    return codigo


def _exigir_que_el_token_viajara(informe: Path) -> None:
    """Aborta si la pasada «autenticada» se comió 401.

    Solo cuenta **401**, no cualquier 4xx: ZAP sondea rutas inexistentes y manda
    entradas malformadas a propósito, así que los 404 y los 400 son la respuesta
    correcta del gateway y contarlos daría un falso positivo. La primera versión
    de esta guarda los mezclaba.
    """
    if not informe.exists():
        sys.exit(f"ERROR: ZAP no dejó informe en {informe}")
    datos = json.loads(informe.read_text(encoding="utf-8", errors="replace"))
    no_autorizados = [
        i.get("uri", "")
        for s in datos.get("site", [])
        for a in s.get("alerts", [])
        if "Client Error" in a.get("name", "")
        for i in a.get("instances", [])
        if (i.get("evidence") or "").strip() in {"401", "403"}
    ]
    if no_autorizados:
        ejemplo = no_autorizados[0][:90]
        sys.exit(
            f"ERROR: {len(no_autorizados)} respuestas 401/403 en la pasada autenticada "
            f"(p. ej. {ejemplo}).\nEl token no llegó a los handlers y lo escaneado fue "
            "el rechazo. Un verde así no vale: revisa el hook antes de creerte el informe."
        )


def main() -> int:
    cargar_env()
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sin-auth", action="store_true", help="solo el borde de autenticación")
    p.add_argument("--con-auth", action="store_true", help="solo los handlers, con token M2M")
    p.add_argument("--salida", default=str(RAIZ / "informes-dast"))
    args = p.parse_args()

    modos = []
    if args.sin_auth:
        modos.append("sin-auth")
    if args.con_auth:
        modos.append("con-auth")
    if not modos:
        modos = ["sin-auth", "con-auth"]

    salida = Path(args.salida).resolve()
    for modo in modos:
        escanear(modo, salida)
    print(f"\ninformes en {salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
