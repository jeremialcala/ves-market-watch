# Contexto de build: la raíz del repo (ver docker-compose.yml).
# Replica el layout del repo bajo /opt/ves para que _RAIZ_REPO del config
# encuentre los contratos de eventos en /opt/ves/schemas.
FROM python:3.12-slim

WORKDIR /opt/ves/apps/api-gateway
COPY schemas/ /opt/ves/schemas/
COPY apps/api-gateway/ .
RUN pip install --no-cache-dir -e .

EXPOSE 8000
CMD ["python", "-m", "api_gateway"]
