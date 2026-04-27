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
npm ci --silent
VITE_APP_URL=https://app.brokergy.es \
VITE_SUPABASE_URL=$SUPA_URL \
VITE_SUPABASE_ANON_KEY=$SUPA_ANON \
npm run build
cd $APP_DIR
echo "    OK"

# ── 3. Reconstruir backend ─────────────────────
echo "[3/4] Reconstruyendo backend..."
docker compose build --no-cache backend
docker compose up -d backend
echo "    OK"

# ── 4. Recargar nginx ──────────────────────────
echo "[4/4] Recargando nginx..."
docker compose exec nginx nginx -s reload
echo "    OK"

echo ""
echo "✅ Deploy completado — https://app.brokergy.es"
echo ""
