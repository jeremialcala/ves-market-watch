#!/usr/bin/env python3
"""Aplica el umbral del proyecto a los informes de ZAP y rompe el build.

ZAP con `-I` nunca falla por avisos, así que el veredicto lo da este script y no
su código de salida — el mismo reparto que ya usa el umbral de severidad sobre
el SARIF de CodeQL en `seguridad.yml`.

Regla: **Medio o Alto rompen el build.** Los Bajo e Informativo solo rompen si no
están declarados abajo, uno a uno y con motivo, como las excepciones de
`.gitleaks.toml`. Un `IGNORAR` sin razón escrita no es una excepción, es una
alfombra.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Hallazgos de riesgo Bajo aceptados a conciencia. La clave es el `pluginid` de
# ZAP; el valor, por qué se acepta y qué lo cerraría.
ACEPTADOS: dict[str, str] = {
    "10021": (
        "X-Content-Type-Options ausente en el gateway. Todas las respuestas son "
        "application/json y ningún navegador las interpreta como HTML por su "
        "cuenta; el SPA sí lo pone en nginx. Se acepta como deuda de "
        "endurecimiento, no como riesgo vivo. Lo cierra un middleware que añada "
        "`nosniff` en el gateway — pendiente de decisión."
    ),
    "90004": (
        "Cross-Origin-Resource-Policy ausente. Ponerla exige decidir el valor: "
        "el SPA vive en criterio-dev.higerotech.com y el API en otro hostname, "
        "así que un `same-origin` rompería el front. La decisión (`same-site` y "
        "verificar, o dejarla) es de producto y no se toma desde el triaje."
    ),
}

NIVEL = {"0": "Info", "1": "Bajo", "2": "Medio", "3": "Alto"}


def main() -> int:
    directorio = Path(sys.argv[1] if len(sys.argv) > 1 else "informes-dast")
    informes = sorted(directorio.glob("*.json"))
    if not informes:
        print(f"ERROR: no hay informes de ZAP en {directorio}/")
        return 1

    graves: list[str] = []
    sin_declarar: list[str] = []
    resumen: list[str] = []

    for informe in informes:
        datos = json.loads(informe.read_text(encoding="utf-8", errors="replace"))
        for sitio in datos.get("site", []):
            for alerta in sitio.get("alerts", []):
                riesgo = str(alerta.get("riskcode", "0"))
                pid = str(alerta.get("pluginid", ""))
                nombre = alerta.get("name", "?")
                n = len(alerta.get("instances", []))
                etiqueta = f"[{NIVEL.get(riesgo, '?')}] {nombre} (x{n}) — {informe.name}"
                if riesgo in ("2", "3"):
                    graves.append(etiqueta)
                elif riesgo == "1" and pid not in ACEPTADOS:
                    sin_declarar.append(f"{etiqueta}  pluginid={pid}")
                elif riesgo == "1":
                    resumen.append(f"  aceptado: {nombre} (x{n})")

    for linea in resumen:
        print(linea)
    for linea in graves:
        print(f"GRAVE  {linea}")
    for linea in sin_declarar:
        print(f"NUEVO  {linea}")

    if graves:
        print(f"\n{len(graves)} hallazgos de riesgo Medio o Alto: el build se rompe.")
        return 1
    if sin_declarar:
        print(
            f"\n{len(sin_declarar)} hallazgos Bajo SIN declarar. No se rompe por su "
            "severidad, sino porque nadie los ha mirado: acéptalos con su motivo en "
            "ACEPTADOS de este script, o arréglalos."
        )
        return 1

    print(f"\nDAST limpio: 0 Medio/Alto, {len(resumen)} Bajo aceptados con motivo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
