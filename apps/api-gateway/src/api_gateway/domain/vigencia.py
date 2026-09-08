"""Vigencia de la tasa oficial: la manda la FECHA-VALOR, no la antigüedad.

Copia deliberada de `indicator_engine.domain.vigencia` (ADR-0022). Los servicios
no comparten código —cada uno se despliega solo— y la alternativa era que el
gateway dijera «vigente» de una tasa que el motor está marcando rancia en el
mismo instante. La regla es de una línea; la duplicación es de una línea.

El BCV publica por la tarde (~16:00–18:30 VET) la tasa del **siguiente día
hábil**, y salta feriados: el jueves 23/07/2026 publicó la del lunes 27. Medir
la vigencia como «captura de hace menos de N horas» da un falso positivo todos
los fines de semana sobre una tasa perfectamente vigente.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

# Venezuela no aplica horario de verano: desplazamiento fijo desde 2016.
VET = timezone(timedelta(hours=-4), name="VET")


def dia_operativo(ahora: datetime) -> date:
    """El día en Venezuela: la tasa rige jornadas bancarias venezolanas."""
    return ahora.astimezone(VET).date()


def oficial_rancia(fecha_valor: date | None, ahora: datetime) -> bool:
    """¿La tasa dejó de estar vigente? Sin fecha-valor, sí: nunca se asume."""
    if fecha_valor is None:
        return True
    return fecha_valor < dia_operativo(ahora)
