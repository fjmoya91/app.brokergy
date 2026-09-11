# Imagen del microservicio cee-engine.
# Mismo patrón que rite-generator: Python slim, uvicorn, $PORT en runtime.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLBACKEND=Agg

WORKDIR /app

# Dependencias (capa cacheable: solo se rehace si cambia requirements.txt).
# shapely y pyproj traen GEOS y PROJ dentro de sus wheels, así que no hace
# falta instalar nada del sistema.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código y la plantilla .cex, que es un activo del servicio.
COPY . .

# Que la imagen no salga rota: si los tests del motor no pasan, no hay imagen.
RUN python -m pytest -q tests

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
