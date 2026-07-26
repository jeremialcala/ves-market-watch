"""Ingesta del mercado P2P de Binance (USDT/VES).

Polling educado al endpoint público de búsqueda de anuncios (ADR-0005):
User-Agent identificable, presupuesto de requests, backoff con jitter y
circuit breaker — nunca rotación de IPs. Publica `p2p.snapshot` al bus.
Ver `docs/design.md` y PRD `docs/01-requirements/ingesta-binance-p2p.md`.
"""

__version__ = "0.1.0"
