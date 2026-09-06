# ADR-0026: Las páginas del top-K se piden en paralelo, en lotes acotados

- **Estado:** accepted
- **Fecha:** 2026-09-06
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Enmienda a:** ADR-0005 (estrategia de ingesta del mercado P2P de Binance)
- **Controles OWASP afectados:** A10 (T7, baneo por patrón de tráfico)

## Contexto

El PRD de ingesta declara `latencia consulta→evento publicado ≤ 5 s (p95)`. El
2026-09-06 se midió **por primera vez** sobre 4.342 capturas reales en 41 h de
log, y se incumple:

| serie | n | p50 | **p95** | max |
|---|---:|---:|---:|---:|
| BUY | 2.171 | 3,31 s | 7,41 s | 51,77 s |
| SELL | 2.171 | 2,98 s | 5,89 s | 56,46 s |
| **agregado** | **4.342** | 3,15 s | **7,16 s** | — |

**El 34,6 % de las capturas supera los 5 s.** La causa no es el procesamiento
—normalizar, persistir y publicar son milisegundos— sino la captura: con
`TOP_K=200` y `ROWS_PER_PAGE=20` son **10 peticiones HTTP secuenciales por
lado**, y la latencia total es la de Binance multiplicada por diez.

**El SLO y ADR-0005 se escribieron sin mirarse.** El SLO viene del PRD de
ingesta; ADR-0005 decidió después el «polling educado». Como estaban
configurados, eran incompatibles: ninguna de las dos partes estaba mal, pero
juntas no se podían cumplir.

## Decisión

Las páginas del top-K se piden **en lotes concurrentes** de tamaño acotado, por
defecto **4** (`PAGINAS_EN_PARALELO`). Se descartó pedir las diez a la vez.

**Lo que NO cambia, y es lo que hace admisible la enmienda:**

- **Las peticiones por minuto son idénticas.** Siguen siendo 10 por lado y
  ciclo, un ciclo cada 60 s, 20 en total contra un presupuesto de 40/min. Cada
  página consume su unidad del `PresupuestoDeRequests` —la ventana deslizante de
  60 s que ADR-0005 nombra— exactamente igual que antes. **Paralelizar no es
  pedir más: es pedir lo mismo más junto.**
- El User-Agent identificable, el backoff con jitter ante 429/5xx, el circuit
  breaker y el tope de bytes por respuesta siguen intactos.
- No se rota IP ni se evade ningún límite. Ante señales de bloqueo se retrocede.

**Lo que sí cambia:**

- **El pico instantáneo.** Cuatro peticiones simultáneas son un patrón más
  agresivo que cuatro espaciadas, y ese es el vector de T7. Es la razón de que
  el lote sea 4 y no 10: con 4 la latencia baja lo suficiente para cumplir el
  SLO y la ráfaga sigue siendo modesta. **Diez habría sido optimizar el número
  en vez de decidir.**
- **La salida temprana se evalúa al cerrar el lote**, no en cada página. En un
  mercado fino eso gasta hasta 3 peticiones de más por lado. Con 20 unidades
  libres de presupuesto por ciclo, cabe.

## Alternativas consideradas

| Opción | Efecto en el SLO | Efecto en T7 | Por qué no |
|---|---|---|---|
| **Lotes de 4 (elegida)** | ~1/3 de la latencia | pico ×4 | — |
| Las 10 páginas a la vez | ~1/10 | pico ×10 | Gana margen que el SLO no necesita a cambio del riesgo que ADR-0005 quiso evitar |
| Subir `ROWS_PER_PAGE` | menos peticiones | pico igual | Respuestas más grandes contra el tope de bytes; y el tamaño de página no está documentado, es un endpoint no oficial |
| Relajar el SLO a ~8 s | trivial | ninguno | Legítimo, pero el SLO existe porque el dato envejece: la brecha se mueve y un snapshot de hace 8 s ya no describe el mercado. Se descarta por producto, no por técnica |
| Bajar `TOP_K` a 100 | ~1/2 | ninguno | Pierde profundidad de libro, que es justo lo que da valor a la microestructura (ADR-0014) |

## Consecuencias

- **Positivas:** el SLO pasa a ser alcanzable sin tocar la cadencia ni el
  presupuesto. La medición queda reproducible con `scripts/medir_slo_ingesta.py`.
- **Negativas / deuda asumida:** el pico de tráfico sube ×4 y **T7 se hace algo
  más probable sin que su mitigación cambie**. Si Binance empieza a devolver 429
  con frecuencia, la señal aparecerá en el backoff y en el breaker; la respuesta
  correcta entonces es **bajar `PAGINAS_EN_PARALELO`, no subirlo ni rotar IP**.
- **Vigilancia explícita:** revisar la tasa de 429 y de aperturas del breaker en
  los primeros días. Si el breaker abre más que antes, esta ADR se revierte.
- **Impacto en threat model:** T7 conserva sus controles; cambia su probabilidad,
  no su tratamiento.

## Verificación

`tests/integration/test_client_paralelo.py` fija lo que la paralelización tiene
que conservar, que importa más que la ganancia: **el presupuesto se consume
igual** (una unidad por página), **el orden por página se mantiene** —la lista
viene ordenada por precio y el VWAP depende de ello; un cambio a `as_completed`
lo rompería en silencio—, la salida temprana sigue cortando, y los errores de
schema y tope de bytes se siguen propagando en vez de quedar tragados por
`gather(return_exceptions=True)`. Un test comprueba además que el pico de
concurrencia es **exactamente 4**: ni 1 (no paralelizaría) ni 8 (la cota estaría
rota).
