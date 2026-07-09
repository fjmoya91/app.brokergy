#!/bin/bash
set -e

APP_DIR="/opt/brokergy"
cd $APP_DIR

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      BROKERGY — Deploy                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Actualizar código ───────────────────────
echo "[1/4] Actualizando código desde GitHub..."
git pull
echo "    OK"

# ── 2. Compilar frontend ───────────────────────
echo "[2/4] Compilando frontend..."
SUPA_URL=$(grep '^SUPABASE_URL=' implementation/backend/.env | cut -d'=' -f2-)
SUPA_ANON=$(grep '^SUPABASE_ANON_KEY=' implementation/backend/.env | head -1 | cut -d'=' -f2-)

cd implementation/frontend
npm install --silent
VITE_APP_URL=https://app.brokergy.es \
VITE_SUPABASE_URL=$SUPA_URL \
VITE_SUPABASE_ANON_KEY=$SUPA_ANON \
npm run build
cd $APP_DIR
echo "    OK"

# ── 3. Reconstruir servicios ───────────────────
echo "[3/4] Reconstruyendo backend, MCP y RITE generator..."
docker compose build --no-cache backend mcp
# rite-generator: build con caché (la capa pesada de pip se reutiliza salvo que
# cambie requirements.txt; el código se recopia siempre).
docker compose build rite-generator
docker compose up -d backend mcp rite-generator
echo "    OK"

# ── 4. Recargar nginx ──────────────────────────
echo "[4/4] Sincronizando y recargando nginx..."
# El fichero montado es nginx/nginx.conf (copia de la config HTTPS; el cron de
# certbot la regenera). Rehacemos la copia para que los cambios de nginx.https.conf
# del repo se apliquen. Solo si ya hay certificados (entorno HTTPS estable).
if [ -f /etc/letsencrypt/live/app.brokergy.es/fullchain.pem ]; then
    cp nginx/nginx.https.conf nginx/nginx.conf
fi
# Validar la config antes de recargar (evita dejar nginx caído por un typo).
docker compose exec -T nginx nginx -t && docker compose exec -T nginx nginx -s reload
echo "    OK"

echo ""
echo "✅ Deploy completado — https://app.brokergy.es"
echo ""
