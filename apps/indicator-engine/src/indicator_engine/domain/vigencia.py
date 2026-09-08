"""Vigencia de la tasa oficial: la manda la FECHA-VALOR, no la antigüedad.

El BCV publica por la tarde (~16:00–18:30 VET) una tasa cuya `value_date` es la
del **siguiente día hábil**. Medir la vigencia por lo vieja que sea la captura
da un falso positivo todos los fines de semana: el viernes a las 16:36 se
publica la tasa del lunes, y desde ese momento hasta el lunes por la tarde no
hay ninguna publicación nueva — pero la tasa está perfectamente vigente, porque
es la tasa oficial de ese lunes.

Observado en la serie real (USD/VES, julio 2026):

    publicada jue 30/07 17:37  ->  fecha-valor vie 31/07
    publicada vie 31/07 16:36  ->  fecha-valor lun 03/08   (salta el fin de semana)
    publicada jue 23/07 18:11  ->  fecha-valor lun 27/07   (el viernes 24 fue feriado)

Ese feriado es la razón de que la regla NO pueda ser «siguiente día hábil»
calculado con un calendario: los feriados venezolanos no son derivables. La
fecha-valor que publica el emisor es el único dato fiable, y por eso es la que
manda.

De aquí sale que **la tasa es vigente mientras su fecha-valor no haya pasado**.
Se vuelve rancia solo cuando el día operativo avanza más allá de ella, que es
exactamente el caso que interesa señalar: el BCV no publicó la tasa de hoy.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

# Venezuela no aplica horario de verano: el desplazamiento es fijo desde 2016.
VET = timezone(timedelta(hours=-4), name="VET")


def dia_operativo(ahora: datetime) -> date:
    """El día en Venezuela, que es el que compara contra la fecha-valor.

    La tasa oficial rige jornadas bancarias venezolanas, así que el corte es el
    de Caracas y no el de UTC: entre las 20:00 y las 24:00 VET los dos difieren
    y usar UTC adelantaría el vencimiento medio día.
    """
    return ahora.astimezone(VET).date()


def oficial_rancia(fecha_valor: date | None, ahora: datetime) -> bool:
    """¿La tasa dejó de estar vigente?

    Sin fecha-valor no hay tasa que usar: rancia, igual que si no hubiera
    ninguna. Nunca se asume vigencia por defecto.
    """
    if fecha_valor is None:
        return True
    return fecha_valor < dia_operativo(ahora)
