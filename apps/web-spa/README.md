# web-spa

Dashboard web de Criterio (React + Vite + TypeScript — ADR-0017): brecha
cambiaria, referencia P2P, microestructura, profundidad y señales en tiempo casi
real, autenticado contra Auth0 (Auth Code + PKCE) y alimentado por el api-gateway
(REST `/api/v1` + WSS `/ws/v1`).

Viste el **sistema de diseño Higerotech** con tema claro/oscuro e interfaz ES/EN
(ADR-0018).

## Qué hace
- **Login** vía Universal Login de Auth0 (cliente público, PKCE). Tokens SOLO en
  memoria del SDK + refresh rotation (controles T12); al recargar, el SDK
  re-autentica en silencio por iframe con la cookie de sesión SSO (sin login
  visible y sin tocar storage).
- **Dashboard en vivo**: tasa oficial multi-moneda (badge `stale`), referencia
  P2P de ambos lados (confianza `low` resaltada), brecha + spread como stat
  tile, microestructura, profundidad por bandas (small multiples buy/sell) y
  feed de señales con su evidencia completa (regla + insumos — T10).
- **Stream WSS** con reconexión (backoff + watchdog de ping), renovación
  proactiva del token a `exp − 60 s` y **reposición del estado por REST** en
  cada (re)conexión (el push es best-effort — ADR-0016).
- **Histórico** con gráficos (tasa oficial por fecha-valor; indicador canónico
  por bucket 5m/1h/1d), rango ≤ 90 días validado en cliente y paginación
  transparente con progreso y cancelación.
- **Análisis**: escenarios y riesgos del mercado. Son los **dos** bloques que
  siguen marcados **`demo · sin fuente`** — la regla de honestidad del dato
  también aplica al diseño (ADR-0018)—, y siguen porque hacerlos reales exigiría
  pronosticar. Los medidores dejaron de estarlo con ADR-0019 y la lectura del
  mercado con ADR-0021.
- **Idioma y tema**: selector ES/EN y claro/oscuro en la barra; ambos se
  recuerdan (preferencias de UI; los tokens siguen solo en memoria).
- **Intradía** (RF-7): parrilla con TODOS los indicadores del día operativo VET
  (UTC−4 fijo) agrupados por oficial / compra / venta / microestructura, cada uno
  con su sparkline del día y la **variación contra la apertura** (Δ abs y %),
  calculada con aritmética exacta sobre el string decimal.
- **Decimales como string exacto** de punta a punta: prohibido float para
  lógica (`src/lib/decimal.ts`); la única conversión es para coordenadas de
  gráfico, con el string original en tooltips.

## Ejecución

```bash
npm install
npm run dev                  # http://localhost:5173 (HMR; gateway en :8800 vía CORS)
npm test                     # check de tipos del contrato + suite con cobertura (≥80 % ramas)
npm run build                # dist/ estático
docker compose up -d --build web-spa   # (raíz) nginx en http://localhost:8080
```

Config pública en `src/config.ts` (overrides por `.env.local`, gitignored):
`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`,
`VITE_API_BASE_URL`. **Jamás un secreto en una `VITE_*`** (se hornean en el
bundle); las credenciales del client M2M del e2e viven en el `.env` de la raíz.
Regla del monorepo: ningún archivo aquí se llama `config.json` (el `.gitignore`
raíz lo ignoraría en silencio).

## Estructura
```
src/
  auth/          # Auth0Provider (memory + rotation), guard, puente de tokens
  api/           # types.gen.ts (GENERADO del openapi.yaml — commiteado),
                 # cliente openapi-fetch, endpoints tipados, RFC 7807
  ws/            # StreamClient singleton + políticas puras + useStream (guard HMR)
  state/         # marketStore (useSyncExternalStore) + reducers puros + resync
  ds/            # sistema de diseño Higerotech: tokens, fuentes, componentes
  i18n/          # diccionario ES/EN tipado + proveedor
  theme/         # claro/oscuro por data-theme (ADR-0018)
  lib/           # decimal.ts (strings exactos + aritmética BigInt), freshness.ts,
                 # intradia.ts (día operativo VET), series.ts (sparkline y calor)
  components/    # paneles del dashboard y sello de bloque sin fuente
  views/         # Dashboard · Analysis · History · Intraday
tests/           # unit / component / contract / e2e (ver npm test)
docs/design.md   # diseño con cabecera AI-DLC
```

Contrato: `npm run generate:api` regenera `src/api/types.gen.ts` desde
`../api-gateway/docs/openapi.yaml`; `npm test` falla si está desactualizado.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/web-spa-dashboard.md`
- ADR-0017 (este producto) · ADR-0012 (auth) · ADR-0016 (semántica del push)
- Amenazas T12 (tokens en el browser — implementación aquí), T15 (CORS) en
  `../../docs/02-design/threat-model.md`

## Desarrollo con login sin fricción (ADR-0020)
El flujo bueno va por los túneles de Cloudflare
(`criterio-dev.higerotech.com`), no por `localhost:8080`: solo un host HTTPS
bajo `higerotech.com` es «verificable» para Auth0 (sin pantalla de
consentimiento) y comparte dominio registrable con `auth.higerotech.com` (cookie
SSO de primera parte, la sesión sobrevive al F5). En `localhost` el
consentimiento y la falta de persistencia son inevitables — es correcto, no un
fallo. Los hosts se configuran con `VITE_API_BASE_URL`, `VITE_AUTH0_DOMAIN` y
`ALLOWED_ORIGINS` en el `.env` de la raíz.

## Pendiente
- Topología de despliegue real: los túneles son de desarrollo (ADR-0020).
- Multi-pestaña: elección de líder (BroadcastChannel) para no agotar las 5
  conexiones WSS por usuario.
- Code-splitting de la vista Histórico (Recharts pesa en el bundle).
