# Contexto de build: la raíz del repo (ver docker-compose.yml).
# Install editable sobre /opt/ves/apps/<app> para que las rutas por defecto
# del config (schemas/ del app vía _RAIZ_APP) resuelvan igual que en el repo.
FROM python:3.12-slim

WORKDIR /opt/ves/apps/ingestor-binance
COPY apps/ingestor-binance/ .
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "ingestor_binance"]
