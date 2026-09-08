"""La vigencia de la tasa oficial (ADR-0022).

Los casos están escritos con el calendario REAL de julio–agosto de 2026, que es
el que motivó la regla: el BCV publica por la tarde la tasa del siguiente día
hábil, y el 24/7 fue feriado.
"""

from datetime import UTC, date, datetime, timedelta, timezone

from indicator_engine.domain.vigencia import VET, dia_operativo, oficial_rancia


def _utc(a, m, d, h=12, mi=0) -> datetime:
    return datetime(a, m, d, h, mi, tzinfo=UTC)


class TestDiaOperativo:
    def test_el_dia_es_el_de_caracas_no_el_de_utc(self):
        # 02:00 UTC del lunes son las 22:00 del domingo en Caracas: usar UTC
        # habría adelantado el vencimiento medio día.
        assert dia_operativo(_utc(2026, 8, 3, 2, 0)) == date(2026, 8, 2)

    def test_justo_despues_de_medianoche_VET_ya_es_el_dia_siguiente(self):
        assert dia_operativo(_utc(2026, 8, 3, 4, 1)) == date(2026, 8, 3)

    def test_respeta_el_instante_venga_en_la_zona_que_venga(self):
        # El mismo instante expresado en dos zonas da el mismo día operativo.
        en_utc = _utc(2026, 8, 3, 2, 0)
        en_vet = en_utc.astimezone(VET)
        en_tokio = en_utc.astimezone(timezone(timedelta(hours=9)))
        assert dia_operativo(en_vet) == dia_operativo(en_tokio) == date(2026, 8, 2)


class TestOficialRancia:
    def test_la_tasa_de_hoy_esta_vigente(self):
        assert not oficial_rancia(date(2026, 7, 31), _utc(2026, 7, 31))

    def test_la_tasa_de_ayer_es_rancia(self):
        # Este es el caso que la bandera EXISTE para señalar: el BCV no publicó.
        assert oficial_rancia(date(2026, 7, 30), _utc(2026, 7, 31))

    def test_viernes_por_la_tarde_publica_la_del_lunes_y_rige_todo_el_finde(self):
        """El caso que motivó ADR-0022, con las fechas reales.

        Publicada el viernes 31/07 a las 16:36 VET con fecha-valor lunes 03/08.
        Desde ese momento hasta el lunes no hay publicación nueva —tres días—, y
        la tasa está vigente en todo el tramo. La regla vieja (antigüedad > 6 h)
        la marcaba rancia el sábado, el domingo y el lunes por la mañana.
        """
        fecha_valor = date(2026, 8, 3)  # lunes
        for momento in (
            _utc(2026, 7, 31, 21, 0),  # viernes, ya publicada
            _utc(2026, 8, 1, 16, 0),  # sábado
            _utc(2026, 8, 2, 16, 0),  # domingo
            _utc(2026, 8, 3, 12, 0),  # lunes por la mañana
            _utc(2026, 8, 3, 23, 59),  # lunes, 19:59 VET
        ):
            assert not oficial_rancia(fecha_valor, momento), momento

    def test_el_martes_sin_publicacion_nueva_ya_es_rancia(self):
        # Si el lunes por la tarde el BCV no publicó la del martes, el martes la
        # bandera se enciende — y ahí sí significa algo.
        assert oficial_rancia(date(2026, 8, 3), _utc(2026, 8, 4, 12, 0))

    def test_el_feriado_del_24_7_lo_cubre_la_propia_fecha_valor(self):
        """Por qué la regla NO puede ser «siguiente día hábil» calculado.

        El jueves 23/07 el BCV publicó con fecha-valor lunes 27/07: el viernes
        24 fue feriado. Ningún calendario derivable acierta eso; la fecha-valor
        que publica el emisor sí.
        """
        fecha_valor = date(2026, 7, 27)
        assert not oficial_rancia(fecha_valor, _utc(2026, 7, 24, 16, 0))  # feriado
        assert not oficial_rancia(fecha_valor, _utc(2026, 7, 27, 12, 0))  # lunes
        assert oficial_rancia(fecha_valor, _utc(2026, 7, 28, 12, 0))  # martes

    def test_una_fecha_valor_futura_esta_vigente(self):
        assert not oficial_rancia(date(2026, 8, 10), _utc(2026, 8, 3))

    def test_sin_fecha_valor_es_rancia_nunca_se_asume_vigencia(self):
        assert oficial_rancia(None, _utc(2026, 8, 3))
