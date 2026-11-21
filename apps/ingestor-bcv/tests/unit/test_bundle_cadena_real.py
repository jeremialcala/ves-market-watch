"""El bundle anclado valida el certificado REAL del BCV (ADR-0006), sin red.

El 2026-11-13 el BCV renovó su certificado y pasó a emitirlo la intermedia
Sectigo «Public Server Authentication CA OV R36», que su servidor no envía. El
bundle solo tenía la «DV R36» y el ingestor dejó de capturar tasas oficiales con
`CERTIFICATE_VERIFY_FAILED` hasta que se añadió la OV.

Este test fija el certificado capturado ese día (`fixtures/bcv-leaf-2026-11.pem`)
y lo valida contra el bundle versionado con el verificador de `cryptography`, a
una fecha fija dentro de su vigencia. Con el bundle anterior falla. El handshake
real contra el BCV lo cubre `tests/integration/test_bcv_client_tls.py` con un
servidor local; este cubre la cadena concreta del BCV.
"""

import datetime
from pathlib import Path

from cryptography import x509
from cryptography.x509.verification import PolicyBuilder, Store

RAIZ = Path(__file__).parents[2]
BUNDLE = RAIZ / "certs" / "bcv-ca-bundle.pem"
LEAF_2026_11 = RAIZ / "tests" / "fixtures" / "bcv-leaf-2026-11.pem"

# Dentro de la vigencia del leaf (2026-11-13 → 2027-05-30): el test no caduca
# con el certificado.
CUANDO = datetime.datetime(2026, 11, 21, tzinfo=datetime.timezone.utc)


def _cargar_bundle() -> tuple[list[x509.Certificate], list[x509.Certificate]]:
    certs = x509.load_pem_x509_certificates(BUNDLE.read_bytes())
    raices = [c for c in certs if c.subject == c.issuer]
    intermedias = [c for c in certs if c.subject != c.issuer]
    return raices, intermedias


def _cn(cert: x509.Certificate) -> str:
    return cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME)[0].value


def test_el_leaf_real_del_bcv_encadena_con_el_bundle():
    raices, intermedias = _cargar_bundle()
    leaf = x509.load_pem_x509_certificate(LEAF_2026_11.read_bytes())
    verificador = (
        PolicyBuilder()
        .store(Store(raices))
        .time(CUANDO)
        .build_server_verifier(x509.DNSName("www.bcv.org.ve"))
    )

    cadena = verificador.verify(leaf, intermedias)

    assert [_cn(c) for c in cadena] == [
        "*.bcv.org.ve",
        "Sectigo Public Server Authentication CA OV R36",
        "Sectigo Public Server Authentication Root R46",
    ]


def test_el_bundle_conserva_las_dos_intermedias_r36():
    # La DV R36 emitía el certificado anterior. Se conserva para que una vuelta
    # del BCV a esa intermedia no repita el corte de captura.
    _, intermedias = _cargar_bundle()
    nombres = {_cn(c) for c in intermedias}
    assert "Sectigo Public Server Authentication CA DV R36" in nombres
    assert "Sectigo Public Server Authentication CA OV R36" in nombres
