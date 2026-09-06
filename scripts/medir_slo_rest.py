#!/usr/bin/env python3
"""Mide los SLO de latencia REST del api-gateway contra el gateway real.

SLOs declarados en `docs/01-requirements/api-streaming.md`:
    - consultas actuales  <= 300 ms (p95)
    - histórico           <= 2 s

Uso:
    AUTH0_M2M_CLIENT_ID=… AUTH0_M2M_CLIENT_SECRET=… python scripts/medir_slo_rest.py

Sin credenciales mide solo `/health`, que es público, y lo dice. No falla en
silencio: un resultado parcial se anuncia como parcial.

Qué mide y qué NO
-----------------
Mide el **gateway** en `localhost:8800`, con keep-alive, que es como lo consume
un cliente real. NO mide nginx ni el túnel de Cloudflare: el camino que recorre
el navegador es más largo y su latencia es mayor. Para el SLO de la plataforma
servida hay que repetir esto contra el hostname público.

La cuota es de 120 peticiones/min por token (`RATE_LIMIT_PER_MIN`), así que el
medidor va acompasado por debajo de ese techo. Un 429 durante la medición
invalida la muestra y se reporta como tal, no se promedia con lo demás.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from statistics import median


def _cargar_env() -> None:
    """Lee el `.env` de la raíz sin pisar lo que ya venga del entorno.

    Existe para que las credenciales M2M no tengan que viajar por la línea de
    órdenes ni por el historial del shell: se ponen una vez en el `.env`, que
    está gitignoreado y ya guarda los demás secretos del proyecto.
    """
    ruta = Path(__file__).resolve().parent.parent / ".env"
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        os.environ.setdefault(clave.strip(), valor.strip().strip("'\""))


_cargar_env()

BASE = os.environ.get("GATEWAY_BASE", "http://localhost:8800")
DOMINIO = os.environ.get("AUTH0_DOMAIN", "auth.higerotech.com")
AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "https://api.vesmarketwatch/")

# Los parámetros NO son opcionales: van por `$ref` a `components/parameters`,
# donde `Side`, `FromDate(Time)` y `ToDate(Time)` llevan `required: true`. Sin
# ellos el gateway responde 400 y lo que se mediría es el rechazo, no la
# consulta. Los valores van elegidos para que devuelvan datos de verdad —una
# respuesta vacía se sirve más rápido y falsearía el percentil hacia abajo.
_DESDE = "2026-08-07"
_HASTA = "2026-09-06"
_DESDE_T = f"{_DESDE}T00:00:00Z"
_HASTA_T = f"{_HASTA}T00:00:00Z"

ACTUALES = [
    "/api/v1/rates/official/current?currency=USD",
    "/api/v1/rates/p2p/current?side=buy",
    "/api/v1/indicators/current?currency=USD",
    "/api/v1/analysis/current?currency=VES",
    "/api/v1/market/depth?side=buy",
]
# Consultas por rango. `/signals` cae aquí por forma —exige `from`/`to` y
# pagina— aunque el PRD no lo clasifique: su SLO no está escrito en ninguna
# parte, y medirlo contra los 300 ms de una consulta puntual sería inventarlo.
HISTORICO = [
    f"/api/v1/rates/official/history?from={_DESDE}&to={_HASTA}&currency=USD",
    f"/api/v1/indicators/history?from={_DESDE_T}&to={_HASTA_T}&interval=1h&currency=VES",
    f"/api/v1/signals?from={_DESDE_T}&to={_HASTA_T}",
]
SLO_ACTUALES = 0.300
SLO_HISTORICO = 2.000

RONDAS_ACTUALES = int(os.environ.get("RONDAS_ACTUALES", "60"))
RONDAS_HISTORICO = int(os.environ.get("RONDAS_HISTORICO", "30"))
POR_MINUTO = 100  # por debajo del techo de 120 para no medir la propia cuota


def percentil(datos: list[float], p: float) -> float:
    if not datos:
        return float("nan")
    d = sorted(datos)
    k = (len(d) - 1) * p / 100
    lo = int(k)
    hi = min(lo + 1, len(d) - 1)
    return d[lo] + (d[hi] - d[lo]) * (k - lo)


def obtener_token() -> str | None:
    cid = os.environ.get("AUTH0_M2M_CLIENT_ID")
    sec = os.environ.get("AUTH0_M2M_CLIENT_SECRET")
    if not cid or not sec:
        return None
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
        with urllib.request.urlopen(peticion, timeout=20, context=ssl.create_default_context()) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as exc:
        # Sin cuerpo: el eco del error de Auth0 devuelve el client_secret.
        print(f"ERROR: el tenant rechazó las credenciales M2M (HTTP {exc.code})")
        sys.exit(2)


def medir(ruta: str, token: str | None) -> tuple[float, int]:
    cabeceras = {"accept": "application/json"}
    if token:
        cabeceras["authorization"] = f"Bearer {token}"
    peticion = urllib.request.Request(BASE + ruta, headers=cabeceras)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            r.read()
            codigo = r.status
    except urllib.error.HTTPError as exc:
        exc.read()
        codigo = exc.code
    except Exception:
        return (time.perf_counter() - t0, 0)
    return (time.perf_counter() - t0, codigo)


def informe(titulo: str, muestras: dict[str, list[float]], slo: float) -> bool:
    print(f"\n{titulo}  ·  SLO <= {slo * 1000:.0f} ms (p95)")
    print(f"  {'endpoint':<40}{'n':>5}{'p50':>9}{'p95':>9}{'p99':>9}{'max':>9}")
    todas: list[float] = []
    for ruta, datos in muestras.items():
        if not datos:
            continue
        todas += datos
        print(
            f"  {ruta:<40}{len(datos):>5}"
            f"{median(datos)*1000:>8.0f}m{percentil(datos,95)*1000:>8.0f}m"
            f"{percentil(datos,99)*1000:>8.0f}m{max(datos)*1000:>8.0f}m"
        )
    if not todas:
        return False
    p95 = percentil(todas, 95)
    cumple = p95 <= slo
    fuera = sum(1 for x in todas if x > slo)
    print(f"  {'-- agregado de la clase --':<40}{len(todas):>5}"
          f"{median(todas)*1000:>8.0f}m{p95*1000:>8.0f}m"
          f"{percentil(todas,99)*1000:>8.0f}m{max(todas)*1000:>8.0f}m")
    print(f"  veredicto: p95 = {p95*1000:.0f} ms  ->  {'CUMPLE' if cumple else 'INCUMPLE'}"
          f"   ({fuera}/{len(todas)} por encima del umbral)")
    return cumple


def main() -> int:
    token = obtener_token()
    if token is None:
        print("Sin AUTH0_M2M_CLIENT_ID/SECRET: solo puedo medir /health (público).")
        print("La medición será PARCIAL y no sirve para cerrar el gate.\n")

    intervalo = 60.0 / POR_MINUTO
    codigos: dict[int, int] = {}

    # Calentamiento: la primera petición paga conexión y caché de JWKS.
    for _ in range(5):
        medir("/api/v1/health", None)

    salud: list[float] = []
    for _ in range(30):
        d, c = medir("/api/v1/health", None)
        salud.append(d)
        codigos[c] = codigos.get(c, 0) + 1
    print(f"/api/v1/health (público, sin auth)   n={len(salud)}  "
          f"p50={median(salud)*1000:.0f} ms  p95={percentil(salud,95)*1000:.0f} ms")
    print("  ^ suelo del gateway: enrutado + comprobación de BD y broker, sin validar token")

    if token is None:
        return 1

    actuales = {r: [] for r in ACTUALES}
    historico = {r: [] for r in HISTORICO}
    total = RONDAS_ACTUALES * len(ACTUALES) + RONDAS_HISTORICO * len(HISTORICO)
    print(f"\nmidiendo {total} peticiones a ~{POR_MINUTO}/min "
          f"(~{total/POR_MINUTO:.1f} min, techo de cuota 120/min)...")

    hecho = 0
    for i in range(max(RONDAS_ACTUALES, RONDAS_HISTORICO)):
        for ruta in ACTUALES if i < RONDAS_ACTUALES else []:
            d, c = medir(ruta, token)
            codigos[c] = codigos.get(c, 0) + 1
            if c == 200:
                actuales[ruta].append(d)
            hecho += 1
            time.sleep(intervalo)
        for ruta in HISTORICO if i < RONDAS_HISTORICO else []:
            d, c = medir(ruta, token)
            codigos[c] = codigos.get(c, 0) + 1
            if c == 200:
                historico[ruta].append(d)
            hecho += 1
            time.sleep(intervalo)

    print(f"\ncódigos de respuesta: {dict(sorted(codigos.items()))}")
    if codigos.get(429):
        print("  AVISO: hubo 429. La muestra mide la cuota, no la latencia: bájala y repite.")

    ok1 = informe("CONSULTAS ACTUALES", actuales, SLO_ACTUALES)
    ok2 = informe("HISTÓRICO", historico, SLO_HISTORICO)
    return 0 if (ok1 and ok2) else 1


if __name__ == "__main__":
    sys.exit(main())
