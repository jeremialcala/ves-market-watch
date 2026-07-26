"""Errores del dominio del gateway. Los adaptadores HTTP los traducen a
problemas RFC 7807 sin filtrar detalles internos (A05)."""

from __future__ import annotations


class ErrorAutenticacion(Exception):
    """Token ausente, malformado, expirado o con firma/claims inválidos (401).

    El detalle interno (qué claim falló) se loguea, nunca se responde: un
    atacante no debe poder distinguir por qué su token fue rechazado (T11).
    """


class PermisoInsuficiente(Exception):
    """Token válido sin el permiso requerido (403)."""

    def __init__(self, permiso: str) -> None:
        super().__init__(permiso)
        self.permiso = permiso


class ParametroInvalido(ValueError):
    """Parámetro de consulta inválido (400)."""


class RangoInvalido(ValueError):
    """Rango de fechas invertido o mayor al máximo permitido (422)."""


class LimiteExcedido(Exception):
    """Cuota de rate limit superada (429)."""

    def __init__(self, limite: int, reset_epoch: int) -> None:
        super().__init__(limite)
        self.limite = limite
        self.reset_epoch = reset_epoch


class LimiteWss(Exception):
    """Límite de conexiones o suscripciones WSS superado (cierre 1008)."""
