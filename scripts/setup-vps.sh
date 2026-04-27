#!/bin/bash
set -e

DOMAIN="app.brokergy.es"
EMAIL="brokergy@brokergy.es"
APP_DIR="/opt/brokergy"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      BROKERGY — Instalación VPS          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Sistema ─────────────────────────────────
echo "[1/9] Actualizando sistema..."
apt-get update -y -q && apt-get upgrade -y -q

# ── 2. Docker ──────────────────────────────────
echo "[2/9] Instalando Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version &> /dev/null 2>&1; then
    apt-get install -y -q docker-compose-plugin
fi
echo "    Docker: $(docker --version)"

# ── 3. Node.js 20 ──────────────────────────────
echo "[3/9] Instalando Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -q nodejs
fi
echo "    Node: $(node --version)"

# ── 4. Certbot ─────────────────────────────────
echo "[4/9] Instalando certbot..."
apt-get install -y -q certbot

# ── 5. Clonar repositorio ──────────────────────
echo "[5/9] Clonando repositorio..."
if [ -d "$APP_DIR/.git" ]; then
    echo "    Repo ya existe, actualizando..."
    cd $APP_DIR && git pull
else
    echo ""
    echo "    El repo es privado. Necesitas un Personal Access Token de GitHub."
    echo "    Créalo en: GitHub → Settings → Developer Settings → Tokens (classic)"
    echo "    Permisos necesarios: repo (read)"
    echo ""
    echo -n "    Introduce tu GitHub Token: "
    read -s GITHUB_TOKEN
    echo ""
    git clone https://${GITHUB_TOKEN}@github.com/fjmoya91/app.brokergy.git $APP_DIR
fi
cd $APP_DIR

# ── 6. Variables de entorno backend ───────────
echo "[6/9] Configurando variables de entorno..."
if [ ! -f "implementation/backend/.env" ]; then
    cp implementation/backend/.env.example implementation/backend/.env
    # Activar WhatsApp para VPS
    sed -i 's/WHATSAPP_ENABLED=false/WHATSAPP_ENABLED=true/' implementation/backend/.env
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚠️  PASO OBLIGATORIO: Edita el .env"
echo "  Rellena todos los valores reales."
echo "  Guarda con: Ctrl+X → Y → Enter"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
sleep 2
nano implementation/backend/.env

# ── 7. Compilar frontend ───────────────────────
echo "[7/9] Compilando frontend..."
# Leer vars de Supabase del .env del backend
SUPA_URL=$(grep '^SUPABASE_URL=' implementation/backend/.env | cut -d'=' -f2-)
SUPA_ANON=$(grep '^SUPABASE_ANON_KEY=' implementation/backend/.env | head -1 | cut -d'=' -f2-)

if [ -z "$SUPA_URL" ] || [ -z "$SUPA_ANON" ]; then
    echo "ERROR: SUPABASE_URL o SUPABASE_ANON_KEY no están configurados en el .env"
    exit 1
fi

cd implementation/frontend
npm ci --silent
VITE_APP_URL=https://$DOMAIN \
VITE_SUPABASE_URL=$SUPA_URL \
VITE_SUPABASE_ANON_KEY=$SUPA_ANON \
npm run build
cd $APP_DIR
echo "    Frontend compilado OK"

# ── 8. Iniciar servicios (HTTP) ────────────────
echo "[8/9] Iniciando servicios..."
mkdir -p /var/www/certbot
cp nginx/nginx.http.conf nginx/nginx.conf
docker compose up -d --build

echo "    Esperando que nginx esté listo..."
sleep 10

# Verificar que el backend responde
if curl -sf http://localhost/health > /dev/null 2>&1; then
    echo "    ✅ Backend responde OK"
else
    echo "    ⚠️  Backend tardando en arrancar (normal la primera vez, continúa...)"
fi

# ── 9. SSL con Let's Encrypt ───────────────────
echo "[9/9] Obteniendo certificado SSL para $DOMAIN..."
echo "    (El dominio debe ya apuntar a la IP de este servidor)"
echo ""

certbot certonly --webroot \
    -w /var/www/certbot \
    -d $DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --non-interactive

echo "    Activando HTTPS..."
cp nginx/nginx.https.conf nginx/nginx.conf
docker compose restart nginx

# ── Renovación automática SSL ──────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --webroot -w /var/www/certbot && cp $APP_DIR/nginx/nginx.https.conf $APP_DIR/nginx/nginx.conf && docker compose -f $APP_DIR/docker-compose.yml restart nginx") | crontab -

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ INSTALACIÓN COMPLETADA              ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  🌐 App:      https://$DOMAIN"
echo "  🔧 API:      https://$DOMAIN/api/health"
echo "  📱 WhatsApp: https://$DOMAIN/whatsapp"
echo ""
echo "Comandos útiles:"
echo "  Ver logs:      docker compose -f $APP_DIR/docker-compose.yml logs -f backend"
echo "  Reiniciar:     docker compose -f $APP_DIR/docker-compose.yml restart"
echo "  Deploy futuro: bash $APP_DIR/scripts/deploy.sh"
echo ""
