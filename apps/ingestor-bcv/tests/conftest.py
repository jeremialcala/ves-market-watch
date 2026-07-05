from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def bcv_html() -> str:
    """Página real de bcv.org.ve capturada el 2026-07-05 (fecha-valor 2026-07-06)."""
    return (FIXTURES / "bcv_home.html").read_text(encoding="utf-8")
