# PRD — Ingesta Tasa Oficial BCV (VES/USD)

- **Fase AI-DLC:** 01-requirements
- **Estado:** review

## Problema y contexto
La referencia oficial de cambio la publica el Banco Central de Venezuela en su sitio web.
Se necesita mantenerla sincronizada (2 consultas/hora) para calcular la brecha frente al
mercado P2P.

## Objetivos / No-objetivos
- Objetivos: obtener valor USD (y fecha-valor) del sitio del BCV, validar, publicar evento
  `official.rate.updated` solo cuando cambie, persistir histórico completo.
- No-objetivos: otras monedas del BCV en fase inicial (EUR, CNY…) — extensible después.

## Usuarios y escenarios
Usuario directo: motor de indicadores.

### Escenarios positivos
1. Cada 30 min el ingestor consulta el sitio del BCV, extrae la tasa USD y su fecha-valor.
2. Si el valor difiere del último persistido, publica `official.rate.updated`.
3. Si no difiere, registra heartbeat sin publicar evento.

### Escenarios negativos / abuso (requerido por Gate 0)
1. **Cambio de estructura HTML**: el parser no encuentra el valor → alerta tras 3 fallos
   consecutivos; se mantiene la última tasa válida marcada como `stale` (A10).
2. **Valor fuera de rango plausible**: variación > X % (configurable, inicial 20 %) contra
   la última tasa → se retiene, se marca `suspect` y requiere validación antes de publicar
   (integridad de datos, A08).
3. **Certificado TLS inválido del sitio BCV** (problema histórico conocido): NO se
   deshabilita la verificación global; se ancla el certificado/CA esperado de forma
   explícita y auditada (ADR-0006) (A04).
4. **Suplantación / DNS poisoning del dominio BCV**: pinning + validación de rango del
   valor mitigan la inyección de una tasa falsa (A08).
5. **Bloqueo del sitio o caída prolongada**: la plataforma sirve la última tasa con
   marca `stale_since`; los indicadores que dependen de ella lo reflejan (A10).

## Requisitos funcionales
- RF-1: Consulta programada 2×/hora con horario configurable.
- RF-2: Extracción robusta (selector + fallback regex) del valor USD y fecha-valor.
- RF-3: Validación de rango y formato antes de publicar.
- RF-4: Evento `official.rate.updated` solo en cambio de valor o fecha-valor.
- RF-5: Persistencia histórica completa (tasa, fecha-valor, timestamp de captura, fuente).

## Requisitos de seguridad (mapeados a OWASP ASVS)
| Req | ASVS | Nivel | OWASP Top 10 |
|---|---|---|---|
| TLS con anclaje explícito de certificado/CA del BCV (sin desactivar verificación) | V9.1 | L2 | A04 |
| Validación de rango y formato de la tasa antes de publicar | V5.1 | L1 | A08, A10 |
| Alerta y estado `stale` ante fallos consecutivos | V16 | L1 | A09, A10 |
| Secretos del bus desde secret store | V6/V14 | L1 | A02 |
| Registro auditable de cada tasa capturada (quién/cuándo/fuente) | V16 | L1 | A09 |

## Métricas de éxito
- Desfase publicación BCV → plataforma ≤ 30 min.
- 0 tasas inválidas publicadas.
- Histórico 100 % de días hábiles cubiertos.

## Dependencias y riesgos
- Depende de: RabbitMQ, TimescaleDB.
- Riesgos: fragilidad del scraping; disponibilidad del sitio BCV (ver ADR-0006).
