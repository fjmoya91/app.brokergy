# El ASISTENTE de Fran por WhatsApp: Claude Code sin pantalla que trabaja con los scripts de la app.
#
# Se construye SOBRE la imagen del backend (brokergy-backend), que ya trae Node, Google Chrome (para
# claude_propuesta.js) y las dependencias del backend en /app/node_modules. Aquí solo se añade el CLI
# de Claude Code. El repo NO va dentro: se monta (/repo) para que un `git pull` cambie los scripts y
# las instrucciones sin reconstruir. Ver arrancar.sh y docker-compose.yml → asistente.
FROM brokergy-backend:latest

RUN npm install -g @anthropic-ai/claude-code \
    && apt-get update && apt-get install -y --no-install-recommends git poppler-utils python3-pil fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# El contenedor corre como root, y Chrome como root se niega a arrancar sin --no-sandbox.
# claude_propuesta.js no pasa argumentos al lanzarlo: se le da un ejecutable que los añade.
RUN printf '#!/bin/sh\nexec /usr/bin/google-chrome-stable --no-sandbox "$@"\n' > /usr/local/bin/chrome-nosandbox \
    && chmod +x /usr/local/bin/chrome-nosandbox

# Node 22: alta_oportunidad.js usa `module.registerHooks` (Node ≥ 22.15) y la imagen del backend
# va con Node 20. Las dependencias del backend no tienen módulos nativos (.node), así que basta con
# cambiar el binario; el backend sigue con el suyo.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

WORKDIR /repo
CMD ["sh", "/repo/implementation/asistente/arrancar.sh"]
