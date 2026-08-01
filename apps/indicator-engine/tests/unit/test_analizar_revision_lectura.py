"""Medición de las variaciones que alimentan la lectura (RF-7, ADR-0021).

El dominio ya está probado con las variaciones ya calculadas
(`test_lectura.py`); lo que se fija aquí es el tramo de aplicación que las
obtiene del histórico, donde viven las dos decisiones que no se ven en el
dominio: la **guarda de hueco de captura** —una variación contra un punto de
otra época no es comparable, así que se omite en vez de estirarse— y el
**reparto de unidades**, brecha en puntos porcentuales y piernas en VES
absolutos, que es la única forma de que `Δbrecha = Δparalelo − Δoficial` sea
exacta.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
import yaml

from indicator_engine.application.analizar_revision import (
    INDICADOR_PARALELO,
    AnalizarRevision,
)
from indicator_engine.domain.analisis import cargar_config_analisis
from indicator_engine.domain.lectura import (
    INDICADOR_BRECHA_BUY,
    cargar_config_lectura,
)
from indicator_engine.domain.models import (
    MONEDA_OFICIAL_REFERENCIA,
    OFFICIAL_RATE,
    Indicador,
)
from indicator_engine.domain.reglas import cargar_ruleset

CONFIG_DIR = Path(__file__).parents[2] / "config"
AS_OF = datetime(2026, 7, 31, 20, 54, tzinfo=UTC)
MONEDA = "VES"


def _yaml(nombre: str):
    return yaml.safe_load((CONFIG_DIR / nombre).read_text(encoding="utf-8"))


class RepoFalso:
    """Histórico en memoria: `{(nombre, moneda): [(as_of, valor), …]}`.

    Solo implementa los dos métodos que la medición usa. El resto del puerto no
    se toca en este camino, y fingirlo escondería si algún día lo hiciera.
    """

    def __init__(self, series: dict[tuple[str, str], list[tuple[datetime, str]]]):
        self._series = {
            clave: sorted(
                (momento, Decimal(valor)) for momento, valor in puntos
            )
            for clave, puntos in series.items()
        }

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        puntos = self._series.get((nombre, moneda))
        return self._indicador(nombre, moneda, puntos[-1]) if puntos else None

    async def indicador_asof(
        self, nombre: str, moneda: str, momento: datetime
    ) -> Indicador | None:
        anteriores = [p for p in self._series.get((nombre, moneda), []) if p[0] <= momento]
        return self._indicador(nombre, moneda, anteriores[-1]) if anteriores else None

    @staticmethod
    def _indicador(nombre, moneda, punto) -> Indicador:
        return Indicador(
            nombre=nombre,
            moneda=moneda,
            valor=punto[1],
            as_of=punto[0],
            calc_version=1,
        )


def caso(series) -> AnalizarRevision:
    return AnalizarRevision(
        config=cargar_config_analisis(_yaml("analisis.v1.yaml")),
        ruleset=cargar_ruleset(_yaml("senales.v1.yaml")),
        distribuciones=None,  # no se toca en la medición
        repository=RepoFalso(series),
        publisher=None,  # ídem
        config_lectura=cargar_config_lectura(_yaml("lectura.v1.yaml")),
    )


def hace(horas: float) -> datetime:
    return AS_OF - timedelta(hours=horas)


# La ventana de config es 6 h con 1 h de holgura: un punto a 6 h es comparable,
# uno a 8 h ya no.
SERIE_COMPLETA = {
    (INDICADOR_BRECHA_BUY, MONEDA): [(hace(6), "14.25"), (hace(0), "13.22")],
    (INDICADOR_PARALELO, MONEDA): [(hace(6), "858.40"), (hace(0), "850.00")],
    (OFFICIAL_RATE, MONEDA_OFICIAL_REFERENCIA): [(hace(72), "417.03")],
}


async def _medir(analizador, vista=None):
    return await analizador._medir_variaciones(
        vista if vista is not None else {INDICADOR_BRECHA_BUY: Decimal("13.22")},
        AS_OF,
        MONEDA,
    )


async def test_mide_la_brecha_en_puntos_y_las_piernas_en_ves():
    variaciones = await _medir(caso(SERIE_COMPLETA))

    assert variaciones.brecha_pp == Decimal("-1.03")  # 13,22 − 14,25 pp
    assert variaciones.paralelo == Decimal("-8.40")  # 850,00 − 858,40 VES
    # El BCV no publicó dentro de la ventana: el extremo antiguo y el actual son
    # la MISMA fila, así que la resta es exactamente 0. Eso es evidencia
    # positiva de que el movimiento fue del paralelo, no un dato que falta.
    assert variaciones.oficial == Decimal("0")


async def test_un_punto_fuera_de_la_ventana_mas_la_holgura_no_es_comparable():
    """8 h atrás con ventana 6 h + holgura 1 h: hubo hueco de captura. Restar
    contra él daría un Δ de 8 h etiquetado como de 6 h."""
    variaciones = await _medir(
        caso(
            {
                **SERIE_COMPLETA,
                (INDICADOR_BRECHA_BUY, MONEDA): [(hace(8), "14.25"), (hace(0), "13.22")],
            }
        )
    )
    assert variaciones.brecha_pp is None
    assert variaciones.paralelo == Decimal("-8.40")  # esta pierna sí resolvió


async def test_dentro_de_la_holgura_si_se_mide():
    """A 6,5 h el punto sigue siendo el de la ventana con retraso de captura
    tolerado: se mide, no se descarta."""
    variaciones = await _medir(
        caso(
            {
                **SERIE_COMPLETA,
                (INDICADOR_BRECHA_BUY, MONEDA): [
                    (hace(6.5), "14.25"),
                    (hace(0), "13.22"),
                ],
            }
        )
    )
    assert variaciones.brecha_pp == Decimal("-1.03")


async def test_sin_histórico_la_variacion_no_existe():
    variaciones = await _medir(caso({}), vista={})
    assert (variaciones.brecha_pp, variaciones.paralelo, variaciones.oficial) == (
        None,
        None,
        None,
    )


async def test_sin_el_indicador_en_la_vista_no_se_inventa_el_actual():
    """La vista es lo vigente en ESTA revisión: si la brecha no está, no se va a
    buscar el último conocido al histórico."""
    variaciones = await _medir(caso(SERIE_COMPLETA), vista={})
    assert variaciones.brecha_pp is None
    # Las piernas sí salen del histórico, y eso es correcto: son niveles, no la
    # magnitud calculada de esta revisión.
    assert variaciones.paralelo == Decimal("-8.40")


async def test_la_guarda_de_hueco_NO_se_aplica_a_la_oficial():
    """Asimetría deliberada, y el corazón de la feature.

    Las series `p2p_*` se persisten en cada revisión: una fila vieja es un hueco
    de captura. `official_rate` se persiste **solo cuando la tasa cambia**, así
    que una fila de hace tres días no es un hueco, es una meseta — y `Δ = 0` es
    justo la evidencia de que el movimiento vino del paralelo. Si se le aplicara
    la guarda, la atribución no se dispararía casi nunca. Lo que sí invalida esa
    serie lo cubre `official_stale`.
    """
    variaciones = await _medir(caso(SERIE_COMPLETA))
    assert variaciones.oficial == Decimal("0")  # la fila es de hace 72 h


async def test_sin_ninguna_fila_de_oficial_no_se_finge_un_cero():
    """Un cero sin histórico diría «el BCV no movió la tasa» cuando lo cierto es
    que no se sabe nada de ella."""
    series = {k: v for k, v in SERIE_COMPLETA.items() if k[0] != OFFICIAL_RATE}
    assert (await _medir(caso(series))).oficial is None


async def test_cuando_el_bcv_publica_dentro_de_la_ventana_la_pierna_se_mueve():
    variaciones = await _medir(
        caso(
            {
                **SERIE_COMPLETA,
                (OFFICIAL_RATE, MONEDA_OFICIAL_REFERENCIA): [
                    (hace(6), "408.03"),
                    (hace(2), "417.03"),
                ],
            }
        )
    )
    assert variaciones.oficial == Decimal("9.00")


async def test_la_oficial_se_mide_en_su_moneda_de_referencia_no_en_la_del_analisis():
    """`official_rate` se persiste bajo USD; buscarlo bajo VES devolvería None y
    la atribución se apagaría en silencio."""
    variaciones = await _medir(
        caso(
            {
                **SERIE_COMPLETA,
                (OFFICIAL_RATE, MONEDA): [(hace(6), "1"), (hace(0), "2")],
            }
        )
    )
    assert variaciones.oficial == Decimal("0")  # la de USD, no la impostora


async def test_sin_config_de_lectura_el_analisis_se_publica_sin_ella():
    """El panel de medidores no depende de la lectura: un motor sin
    `lectura.v1.yaml` sigue emitiendo el mismo `analysis.updated`."""
    analizador = AnalizarRevision(
        config=cargar_config_analisis(_yaml("analisis.v1.yaml")),
        ruleset=cargar_ruleset(_yaml("senales.v1.yaml")),
        distribuciones=None,
        repository=RepoFalso(SERIE_COMPLETA),
        publisher=None,
    )
    assert (
        await analizador._construir_lectura(
            analisis=None,
            vista={},
            as_of=AS_OF,
            moneda=MONEDA,
            confianza_baja=False,
            official_stale=False,
        )
        is None
    )
