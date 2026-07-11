# Contexto de build: la raíz del repo (ver docker-compose.yml).
# Install editable sobre /opt/ves/apps/<app> para que las rutas por defecto
# del config (certs/bcv-ca-bundle.pem vía _RAIZ_APP, ADR-0006) resuelvan
# igual que en el repo.
FROM python:3.12-slim

WORKDIR /opt/ves/apps/ingestor-bcv
COPY apps/ingestor-bcv/ .
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "ingestor_bcv"]
