"""Hook de ZAP: inyecta el `Authorization` de la pasada autenticada.

Se carga con `zap-api-scan.py --hook`. Corre DENTRO del contenedor, ya con ZAP
arrancado y su API disponible, y da de alta la regla del Replacer por la API en
vez de por `-config`.

Por qué así y no con `-z "-config replacer.full_list(0)…"`
----------------------------------------------------------
Porque aquello **no funciona y no avisa**. Se intentó dos veces:

1. Sin el prefijo `-config` en cada propiedad — `-z` recibe opciones de línea de
   órdenes de ZAP, no pares sueltos.
2. Con el prefijo puesto, que tampoco aplicó la regla.

En ambos casos ZAP ignoró la configuración **en silencio** y devolvió el mismo
informe reluciente: 116 PASS, 0 FAIL. Lo único que delataba el fallo eran 24
respuestas 401 enterradas entre las alertas informativas. Por la API el alta
devuelve un resultado que se puede comprobar, y este hook aborta si no está.

El token llega por la variable `DAST_TOKEN` del entorno del contenedor, nunca
por la línea de órdenes.
"""

import os
import sys


def zap_started(zap, target):
    token = os.environ.get("DAST_TOKEN")
    if not token:
        print("HOOK ERROR: no hay DAST_TOKEN en el entorno del contenedor")
        sys.exit(1)

    zap.replacer.add_rule(
        description="auth",
        enabled=True,
        matchtype="REQ_HEADER",
        matchregex="false",
        matchstring="Authorization",
        replacement=f"Bearer {token}",
    )

    # Comprobar que quedó dada de alta: es justo lo que el camino de `-config`
    # no permitía y por lo que el fallo pasó desapercibido dos veces.
    reglas = zap.replacer.rules
    nombres = [r.get("description") for r in reglas] if reglas else []
    if "auth" not in nombres:
        print(f"HOOK ERROR: la regla no quedó registrada. Reglas: {nombres}")
        sys.exit(1)
    print(f"HOOK: regla de Authorization dada de alta ({len(token)} chars de token)")

    return zap, target
