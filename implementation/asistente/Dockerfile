# El ASISTENTE de Fran por WhatsApp: Claude Code sin pantalla que trabaja con los scripts de la app.
#
# Se construye SOBRE la imagen del backend (brokergy-backend), que ya trae Node, Google Chrome (para
# claude_propuesta.js) y las dependencias del backend en /app/node_modules. Aquí solo se añade el CLI
# de Claude Code. El repo NO va dentro: se monta (/repo) para que un `git pull` cambie los scripts y
# las instrucciones sin reconstruir. Ver arrancar.sh y docker-compose.yml → asistente.
FROM brokergy-backend:latest

# Node 22 ANTES de instalar Claude Code: alta_oportunidad.js usa `module.registerHooks` (Node ≥ 22.15)
# y la imagen del backend va con Node 20. Las dependencias del backend no tienen módulos nativos
# (.node), así que basta con cambiar el binario; el backend sigue con el suyo.
# ⚠️ El orden importa (19/10/2026): Claude Code exige Node ≥ 22 desde hace tiempo, y con el Node 20 de
# la imagen npm instalaba la ÚLTIMA versión compatible con él —la 2.1.197, meses atrás, que va con
# Opus 4.8— aunque la última publicada era la 2.1.303. Para actualizar Claude Code:
# `docker compose build --no-cache asistente && docker compose up -d asistente` (con el asistente libre).
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

RUN npm install -g @anthropic-ai/claude-code \
    && apt-get update && apt-get install -y --no-install-recommends git poppler-utils python3-pil fonts-dejavu-core ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# El contenedor corre como root, y Chrome como root se niega a arrancar sin --no-sandbox.
# claude_propuesta.js no pasa argumentos al lanzarlo: se le da un ejecutable que los añade.
RUN printf '#!/bin/sh\nexec /usr/bin/google-chrome-stable --no-sandbox "$@"\n' > /usr/local/bin/chrome-nosandbox \
    && chmod +x /usr/local/bin/chrome-nosandbox

WORKDIR /repo
CMD ["sh", "/repo/implementation/asistente/arrancar.sh"]
