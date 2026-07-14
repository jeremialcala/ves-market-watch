# Contexto de build: la raíz del repo (ver docker-compose.yml).
# Replica el layout del repo bajo /opt/ves para que _RAIZ_REPO del config
# encuentre los contratos de eventos en /opt/ves/schemas.
FROM python:3.12-slim

WORKDIR /opt/ves/apps/indicator-engine
COPY schemas/ /opt/ves/schemas/
COPY apps/indicator-engine/ .
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "indicator_engine"]
