# ADR-0023: Las piernas de la brecha se publican siempre, la atribución no

- **Estado:** accepted
- **Fecha:** 2026-08-02
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Enmienda a:** ADR-0021 (lectura del estado de mercado) — las dos deltas
  dejan de viajar dentro del claim `atribucion`
- **Controles OWASP afectados:** A05 (honestidad de la presentación)

## Contexto

ADR-0021 publica la atribución del movimiento de la brecha como un claim:

```python
Afirmacion(CLAIM_ATRIBUCION, {"responsable": …, "paralelo": …, "oficial": …})
```

y se calla —correctamente— cuando la brecha no se movió o la tasa oficial no
está vigente: decir *quién* la movió sería afirmar de más.

El problema es que **las tres cosas viajaban juntas**. Al callarse el claim
desaparecían también `paralelo` y `oficial`, que no son afirmaciones sino
mediciones: el motor las calcula en `_medir_variaciones` en **cada revisión**,
tenga o no algo que atribuir.

El efecto en pantalla, medido: la tarjeta de descomposición se quedaba con
**160 px vacíos** siempre que el mercado estaba quieto — que es justo cuando el
usuario mira para comprobar que no está pasando nada. Y el mismo hueco aparecía
todos los fines de semana mientras la rancidez estuvo mal medida (ADR-0022).

## Decisión

**Publicar `gap_legs` siempre que alguna pierna sea medible, con `responsible`
como campo aparte que puede ser `null`.**

```jsonc
"gap_legs": {
  "hours": 6,
  "official": "0",          // 0 = no se movió (dato); null = no medible
  "parallel": "-0.40250000",
  "responsible": null       // solo cuando se puede sostener
}
```

Cinco consecuencias que la definen:

1. **Deltas = hechos, responsable = afirmación.** La honestidad de ADR-0021 se
   conserva exactamente donde tenía sentido: en quién movió la brecha. Las
   deltas no dejan de ser ciertas porque el movimiento sea pequeño.
2. **`0` y `null` no se colapsan.** `0` significa que la pierna no se movió —el
   BCV publica por tramos y una meseta es dato—; `null`, que no había punto
   histórico con el que comparar. Confundirlos haría que un hueco de captura se
   leyera como una meseta real.
3. **El neto NO viaja.** `Δbrecha = Δparalelo − Δoficial` es una identidad, y el
   consumidor la deriva con aritmética exacta. Publicar una tercera cifra medida
   aparte abriría la puerta a que las tres no cuadren en la misma pantalla.
4. **En VES absolutos**, la única unidad donde esa identidad se cumple; en
   puntos porcentuales las dos piernas no suman la brecha.
5. **Una pierna nula no enmudece a la otra.** Solo se omite `gap_legs` entero
   cuando ninguna de las dos es medible.

## Despliegue

`payload.additionalProperties` es `false`, así que **el gateway va primero**: es
la misma trampa que ADR-0021 documentó en su punto 4 y que ya costó una vez que
el gateway descartara todos los `analysis.updated`. Orden aplicado y verificado:
gateway → motor → SPA, con cero descartes en el log.

## Consecuencias

**A favor**

- La tarjeta deja de vaciarse con el mercado quieto; el hueco medido pasó de
  160 px a 27 (el padding).
- El SPA deja de depender de un claim de prosa para pintar cifras.

**En contra / riesgos**

- Un campo más en un contrato ya grande. Se acepta: es aditivo y opcional, y el
  cliente que no lo lea se comporta igual que antes.
- La ventana (`hours`) se duplica con la del claim `brecha`. Salen del mismo
  `Variaciones` y de una sola `ventana_horas` de config, así que no pueden
  discrepar; hay un test que lo fija.

## Verificación

- `tests/unit/test_lectura.py` — las piernas con brecha estable y con oficial
  rancia (los dos casos que antes las borraban), la identidad, la pierna nula
  que no enmudece a la otra y la ventana compartida con el claim `brecha`.
- `tests/contract/test_analysis_event_schema.py` — `responsible: null` válido,
  `null` ≠ `"0"`, aditividad (el evento sin el campo sigue valiendo) y rechazo
  de un responsable fuera del enum.
- `tests/component/descomposicion.test.tsx` — la fila sin atribución, «—» para
  la pierna no medible, y la identidad cuadrando en pantalla.
- En vivo: `gap_legs` presente en el análisis persistido con `responsible: null`
  y `parallel: -0.4025`, sin descartes en el gateway.
