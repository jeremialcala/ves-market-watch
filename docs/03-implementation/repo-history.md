# Historial de implementación — Criterio

* **Estado:** review (documentación viva — regenerada por script, no editar a mano)
* **Fecha:** 2026-10-15
* **Decisores:** Jeremi Alcalá
* **Fase AI-DLC:** 03-implementation
* **Versión:** 0.6.0
* **Gate:** 2
* **Rama principal:** main
* **Estrategia de branching:** GitFlow (main + develop + ramas feature)

## Historial del repositorio (documentación viva)

Derivado de `git log` con `scripts/gitgraph_branches.py`
(ramas vivas: `main`, `develop`). Regenerar tras cada commit,
merge o tag relevante. Los tags SemVer enlazan con las versiones del `CHANGELOG.md`.

> Nota: historia entrelazada u octopus — el gitGraph es aproximado; la bitácora es la fuente de verdad.

### Grafo de commits y ramas

```mermaid
gitGraph
    commit id: "b34c3af" tag: "v0.1.0"
    commit id: "6c42e58"
    commit id: "bd9698b"
    branch develop
    commit id: "9ad366f"
    commit id: "5ad050e"
    commit id: "f8922b6"
    commit id: "424dd26"
    commit id: "0775c6b"
    commit id: "b3f9786"
    commit id: "5e18ca8"
    commit id: "2413423"
    commit id: "a02f580"
    commit id: "3dfba24"
    commit id: "f980ff5"
    commit id: "ac47922"
    commit id: "b14c8f7" tag: "v0.2.0"
    commit id: "92a9e3d"
    commit id: "31289f5"
    commit id: "fefef5c"
    commit id: "2349425"
    commit id: "2b58b0b"
    commit id: "8501a04"
    commit id: "da3719a" type: HIGHLIGHT
    commit id: "b251d46"
    commit id: "cee9891"
    commit id: "83cffde" type: HIGHLIGHT
    commit id: "8658d68"
    commit id: "e7aac30"
    commit id: "f8a159f"
    commit id: "ed42b13"
    commit id: "11da932"
    commit id: "1d6eb1b"
    commit id: "fb5db08"
    commit id: "002a6af"
    commit id: "8f9178e"
    commit id: "949e87d"
    commit id: "ec6c272"
    checkout main
    merge develop tag: "v0.3.0"
    checkout develop
    commit id: "d943a62"
    commit id: "75e6c3f"
    checkout main
    merge develop tag: "v0.3.1"
    checkout develop
    commit id: "2d4a1f2"
    commit id: "9b6d94e"
    commit id: "f5a7215"
    commit id: "0d80bd6"
    checkout main
    merge develop tag: "v0.4.0"
    checkout develop
    commit id: "b29be3b"
    checkout main
    merge develop
    checkout develop
    commit id: "38abe5e"
    commit id: "a230666"
    commit id: "10b3cb5"
    commit id: "95354e3"
    commit id: "792beae"
    commit id: "12def0b"
    commit id: "4578db2"
    commit id: "3622623"
    commit id: "8f30547"
    commit id: "22a7c7a"
    commit id: "5ed6042"
    commit id: "c852844"
    commit id: "aed25fa"
    commit id: "7ac255a"
    commit id: "f7280f1"
    commit id: "f074aab"
    commit id: "47d1286"
    commit id: "798b83b"
    commit id: "75bd24e"
    commit id: "f525868"
    commit id: "f50f890"
    commit id: "f307d18"
    commit id: "8978022"
    commit id: "b4ca2c5"
    commit id: "657184e"
    commit id: "af3a347"
    commit id: "3b440a4"
    commit id: "c543b08"
    commit id: "7471953"
    commit id: "28a1d5d"
    commit id: "df2c185"
    commit id: "ee29078"
    commit id: "219945f"
    commit id: "95dbde8"
    commit id: "04eab58"
    commit id: "dfb061e"
    commit id: "6b07555"
    commit id: "0d2ecd9"
    commit id: "027f056"
    commit id: "2a70922"
    commit id: "6c362a5"
    commit id: "149e8b3"
    commit id: "078d7f7"
    commit id: "4989144"
    commit id: "f9ca6cf"
    commit id: "e759414"
    commit id: "a0c26d3"
    commit id: "5720bf4"
    commit id: "df1c2a8"
    commit id: "2de8b70"
    commit id: "d1682ac"
    commit id: "6190faa"
    commit id: "d601b39"
    commit id: "85c492a"
    commit id: "31eb62b"
    commit id: "a8b8c02"
    commit id: "603705d"
    commit id: "4a2a69e"
    commit id: "592e4b5"
    commit id: "bf7aa01"
    commit id: "e0f5f8b"
    commit id: "1383830"
    commit id: "abef31d"
    commit id: "25cd440"
    commit id: "28c75b9"
    commit id: "0b42533"
    commit id: "9934d12"
    commit id: "166c528"
    commit id: "b533588"
    commit id: "8023c36"
    commit id: "6aab1bf"
    commit id: "c4f2630"
    commit id: "172f794"
    commit id: "7d0d712"
    commit id: "e7accd4"
    commit id: "ee39077"
    commit id: "98ea475"
    commit id: "b3d95fc"
    commit id: "534afa1"
    commit id: "be00558"
    commit id: "f0961fd"
    commit id: "b8b625a"
    commit id: "90d9100"
    commit id: "43f00b6"
    commit id: "ce5560b"
    commit id: "8549165"
    commit id: "834d032"
    commit id: "2a4fbef"
    commit id: "c742332"
    commit id: "5c61be8"
    commit id: "10349eb"
    commit id: "cc95ab2"
    commit id: "9e508aa"
    commit id: "c5a2660"
    commit id: "8ca8db5"
    commit id: "b15e29d"
    commit id: "3a358cf"
    commit id: "e4b3604"
    commit id: "84dd5c0"
    commit id: "a9ea4a1"
    commit id: "b59b673"
    commit id: "5581471"
    commit id: "c293b1d"
    commit id: "f8faa89"
    commit id: "c7a2b32"
    commit id: "f508c30"
    commit id: "5207199"
    commit id: "1b7b272"
    commit id: "dcb268c"
    commit id: "960a01f"
    commit id: "8b15755"
    commit id: "536f7c8"
    commit id: "d4d05c7"
    commit id: "58324b4"
    commit id: "4c568cc"
    commit id: "bd690bc"
    commit id: "14b7282"
    commit id: "4039c07"
    commit id: "bc638ce"
    commit id: "a0890ae"
    commit id: "2031daa"
    commit id: "e19af34"
    commit id: "8c6ca8e"
    commit id: "c636de0"
    commit id: "4fbada0"
    commit id: "e1f378c"
    commit id: "6deea55"
    commit id: "86acb1c"
    commit id: "7f89626"
    commit id: "9524c44"
    commit id: "1ba92bb"
    commit id: "dd65cfc"
    commit id: "7ea0705"
    commit id: "80b2d50"
    commit id: "3e71f14"
    commit id: "7f40d03"
    commit id: "8335285"
    commit id: "976a54f"
    commit id: "2ee76c7"
    commit id: "4aeadaa"
    commit id: "3859349"
    commit id: "74c55b5"
    commit id: "af51136"
    commit id: "e0b1a95"
    commit id: "ee5e8c1"
    commit id: "0856c5c"
    commit id: "c4149ce"
    commit id: "b1bfa63"
    commit id: "f508921"
    commit id: "8e3baf5"
    commit id: "9445199"
    commit id: "a98cf7f"
    commit id: "ed9f843" type: HIGHLIGHT
    commit id: "3b6407a"
    commit id: "7f5ac52"
    commit id: "e5d3069"
    commit id: "64ed29f"
    commit id: "1f20118"
    commit id: "59ddc5a" type: HIGHLIGHT
    commit id: "eb6fbfb" type: HIGHLIGHT
    commit id: "4917d03"
    commit id: "df2da0b" type: HIGHLIGHT
    commit id: "3be72cb"
    commit id: "4c25643"
    commit id: "0bb8be7"
    commit id: "8ef0624" type: HIGHLIGHT
    commit id: "ae49831"
    commit id: "39a3076"
    commit id: "3b68d49"
    commit id: "abd3c2a" type: HIGHLIGHT
    commit id: "819557c"
    commit id: "cf66855"
    commit id: "fc93042"
    commit id: "e215e3b"
    commit id: "c4b7b33" type: HIGHLIGHT
    commit id: "f19a490" type: HIGHLIGHT
    commit id: "9d639e3" type: HIGHLIGHT
    commit id: "60c7264"
    commit id: "f87805c"
    commit id: "854667a" type: HIGHLIGHT
    commit id: "62f012d"
    commit id: "6546c4a" type: HIGHLIGHT
    commit id: "d801dd1"
    commit id: "70af379"
    commit id: "244d69a" type: HIGHLIGHT
    commit id: "2de91a4"
    commit id: "795709b"
    commit id: "d0f9a92"
    commit id: "5a7d915" type: HIGHLIGHT
    commit id: "bccfe93"
    commit id: "91c5a2b"
    commit id: "a86d418" type: HIGHLIGHT
    commit id: "0e279f7"
    commit id: "f4ab6a5"
    commit id: "0105c59"
    commit id: "b45b108" type: HIGHLIGHT
    commit id: "3b49dde"
    commit id: "6151be5"
    commit id: "1d9ef92"
    commit id: "1a9301c" type: HIGHLIGHT
    commit id: "4cf9ef3"
    commit id: "7afd0ac" type: HIGHLIGHT
    commit id: "8abe2d9"
    commit id: "d6e97f0" type: HIGHLIGHT
    commit id: "ed10702"
    commit id: "4394deb"
    commit id: "5bab09d" type: HIGHLIGHT
    commit id: "a1c18ca" type: HIGHLIGHT
    commit id: "008825a"
    commit id: "79eed5b" type: HIGHLIGHT
    commit id: "810006e"
    commit id: "4b7a016" type: HIGHLIGHT
    commit id: "3924b55"
    commit id: "b19d826" type: HIGHLIGHT
    commit id: "f7fd145"
    commit id: "ef9bc26" type: HIGHLIGHT
    commit id: "fb6de9a"
    commit id: "1861191" type: HIGHLIGHT
    commit id: "ed223ae"
    commit id: "be0a296" type: HIGHLIGHT
    commit id: "179252d"
    commit id: "933b9cb" type: HIGHLIGHT
    commit id: "94a9738"
    commit id: "934dacc" type: HIGHLIGHT
    commit id: "be98c39"
    commit id: "37928b8" type: HIGHLIGHT
    commit id: "d1c6839"
    commit id: "b3ceefd"
    commit id: "c739524" type: HIGHLIGHT
    commit id: "01362d6"
    commit id: "5f8509c" type: HIGHLIGHT
    commit id: "d9a0bcc"
    commit id: "2dfe2f6" type: HIGHLIGHT
    commit id: "d8c0755"
    commit id: "5c4d0fa"
    commit id: "ce02088" type: HIGHLIGHT
    commit id: "d63bbda" type: HIGHLIGHT
    commit id: "49aa798" type: HIGHLIGHT
    commit id: "3712289"
    commit id: "c685a1c" type: HIGHLIGHT
    commit id: "9c2a911"
    commit id: "69e847c" type: HIGHLIGHT
    commit id: "417efb5"
    commit id: "0fb1410" type: HIGHLIGHT
    commit id: "df714f6"
    commit id: "3fcf200" type: HIGHLIGHT
    commit id: "3fccd45"
    commit id: "54bd33c" type: HIGHLIGHT
    commit id: "b6be6df"
    commit id: "7372248" type: HIGHLIGHT
    commit id: "0f03023"
    commit id: "3511047" type: HIGHLIGHT
    commit id: "d50f23c"
    commit id: "c1b7627" type: HIGHLIGHT
    commit id: "698e808"
    commit id: "78cb283"
    commit id: "5c38c0a"
    commit id: "860c67c" type: HIGHLIGHT
    commit id: "c7e5c36"
    commit id: "109ccfb"
    commit id: "ef04e46"
    commit id: "23ce20d"
    checkout main
    merge develop tag: "v0.5.0"
    checkout develop
    commit id: "82ac974"
    commit id: "bd60a12"
    commit id: "d9f2709" type: HIGHLIGHT
    commit id: "f99af22"
    commit id: "e16018a"
    commit id: "1120f9f"
    commit id: "32ee6dd" type: HIGHLIGHT
    commit id: "2d3c697" type: HIGHLIGHT
    commit id: "7f6b5b6" type: HIGHLIGHT
    commit id: "3ce4697"
    commit id: "a51b2f6" type: HIGHLIGHT
    checkout main
    merge develop
    checkout develop
    commit id: "3be6a2b"
    commit id: "3a822aa"
    commit id: "ba16f6f" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.1"
    checkout develop
    commit id: "73a1136"
    commit id: "bb81ef4" type: HIGHLIGHT
    commit id: "f993162"
    commit id: "1780857"
    commit id: "0a789d8" type: HIGHLIGHT
    commit id: "cb2f97e" type: HIGHLIGHT
    commit id: "df82c18"
    commit id: "1e4b5c4"
    commit id: "176c742"
    commit id: "1b8c953"
    commit id: "3907045" type: HIGHLIGHT
    commit id: "0bd5e2c" type: HIGHLIGHT
    commit id: "6288c9b" type: HIGHLIGHT
    commit id: "c2ff3b2" type: HIGHLIGHT
    commit id: "1678164"
    commit id: "49dc15c"
    commit id: "b11fb26"
    commit id: "e95c433"
    commit id: "5732fb5"
    commit id: "2d08952"
    commit id: "d0c046c"
    commit id: "e72130a" type: HIGHLIGHT
    commit id: "a7d551a" type: HIGHLIGHT
    commit id: "42b43b3" type: HIGHLIGHT
    commit id: "09646bb"
    commit id: "ed18c5c"
    commit id: "2c9fbff" type: HIGHLIGHT
    commit id: "b77f0f5"
    commit id: "f3343ea" type: HIGHLIGHT
    commit id: "d309671"
    commit id: "b29edd8" type: HIGHLIGHT
    commit id: "bef34f6"
    commit id: "ade8c3f"
    commit id: "1e1f53d"
    commit id: "e4a8e00" type: HIGHLIGHT
    commit id: "b8967b0"
    commit id: "22d61f1" type: HIGHLIGHT
    commit id: "a9ec842"
    commit id: "4a364fa" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.2"
    checkout develop
    commit id: "9e8fd85"
    commit id: "2ae9d21"
    commit id: "8a5039a" type: HIGHLIGHT
    commit id: "3e46bf1"
    commit id: "28f8114" type: HIGHLIGHT
    commit id: "ea0e402"
    commit id: "162ff4f" type: HIGHLIGHT
    commit id: "9b9e3b3"
    commit id: "610cea8" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.3"
    checkout develop
    commit id: "85ee7b4"
    commit id: "8aa55a9" type: HIGHLIGHT
    commit id: "82f450e"
    commit id: "f59ba58" type: HIGHLIGHT
    commit id: "2b54b00"
    commit id: "9b76a37" type: HIGHLIGHT
    commit id: "99bf679"
    commit id: "8619a5c" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.4"
    checkout develop
    commit id: "27f9de3"
    commit id: "533c51e" type: HIGHLIGHT
    commit id: "c8117ba"
    commit id: "46eb537" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.5"
    checkout develop
    commit id: "f1c4c04"
    commit id: "4580818" type: HIGHLIGHT
    commit id: "56789d7"
    commit id: "3f9a172" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.5.6"
    checkout develop
    commit id: "d46d66a"
    commit id: "1170959" type: HIGHLIGHT
    commit id: "edc1b1c"
    commit id: "ff28e29"
    commit id: "fd2035c"
    commit id: "57489bc"
    commit id: "4bd7d5d" type: HIGHLIGHT
    commit id: "275037d"
    commit id: "b3c0c6c" type: HIGHLIGHT
    commit id: "06141a5" type: HIGHLIGHT
    commit id: "7fa7ac0"
    commit id: "9619fa5" type: HIGHLIGHT
    commit id: "16e518f" type: HIGHLIGHT
    commit id: "da246b7" type: HIGHLIGHT
    commit id: "bb6dee3" type: HIGHLIGHT
    commit id: "1a3e355"
    commit id: "d41e571" type: HIGHLIGHT
    checkout main
    merge develop tag: "v0.6.0"
    checkout develop
    commit id: "05707d8"
    commit id: "4f23f80"
    commit id: "01b98ee" type: HIGHLIGHT
```

### Estado actual de las ramas

| Rama | Punta | Fecha | Commits en su lane |
|---|---|---|---|
| `main` | `3dc972a` | 2026-10-14 | 16 |
| `develop` | `01b98ee` | 2026-10-15 | 401 |

### Trazabilidad tag ↔ versión ↔ decisión

| Tag | Commit | Fecha | Versión CHANGELOG | ADR / feature | Nota |
|---|---|---|---|---|---|
| v0.1.0 | `b34c3af` | 2026-07-05 | 0.1.0 | ADR-0001…0006; 4 PRDs; threat model v1 | Línea base documental (Gates 0 y 1 en borrador). Sin código ejecutable |
| v0.2.0 | `b14c8f7` | 2026-07-11 | 0.2.0 | Gates 0 y 1 cerrados (HITL); ADR-0007…0012; ingestor-bcv, indicator-engine fase 1, ingestor-binance | Tres servicios implementados y verificados en vivo |
| v0.3.0 | `2ec16da` | 2026-07-26 | 0.3.0 | ADR-0013…0015; ingestor-historico; engine fase 2 (microestructura P2P) + motor de señales RF-4/RF-5; OpenAPI del gateway | Cierre funcional del pipeline de datos; api-gateway aún sin código |
| v0.3.1 | `461d4dc` | 2026-07-26 | 0.3.1 | Barrido de coherencia documental post-0.3.0; threat model T13/T14; trazabilidad tag↔ADR restaurada; design.md del ingestor-historico | Patch solo de docs, sin cambios funcionales |
| v0.4.0 | `779231f` | 2026-07-26 | 0.4.0 | ADR-0016; api-gateway implementado (REST /api/v1 + WSS /ws/v1, Resource Server Auth0, 78 tests); AsyncAPI del WSS; OpenAPI ajustada | Los 5 servicios con código; pipeline completo fuente → bus → REST/WSS operativo. Pendiente HITL: SPA + client M2M de prueba |
| v0.5.0 | `d12a351` | 2026-09-07 | 0.5.0 | ADR-0025/0026; riesgos y análisis como dato servido; SLOs medidos; T8 cerrada (lockfiles con hashes + imágenes por digest) | Gates 2 y 3 aprobados HITL (2026-09-08): cierran 03-implementation y 04-testing. Sin bloques `demo · sin fuente` en el producto |
| v0.5.1 | `d585124` | 2026-09-21 | 0.5.1 | Avisos por ntfy del cron de seguridad (`seguridad.yml`) y del respaldo (`aviso.sh` + healthcheck `estado`); js-yaml 4.3.2 (GHSA-2883-xcg3-v3hh); caja de respaldo por digest e `init: true` | Patch de correcciones e instrumentación (2026-09-21): los dos procesos desatendidos ya avisan cuando fallan. Sin gate cerrado; Gate 4 (05-deployment) sin iniciar |
| v0.5.2 | `36e1a2e` | 2026-10-12 | 0.5.2 | ADR-0027 (respaldo en Backblaze B2, clave sin borrado); ADR-0028…0033 y threat model 0.5.0 (T16–T25) del portal público; `pyjwt` 2.15.1, `multidict` 6.9.1, `undici` 8.11.2, `brace-expansion` 2.1.7 y `source-map-js` 1.2.2 | Patch de mantenimiento (2026-10-12): el respaldo sale de Google Drive, `T8 · SCA` vuelve a verde en `main` y entra la fase 0 del portal público, solo documentación. Sin gate cerrado: el PRD del portal sigue en borrador |
| v0.5.3 | `2934219` | 2026-10-13 | 0.5.3 | ADR-0034 (el entorno de captura pasa a midgard por réplica física); `deploy/midgard/` con un proyecto compose por servicio; cinco workflows `build-<servicio>` sobre `publicar-imagen.yml` | Patch de despliegue (2026-10-13): la captura sale de la máquina de desarrollo sin perder un ciclo y los seis servicios quedan con despliegue continuo. Sin cambios de producto ni gate cerrado; no decide D15 |
| v0.5.4 | `88d7f9b` | 2026-10-13 | 0.5.4 | `respaldar agregados` excluye el crudo chunk a chunk y lo comprueba en el índice del volcado; `deploy/midgard/respaldo-nas/` (segunda copia, al NAS); avisos por ntfy de despliegues fallidos | Patch de respaldos (2026-10-13): el volcado mensual llevaba dentro los snapshots crudos que debía excluir. Primer despliegue automático por servicio (`ves-respaldo`). Sin cambios de producto ni gate cerrado |
| v0.5.5 | `5195cd7` | 2026-10-13 | 0.5.5 | `deploy/midgard/vigia/` (vigía de operación: contenedores y sondas de trabajo); `estado.sh` vigila la verificación semanal y los agregados mensuales, con pruebas; trabajo `scripts de operación` en CI | Patch de operación (2026-10-13): un servicio caído o parado avisa por ntfy en vez de descubrirse mirando. Sin cambios de producto ni gate cerrado |
| v0.5.6 | `3bdc738` | 2026-10-13 | 0.5.6 | `sondeo-externo.yml` (sondeo desde GitHub Actions del API y el panel públicos, por transiciones, con estado en la caché de Actions); `scripts/sondeo/` con 28 pruebas | Patch de operación (2026-10-13): un apagón de midgard se avisa desde fuera de la casa. El cron de GitHub resultó demasiado irregular y en 0.6.0 la alarma pasó al latido del vigía. Sin cambios de producto ni gate cerrado |
| v0.6.0 | `3dc972a` | 2026-10-14 | 0.6.0 | ADR-0028 (`/portal/v1`: IP real, cuota por IP, caché single-flight, `portal-openapi.yaml`) y ADR-0031 (workspace de npm, `packages/criterio-ui`, `apps/portal`); latido del vigía a Healthchecks.io | Minor (2026-10-14): primera lectura pública sin token y la landing del portal con datos reales, aún sin desplegar (falta Workers y D12). Sin gate cerrado |

### Bitácora de cambios (fiel al repo)

| Commit | Tipo | Tags | Autor | Fecha | Mensaje |
|---|---|---|---|---|---|
| `01b98ee` | merge | — | Jeremi J. Alcalá M. | 2026-10-15 | Merge pull request #87 from jeremialcala/portal-workers |
| `4f23f80` | commit | — | Jeremi Alcala | 2026-10-15 | docs(plan): número del PR del despliegue del portal |
| `05707d8` | commit | — | Jeremi Alcala | 2026-10-15 | feat(portal): desplegar en Cloudflare Workers en criterio.higerotech.com |
| `3dc972a` | merge | v0.6.0 | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #86 from jeremialcala/develop |
| `d41e571` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #85 from jeremialcala/release-0.6.0 |
| `1a3e355` | commit | — | Jeremi Alcala | 2026-10-14 | docs(changelog): cortar la versión 0.6.0 |
| `bb6dee3` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #84 from jeremialcala/portal-landing |
| `da246b7` | merge | — | Jeremi Alcala | 2026-10-14 | Merge remote-tracking branch 'origin/develop' into portal-landing |
| `16e518f` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #83 from jeremialcala/paquete-criterio-ui |
| `9619fa5` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #82 from jeremialcala/portal-snapshot |
| `7fa7ac0` | commit | — | Jeremi J. Alcalá M. | 2026-10-14 | Potential fix for pull request finding 'CodeQL / Statement has no effect' |
| `06141a5` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #81 from jeremialcala/ip-real-limitador |
| `b3c0c6c` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #80 from jeremialcala/workspace-npm |
| `275037d` | commit | — | Jeremi Alcala | 2026-10-14 | feat(portal): app del portal público con la landing en vivo |
| `4bd7d5d` | merge | — | Jeremi Alcala | 2026-10-14 | Merge portal-snapshot en portal-landing: el portal necesita el contrato /portal/v1 |
| `ff28e29` | commit | — | Jeremi Alcala | 2026-10-14 | feat(ui): paquete compartido @criterio/ui con el sistema de diseño, idioma y tema |
| `57489bc` | commit | — | Jeremi Alcala | 2026-10-14 | feat(gateway): snapshot y series públicos del portal en /portal/v1 |
| `fd2035c` | commit | — | Jeremi Alcala | 2026-10-14 | feat(gateway): IP real desde proxies de confianza y cuota por IP con poda |
| `edc1b1c` | commit | — | Jeremi Alcala | 2026-10-14 | build(npm): workspace de npm en la raíz, sin mover código |
| `22f247a` | merge | — | Jeremi Alcala | 2026-10-14 | Merge develop en portal-publico: al día con 0.5.6 y el latido del vigía |
| `1170959` | merge | — | Jeremi J. Alcalá M. | 2026-10-14 | Merge pull request #79 from jeremialcala/latido-vigia |
| `d46d66a` | commit | — | Jeremi Alcala | 2026-10-14 | feat(operacion): latido del vigía a Healthchecks.io |
| `3bdc738` | merge | v0.5.6 | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #78 from jeremialcala/develop |
| `3f9a172` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #77 from jeremialcala/release-0.5.6 |
| `56789d7` | commit | — | Jeremi Alcala | 2026-10-13 | docs(changelog): cortar la versión 0.5.6 |
| `4580818` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #76 from jeremialcala/sondeo-externo |
| `f1c4c04` | commit | — | Jeremi Alcala | 2026-10-13 | feat(operacion): sondeo externo desde GitHub Actions |
| `5195cd7` | merge | v0.5.5 | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #75 from jeremialcala/develop |
| `46eb537` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #74 from jeremialcala/release-0.5.5 |
| `c8117ba` | commit | — | Jeremi Alcala | 2026-10-13 | docs(changelog): cortar la versión 0.5.5 |
| `533c51e` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #73 from jeremialcala/salud-respaldo-y-vigia |
| `27f9de3` | commit | — | Jeremi Alcala | 2026-10-13 | feat(operacion): vigia de operacion en midgard y salud del respaldo completa |
| `88d7f9b` | merge | v0.5.4 | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #72 from jeremialcala/develop |
| `8619a5c` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #71 from jeremialcala/release-0.5.4 |
| `99bf679` | commit | — | Jeremi Alcala | 2026-10-13 | docs(changelog): cortar la versión 0.5.4 |
| `9b76a37` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #70 from jeremialcala/respaldo-nas |
| `2b54b00` | commit | — | Jeremi Alcala | 2026-10-13 | feat(respaldo): segunda copia diaria al NAS, independiente de la de B2 |
| `f59ba58` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #69 from jeremialcala/avisos-receptor-y-agregados |
| `82f450e` | commit | — | Jeremi Alcala | 2026-10-13 | fix(respaldo): el volcado de agregados llevaba dentro el crudo que debia excluir |
| `8aa55a9` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #68 from jeremialcala/cierre-t8-cd |
| `85ee7b4` | commit | — | Jeremi Alcala | 2026-10-13 | docs: cerrar el retroceso de T8 e historial tras el release 0.5.3 |
| `2934219` | merge | v0.5.3 | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #67 from jeremialcala/develop |
| `610cea8` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #66 from jeremialcala/release-0.5.3 |
| `9b9e3b3` | commit | — | Jeremi Alcala | 2026-10-13 | docs(changelog): cortar la versión 0.5.3 |
| `162ff4f` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #65 from jeremialcala/cd-cinco-imagenes |
| `ea0e402` | commit | — | Jeremi Alcala | 2026-10-13 | feat(cd): despliegue continuo para ingestores, motor, panel y respaldo |
| `28f8114` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #64 from jeremialcala/traslado-midgard |
| `8a5039a` | merge | — | Jeremi J. Alcalá M. | 2026-10-13 | Merge pull request #63 from jeremialcala/docs-coherencia-052 |
| `3e46bf1` | commit | — | Jeremi Alcala | 2026-10-13 | feat(despliegue): el entorno de captura corre en midgard (ADR-0034) |
| `2ae9d21` | commit | — | Jeremi Alcala | 2026-10-12 | docs(historial): regenerar repo-history tras el corte 0.5.2 |
| `9e8fd85` | commit | — | Jeremi Alcala | 2026-10-12 | docs(portal): dos contradicciones entre documentos tras el release 0.5.2 |
| `36e1a2e` | merge | v0.5.2 | Jeremi J. Alcalá M. | 2026-10-12 | Merge pull request #62 from jeremialcala/develop |
| `4a364fa` | merge | — | Jeremi J. Alcalá M. | 2026-10-12 | Merge pull request #61 from jeremialcala/release-0.5.2 |
| `a9ec842` | commit | — | Jeremi Alcala | 2026-10-12 | docs(changelog): cortar la versión 0.5.2 |
| `22d61f1` | merge | — | Jeremi J. Alcalá M. | 2026-10-12 | Merge pull request #60 from jeremialcala/seguridad-sca-multidict-sourcemap |
| `b8967b0` | commit | — | Jeremi Alcala | 2026-10-12 | fix(seguridad): multidict 6.9.1 y source-map-js 1.2.2 |
| `e4a8e00` | merge | — | Jeremi J. Alcalá M. | 2026-10-05 | Merge pull request #59 from jeremialcala/placement-despliegue |
| `1e1f53d` | commit | — | Jeremi Alcala | 2026-10-05 | docs(placement): el SMART de hgtech001 muestra el disco fallando |
| `ade8c3f` | commit | — | Jeremi Alcala | 2026-10-05 | docs(placement): verificación de performance y disponibilidad de hgtech001 |
| `bef34f6` | commit | — | Jeremi Alcala | 2026-10-05 | docs(placement): AWS frente a Cloudflare para el despliegue completo |
| `b29edd8` | merge | — | Jeremi J. Alcalá M. | 2026-10-05 | Merge pull request #58 from jeremialcala/plan-implementacion-portal |
| `d309671` | commit | — | Jeremi Alcala | 2026-10-05 | docs(portal): plan de implementación PR a PR |
| `f3343ea` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #57 from jeremialcala/prd-portal-publico |
| `2c9fbff` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #56 from jeremialcala/docs-portal-monedas-bcv |
| `ed18c5c` | commit | — | Jeremi Alcala | 2026-10-05 | docs(portal): el diseño vuelve a mostrar las cinco monedas |
| `b77f0f5` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): PRD del portal público |
| `09646bb` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): el ingestor BCV sí captura las cinco monedas |
| `8fcf818` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): el ingestor BCV sí captura las cinco monedas |
| `42b43b3` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #55 from jeremialcala/portal-publico |
| `a7d551a` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge branch 'develop' into portal-publico |
| `e72130a` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #54 from jeremialcala/docs-coherencia-respaldo |
| `2d08952` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): tercera revisión, el diseño queda alineado con las decisiones |
| `5732fb5` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): segunda revisión del diseño, cuatro correcciones aplicadas |
| `e95c433` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): son cuatro las correcciones nuevas del diseño, no tres |
| `b11fb26` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): revisión del diseño con las 12 correcciones aplicadas |
| `49dc15c` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): DREAD de T16–T25 ratificado y borrador del aviso de privacidad |
| `1678164` | commit | — | Jeremi Alcala | 2026-10-04 | docs(portal): plan del portal público, ADR-0028 a ADR-0033 y threat model 0.5.0 |
| `d0c046c` | commit | — | Jeremi Alcala | 2026-10-04 | docs(respaldo): coherencia tras los merges de #51, #52 y #53 |
| `c2ff3b2` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #52 from jeremialcala/respaldo-estado-volumen |
| `6288c9b` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge branch 'develop' into respaldo-estado-volumen |
| `0bd5e2c` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #51 from jeremialcala/respaldo-b2 |
| `3907045` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge branch 'develop' into respaldo-b2 |
| `cb2f97e` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge branch 'develop' into respaldo-estado-volumen |
| `0a789d8` | merge | — | Jeremi J. Alcalá M. | 2026-10-04 | Merge pull request #53 from jeremialcala/seguridad-sca-pyjwt-undici |
| `1780857` | commit | — | Jeremi Alcala | 2026-10-04 | fix(seguridad): pyjwt 2.15.1, undici 8.11.2 y brace-expansion 2.1.7 |
| `f993162` | commit | — | Jeremi Alcala | 2026-10-04 | fix(respaldo): el estado de los trabajos en un volumen con nombre |
| `1b8c953` | commit | — | Jeremi Alcala | 2026-10-04 | fix(respaldo): que subir a B2 no dependa de la cuota de descarga |
| `176c742` | commit | — | Jeremi Alcala | 2026-10-04 | fix(respaldo): rclone 1.75.0 desde la imagen oficial, por digest |
| `1e4b5c4` | commit | — | Jeremi Alcala | 2026-10-04 | docs(respaldo): borrar la master key de B2 tras crear la clave |
| `df82c18` | commit | — | Jeremi Alcala | 2026-10-04 | feat(respaldo): migrar el destino de Google Drive a Backblaze B2 |
| `bb81ef4` | merge | — | Jeremi J. Alcalá M. | 2026-09-21 | Merge pull request #50 from jeremialcala/docs-historial-051 |
| `73a1136` | commit | — | Jeremi Alcala | 2026-09-21 | docs(historial): regenerar repo-history tras el corte 0.5.1 |
| `d585124` | merge | v0.5.1 | Jeremi J. Alcalá M. | 2026-09-21 | Merge pull request #49 from jeremialcala/develop |
| `ba16f6f` | merge | — | Jeremi J. Alcalá M. | 2026-09-21 | Merge pull request #48 from jeremialcala/release-0.5.1 |
| `3a822aa` | commit | — | Jeremi Alcala | 2026-09-21 | docs(changelog): cortar la versión 0.5.1 |
| `3be6a2b` | commit | — | Jeremi Alcala | 2026-09-21 | docs(changelog): restaurar las entradas que se perdieron en un merge |
| `8efe216` | merge | — | Jeremi J. Alcalá M. | 2026-09-21 | Merge pull request #47 from jeremialcala/develop |
| `a51b2f6` | merge | — | Jeremi J. Alcalá M. | 2026-09-21 | Merge pull request #46 from jeremialcala/ci-aviso-cron-seguridad |
| `3ce4697` | commit | — | Jeremi Alcala | 2026-09-20 | ci(seguridad): que la pasada del cron avise por ntfy cuando un gate se pone rojo |
| `7f6b5b6` | merge | — | Jeremi J. Alcalá M. | 2026-09-20 | Merge pull request #44 from jeremialcala/fix-respaldo-aviso |
| `2d3c697` | merge | — | Jeremi J. Alcalá M. | 2026-09-20 | Merge branch 'develop' into fix-respaldo-aviso |
| `32ee6dd` | merge | — | Jeremi J. Alcalá M. | 2026-09-20 | Merge pull request #45 from jeremialcala/security-js-yaml-4-3-2 |
| `1120f9f` | commit | — | Jeremi Alcala | 2026-09-20 | security(deps): subir js-yaml a 4.3.2 y poner verde la prueba T8 del web-spa |
| `e16018a` | commit | — | Jeremi Alcala | 2026-09-16 | fix(respaldo): cerrar el hueco de T8 y los zombis que dejaba el aviso |
| `f99af22` | commit | — | Jeremi Alcala | 2026-09-16 | feat(respaldo): avisar cuando el respaldo falla, y un healthcheck que lo note |
| `d9f2709` | merge | — | Jeremi J. Alcalá M. | 2026-09-08 | Merge pull request #43 from jeremialcala/docs-historial-050 |
| `bd60a12` | commit | — | Jeremi Alcala | 2026-09-07 | fix(compose): el healthcheck de la DB daba un falso positivo durante initdb |
| `82ac974` | commit | — | Jeremi Alcala | 2026-09-07 | docs(historial): regenerar repo-history tras el corte 0.5.0 |
| `d12a351` | merge | v0.5.0 | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #42 from jeremialcala/develop |
| `23ce20d` | commit | — | Jeremi J. Alcalá M. | 2026-09-07 | Potential fix for pull request finding 'CodeQL / Statement has no effect' |
| `ef04e46` | commit | — | Jeremi J. Alcalá M. | 2026-09-07 | Potential fix for pull request finding 'CodeQL / Statement has no effect' |
| `109ccfb` | commit | — | Jeremi J. Alcalá M. | 2026-09-07 | Potential fix for pull request finding 'CodeQL / Statement has no effect' |
| `c7e5c36` | commit | — | Jeremi J. Alcalá M. | 2026-09-07 | Potential fix for pull request finding 'CodeQL / Statement has no effect' |
| `860c67c` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #41 from jeremialcala/feat-t8-lockfiles-digests |
| `5c38c0a` | commit | — | Jeremi Alcala | 2026-09-07 | fix(ci): el salto de línea del paso de SCA quedó como `\n` literal |
| `78cb283` | commit | — | Jeremi Alcala | 2026-09-07 | docs(gates): firmar Gates 2 y 3 y cortar la versión 0.5.0 |
| `698e808` | commit | — | Jeremi Alcala | 2026-09-07 | feat(t8): lockfiles con hashes e imágenes por digest — cierra la deuda del Gate 2 |
| `c1b7627` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #40 from jeremialcala/feat-quitar-cronologia-senales |
| `d50f23c` | commit | — | Jeremi Alcala | 2026-09-07 | feat(spa): retirar la Cronología de señales del dashboard |
| `3511047` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #39 from jeremialcala/feat-tope-por-filas |
| `0f03023` | commit | — | Jeremi Alcala | 2026-09-07 | fix(api): acotar el histórico por filas y no por días de calendario |
| `7372248` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #38 from jeremialcala/feat-disolver-analisis |
| `b6be6df` | commit | — | Jeremi Alcala | 2026-09-07 | feat(spa): disolver la vista de Análisis; su contenido pasa al dashboard |
| `54bd33c` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #37 from jeremialcala/feat-retirar-escenarios |
| `3fccd45` | commit | — | Jeremi Alcala | 2026-09-07 | feat(analisis): retirar los escenarios; el producto se queda sin sellos demo |
| `3fcf200` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #36 from jeremialcala/feat-vista-riesgos |
| `df714f6` | commit | — | Jeremi Alcala | 2026-09-07 | feat(analisis): los riesgos dejan de ser redacción |
| `103736e` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #35 from jeremialcala/ci/build-api-gateway |
| `0fb1410` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #34 from jeremialcala/feat-cortes-riesgos |
| `b29be3b` | commit | — | Jeremi Alcala | 2026-09-07 | ci: publicar la imagen de api-gateway en GHCR |
| `417efb5` | commit | — | Jeremi Alcala | 2026-09-07 | feat(riesgos): los niveles salen de config versionada, no del componente |
| `69e847c` | merge | — | Jeremi J. Alcalá M. | 2026-09-07 | Merge pull request #33 from jeremialcala/req-analisis-comprensivo |
| `9c2a911` | commit | — | Jeremi Alcala | 2026-09-06 | docs(analisis): qué dato hace falta para retirar los dos sellos demo |
| `c685a1c` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #32 from jeremialcala/docs-cifras-spa |
| `3712289` | commit | — | Jeremi Alcala | 2026-09-06 | docs(cifras): el SPA tras el componente único de serie |
| `49aa798` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #31 from jeremialcala/docs-coherencia |
| `d63bbda` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge branch 'develop' into docs-coherencia |
| `ce02088` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #30 from jeremialcala/refactor-serie-temporal |
| `d8c0755` | commit | — | Jeremi Alcala | 2026-09-06 | docs(coherencia): cifras reales de la pipeline y lo que el README se contradecía |
| `5c4d0fa` | commit | — | Jeremi Alcala | 2026-09-06 | refactor(graficos): un solo componente de serie temporal para todo Criterio |
| `2dfe2f6` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #29 from jeremialcala/feat-ritmo-historico |
| `d9a0bcc` | commit | — | Jeremi Alcala | 2026-09-06 | fix(historico): el hueco de 22 px no se aplicaba, y normalizar el ritmo |
| `5f8509c` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #28 from jeremialcala/feat-estados-historico |
| `01362d6` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): estados de ventana insuficiente y sin datos |
| `c739524` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #27 from jeremialcala/feat-tooltip-graficos |
| `b3ceefd` | commit | — | Jeremi J. Alcalá M. | 2026-09-06 | Potential fix for pull request finding 'CodeQL / Unused variable, import, function or class' |
| `d1c6839` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): crosshair, punto y tooltip en los dos graficos |
| `37928b8` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #26 from jeremialcala/feat-controles-en-tarjeta |
| `be98c39` | commit | — | Jeremi Alcala | 2026-09-06 | refactor(historico): los controles, dentro de la tarjeta que gobiernan |
| `934dacc` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #25 from jeremialcala/feat-eje-temporal |
| `94a9738` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): eje X temporal en los dos graficos, no categorico |
| `933b9cb` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #24 from jeremialcala/feat-cabecera-serie-evaluada |
| `179252d` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): cabecera y estadisticas de ventana en la serie evaluada |
| `be0a296` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #23 from jeremialcala/feat-jerarquia-historico |
| `ed223ae` | commit | — | Jeremi Alcala | 2026-09-06 | refactor(historico): la serie evaluada manda, la tasa oficial pasa a contexto |
| `1861191` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #22 from jeremialcala/feat-historial-reglas |
| `fb6de9a` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): seccion «Historial de las reglas» como ultimo bloque |
| `ef9bc26` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #21 from jeremialcala/feat-episodios-comparables |
| `f7fd145` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): seccion «Episodios comparables» tras los graficos |
| `b19d826` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #20 from jeremialcala/feat-lectura-historico |
| `3924b55` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): panel «Lo que dice el historico» como bloque rector |
| `4b7a016` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #19 from jeremialcala/feat-capa-referencia-historico |
| `810006e` | commit | — | Jeremi Alcala | 2026-09-06 | feat(historico): capa de referencia bajo la serie evaluada |
| `79eed5b` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #18 from jeremialcala/feat-paginacion-paralela |
| `008825a` | commit | — | Jeremi Alcala | 2026-09-06 | test(slo): verificador de cierre del SLO de ingesta, programado para manana |
| `a1c18ca` | merge | — | Jeremi Alcala | 2026-09-06 | merge: develop (renumeracion de gates) en la rama de paginacion paralela |
| `ed10702` | commit | — | Jeremi Alcala | 2026-09-06 | feat(ingesta): paginar en lotes concurrentes para cumplir el SLO (ADR-0026) |
| `5bab09d` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #17 from jeremialcala/docs-renumerar-gates |
| `4394deb` | commit | — | Jeremi Alcala | 2026-09-06 | docs(gates): renumerar a la numeracion canonica de AI-DLC |
| `d6e97f0` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #16 from jeremialcala/test-medir-slo-wss |
| `8abe2d9` | commit | — | Jeremi Alcala | 2026-09-06 | test(slo): medir el push del WSS, el quinto y ultimo SLO sin medir |
| `7afd0ac` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #15 from jeremialcala/chore-retirar-cve-js-yaml |
| `4cf9ef3` | commit | — | Jeremi Alcala | 2026-09-06 | security(deps): retirar la excepcion del CVE-2026-59870, que ya esta cerrado |
| `1a9301c` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #14 from jeremialcala/feat-dast-zap |
| `1d9ef92` | commit | — | Jeremi Alcala | 2026-09-06 | fix(gateway): un byte NUL en la query devolvia 500, no 400 |
| `6151be5` | commit | — | Jeremi Alcala | 2026-09-06 | fix(dast): dos fallos que solo aparecian en CI |
| `3b49dde` | commit | — | Jeremi Alcala | 2026-09-06 | feat(dast): escaneo dinamico con ZAP, que era el hueco real del gate |
| `b45b108` | merge | — | Jeremi J. Alcalá M. | 2026-09-06 | Merge pull request #13 from jeremialcala/test-medir-los-slo |
| `0105c59` | commit | — | Jeremi J. Alcalá M. | 2026-09-06 | Potential fix for pull request finding 'CodeQL / Unused import' |
| `f4ab6a5` | commit | — | Jeremi J. Alcalá M. | 2026-09-06 | Potential fix for pull request finding 'CodeQL / File is not always closed' |
| `0e279f7` | commit | — | Jeremi Alcala | 2026-09-06 | test(slo): medir los SLO de latencia, que llevaban declarados sin contrastar |
| `a86d418` | merge | — | Jeremi J. Alcalá M. | 2026-08-31 | Merge pull request #12 from jeremialcala/chore-sacar-dump-del-repo |
| `91c5a2b` | commit | — | Jeremi Alcala | 2026-08-31 | chore(repo): sacar de la punta el volcado que viajaba de polizon |
| `bccfe93` | commit | — | Jeremi Alcala | 2026-08-31 | chore(.gitignore): add *.dump to ignore list |
| `5a7d915` | merge | — | Jeremi J. Alcalá M. | 2026-08-31 | Merge pull request #11 from jeremialcala/fix-ventana-incremental |
| `d0f9a92` | commit | — | Jeremi Alcala | 2026-08-31 | chore(respaldo): levantarlo de verdad, y arreglar lo que la puesta en marcha daba por hecho |
| `795709b` | commit | — | Jeremi Alcala | 2026-08-24 | docs(respaldo): cifras reales tras ejecutarlo, y la que estaba mal |
| `2de91a4` | commit | — | Jeremi Alcala | 2026-08-24 | fix(respaldo): anclar la ventana del incremental al filo de la hora |
| `244d69a` | merge | — | Jeremi J. Alcalá M. | 2026-08-24 | Merge pull request #10 from jeremialcala/fix-cabeceras-cuota-en-errores |
| `70af379` | commit | — | Jeremi Alcala | 2026-08-23 | chore(spa): regenerar los tipos del OpenAPI |
| `6546c4a` | merge | — | Jeremi J. Alcalá M. | 2026-08-23 | Merge pull request #9 from jeremialcala/feat-respaldo-y-volumen |
| `d801dd1` | commit | — | Jeremi Alcala | 2026-08-23 | fix(gateway): la cuota viaja también en los errores que la consumen |
| `62f012d` | commit | — | Jeremi Alcala | 2026-08-23 | feat(respaldo): volumen con nombre y respaldo a Drive |
| `854667a` | merge | — | Jeremi J. Alcalá M. | 2026-08-23 | Merge pull request #8 from jeremialcala/chore-tunel-en-compose |
| `f87805c` | commit | — | Jeremi Alcala | 2026-08-23 | docs(repo-history): regenerar |
| `60c7264` | commit | — | Jeremi Alcala | 2026-08-23 | chore(dev): el conector del túnel entra en el compose |
| `9d639e3` | merge | — | Jeremi J. Alcalá M. | 2026-08-23 | Merge pull request #6 from jeremialcala/ci-e2e-vivo |
| `f19a490` | merge | — | Jeremi J. Alcalá M. | 2026-08-23 | Merge branch 'develop' into ci-e2e-vivo |
| `c4b7b33` | merge | — | Jeremi J. Alcalá M. | 2026-08-23 | Merge pull request #7 from jeremialcala/fix-bucle-4401 |
| `e215e3b` | commit | — | Jeremi Alcala | 2026-08-23 | fix(spa): el 4401 encadenado ya no reconecta en bucle |
| `fc93042` | commit | — | Jeremi Alcala | 2026-08-20 | fix(seguridad): nanoid a 3.3.18 (GHSA-2v37-7h3g-55p8) |
| `cf66855` | commit | — | Jeremi Alcala | 2026-08-20 | docs(repo-history): regenerar |
| `819557c` | commit | — | Jeremi Alcala | 2026-08-20 | ci(e2e): llevar el e2e en vivo al pipeline |
| `abd3c2a` | merge | — | Jeremi J. Alcalá M. | 2026-08-07 | Merge pull request #5 from jeremialcala/docs-e2e-cumplido |
| `3b68d49` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar |
| `39a3076` | commit | — | Jeremi Alcala | 2026-08-07 | docs(gate-2): el e2e autenticado en vivo queda cumplido |
| `ae49831` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar tras el merge del PR #4 |
| `8ef0624` | merge | — | Jeremi J. Alcalá M. | 2026-08-07 | Merge pull request #4 from jeremialcala/feat-e2e-autenticado |
| `0bb8be7` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar |
| `4c25643` | commit | — | Jeremi Alcala | 2026-08-07 | test(e2e): los rechazos en vivo, que no necesitaban credenciales |
| `3be72cb` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar tras los merges de los PR #2 y #3 |
| `df2da0b` | merge | — | Jeremi J. Alcalá M. | 2026-08-07 | Merge pull request #3 from jeremialcala/fix-cronologia-repeticion |
| `4917d03` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar |
| `eb6fbfb` | merge | — | Jeremi Alcala | 2026-08-07 | Merge develop en fix-cronologia-repeticion: resolver la normalizacion duplicada |
| `59ddc5a` | merge | — | Jeremi J. Alcalá M. | 2026-08-07 | Merge pull request #2 from jeremialcala/fix-mejor-precio |
| `e5d3069` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar |
| `7f5ac52` | commit | — | Jeremi Alcala | 2026-08-07 | fix(intradia): la cronologia resume las repeticiones en vez de listarlas |
| `1f20118` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar |
| `64ed29f` | commit | — | Jeremi Alcala | 2026-08-07 | feat(engine): el mejor precio se publica en par, sin filtrar y filtrado |
| `3b6407a` | commit | — | Jeremi Alcala | 2026-08-07 | docs(repo-history): regenerar tras el merge del PR #1 |
| `ed9f843` | merge | — | Jeremi J. Alcalá M. | 2026-08-07 | Merge pull request #1 from jeremialcala/feat-intraday |
| `a98cf7f` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `9445199` | commit | — | Jeremi Alcala | 2026-08-06 | security(t8): CVE-2026-59870 aceptado por escrito, con caducidad propia |
| `8e3baf5` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `f508921` | commit | — | Jeremi Alcala | 2026-08-06 | docs: barrido de coherencia y ADR-0025 |
| `b1bfa63` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `c4149ce` | commit | — | Jeremi Alcala | 2026-08-06 | refactor(intradia): una sola tarjeta de metrica para todos los bloques |
| `0856c5c` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `ee5e8c1` | commit | — | Jeremi Alcala | 2026-08-06 | style(intradia): ritmo vertical normalizado, y siete blancos que no eran blancos |
| `e0b1a95` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `af51136` | commit | — | Jeremi Alcala | 2026-08-06 | feat(intradia): el cero de outliers es un resultado, no un hueco |
| `74c55b5` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `3859349` | commit | — | Jeremi Alcala | 2026-08-06 | fix(intradia): tooltip propio para los sparklines, fuera del flujo |
| `4aeadaa` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `2ee76c7` | commit | — | Jeremi Alcala | 2026-08-06 | feat(intradia): etiqueta legible y clave del contrato, en un solo catalogo |
| `976a54f` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `8335285` | commit | — | Jeremi Alcala | 2026-08-06 | refactor(intradia): un solo formato para toda variacion |
| `7f40d03` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `3e71f14` | commit | — | Jeremi Alcala | 2026-08-06 | feat(intradia): la barra de control dice el estado en vez de ofrecer un boton |
| `80b2d50` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `7ea0705` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): microestructura como condiciones del ruleset, no cifras del dia |
| `dd65cfc` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): compra y venta enfrentadas metrica por metrica |
| `1ba92bb` | commit | — | Jeremi Alcala | 2026-08-06 | docs: coherencia de la rama feat-intraday |
| `9524c44` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): histeresis por permanencia en los cruces de la cronologia |
| `7f89626` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): seccion «Cronologia de la sesion» como ultimo bloque del Intradia |
| `86acb1c` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): seccion «Que se movio desde la apertura» en el Intradia |
| `6deea55` | commit | — | Jeremi Alcala | 2026-08-06 | feat(web-spa): panel «Lectura de la sesion» como primer bloque del Intradia |
| `e1f378c` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `4fbada0` | commit | — | Jeremi Alcala | 2026-08-06 | fix: la profundidad se anclaba en un anuncio manipulado (T2) |
| `c636de0` | commit | — | Jeremi Alcala | 2026-08-06 | ci: apretar el trinquete del gateway a 92 (era 90) |
| `8c6ca8e` | commit | — | Jeremi Alcala | 2026-08-06 | fix(api-gateway): un fallo transitorio de JWKS mataba la autenticacion 60 s |
| `e19af34` | commit | — | Jeremi Alcala | 2026-08-06 | docs(repo-history): regenerar |
| `2031daa` | commit | — | Jeremi Alcala | 2026-08-06 | fix(api-gateway): el contrato de cierres del WSS era inalcanzable |
| `a0890ae` | commit | — | Jeremi Alcala | 2026-08-05 | docs(repo-history): regenerar |
| `bc638ce` | commit | — | Jeremi Alcala | 2026-08-05 | docs: barrido de coherencia, README incluido, y estado real de los gates |
| `4039c07` | commit | — | Jeremi Alcala | 2026-08-04 | docs: la cifra que manda es la de la pipeline (97,22 %, no 97,40 %) |
| `14b7282` | commit | — | Jeremi Alcala | 2026-08-04 | test(ingestor-historico): 72 % a 97 % y el criterio de cobertura de Gate 2 cerrado |
| `bd690bc` | commit | — | Jeremi Alcala | 2026-08-04 | docs(repo-history): regenerar |
| `4c568cc` | commit | — | Jeremi Alcala | 2026-08-04 | test(ingestor-binance): cobertura de 76 % a 99 %, y una prueba que no probaba |
| `58324b4` | commit | — | Jeremi Alcala | 2026-08-04 | docs(repo-history): regenerar |
| `d4d05c7` | commit | — | Jeremi Alcala | 2026-08-04 | test(ingestor-bcv): cobertura de 76 % a 99 %, y lo que escondia |
| `536f7c8` | commit | — | Jeremi Alcala | 2026-08-04 | docs: registrar los tres fallos de la primera ejecucion de CI |
| `8b15755` | commit | — | Jeremi Alcala | 2026-08-04 | ci: apretar el trinquete con las cifras de la propia pipeline |
| `960a01f` | commit | — | Jeremi Alcala | 2026-08-04 | ci: los tres fallos de la primera ejecucion |
| `dcb268c` | commit | — | Jeremi Alcala | 2026-08-04 | docs(repo-history): regenerar |
| `1b7b272` | commit | — | Jeremi Alcala | 2026-08-04 | ci: pipeline con los gates de Gate 2, y la cobertura de ayer estaba inflada |
| `5207199` | commit | — | Jeremi Alcala | 2026-08-04 | docs(repo-history): regenerar |
| `f508c30` | commit | — | Jeremi Alcala | 2026-08-04 | security(threat-model): ratificado el DREAD de T15 (HITL 2026-08-04) |
| `c7a2b32` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `f8faa89` | commit | — | Jeremi Alcala | 2026-08-03 | docs: barrido de coherencia y revision de gates |
| `c293b1d` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `5581471` | commit | — | Jeremi Alcala | 2026-08-03 | chore(auth0): las etiquetas del tenant siguen al producto (ADR-0024 enmienda) |
| `b59b673` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `a9ea4a1` | commit | — | Jeremi Alcala | 2026-08-03 | feat: el producto pasa a llamarse Criterio (ADR-0024) |
| `84dd5c0` | commit | — | Jeremi Alcala | 2026-08-03 | fix(tests): el e2e del motor llevaba rojo desde ADR-0022 y nadie lo vio |
| `e4b3604` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `3a358cf` | commit | — | Jeremi Alcala | 2026-08-03 | feat(web-spa): el mapa de calor pasa a rampa secuencial y el coral a categoria |
| `b15e29d` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `8ca8db5` | commit | — | Jeremi Alcala | 2026-08-03 | feat(web-spa): el panel de instrumentos pierde su banda de cabecera |
| `c5a2660` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `9e508aa` | commit | — | Jeremi Alcala | 2026-08-03 | feat(web-spa): los dos minis comparten fila, a un cuarto del ancho cada uno |
| `cc95ab2` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `10349eb` | commit | — | Jeremi Alcala | 2026-08-03 | fix(web-spa): separacion uniforme de 24 px entre bloques de la vista |
| `5c61be8` | commit | — | Jeremi Alcala | 2026-08-03 | docs(repo-history): regenerar |
| `c742332` | commit | — | Jeremi Alcala | 2026-08-03 | feat(web-spa): la tarjeta de brecha como bloque rector |
| `2a4fbef` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `834d032` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): «Lectura de hoy» como unica superficie con tinte |
| `8549165` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `ce5560b` | commit | — | Jeremi Alcala | 2026-08-02 | fix(web-spa): las pestañas se salian de la barra entre 760 y 1050 px |
| `43f00b6` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `90d9100` | commit | — | Jeremi Alcala | 2026-08-02 | docs: barrido de coherencia tras el bloque 3, la barra y las aclaraciones |
| `b8b625a` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `f0961fd` | commit | — | Jeremi Alcala | 2026-08-02 | refactor(web-spa): la interfaz describe el mercado, no se describe a si misma |
| `be00558` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `534afa1` | commit | — | Jeremi Alcala | 2026-08-02 | refactor(web-spa): fuera el pie de aclaracion de la tarjeta de regimen |
| `b3d95fc` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `98ea475` | commit | — | Jeremi Alcala | 2026-08-02 | refactor(web-spa): la barra a 76 px fijos y «Salir» deja de ser coral |
| `ee39077` | commit | — | Jeremi Alcala | 2026-08-02 | docs(web-spa): la tabla del shell describia la tira vieja |
| `e7accd4` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `7d0d712` | commit | — | Jeremi Alcala | 2026-08-02 | refactor(web-spa): la tira de estado vuelve a ser estado, no diagnostico |
| `172f794` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `c4f2630` | commit | — | Jeremi Alcala | 2026-08-02 | feat(signals): resultado observado por senal, sin tasa de acierto |
| `6aab1bf` | commit | — | Jeremi Alcala | 2026-08-02 | feat(analysis): la cuota del movimiento que puso la tasa oficial |
| `8023c36` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `b533588` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): bloque 2 — variacion por moneda y procedencia completa |
| `166c528` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `9934d12` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): resto del bloque 1 — disposicion del prototipo |
| `0b42533` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): las tarjetas de medidor adoptan la estructura del prototipo |
| `28c75b9` | commit | — | Jeremi Alcala | 2026-08-02 | feat(analysis): las piernas de la brecha se publican siempre (ADR-0023) |
| `25cd440` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `abef31d` | commit | — | Jeremi Alcala | 2026-08-02 | docs: barrido de coherencia tras ADR-0022 y el mapa de calor |
| `1383830` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `e0f5f8b` | commit | — | Jeremi Alcala | 2026-08-02 | fix(vigencia): la tasa oficial rige por fecha-valor, no por antiguedad (ADR-0022) |
| `bf7aa01` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `592e4b5` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): la descomposicion muestra las piernas del movimiento |
| `4a2a69e` | commit | — | Jeremi Alcala | 2026-08-02 | docs(repo-history): regenerar |
| `603705d` | commit | — | Jeremi Alcala | 2026-08-02 | feat(web-spa): el mapa de calor gana un umbral visible en el p90 |
| `a8b8c02` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `31eb62b` | commit | — | Jeremi Alcala | 2026-08-01 | style(web-spa): distribución del dashboard según el prototipo |
| `85c492a` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `d601b39` | commit | — | Jeremi Alcala | 2026-08-01 | feat(web-spa): dashboard según el prototipo Criterio |
| `6190faa` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `d1682ac` | commit | — | Jeremi Alcala | 2026-08-01 | docs: barrido de coherencia y repo-history |
| `2de8b70` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `df1c2a8` | commit | — | Jeremi Alcala | 2026-08-01 | feat(web-spa): la sparkline de 24 h pinta los dos lados con escala compartida |
| `5720bf4` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `a0c26d3` | commit | — | Jeremi Alcala | 2026-08-01 | feat(web-spa): el mapa de calor mira el lado venta, que es el que tiene historia |
| `e759414` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `f9ca6cf` | commit | — | Jeremi Alcala | 2026-08-01 | docs: fase 5 — AI-DLC de la comparativa histórica y barrido de coherencia |
| `4989144` | commit | — | Jeremi Alcala | 2026-08-01 | fix(indicator-engine,web-spa): la media de 90 d estaba sesgada y la prosa citaba una cifra invisible |
| `078d7f7` | commit | — | Jeremi Alcala | 2026-08-01 | feat(web-spa): la descomposición compara los dos lados y rotula el tramo real |
| `149e8b3` | commit | — | Jeremi Alcala | 2026-08-01 | feat(indicator-engine): la brecha contra su propia historia, con cobertura real |
| `6c362a5` | commit | — | Jeremi Alcala | 2026-08-01 | feat(ingestor-historico): brecha histórica del lado venta desde 2025-12 |
| `2a70922` | commit | — | Jeremi Alcala | 2026-08-01 | fix(web-spa): tres tarjetas en blanco por el orden de los efectos de React |
| `027f056` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `0d2ecd9` | commit | — | Jeremi Alcala | 2026-08-01 | fix(ingestor-historico): banks[].volume estaba vacío con el dato en el archivo |
| `6b07555` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `dfb061e` | commit | — | Jeremi Alcala | 2026-08-01 | data(ingestor-historico): histórico P2P al día + defecto conocido en banks[].volume |
| `04eab58` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `95dbde8` | commit | — | Jeremi Alcala | 2026-08-01 | feat(ingestor-historico): histórico de tasas oficiales del BCV desde 2020 |
| `219945f` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `ee29078` | commit | — | Jeremi Alcala | 2026-08-01 | docs: barrido de coherencia tras ADR-0021 |
| `df2c185` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `28a1d5d` | commit | — | Jeremi Alcala | 2026-08-01 | feat(indicator-engine,web-spa): lectura del estado de mercado por revisión |
| `7471953` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `c543b08` | commit | — | Jeremi Alcala | 2026-08-01 | perf(indicator-engine): comprimir `indicators` en vez de aplicarle retencion |
| `3b440a4` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `af3a347` | commit | — | Jeremi Alcala | 2026-08-01 | docs(rendimiento): medida la consulta de percentiles, sobra margen |
| `657184e` | commit | — | Jeremi Alcala | 2026-08-01 | docs: cerrar dos pendientes que sobrevivieron a su propio cumplimiento |
| `b4ca2c5` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `8978022` | commit | — | Jeremi Alcala | 2026-08-01 | docs(auth): ADR-0020, enmiendas y correccion de un tenant mal documentado |
| `f307d18` | commit | — | Jeremi Alcala | 2026-08-01 | fix(web-spa): el login estaba roto — faltaba worker-src en la CSP |
| `f50f890` | commit | — | Jeremi Alcala | 2026-08-01 | docs(repo-history): regenerar |
| `f525868` | commit | — | Jeremi Alcala | 2026-08-01 | feat(analisis): modulo de analisis de indicadores — el panel deja de ser demo |
| `75bd24e` | commit | — | Jeremi Alcala | 2026-07-31 | docs(repo-history): regenerar |
| `798b83b` | commit | — | Jeremi Alcala | 2026-07-31 | security(web-spa): la CSP no se enviaba; frame-src del tenant anadido |
| `47d1286` | commit | — | Jeremi Alcala | 2026-07-31 | docs(repo-history): regenerar |
| `f074aab` | commit | — | Jeremi Alcala | 2026-07-31 | fix(web-spa): la tira de estado no se pinta ni un fotograma en movil |
| `f7280f1` | commit | — | Jeremi Alcala | 2026-07-31 | docs(repo-history): regenerar tras el arreglo de la paleta |
| `7ac255a` | commit | — | Jeremi Alcala | 2026-07-31 | fix(web-spa): la paleta de datos deja de ser la paleta de marca |
| `aed25fa` | commit | — | Jeremi Alcala | 2026-07-31 | docs(repo-history): regenerar tras el shell responsive |
| `c852844` | commit | — | Jeremi Alcala | 2026-07-31 | feat(web-spa): shell responsive — la tira de estado se reparte, no se encoge |
| `5ed6042` | commit | — | Jeremi Alcala | 2026-07-31 | docs(repo-history): regenerar tras el rediseno y los barridos |
| `22a7c7a` | commit | — | Jeremi Alcala | 2026-07-31 | docs: barridos de coherencia (gates, charter, PRDs, plan de pruebas, knowledge) |
| `8f30547` | commit | — | Jeremi Alcala | 2026-07-31 | feat(web-spa): rediseno Higerotech, i18n ES/EN y sello de bloque sin fuente (ADR-0018) |
| `3622623` | commit | — | Jeremi Alcala | 2026-07-31 | fix(api-gateway): reconectar y alertar el consumidor AMQP del push WSS |
| `4578db2` | commit | — | Jeremi Alcala | 2026-07-29 | docs: front-end en el alcance (ADR-0017) y corrección del plan de pruebas |
| `12def0b` | commit | — | Jeremi Alcala | 2026-07-29 | feat(web-spa): dashboard, histórico e intradía (ADR-0017) |
| `792beae` | commit | — | Jeremi Alcala | 2026-07-29 | fix(api-gateway): tolerar deriva de reloj al validar el JWT |
| `95354e3` | commit | — | Jeremi Alcala | 2026-07-29 | feat(api-gateway): CORS por allowlist para el SPA (T15) |
| `10b3cb5` | commit | — | Jeremi Alcala | 2026-07-29 | feat(api-gateway): filtros de indicador y moneda en /indicators/history |
| `a230666` | commit | — | Jeremi Alcala | 2026-07-26 | docs(repo-history): gitGraph con lanes GitFlow reales (first-parent en main) |
| `38abe5e` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Regenerate repo-history tras el release 0.4.0 (merge a main + tag) |
| `779231f` | merge | v0.4.0 | Jeremi Alcala | 2026-07-26 | Merge develop into main: release 0.4.0 |
| `0d80bd6` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Corte 0.4.0 — api-gateway implementado, pipeline completo operativo |
| `f5a7215` | commit | — | Jeremi Alcala | 2026-07-26 | Implement integration and unit tests for API Gateway functionality |
| `9b6d94e` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Ratificación HITL del DREAD de T13/T14 (threat model + gate 1) |
| `2d4a1f2` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Regenerate repo-history tras el release 0.3.1 (merge a main + tag) |
| `461d4dc` | merge | v0.3.1 | Jeremi Alcala | 2026-07-26 | Merge develop into main: release 0.3.1 |
| `75e6c3f` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Corte 0.3.1 — barrido de coherencia post-0.3.0 (trazabilidad, threat model T13/T14, cabeceras) |
| `d943a62` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Regenerate repo-history tras el release 0.3.0 (merge a main + tags) |
| `2ec16da` | merge | v0.3.0 | Jeremi Alcala | 2026-07-26 | Merge develop into main: release 0.3.0 |
| `ec6c272` | commit | — | Jeremi Alcala | 2026-07-26 | docs: Corte 0.3.0 — motor de señales verificado (RF-4/RF-5) |
| `949e87d` | commit | — | Jeremi Alcala | 2026-07-26 | fix(compose): restart unless-stopped en rabbitmq y timescaledb |
| `8f9178e` | commit | — | Jeremi Alcala | 2026-07-22 | docs: Flip signals to implemented (RF-4) + ADR-0015, e2e coherence |
| `002a6af` | commit | — | Jeremi Alcala | 2026-07-22 | feat(indicator-engine): Signal rules engine (RF-4) — emits signals.emitted |
| `fb5db08` | commit | — | Jeremi Alcala | 2026-07-20 | feat(schemas): Define signal.v1 contract for signals.emitted (schema only) |
| `1d6eb1b` | commit | — | Jeremi Alcala | 2026-07-20 | docs: Coherence pass post-fase-2 + ADR-0014 (microestructura P2P) |
| `11da932` | commit | — | Jeremi Alcala | 2026-07-20 | feat: Implementar procesamiento de snapshots P2P y cálculo de indicadores |
| `ed42b13` | commit | — | Jeremi Alcala | 2026-07-17 | feat(api-gateway): Add OpenAPI 3.1 REST spec (fase 03) |
| `f8a159f` | commit | — | Jeremi Alcala | 2026-07-17 | chore: Ignore config.json (Auth0 tenant config, fase 03 api-gateway) |
| `e7aac30` | commit | — | Jeremi Alcala | 2026-07-14 | docs: Close feat-ai-dlc branch, regenerate repo-history for main+develop |
| `8658d68` | commit | — | Jeremi Alcala | 2026-07-14 | docs: Regenerate repo-history after Auth0 tenant merge |
| `83cffde` | merge | — | Jeremi Alcala | 2026-07-14 | Merge feat-ai-dlc into develop: Auth0 dev tenant provisioned (api-gateway phase 03 start) |
| `cee9891` | commit | — | Jeremi Alcala | 2026-07-14 | docs: Record provisioned Auth0 dev tenant in api-gateway design (ADR-0012) |
| `b251d46` | commit | — | Jeremi Alcala | 2026-07-14 | docs: Regenerate repo-history after merging feat-ai-dlc into develop |
| `da3719a` | merge | — | Jeremi Alcala | 2026-07-14 | Merge feat-ai-dlc into develop: ingestor-historico (ADR-0013), multi-branch gitGraph, three-axis diagram evidence |
| `8501a04` | commit | — | Jeremi Alcala | 2026-07-14 | docs: Complete three-axis Mermaid evidence for Gates 0/1 (AI-DLC coherence audit) |
| `2b58b0b` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Add multi-branch gitGraph generator and update repo history documentation |
| `2349425` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Update documentation for ingestor-historico service and changelog with approval status and versioning |
| `fefef5c` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Update project charter with additional scope, stakeholders, and success metrics |
| `31289f5` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Implement historical data ingestion service with adaptive parsing |
| `92a9e3d` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Add Dockerfiles for ingestor-binance, ingestor-bcv, and indicator-engine; create .dockerignore and analysis script |
| `b14c8f7` | commit | v0.2.0 | Jeremi Alcala | 2026-07-11 | feat: Update documentation for version 0.2.0, closing Gates 0 and 1, and add implementation history |
| `ac47922` | commit | — | Jeremi Alcala | 2026-07-11 | feat: Update API contracts and architecture to integrate Auth0 for authentication |
| `f980ff5` | commit | — | Jeremi Alcala | 2026-07-07 | feat: Update Gate 0 and Gate 1 documentation with resolution of alias retention and ADR-0011 implementation details |
| `3dfba24` | commit | — | Jeremi Alcala | 2026-07-06 | feat: Implement ADR-0011 for P2P advertiser pseudonymization |
| `a02f580` | commit | — | Jeremi Alcala | 2026-07-06 | feat: Implement ADR-0011 for HMAC pseudonymization of P2P advertiser identifiers and update related documentation |
| `2413423` | commit | — | Jeremi Alcala | 2026-07-06 | feat: Implement data minimization for P2P snapshots and update documentation |
| `5e18ca8` | commit | — | Jeremi Alcala | 2026-07-06 | feat: Implement P2P snapshot ingestion from Binance |
| `b3f9786` | commit | — | Jeremi Alcala | 2026-07-05 | Implementación de la fase 1 del motor de indicadores en `indicator-engine`: consumo de eventos `official.rate.updated`, validación de schema, DLQ, idempotencia y emisión de `indicators.updated`. Se agregan pruebas E2E, de integración y unitarias para asegurar el correcto funcionamiento del flujo de datos. Se actualizan los contratos de eventos y se añaden esquemas JSON para validación. Se realizan cambios en la documentación para reflejar el estado actual del proyecto y las tablas implementadas en la base de datos. |
| `0775c6b` | commit | — | Jeremi Alcala | 2026-07-05 | feat: Implement HITL re-validation for suspect rates (ADR-0007) |
| `424dd26` | commit | — | Jeremi Alcala | 2026-07-05 | Update configuration and documentation for local development setup |
| `f8922b6` | commit | — | Jeremi Alcala | 2026-07-05 | Add Open Knowledge Format (OKF) context bundle and enhance documentation |
| `5ad050e` | commit | — | Jeremi Alcala | 2026-07-05 | Add initial documentation for services, events, metrics, and tables in the VES Market Watch project |
| `9ad366f` | commit | — | Jeremi Alcala | 2026-07-05 | Add unit tests for BCV ingestor functionality and update documentation |
| `bd9698b` | commit | — | Jeremi Alcala | 2026-07-05 | Update design documentation and add new ADRs for state machine and bitemporal model |
| `6c42e58` | commit | — | Jeremi Alcala | 2026-07-05 | Add initial changelog documenting project milestones and structure |
| `b34c3af` | commit | v0.1.0 | Jeremi Alcala | 2026-07-05 | first commit |
