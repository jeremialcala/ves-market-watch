# ADR-0007: Máquina de estados de la tasa oficial (valid / suspect / stale)

- **Estado:** accepted (implementado en `apps/ingestor-bcv`, 2026-07-05)
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A08, A09, A10

## Contexto
Origina: PRD `docs/01-requirements/ingesta-bcv.md`, escenarios negativos 2 y 5, y amenaza
T1 del threat model. Una tasa capturada puede ser inválida (parse erróneo, valor
implausible) o quedar desactualizada (fuente caída). El sistema debe distinguir estos
estados sin publicar datos dudosos ni ocultar la degradación a los consumidores.

## Decisión
Modelar la tasa oficial con máquina de estados explícita:

```
capturada ──validación ok──> valid ──sin actualización > umbral (6 h)──> stale
    │
    └─fuera de rango (|Δ| > 20 % vs. última valid)──> suspect
                suspect ──aprobación humana──> valid
                suspect ──rechazo / timeout──> descartada (auditada)
```

- Solo tasas `valid` se publican como `official.rate.updated`.
- `suspect` requiere validación humana (HITL); nunca se auto-promueve. «Descartada»
  se materializa como estado terminal `rejected` en el esquema, por rechazo humano,
  timeout (TTL 24 h configurable, actor auditado `system:timeout`) o reemplazo por
  la aprobación de una sospecha más reciente.
- `stale` no es un estado de la tasa sino de la referencia vigente: se propaga como
  bandera `official_stale=true` en indicadores y respuestas de API (con `stale_since`).
- Toda transición se registra en log de auditoría (quién/qué/cuándo).
- Umbrales (20 %, 6 h, 3 fallos consecutivos → alerta) configurables y versionados.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Máquina de estados + HITL (elegida) | Integridad garantizada; degradación visible; auditable | Latencia humana ante saltos reales grandes de la tasa | Bajo |
| Publicar todo y filtrar aguas abajo | Sin latencia | Cada consumidor debe defenderse; tasa falsa entra al bus | Alto (A08) |
| Descartar silenciosamente valores anómalos | Simple | Saltos reales del mercado se pierden sin alerta; sin auditoría | Medio (A09, A10) |
| Bloqueo total hasta revisión de cada captura | Máxima integridad | Inoperable a 2 consultas/hora | Bajo pero impráctico |

## Consecuencias
- Positivas: T1 mitigada extremo a extremo; los consumidores siempre saben la calidad del dato.
- Negativas / deuda asumida: devaluaciones reales > 20 % esperan aprobación humana.
  Mecanismo de aprobación resuelto: CLI de operador
  (`python -m ingestor_bcv revalidar listar|aprobar|rechazar`, con nota y usuario
  auditables); un endpoint admin autenticado podrá sumarse cuando exista el api-gateway.
- Impacto en threat model: cierra el residual de T1 documentado en ADR-0006; añade superficie admin que debe autenticarse (A01, ver ADR-0012 — rol `operator` en Auth0).
