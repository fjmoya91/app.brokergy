FROM node:20-slim

# Chrome dependencies + Google Chrome Stable
#
# fonts-noto-color-emoji: SIN ella el contenedor no tiene NINGUNA fuente con
# emojis (solo fonts-liberation) y Chrome los pinta como cuadraditos "tofu" al
# generar el PDF — se veían bien en el navegador del usuario y mal en el PDF
# enviado al cliente (propuesta, anexo fotográfico…). Es un arreglo de fuente,
# no de maquetado: ningún documento cambia salvo esos glifos.
RUN apt-get update && apt-get install -y \
    wget ca-certificates fonts-liberation fonts-noto-color-emoji \
    procps \
    libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
    libdbus-1-3 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libxss1 libxtst6 xdg-utils \
    && wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y /tmp/chrome.deb \
    && rm -f /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# OJO: el contexto de build es `./implementation` (NO `./implementation/backend`),
# así que todas las rutas van prefijadas. Ver docker-compose.yml → backend.build.
COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# ─────────────────────────────────────────────────────────────────────────────
# Lógica ESM compartida con el frontend (FUENTE ÚNICA de la matemática del CAE).
#
# `cifoService.js` y `expedienteFinancialsNode.js` la importan en runtime con
# `path.join(__dirname, '../../frontend/src/…')`, que desde /app/services resuelve
# a /frontend/src — la MISMA ruta relativa que en el repo. Copiándola aquí, el
# código no necesita saber si corre en local o en un contenedor.
#
# Sin esto: `Cannot find module '/frontend/src/features/calculator/logic/
# calculation.js'` y se caen el CIFO server-side, `estado_cifo`/`generar_cifo`
# del MCP, la economía del portal del cliente y la regla SOBREFINANCIACIÓN del
# OCR de facturas (esta última en silencio: va dentro de un try/catch).
COPY frontend/src /frontend/src

# Marcador OBLIGATORIO: Node decide ESM/CJS por el package.json más cercano. Sin
# él, estos ficheros heredan el del backend (CJS) y dan "Cannot use import
# statement outside a module". En el repo ese papel lo hace frontend/package.json.
RUN echo '{"type":"module"}' > /frontend/package.json

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000

CMD ["node", "server.js"]
