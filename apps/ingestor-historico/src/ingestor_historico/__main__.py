"""Entrypoint: `python -m ingestor_historico <comando>`.

cargar <archivo.csv> [--dry-run] [--tz -04:00] [--rellenar-vacios]
    Carga un export histórico en TimescaleDB (idempotente). Con --dry-run
    parsea y resume sin tocar la base. Con --rellenar-vacios, las filas ya
    cargadas a las que les falte un campo que el export SÍ trae se completan
    (reparación explícita; nunca sobrescribe un valor existente).

cargar-oficiales <archivo.csv> [--dry-run] [--tz -04:00] [--monedas USD,EUR]
    Carga el histórico de tasas oficiales del BCV en `official_rates`
    (idempotente). Sin --monedas carga todas las del export.

derivar-brechas [--dry-run]
    Deriva la brecha histórica del LADO VENTA (`p2p_brecha_pct_sell`,
    `p2p_brecha_abs_sell`) cruzando los snapshots cargados con la tasa oficial
    vigente en cada instante. Se corta ANTES del primer punto que publicó el
    motor: nunca escribe en el tramo de la serie viva.

stats [--desde ISO] [--hasta ISO] [--por-dia] [--json]
    Varianza histórica del precio (global y por banco) sobre lo cargado.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from ingestor_historico.adapters.csv_reader import leer_csv
from ingestor_historico.adapters.memory import (
    InMemoryRepositorioHistorico,
    InMemoryRepositorioTasasOficiales,
)
from ingestor_historico.application.cargar_historicos import (
    CargarHistoricos,
    ResumenCarga,
)
from ingestor_historico.application.cargar_tasas_oficiales import (
    CargarTasasOficiales,
    ResumenCargaOficiales,
)
from ingestor_historico.application.derivar_brechas import (
    DerivarBrechas,
    ResumenDerivacion,
)
from ingestor_historico.config import Settings, parse_tz
from ingestor_historico.domain.brechas import INDICADOR_PCT, MONEDA
from ingestor_historico.domain.estadisticas import (
    ResumenSerie,
    VarianzaHistorica,
    varianza_historica,
    varianza_por_dia,
)

logger = logging.getLogger("ingestor_historico")


def _imprimir_resumen_carga(resumen: ResumenCarga) -> None:
    print(f"archivo:      {resumen.archivo}")
    print(f"filas:        {resumen.total_filas}")
    print(f"insertadas:   {resumen.insertadas}")
    print(f"duplicadas:   {resumen.duplicadas}")
    if resumen.actualizadas:
        print(f"actualizadas: {resumen.actualizadas} (campos vacios rellenados)")
    for motivo, cantidad in sorted(resumen.descartadas.items()):
        print(f"descartadas:  {cantidad} ({motivo})")
    if resumen.desde and resumen.hasta:
        # Salida ASCII: la consola de Windows puede ser cp1252.
        print(f"rango:        {resumen.desde.isoformat()} -> {resumen.hasta.isoformat()}")
    print(f"bancos:       {', '.join(resumen.bancos) or '-'}")


def _imprimir_resumen_oficiales(resumen: ResumenCargaOficiales) -> None:
    print(f"archivo:      {resumen.archivo}")
    print(f"filas:        {resumen.total_filas}")
    print(f"insertadas:   {resumen.insertadas}")
    print(f"duplicadas:   {resumen.duplicadas}")
    for motivo, cantidad in sorted(resumen.descartadas.items()):
        print(f"descartadas:  {cantidad} ({motivo})")
    if resumen.sin_hora:
        # No es un detalle menor: esas filas llevan la FECHA real y una hora
        # que no se sabe. Van marcadas en `source` para que se puedan aislar.
        print(
            f"sin hora:     {resumen.sin_hora} "
            f"(fecha real, hora desconocida -> source='BCV-historico-sin-hora')"
        )
    if resumen.desde and resumen.hasta:
        # Salida ASCII: la consola de Windows puede ser cp1252.
        print(f"fecha valor:  {resumen.desde.isoformat()} -> {resumen.hasta.isoformat()}")
    print(f"monedas:      {len(resumen.monedas)} ({', '.join(resumen.monedas) or '-'})")


def _imprimir_resumen_derivacion(resumen: ResumenDerivacion) -> None:
    print(f"puntos:       {resumen.puntos}")
    print(f"insertadas:   {resumen.insertadas}  (2 indicadores por punto)")
    print(f"duplicadas:   {resumen.duplicadas}")
    for motivo, cantidad in sorted(resumen.omitidas.items()):
        print(f"omitidas:     {cantidad} ({motivo})")
    if resumen.frontera is not None:
        print(f"corte:        {resumen.frontera.isoformat()} (arranque de la serie del motor)")
    else:
        print("corte:        - (el motor aun no publica esta serie)")
    if resumen.desde and resumen.hasta:
        print(f"rango:        {resumen.desde.isoformat()} -> {resumen.hasta.isoformat()}")


def _formato_resumen(nombre: str, serie: ResumenSerie) -> str:
    return (
        f"{nombre:<14} n={serie.n:<5} media={serie.media:>10.4f} "
        f"varianza={serie.varianza:>12.6f} desv={serie.desviacion:>9.4f} "
        f"min={serie.minimo:>9.4f} max={serie.maximo:>9.4f}"
    )


def _imprimir_varianza(titulo: str, resultado: VarianzaHistorica) -> None:
    print(f"* {titulo} ({resultado.desde.isoformat()} -> {resultado.hasta.isoformat()})")
    print("  " + _formato_resumen("precio base", resultado.precio))
    if resultado.retornos:
        print("  " + _formato_resumen("log-retornos", resultado.retornos))
    for banco, serie in resultado.por_banco.items():
        print("  " + _formato_resumen(banco, serie))


def _varianza_a_dict(resultado: VarianzaHistorica) -> dict:
    def serie(s: ResumenSerie | None) -> dict | None:
        if s is None:
            return None
        return {
            "n": s.n, "media": s.media, "varianza": s.varianza,
            "desviacion": s.desviacion, "min": s.minimo, "max": s.maximo,
            "coef_variacion": s.coeficiente_variacion,
        }

    return {
        "desde": resultado.desde.isoformat(),
        "hasta": resultado.hasta.isoformat(),
        "precio": serie(resultado.precio),
        "log_retornos": serie(resultado.retornos),
        "por_banco": {b: serie(s) for b, s in resultado.por_banco.items()},
    }


async def _cmd_cargar(args: argparse.Namespace, settings: Settings) -> None:
    tz = parse_tz(args.tz or settings.tz_origen)
    cabeceras, filas = leer_csv(args.archivo)

    if args.dry_run:
        repositorio = InMemoryRepositorioHistorico()
        cerrar = None
    else:
        from ingestor_historico.adapters.timescale.repository import (
            TimescaleRepositorioHistorico,
        )

        repositorio = await TimescaleRepositorioHistorico.connect(
            settings.database_url
        )
        cerrar = repositorio.close

    try:
        resumen = await CargarHistoricos(repositorio).ejecutar(
            cabeceras, filas, Path(args.archivo).name, tz, args.rellenar_vacios
        )
        _imprimir_resumen_carga(resumen)
        if args.dry_run:
            print("(dry-run: nada se persistió)")
    finally:
        if cerrar:
            await cerrar()


async def _cmd_cargar_oficiales(
    args: argparse.Namespace, settings: Settings
) -> None:
    tz = parse_tz(args.tz or settings.tz_origen)
    cabeceras, filas = leer_csv(args.archivo)
    monedas = (
        frozenset(m.strip().upper() for m in args.monedas.split(",") if m.strip())
        if args.monedas
        else None
    )

    if args.dry_run:
        repositorio = InMemoryRepositorioTasasOficiales()
        cerrar = None
    else:
        from ingestor_historico.adapters.timescale.tasas_oficiales import (
            TimescaleRepositorioTasasOficiales,
        )

        repositorio = await TimescaleRepositorioTasasOficiales.connect(
            settings.database_url
        )
        cerrar = repositorio.close

    try:
        resumen = await CargarTasasOficiales(repositorio).ejecutar(
            cabeceras, filas, Path(args.archivo).name, tz, monedas
        )
        _imprimir_resumen_oficiales(resumen)
        if args.dry_run:
            print("(dry-run: nada se persistio)")
    finally:
        if cerrar:
            await cerrar()


async def _cmd_derivar_brechas(
    args: argparse.Namespace, settings: Settings
) -> None:
    if args.dry_run:
        from ingestor_historico.adapters.memory import InMemoryRepositorioBrechas

        # En seco se leen los puntos reales pero no se escribe: para eso hace
        # falta el repositorio real como lector.
        from ingestor_historico.adapters.timescale.brechas import (
            TimescaleRepositorioBrechas,
        )

        lector = await TimescaleRepositorioBrechas.connect(settings.database_url)
        try:
            frontera = await lector.frontera_serie_viva(INDICADOR_PCT, MONEDA)
            puntos = await lector.puntos_derivables(frontera)
        finally:
            await lector.close()
        repositorio = InMemoryRepositorioBrechas(puntos, frontera)
        cerrar = None
    else:
        from ingestor_historico.adapters.timescale.brechas import (
            TimescaleRepositorioBrechas,
        )

        repositorio = await TimescaleRepositorioBrechas.connect(settings.database_url)
        cerrar = repositorio.close

    try:
        resumen = await DerivarBrechas(repositorio).ejecutar(
            sesgo_medido_pp=args.sesgo, horas_solape=args.horas_solape
        )
        _imprimir_resumen_derivacion(resumen)
        if args.dry_run:
            print("(dry-run: nada se persistio)")
    finally:
        if cerrar:
            await cerrar()


async def _cmd_stats(args: argparse.Namespace, settings: Settings) -> None:
    from ingestor_historico.adapters.timescale.repository import (
        TimescaleRepositorioHistorico,
    )
    from ingestor_historico.domain.estadisticas import PuntoSerie

    desde = datetime.fromisoformat(args.desde) if args.desde else None
    hasta = datetime.fromisoformat(args.hasta) if args.hasta else None

    repositorio = await TimescaleRepositorioHistorico.connect(settings.database_url)
    try:
        puntos = await repositorio.leer_puntos(desde, hasta)
    finally:
        await repositorio.close()

    if not puntos:
        print("sin datos en el rango pedido; cargar primero con `cargar <archivo>`")
        return

    # La DB devuelve UTC; el día de mercado se agrupa en la zona del origen
    # (TZ_ORIGEN u opción --tz), no en el día calendario UTC.
    tz = parse_tz(args.tz or settings.tz_origen)
    puntos = [
        PuntoSerie(p.capturado_en.astimezone(tz), p.precio, p.tasas_por_banco)
        for p in puntos
    ]

    if args.por_dia:
        resultados = varianza_por_dia(puntos)
        if args.json:
            print(json.dumps(
                {dia.isoformat(): _varianza_a_dict(r) for dia, r in resultados},
                indent=2, ensure_ascii=False,
            ))
        else:
            for dia, resultado in resultados:
                _imprimir_varianza(dia.isoformat(), resultado)
    else:
        resultado = varianza_historica(puntos)
        if args.json:
            print(json.dumps(_varianza_a_dict(resultado), indent=2, ensure_ascii=False))
        else:
            _imprimir_varianza("serie completa", resultado)


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ingestor-historico",
        description="Carga batch de históricos de precio USDT/VES y varianza histórica",
    )
    sub = parser.add_subparsers(dest="comando", required=True)

    p_cargar = sub.add_parser("cargar", help="cargar un export CSV en TimescaleDB")
    p_cargar.add_argument("archivo", help="ruta al export CSV")
    p_cargar.add_argument("--dry-run", action="store_true", help="parsear sin persistir")
    p_cargar.add_argument("--tz", help="zona horaria del export (default TZ_ORIGEN, -04:00)")
    p_cargar.add_argument(
        "--rellenar-vacios",
        action="store_true",
        help="rellenar campos vacios de filas YA cargadas (reparacion; nunca sobrescribe)",
    )

    p_oficiales = sub.add_parser(
        "cargar-oficiales", help="cargar el histórico de tasas oficiales del BCV"
    )
    p_oficiales.add_argument("archivo", help="ruta al export CSV (bcv_fx_historico.csv)")
    p_oficiales.add_argument("--dry-run", action="store_true", help="parsear sin persistir")
    p_oficiales.add_argument("--tz", help="zona del export (default TZ_ORIGEN, -04:00)")
    p_oficiales.add_argument(
        "--monedas", help="lista separada por comas (default: todas las del export)"
    )

    p_brechas = sub.add_parser(
        "derivar-brechas", help="derivar la brecha historica del lado venta"
    )
    p_brechas.add_argument("--dry-run", action="store_true", help="calcular sin persistir")
    p_brechas.add_argument(
        "--sesgo",
        default="-0.0776",
        help="sesgo medido vs la serie del motor, en pp (va en metadata)",
    )
    p_brechas.add_argument(
        "--horas-solape",
        type=int,
        default=279,
        help="horas de solape sobre las que se midio el sesgo (va en metadata)",
    )

    p_stats = sub.add_parser("stats", help="varianza histórica de lo cargado")
    p_stats.add_argument("--desde", help="ISO 8601 (con offset), inclusive")
    p_stats.add_argument("--hasta", help="ISO 8601 (con offset), inclusive")
    p_stats.add_argument("--por-dia", action="store_true", help="agrupar por día")
    p_stats.add_argument("--tz", help="zona del día de mercado (default TZ_ORIGEN, -04:00)")
    p_stats.add_argument("--json", action="store_true", help="salida JSON")

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    settings = Settings.from_env()
    comandos = {
        "cargar": _cmd_cargar,
        "cargar-oficiales": _cmd_cargar_oficiales,
        "derivar-brechas": _cmd_derivar_brechas,
        "stats": _cmd_stats,
    }
    comando = comandos[args.comando]
    try:
        asyncio.run(comando(args, settings))
    except KeyboardInterrupt:
        logger.info("detenido por el usuario")


if __name__ == "__main__":
    main()
