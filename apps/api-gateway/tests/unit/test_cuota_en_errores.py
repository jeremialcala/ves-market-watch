"""La cuota viaja también en los errores que la consumieron.

El contrato dice que toda respuesta que gaste cuota lleva `X-RateLimit-*`, y el
gateway solo las ponía en las respuestas que el handler DEVOLVÍA: cuando lanzaba
—un 404 de «todavía no hay datos», por ejemplo— la respuesta la construía
`problem.py` desde cero y las cabeceras se perdían, aunque el limitador ya
hubiera contado la petición.

Nadie lo vio en año y medio porque en desarrollo la base siempre tiene datos y
ese endpoint nunca devuelve 404. Lo destapó el e2e en vivo la primera vez que
corrió en CI, contra una base recién creada y vacía.

Importa más de lo que parece: un cliente que sondea un endpoint todavía sin datos
gasta su límite sin poder verlo y se estrella contra un 429 que no vio venir. Es
justo el patrón del SPA cuando arranca un mercado nuevo.
"""

from tests.soporte_auth import firmar_token

CABECERAS = ("x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset")


def test_el_404_lleva_la_cuota_que_gasto(cliente, auth):
    # Repositorio vacío: el endpoint existe en el contrato y no tiene qué servir.
    r = cliente.get("/api/v1/rates/official/current?currency=USD", headers=auth)

    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    for cabecera in CABECERAS:
        assert cabecera in r.headers, f"falta {cabecera} en el 404"
    # Y con la cifra de verdad: la petición se contó, así que queda una menos.
    assert int(r.headers["x-ratelimit-remaining"]) == int(
        r.headers["x-ratelimit-limit"]
    ) - 1


def test_el_400_por_parametro_invalido_tambien(cliente, auth):
    # `currency` tiene patrón de tres mayúsculas; esto no valida.
    r = cliente.get("/api/v1/rates/official/current?currency=zzzz", headers=auth)

    assert r.status_code == 400
    for cabecera in CABECERAS:
        assert cabecera in r.headers, f"falta {cabecera} en el 400"


def test_el_422_de_rango_tambien(cliente, auth):
    r = cliente.get(
        "/api/v1/rates/official/history?from=2020-01-01&to=2026-01-01",
        headers=auth,
    )

    assert r.status_code == 422
    for cabecera in CABECERAS:
        assert cabecera in r.headers, f"falta {cabecera} en el 422"


def test_el_401_NO_las_lleva(cliente):
    """Sin token no se consume cuota, así que no hay cifra que dar.

    Es la mitad que impide «arreglar» esto poniendo las cabeceras siempre: un
    número inventado en un 401 sería peor que no ponerlo, porque el cliente lo
    creería. Y de paso no se le regala a un desconocido el estado del limitador.
    """
    r = cliente.get("/api/v1/rates/official/current?currency=USD")

    assert r.status_code == 401
    for cabecera in CABECERAS:
        assert cabecera not in r.headers, f"el 401 no debería traer {cabecera}"


def test_el_403_NO_las_lleva(cliente):
    """Igual: el permiso se exige ANTES de consumir cuota."""
    sin_permiso = {
        "Authorization": f"Bearer {firmar_token(permisos=['read:signals'])}"
    }
    r = cliente.get("/api/v1/rates/official/current?currency=USD", headers=sin_permiso)

    assert r.status_code == 403
    for cabecera in CABECERAS:
        assert cabecera not in r.headers, f"el 403 no debería traer {cabecera}"
