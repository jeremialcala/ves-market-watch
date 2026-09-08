# ADR-0022: La vigencia de la tasa oficial la manda la fecha-valor

- **Estado:** accepted
- **Fecha:** 2026-08-02
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Enmienda a:** ADR-0007 (máquina de estados de la tasa oficial) — la
  transición a `stale` deja de ser un umbral de horas
- **Aplica:** ADR-0009 (modelo bitemporal). No lo cambia: el modelo ya separaba
  `captured_at` de `value_date`; lo que faltaba era que la bandera de
  degradación usara el eje correcto de los dos.
- **Controles OWASP afectados:** A05 (honestidad de la presentación: no declarar
  rancio lo que está vigente), A09/T10 (la degradación que se anuncia tiene que
  corresponderse con un hecho real)

## Contexto

El BCV **no publica todos los días**, y lo que publica no rige para el día en que
se publica. Observado en la serie real de USD/VES (julio–agosto de 2026):

| publicada (VET) | fecha-valor |
|---|---|
| jue 30/07 17:37 | vie 31/07 |
| **vie 31/07 16:36** | **lun 03/08** — salta el fin de semana |
| jue 23/07 18:11 | **lun 27/07** — el viernes 24 fue feriado |

El emisor publica por la tarde (~16:00–18:30 VET) la tasa del **siguiente día
hábil**. Ese es el hecho de negocio, y el modelo bitemporal de ADR-0009 ya lo
recogía separando `captured_at` (cuándo lo vimos) de `value_date` (para qué día
rige).

Lo que no lo recogía era la bandera de degradación. Cuatro sitios calculaban
`stale` —dos en el motor y dos en el gateway— y **los cuatro medían antigüedad**:

```python
# indicator-engine/application/process_p2p_snapshot.py
return snap.capturado_en - oficial.as_of > self._umbral_stale   # 6 h
```

`oficial.as_of` es el instante en que el indicador **cambió**, y el indicador
solo se persiste cuando la tasa cambia. El viernes a las 16:36 se publica la tasa
del lunes; hasta el lunes por la tarde no hay ningún cambio más. Resultado: desde
el viernes por la noche hasta el lunes por la tarde —tres días de cada semana— la
plataforma marcaba `official_stale=true` sobre una tasa perfectamente vigente.

No era cosmético. Con la bandera encendida el motor **suprime la atribución** de
la brecha (ADR-0021: con una tasa vencida, decir quién la movió sería afirmar de
más). Así que la tarjeta de descomposición se quedaba sin sus piernas todos los
fines de semana, por una degradación que no correspondía a ningún hecho. Y la
app se contradecía a sí misma en la misma pantalla: «vigente 2026-08-03» junto a
«más de 6 h sin actualizarse».

Se consideró y **descartó** derivar la vigencia con un calendario de días
hábiles: el 24/07/2026 fue feriado y ningún calendario derivable lo acierta. Los
feriados venezolanos no son una función del almanaque. La fecha-valor que publica
el propio emisor es el único dato fiable.

## Decisión

**Una tasa oficial está vigente mientras su `value_date` no haya pasado.**

```python
def oficial_rancia(fecha_valor: date | None, ahora: datetime) -> bool:
    if fecha_valor is None:
        return True                       # sin tasa: nunca se asume vigencia
    return fecha_valor < ahora.astimezone(VET).date()
```

Consecuencias de la regla, punto por punto:

1. **El día es el de Caracas** (`VET`, UTC−4 fijo — Venezuela no aplica horario
   de verano). La tasa rige jornadas bancarias venezolanas; entre las 20:00 y las
   24:00 VET el día UTC ya avanzó y usar UTC adelantaría el vencimiento medio día.
2. **`stale` deja de ser una antigüedad**, así que `STALE_THRESHOLD_HOURS`
   desaparece del motor y del gateway. No queda como config muerta.
3. **Rancia pasa a significar algo**: el BCV no publicó la tasa de hoy. Antes se
   encendía cada fin de semana y por tanto no informaba de nada.
4. El motor gana **una lectura fuera de `indicators`**: `SELECT value_date FROM
   official_rates` (solo esa columna, solo lectura). Es inevitable —el indicador
   `official_rate` guarda cuándo cambió la tasa, no para qué día rige— y se
   filtra por `status = 'valid'`, para que una tasa retenida por variación
   sospechosa (T1, ADR-0007) no pase por vigencia.
5. **La regla se duplica en motor y gateway** (`domain/vigencia.py` en cada uno).
   Los servicios no comparten código porque se despliegan por separado; la
   alternativa era que el REST dijera «vigente» de la misma tasa que el análisis
   marca rancia. La regla es de una línea.
6. La vigencia se juzga **en el instante del dato que se procesa**
   (`snap.capturado_en`), no contra el reloj: un reproceso tardío no debe
   reescribir la historia con el día de hoy.

## Alcance transversal

| Dónde | Antes | Ahora |
|---|---|---|
| `indicator-engine` · `process_official_rate` | `reloj() − capturada_en > 6 h` | `oficial_rancia(tasa.fecha_valor, reloj())` |
| `indicator-engine` · `process_p2p_snapshot` | `capturado_en − oficial.as_of > 6 h` | `oficial_rancia(fecha_valor_oficial(), capturado_en)` |
| `api-gateway` · `GET /rates/official` | `now − captured_at > 6 h` | `oficial_rancia(value_date, now)` |
| `api-gateway` · `GET /indicators` | `now − captured_at > 6 h` | `oficial_rancia(value_date, now)` |
| `web-spa` | «más de 6 h sin actualizarse» | «sin tasa para hoy» |
| `ingestor-bcv` | *(sin cambio)* | su `stale_since` cuenta fallos de parseo — otra cosa |

El contrato **no cambia**: `stale` y `official_stale` siguen siendo booleanos con
el mismo nombre y el mismo sitio. Cambia cuándo son `true`, así que no hay orden
de despliegue que respetar entre gateway y motor (a diferencia de ADR-0021).

## Consecuencias

**A favor**

- La degradación vuelve a informar: `official_stale=true` significa que el BCV no
  publicó, que es exactamente el caso que merece señalarse.
- La atribución de la brecha deja de suprimirse los fines de semana.
- Desaparece la contradicción en pantalla entre «vigente 03/08» y «rancia».
- Sin calendario de feriados que mantener.

**En contra / riesgos**

- Si el ingestor muere justo después de capturar una fecha-valor futura, la
  plataforma la dará por vigente hasta que esa fecha pase (como mucho, hasta el
  siguiente día hábil). Se acepta: durante ese tramo **es** la tasa oficial
  vigente. La caída del ingestor es un problema de observabilidad del ingestor,
  no algo que deba disfrazarse de tasa rancia.
- La regla vive duplicada en dos servicios. Se acepta por el punto 5; un test en
  cada uno fija el mismo comportamiento con el mismo calendario real.

## Verificación

- `apps/indicator-engine/tests/unit/test_vigencia.py` — la regla con el
  calendario REAL de julio/agosto de 2026, **incluido el feriado del 24/07**, que
  es el caso que demuestra por qué no vale un calendario derivado.
- `test_process_official_rate.py::test_una_CAPTURA_VIEJA_con_fecha_valor_futura_NO_es_rancia`
  y `test_process_p2p_snapshot.py::test_la_brecha_del_finde_NO_marca_la_oficial_rancia`
  — el defecto, en el caso de uso completo.
- `apps/api-gateway/tests/unit/test_consultas.py` — las mismas dos direcciones
  sobre el REST, para que los dos servicios no puedan divergir en silencio.
- El adaptador en memoria del motor devuelve `None` por defecto (= rancia): un
  test que se olvide de declarar la vigencia ve el caso degradado, no uno cómodo.
