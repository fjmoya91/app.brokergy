# Imagen del microservicio RITE Generator
FROM python:3.12-slim

# Evitar prompts y buffers
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# LibreOffice headless (solo Writer) para convertir la Memoria .docx -> .pdf.
# Capa cacheable (no cambia salvo que se edite esta línea).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Dependencias Python (capa cacheable)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código y assets
COPY . .

# Cloud Run / Railway inyectan el puerto en $PORT (por defecto 8080)
ENV PORT=8080
EXPOSE 8080

# Arranque. `sh -c` para expandir $PORT en runtime.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
