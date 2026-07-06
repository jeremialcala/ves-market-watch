"""Motor reactivo de indicadores de VES Market Watch.

Fase 1: consume `official.rate.updated` (validado contra `schemas/official-rate.v1.json`),
calcula los indicadores derivados de la tasa oficial y publica `indicators.updated`.
Arquitectura hexagonal — ver `docs/design.md` y PRD `docs/01-requirements/motor-indicadores.md`.
"""

__version__ = "0.1.0"
