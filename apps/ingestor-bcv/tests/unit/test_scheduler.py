"""Tests del bucle de sincronización programada (RF-1).

El planificador parecía trivial —un `while True` con un `sleep`— y por eso estaba
sin cubrir. Tiene dos comportamientos que sí importan: que un fallo NO se cuente
como éxito, y que ninguna configuración pueda convertir el bucle en un martillo
contra el BCV.
"""

import asyncio
import logging
from dataclasses import dataclass

import pytest

from ingestor_bcv.scheduler import ejecutar_una_vez, run_forever


@dataclass
class ResumenFalso:
    """Misma forma que el resumen de `SincronizarTasasOficiales.ejecutar()`."""

    publicadas: list[str]
    heartbeats: list[str]
    sospechosas: list[str]
    error: str | None = None
    fallos_consecutivos: int = 0


class CasoDeUsoFalso:
    def __init__(self, *resumenes: ResumenFalso) -> None:
        self._resumenes = list(resumenes)
        self.ejecuciones = 0

    async def ejecutar(self) -> ResumenFalso:
        self.ejecuciones += 1
        # El último se repite: el bucle puede pedir más vueltas de las previstas.
        indice = min(self.ejecuciones - 1, len(self._resumenes) - 1)
        return self._resumenes[indice]


def _resumen_ok(**kwargs) -> ResumenFalso:
    base = {"publicadas": [], "heartbeats": [], "sospechosas": []}
    return ResumenFalso(**{**base, **kwargs})


async def test_un_fallo_no_se_cuenta_como_sincronizacion_correcta(caplog):
    """Con error se sale ANTES del log de éxito.

    Sin el `return`, una sincronización fallida dejaría en el log la línea
    «sincronización OK» con las tres listas vacías: indistinguible de una pasada
    correcta en la que el BCV no publicó nada.
    """
    caso = CasoDeUsoFalso(_resumen_ok(error="timeout del BCV", fallos_consecutivos=2))

    with caplog.at_level(logging.INFO, logger="ingestor_bcv"):
        await ejecutar_una_vez(caso)

    mensajes = [r.getMessage() for r in caplog.records]
    assert any("sincronización fallida (2 fallos consecutivos)" in m for m in mensajes)
    assert not any("sincronización OK" in m for m in mensajes)


async def test_el_resumen_correcto_nombra_las_tres_categorias(caplog):
    caso = CasoDeUsoFalso(
        _resumen_ok(publicadas=["USD", "EUR"], sospechosas=["TRY"]),
    )

    with caplog.at_level(logging.INFO, logger="ingestor_bcv"):
        await ejecutar_una_vez(caso)

    (mensaje,) = [r.getMessage() for r in caplog.records]
    assert "publicadas: USD,EUR" in mensaje
    assert "sospechosas: TRY" in mensaje
    # Una lista vacía se escribe «-», no en blanco: un hueco en el log se lee
    # como un campo que faltó, no como «ninguna».
    assert "sin cambio (heartbeat): -" in mensaje


async def test_ningun_intervalo_puede_convertir_el_bucle_en_un_martillo(monkeypatch):
    """`max(espera, 60)` es un suelo, no una defensa contra el jitter.

    Con `FETCH_INTERVAL_SECONDS=0` —o con cualquier intervalo por debajo del
    jitter de ±60 s— la espera calculada sale negativa. Sin el suelo, el bucle
    consultaría al BCV tan rápido como le respondiera: exactamente el patrón que
    ADR-0006 evita, y desde una IP que el BCV puede bloquear.
    """
    esperas: list[float] = []

    async def sleep_espia(segundos: float) -> None:
        esperas.append(segundos)
        raise asyncio.CancelledError  # corta el `while True`

    # El peor caso del jitter, no uno al azar: el test tiene que fallar siempre
    # que el suelo desaparezca, no una vez de cada tantas.
    monkeypatch.setattr("ingestor_bcv.scheduler.random.uniform", lambda a, b: a)
    monkeypatch.setattr("ingestor_bcv.scheduler.asyncio.sleep", sleep_espia)

    with pytest.raises(asyncio.CancelledError):
        await run_forever(CasoDeUsoFalso(_resumen_ok()), interval_seconds=0)

    assert esperas == [60]


async def test_el_jitter_reparte_alrededor_del_intervalo(monkeypatch):
    """Con un intervalo normal el suelo no interviene: manda el jitter."""
    esperas: list[float] = []

    async def sleep_espia(segundos: float) -> None:
        esperas.append(segundos)
        raise asyncio.CancelledError

    monkeypatch.setattr("ingestor_bcv.scheduler.random.uniform", lambda a, b: b)
    monkeypatch.setattr("ingestor_bcv.scheduler.asyncio.sleep", sleep_espia)

    caso = CasoDeUsoFalso(_resumen_ok())
    with pytest.raises(asyncio.CancelledError):
        await run_forever(caso, interval_seconds=1800)

    assert esperas == [1860]
    # Y sincroniza ANTES de dormir: si el orden se invirtiera, arrancar el
    # servicio costaría media hora de silencio.
    assert caso.ejecuciones == 1
