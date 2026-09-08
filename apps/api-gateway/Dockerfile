# Contexto de build: la raíz del repo (ver docker-compose.yml).
# Replica el layout del repo bajo /opt/ves para que _RAIZ_REPO del config
# encuentre los contratos de eventos en /opt/ves/schemas.
# Imagen FIJADA POR DIGEST, no por tag (T8). `python:3.12-slim` es un tag
# móvil: la misma línea construye imágenes distintas en fechas distintas, así
# que un build reproducible y una auditoría de dependencias que signifique algo
# exigen clavarla. Para actualizarla:
#   docker manifest inspect -v python:3.12-slim | jq -r '.[0].Descriptor.digest'
FROM python:3.12-slim@sha256:2fe5997d249a808b8eeea52c58a1dbffbba28754dc11699ef5c029f2d818ce79

WORKDIR /opt/ves/apps/api-gateway
COPY schemas/ /opt/ves/schemas/
COPY apps/api-gateway/ .
# Dependencias desde el LOCK, con verificación de hashes; el paquete del
# servicio aparte y con `--no-deps`, para que no se re-resuelva nada (T8).
RUN pip install --no-cache-dir --require-hashes -r requirements.lock \
 && pip install --no-cache-dir --no-deps -e .

EXPOSE 8000
CMD ["python", "-m", "api_gateway"]
