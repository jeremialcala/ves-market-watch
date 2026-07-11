"""Lectura de exports CSV (UTF-8, con o sin BOM)."""

from __future__ import annotations

import csv
from pathlib import Path


def leer_csv(ruta: str | Path) -> tuple[list[str], list[dict[str, str]]]:
    """Devuelve (cabeceras, filas). Filas completamente vacías se omiten."""
    with open(ruta, encoding="utf-8-sig", newline="") as archivo:
        lector = csv.DictReader(archivo)
        cabeceras = list(lector.fieldnames or [])
        filas = [
            {k: (v or "") for k, v in fila.items() if k is not None}
            for fila in lector
            if any((v or "").strip() for v in fila.values() if isinstance(v, str))
        ]
    return cabeceras, filas
