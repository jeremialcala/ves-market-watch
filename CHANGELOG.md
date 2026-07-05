# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
y el proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Convención de mantenimiento (inventario por ejecución):
- Cada ejecución/sesión de trabajo agrega sus cambios bajo [Unreleased],
  usando las categorías estándar: Added, Changed, Deprecated, Removed, Fixed, Security.
- Al cerrar un hito (p. ej. un gate AI-DLC o un release), se corta una versión:
  se renombra [Unreleased] a [X.Y.Z] - AAAA-MM-DD y se abre un nuevo [Unreleased].
- Guía de versiones mientras no haya código en producción: 0.x.y
  (minor = nueva funcionalidad o gate completado, patch = correcciones/ajustes de docs).
-->

## [Unreleased]

## [0.1.0] - 2026-07-05

Línea base del proyecto (commit inicial `b34c3af`). Fase documental: Gate 0
(requisitos) y Gate 1 (diseño) de la metodología AI-DLC. Sin código ejecutable aún.

### Added

- Estructura de repositorio según el estándar AI-DLC: `.ai-dlc/` (gates y plantillas),
  `docs/` (proyecto, requisitos, diseño, arquitectura) y `apps/` (esqueletos de servicios).
- Metodología AI-DLC:
  - Checklists de Gate 0 (requisitos) y Gate 1 (diseño).
  - Plantillas de PRD, ADR y threat model.
- Documentación de proyecto (`docs/00-project/`):
  - Project charter con visión, alcance, no-scope, métricas de éxito y riesgos.
  - Glosario de términos del dominio cambiario.
  - Clasificación de datos.
- Decisiones de arquitectura (ADRs):
  - ADR-0001: Adopción de la estructura AI-DLC.
  - ADR-0002: Almacenamiento de series de tiempo con PostgreSQL + TimescaleDB.
  - ADR-0003: Autenticación JWT / OAuth2 client credentials para API/WSS.
  - ADR-0004: RabbitMQ como bus de mensajería entre ingesta e indicadores.
  - ADR-0005: Estrategia de ingesta del portal P2P de Binance (VES/USDT).
  - ADR-0006: Scraping del sitio BCV y manejo de sus problemas de TLS.
- Requisitos — PRDs de Gate 0 (`docs/01-requirements/`):
  - Ingesta P2P Binance (VES/USDT).
  - Ingesta de tasa oficial BCV (VES/USD).
  - Motor de indicadores (brecha BCV↔Binance, spreads, volúmenes, tendencias).
  - API REST + streaming WebSocket para consumidores.
- Diseño — Gate 1 (`docs/02-design/` y `docs/architecture/`):
  - Arquitectura general del sistema.
  - Threat model.
  - Contratos de API.
  - Diagramas C4 de contexto y contenedores (Mermaid).
- Esqueletos de los cuatro servicios en `apps/`, cada uno con README, documento de
  diseño y carpeta de tests: `ingestor-binance`, `ingestor-bcv`, `indicator-engine`
  y `api-gateway`.

[Unreleased]: https://github.com/jeremialcala/ves-market-watch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jeremialcala/ves-market-watch/releases/tag/v0.1.0
