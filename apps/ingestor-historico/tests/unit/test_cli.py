"""CLI de operador (`python -m ingestor_historico <comando>`).

178 sentencias al 0 %: el fichero más grande del servicio y el único sin cubrir.
No es cableado. Decide qué adaptadores se montan por comando —y `--dry-run` NO
significa lo mismo en los tres—, y sus resúmenes son lo único que ve quien carga
seis años de historia: un número mal impreso ahí es una carga mal juzgada.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from conftest import FIXTURES, TZ_CARACAS

from ingestor_historico import __main__ as cli
from ingestor_historico.application.cargar_historicos import ResumenCarga
from ingestor_historico.application.cargar_tasas_oficiales import ResumenCargaOficiales
from ingestor_historico.application.derivar_brechas import ResumenDerivacion
from ingestor_historico.application.ports import PuntoDerivable
from ingestor_historico.config import Settings, parse_tz
from ingestor_historico.domain.estadisticas import (
    PuntoSerie,
    ResumenSerie,
    VarianzaHistorica,
)

CSV = str(FIXTURES / "query_result_muestra.csv")
# El export de tasas oficiales tiene otras columnas; la tercera fila va sin
# `publicado_en` a propósito: es el caso «fecha real, hora desconocida».
CSV_OFICIALES = str(FIXTURES / "bcv_oficiales_muestra.csv")
AHORA = datetime(2026, 3, 2, 16, 30, tzinfo=UTC)


def _ajustes() -> Settings:
    return Settings.from_env({})


class Args:
    """`argparse.Namespace` a mano: los tests dicen qué flags importan."""

    def __init__(self, **kwargs) -> None:
        self.__dict__.update(kwargs)


@pytest.fixture(autouse=True)
def sin_infraestructura(monkeypatch):
    """Ningún test de este módulo puede abrir una conexión real.

    Se parchean los tres adaptadores en SU módulo, que es donde el CLI los
    importa (import diferido dentro de cada comando).
    """

    def prohibido(*args, **kwargs):
        raise AssertionError("se montó un adaptador de infraestructura")

    for ruta in (
        "ingestor_historico.adapters.timescale.repository.TimescaleRepositorioHistorico",
        "ingestor_historico.adapters.timescale.tasas_oficiales.TimescaleRepositorioTasasOficiales",
        "ingestor_historico.adapters.timescale.brechas.TimescaleRepositorioBrechas",
    ):
        monkeypatch.setattr(f"{ruta}.connect", prohibido)


# -- configuración -----------------------------------------------------------


def test_una_zona_horaria_mal_escrita_se_rechaza_al_arrancar():
    """`TZ_ORIGEN` decide cómo se interpretan las fechas naive de un export de
    seis años. Aceptar algo que no se entiende y caer a un default silencioso
    desplazaría la serie entera unas horas sin que nadie lo viera."""
    for malo in ("-4", "04:00", "-04:00:00", "GMT-4", ""):
        with pytest.raises(ValueError, match="TZ_ORIGEN"):
            parse_tz(malo)


def test_la_zona_se_lee_con_signo_y_minutos():
    assert parse_tz("-04:00").utcoffset(None) == timedelta(hours=-4)
    assert parse_tz("+05:30").utcoffset(None) == timedelta(hours=5, minutes=30)


def test_los_defaults_apuntan_al_compose_de_desarrollo():
    ajustes = _ajustes()

    assert ajustes.tz_origen == "-04:00"
    assert "5433" in ajustes.database_url


# -- resúmenes: lo único que ve el operador ----------------------------------


def _resumen_carga(**extra) -> ResumenCarga:
    base = {
        "archivo": "export.csv",
        "total_filas": 100,
        "insertadas": 90,
        "duplicadas": 8,
        "actualizadas": 0,
        "descartadas": {},
        "desde": AHORA,
        "hasta": AHORA + timedelta(days=1),
        "bancos": ("Banesco", "Mercantil"),
        "mapeo": None,
    }
    return ResumenCarga(**{**base, **extra})


def test_el_resumen_de_carga_desglosa_los_descartes_por_motivo(capsys):
    """Un total de descartes sin motivo obliga a abrir el CSV a mano. Con el
    motivo, se ve si es un problema del export o del parser."""
    cli._imprimir_resumen_carga(
        _resumen_carga(descartadas={"precio invalido": 7, "fecha ausente": 3})
    )

    salida = capsys.readouterr().out
    assert "descartadas:  3 (fecha ausente)" in salida
    assert "descartadas:  7 (precio invalido)" in salida


def test_las_actualizadas_solo_se_nombran_si_las_hay(capsys):
    """Rellenar campos vacíos es una REPARACIÓN, no el caso normal: mencionarla
    siempre con un 0 la convertiría en ruido y dejaría de llamar la atención el
    día que no sea 0."""
    cli._imprimir_resumen_carga(_resumen_carga(actualizadas=0))
    assert "actualizadas" not in capsys.readouterr().out

    cli._imprimir_resumen_carga(_resumen_carga(actualizadas=4))
    assert "actualizadas: 4 (campos vacios rellenados)" in capsys.readouterr().out


def test_el_resumen_de_oficiales_avisa_de_las_filas_sin_hora(capsys):
    """La reserva más importante de esta carga: fecha real, hora desconocida.

    Si el resumen no lo dijera, el operador daría por buena la marca temporal de
    ~2 000 filas que no la tienen. Se nombra el `source` para poder aislarlas.
    """
    cli._imprimir_resumen_oficiales(
        ResumenCargaOficiales(
            archivo="bcv_fx_historico.csv",
            total_filas=31_078,
            insertadas=31_000,
            duplicadas=78,
            descartadas={},
            sin_hora=1_940,
            monedas=("USD", "EUR"),
            desde=date(2020, 1, 2),
            hasta=date(2026, 3, 2),
        )
    )

    salida = capsys.readouterr().out
    assert "sin hora:     1940" in salida
    assert "source='BCV-historico-sin-hora'" in salida
    assert "monedas:      2 (USD, EUR)" in salida


def test_sin_filas_sin_hora_no_se_menciona_la_reserva(capsys):
    cli._imprimir_resumen_oficiales(
        ResumenCargaOficiales(
            archivo="x.csv",
            total_filas=1,
            insertadas=1,
            duplicadas=0,
            descartadas={},
            sin_hora=0,
            monedas=("USD",),
            desde=None,
            hasta=None,
        )
    )

    assert "sin hora" not in capsys.readouterr().out


def test_la_derivacion_distingue_no_haber_corte_de_tenerlo(capsys):
    """«corte: -» y «corte: <fecha>» significan cosas opuestas: en el primer caso
    el backfill puede llegar hasta hoy porque el motor aún no publica esa serie;
    en el segundo tiene que parar ahí. Un guion mudo confundiría los dos."""
    base = {
        "puntos": 10,
        "insertadas": 20,
        "duplicadas": 0,
        "omitidas": {},
        "desde": AHORA,
        "hasta": AHORA,
    }

    cli._imprimir_resumen_derivacion(ResumenDerivacion(**base, frontera=None))
    assert "corte:        - (el motor aun no publica esta serie)" in capsys.readouterr().out

    cli._imprimir_resumen_derivacion(ResumenDerivacion(**base, frontera=AHORA))
    salida = capsys.readouterr().out
    assert "arranque de la serie del motor" in salida
    assert AHORA.isoformat() in salida


# -- estadísticas ------------------------------------------------------------


def _serie(n: int = 10, media: float = 40.0) -> ResumenSerie:
    return ResumenSerie(
        n=n, media=media, varianza=0.25, desviacion=0.5, minimo=39.0, maximo=41.0
    )


def test_una_serie_sin_log_retornos_sale_como_nula_en_el_json():
    """`retornos` es None con menos de dos puntos. En JSON tiene que salir `null`
    y no un objeto de ceros, que se leería como «volatilidad medida: 0»."""
    resultado = VarianzaHistorica(
        desde=AHORA, hasta=AHORA, precio=_serie(), retornos=None, por_banco={}
    )

    salida = cli._varianza_a_dict(resultado)

    assert salida["log_retornos"] is None
    assert salida["precio"]["n"] == 10
    assert salida["precio"]["coef_variacion"] == pytest.approx(0.0125)


def test_el_texto_de_la_varianza_no_imprime_retornos_ausentes(capsys):
    cli._imprimir_varianza(
        "serie completa",
        VarianzaHistorica(
            desde=AHORA, hasta=AHORA, precio=_serie(), retornos=None, por_banco={}
        ),
    )

    salida = capsys.readouterr().out
    assert "precio base" in salida
    assert "log-retornos" not in salida


def test_cada_banco_sale_con_su_propia_linea(capsys):
    cli._imprimir_varianza(
        "dia",
        VarianzaHistorica(
            desde=AHORA,
            hasta=AHORA,
            precio=_serie(),
            retornos=_serie(n=9),
            por_banco={"Banesco": _serie(n=5), "Mercantil": _serie(n=4)},
        ),
    )

    salida = capsys.readouterr().out
    assert "log-retornos" in salida
    assert "Banesco" in salida and "Mercantil" in salida


# -- comandos ----------------------------------------------------------------


async def test_cargar_en_seco_no_toca_la_base(capsys):
    """El `--dry-run` de `cargar`: parsea el CSV entero y no persiste. Es el modo
    con el que se valida un export de seis años antes de escribirlo."""
    await cli._cmd_cargar(
        Args(archivo=CSV, dry_run=True, tz=None, rellenar_vacios=False), _ajustes()
    )

    salida = capsys.readouterr().out
    assert "(dry-run: nada se persistió)" in salida
    assert "filas:" in salida


async def test_cargar_oficiales_en_seco_normaliza_el_filtro_de_monedas(monkeypatch):
    """`--monedas usd, eur ` tiene que filtrar igual que `USD,EUR`.

    Si el filtro no normalizara, un espacio o una minúscula lo dejarían sin
    efecto y la carga traería TODAS las monedas del export en silencio — lo
    contrario de lo que pidió el operador.
    """
    recibido = {}

    class CasoEspia:
        def __init__(self, repositorio) -> None:
            pass

        async def ejecutar(self, cabeceras, filas, archivo, tz, monedas):
            recibido["monedas"] = monedas
            return ResumenCargaOficiales(
                archivo=archivo,
                total_filas=0,
                insertadas=0,
                duplicadas=0,
                descartadas={},
                sin_hora=0,
                monedas=(),
                desde=None,
                hasta=None,
            )

    monkeypatch.setattr(cli, "CargarTasasOficiales", CasoEspia)

    await cli._cmd_cargar_oficiales(
        Args(archivo=CSV_OFICIALES, dry_run=True, tz=None, monedas=" usd , eur "), _ajustes()
    )

    assert recibido["monedas"] == frozenset({"USD", "EUR"})


async def test_sin_filtro_de_monedas_se_cargan_todas(monkeypatch):
    recibido = {}

    class CasoEspia:
        def __init__(self, repositorio) -> None:
            pass

        async def ejecutar(self, cabeceras, filas, archivo, tz, monedas):
            recibido["monedas"] = monedas
            return ResumenCargaOficiales(
                archivo=archivo, total_filas=0, insertadas=0, duplicadas=0,
                descartadas={}, sin_hora=0, monedas=(), desde=None, hasta=None,
            )

    monkeypatch.setattr(cli, "CargarTasasOficiales", CasoEspia)

    await cli._cmd_cargar_oficiales(
        Args(archivo=CSV_OFICIALES, dry_run=True, tz=None, monedas=None), _ajustes()
    )

    assert recibido["monedas"] is None


async def test_derivar_brechas_en_seco_SI_lee_la_base_pero_no_escribe(
    monkeypatch, capsys
):
    """El `--dry-run` de este comando NO es el de los otros dos, y conviene que
    siga sin serlo.

    Los puntos derivables solo existen en la base: si el modo seco los falseara,
    el resumen diría cuántas filas se habrían escrito sobre datos inventados y no
    serviría para decidir nada. Por eso abre el repositorio real **como lector**
    y solo sustituye la escritura.
    """
    lecturas = []

    class LectorFalso:
        @classmethod
        async def connect(cls, dsn):
            lecturas.append(dsn)
            return cls()

        async def frontera_serie_viva(self, indicador, moneda):
            return AHORA + timedelta(days=1)

        async def puntos_derivables(self, hasta):
            lecturas.append(hasta)
            return [
                PuntoDerivable(
                    as_of=AHORA, precio_p2p=Decimal("40.0"), tasa_oficial=Decimal("36.0")
                )
            ]

        async def close(self):
            lecturas.append("cerrado")

    monkeypatch.setattr(
        "ingestor_historico.adapters.timescale.brechas.TimescaleRepositorioBrechas",
        LectorFalso,
    )

    await cli._cmd_derivar_brechas(
        Args(dry_run=True, sesgo="-0.0776", horas_solape=279), _ajustes()
    )

    # Leyó de verdad —con la frontera real— y cerró lo que abrió.
    assert lecturas[0] == _ajustes().database_url
    assert lecturas[1] == AHORA + timedelta(days=1)
    assert lecturas[-1] == "cerrado"
    salida = capsys.readouterr().out
    assert "(dry-run: nada se persistio)" in salida
    assert "puntos:       1" in salida


async def test_stats_sin_datos_dice_que_hacer(monkeypatch, capsys):
    """Un rango vacío no es un error: es que aún no se ha cargado nada. El
    mensaje lleva el comando siguiente en vez de una lista vacía."""

    class RepoVacio:
        @classmethod
        async def connect(cls, dsn):
            return cls()

        async def leer_puntos(self, desde, hasta):
            return []

        async def close(self):
            pass

    monkeypatch.setattr(
        "ingestor_historico.adapters.timescale.repository.TimescaleRepositorioHistorico",
        RepoVacio,
    )

    await cli._cmd_stats(
        Args(desde=None, hasta=None, por_dia=False, tz=None, json=False), _ajustes()
    )

    assert "cargar primero con `cargar <archivo>`" in capsys.readouterr().out


def _repo_con_puntos(monkeypatch, puntos):
    class RepoFalso:
        @classmethod
        async def connect(cls, dsn):
            return cls()

        async def leer_puntos(self, desde, hasta):
            return puntos

        async def close(self):
            pass

    monkeypatch.setattr(
        "ingestor_historico.adapters.timescale.repository.TimescaleRepositorioHistorico",
        RepoFalso,
    )


async def test_el_dia_de_mercado_se_agrupa_en_la_zona_de_origen(monkeypatch, capsys):
    """La base devuelve UTC; el día que interesa es el de Caracas.

    Estos dos instantes son el MISMO día en Venezuela (2 de marzo, 21:00 y 23:00
    VET) y días distintos en UTC (2 y 3 de marzo). Agrupar por el día UTC partiría
    la jornada en dos y ninguna de las dos mitades sería un día de mercado.
    """
    puntos = [
        PuntoSerie(
            capturado_en=datetime(2026, 3, 3, 1, 0, tzinfo=UTC),  # 2 mar 21:00 VET
            precio=Decimal("40.0"),
            tasas_por_banco={},
        ),
        PuntoSerie(
            capturado_en=datetime(2026, 3, 3, 3, 0, tzinfo=UTC),  # 2 mar 23:00 VET
            precio=Decimal("41.0"),
            tasas_por_banco={},
        ),
    ]
    _repo_con_puntos(monkeypatch, puntos)

    await cli._cmd_stats(
        Args(desde=None, hasta=None, por_dia=True, tz=None, json=True), _ajustes()
    )

    salida = json.loads(capsys.readouterr().out)
    assert list(salida) == ["2026-03-02"]
    assert salida["2026-03-02"]["precio"]["n"] == 2


async def test_stats_acota_el_rango_con_las_fechas_pedidas(monkeypatch, capsys):
    """`--desde/--hasta` llegan como ISO 8601 con offset y se pasan al
    repositorio: filtrar después en memoria traería la serie entera."""
    recibido = {}

    class RepoFalso:
        @classmethod
        async def connect(cls, dsn):
            return cls()

        async def leer_puntos(self, desde, hasta):
            recibido["rango"] = (desde, hasta)
            return []

        async def close(self):
            pass

    monkeypatch.setattr(
        "ingestor_historico.adapters.timescale.repository.TimescaleRepositorioHistorico",
        RepoFalso,
    )

    await cli._cmd_stats(
        Args(
            desde="2026-03-01T00:00:00-04:00",
            hasta="2026-03-31T23:59:59-04:00",
            por_dia=False,
            tz=None,
            json=False,
        ),
        _ajustes(),
    )

    desde, hasta = recibido["rango"]
    assert desde == datetime(2026, 3, 1, tzinfo=TZ_CARACAS)
    assert hasta.day == 31


async def test_stats_de_la_serie_completa_en_texto(monkeypatch, capsys):
    _repo_con_puntos(
        monkeypatch,
        [
            PuntoSerie(
                capturado_en=AHORA + timedelta(hours=h),
                precio=Decimal(40 + h),
                tasas_por_banco={"Banesco": Decimal(40 + h)},
            )
            for h in range(3)
        ],
    )

    await cli._cmd_stats(
        Args(desde=None, hasta=None, por_dia=False, tz=None, json=False), _ajustes()
    )

    salida = capsys.readouterr().out
    assert "serie completa" in salida
    assert "precio base" in salida
    assert "Banesco" in salida


# -- despacho ----------------------------------------------------------------


def test_cada_subcomando_llega_a_su_funcion(monkeypatch):
    """El diccionario de despacho es fácil de desincronizar del parser: un
    subcomando nuevo sin entrada revienta con KeyError en tiempo de ejecución."""
    for comando, funcion in (
        ("cargar", "_cmd_cargar"),
        ("cargar-oficiales", "_cmd_cargar_oficiales"),
        ("derivar-brechas", "_cmd_derivar_brechas"),
        ("stats", "_cmd_stats"),
    ):
        llamadas = []

        async def espia(args, settings, _n=comando):
            llamadas.append(_n)

        monkeypatch.setattr(cli, funcion, espia)
        argv = ["ingestor-historico", comando]
        if comando in ("cargar", "cargar-oficiales"):
            argv.append(CSV)
        monkeypatch.setattr("sys.argv", argv)

        cli.main()

        assert llamadas == [comando]


def test_sin_subcomando_no_se_arranca(monkeypatch):
    """`required=True`: invocar el módulo a secas no debe caer en un comando por
    defecto que escriba en la base."""
    monkeypatch.setattr("sys.argv", ["ingestor-historico"])

    with pytest.raises(SystemExit):
        cli.main()


def test_un_ctrl_c_a_media_carga_no_es_un_fallo(monkeypatch, caplog):
    """Una carga de 31 k filas se puede querer parar. La transacción hace el
    resto: lo escrito queda consistente."""
    import logging

    monkeypatch.setattr("sys.argv", ["ingestor-historico", "stats"])

    async def interrumpe(args, settings):
        raise KeyboardInterrupt

    monkeypatch.setattr(cli, "_cmd_stats", interrumpe)

    with caplog.at_level(logging.INFO, logger="ingestor_historico"):
        cli.main()

    assert any("detenido por el usuario" in r.getMessage() for r in caplog.records)


# -- la rama con infraestructura ---------------------------------------------


class _AdaptadorFalso:
    """Sustituye a un repositorio Timescale entero, no solo a su `connect`.

    Con la clase completa se puede recorrer la rama que SÍ monta infraestructura
    —la que corre en una carga de verdad— sin abrir una conexión.
    """

    abiertos: list["_AdaptadorFalso"] = []

    def __init__(self) -> None:
        self.cerrado = False

    @classmethod
    async def connect(cls, dsn: str) -> "_AdaptadorFalso":
        instancia = cls()
        _AdaptadorFalso.abiertos.append(instancia)
        return instancia

    async def close(self) -> None:
        self.cerrado = True

    # Superficie mínima que consumen los casos de uso.
    async def guardar_lote(self, *args, **kwargs):
        from ingestor_historico.application.ports import ResumenPersistencia

        return ResumenPersistencia(insertados=0, duplicados=0)

    async def guardar_tasas(self, tasas):
        from ingestor_historico.application.ports import ResumenPersistencia

        return ResumenPersistencia(insertados=0, duplicados=0)

    async def frontera_serie_viva(self, indicador, moneda):
        return None

    async def puntos_derivables(self, hasta):
        return []

    async def guardar_brechas(self, brechas, metadata):
        from ingestor_historico.application.ports import ResumenPersistencia

        return ResumenPersistencia(insertados=0, duplicados=0)


@pytest.fixture
def adaptador(monkeypatch):
    _AdaptadorFalso.abiertos = []

    for ruta in (
        "ingestor_historico.adapters.timescale.repository.TimescaleRepositorioHistorico",
        "ingestor_historico.adapters.timescale.tasas_oficiales.TimescaleRepositorioTasasOficiales",
        "ingestor_historico.adapters.timescale.brechas.TimescaleRepositorioBrechas",
    ):
        monkeypatch.setattr(ruta, _AdaptadorFalso)
    return _AdaptadorFalso


async def test_cargar_de_verdad_cierra_la_conexion(adaptador):
    """Sin el `finally`, una carga que falle a mitad deja el pool abierto y el
    proceso colgado sin terminar."""
    await cli._cmd_cargar(
        Args(archivo=CSV, dry_run=False, tz=None, rellenar_vacios=False), _ajustes()
    )

    (repositorio,) = adaptador.abiertos
    assert repositorio.cerrado


async def test_cargar_oficiales_de_verdad_cierra_la_conexion(adaptador):
    await cli._cmd_cargar_oficiales(
        Args(archivo=CSV_OFICIALES, dry_run=False, tz=None, monedas=None), _ajustes()
    )

    (repositorio,) = adaptador.abiertos
    assert repositorio.cerrado


async def test_derivar_de_verdad_abre_UNA_sola_conexion(adaptador):
    """En seco se abren dos repositorios —lector real y escritor en memoria—; en
    real basta uno, que lee y escribe. Abrir dos aquí sería duplicar el pool
    contra la misma base sin necesidad."""
    await cli._cmd_derivar_brechas(
        Args(dry_run=False, sesgo="-0.0776", horas_solape=279), _ajustes()
    )

    assert len(adaptador.abiertos) == 1
    assert adaptador.abiertos[0].cerrado


# -- las cuatro combinaciones de salida de `stats` ---------------------------


async def test_stats_por_dia_en_texto(monkeypatch, capsys):
    _repo_con_puntos(
        monkeypatch,
        [
            PuntoSerie(
                capturado_en=AHORA + timedelta(hours=h),
                precio=Decimal(40 + h),
                tasas_por_banco={},
            )
            for h in range(2)
        ],
    )

    await cli._cmd_stats(
        Args(desde=None, hasta=None, por_dia=True, tz=None, json=False), _ajustes()
    )

    salida = capsys.readouterr().out
    assert "2026-03-02" in salida
    assert "precio base" in salida


async def test_stats_de_la_serie_completa_en_json(monkeypatch, capsys):
    _repo_con_puntos(
        monkeypatch,
        [
            PuntoSerie(
                capturado_en=AHORA + timedelta(hours=h),
                precio=Decimal(40 + h),
                tasas_por_banco={},
            )
            for h in range(3)
        ],
    )

    await cli._cmd_stats(
        Args(desde=None, hasta=None, por_dia=False, tz=None, json=True), _ajustes()
    )

    salida = json.loads(capsys.readouterr().out)
    assert salida["precio"]["n"] == 3
    assert salida["log_retornos"]["n"] == 2  # n-1 retornos entre 3 puntos
