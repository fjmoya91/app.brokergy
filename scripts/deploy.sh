#!/bin/bash
set -e

APP_DIR="/opt/brokergy"
cd $APP_DIR

# ── 0. Un deploy cada vez ──────────────────────
# Dos sesiones desplegando a la vez (22/11/2026, 18:11) se pisaron al recrear los contenedores
# («The container name "/brokergy-rite" is already in use») y la app se quedó PARADA, con todo en
# «Created», hasta levantarla a mano. El segundo espera a que acabe el primero y después hace su
# propio `git pull`, así que despliega lo último de los dos.
exec 9>/var/lock/brokergy-deploy.lock
if ! flock -n 9; then
  echo "Hay otro deploy en marcha: espero a que termine (máximo 20 min)..."
  flock -w 1200 9 || { echo "El otro deploy no ha terminado en 20 min: no sigo."; exit 1; }
  echo "    El otro ha terminado: sigo."
fi

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
echo "[3/4] Reconstruyendo backend, MCP, RITE, motor CEE y xml2cert..."
docker compose build --no-cache backend mcp
# rite-generator: build con caché (la capa pesada de pip se reutiliza salvo que
# cambie requirements.txt; el código se recopia siempre).
docker compose build rite-generator
# cee-engine: mismo criterio que el RITE. La imagen corre los tests del
# motor al construirse, asi que una imagen que sale es una imagen que pasa.
docker compose build cee-engine
# xml2cert (el PDF del CEE desde su XML): con caché, Wine, Java y las fuentes no se
# vuelven a bajar. Se autoprueba al construirse: sin PDF o sin fuentes, no sale.
docker compose build xml2cert
docker compose up -d backend mcp rite-generator cee-engine xml2cert
echo "    OK"

# ── 3a. El motor de CE3X (ce3x-engine), solo si CE3X está subido al VPS ───
# CE3X no va en el repo: su carpeta instalada vive en /opt/brokergy-ce3x (README de
# implementation/ce3x-engine). Sin ella se salta (y la app sigue calificando en el PC). Con caché:
# Wine no se vuelve a bajar. Se autoprueba al construirse: si CE3X no califica, no sale imagen y
# el contenedor de antes sigue. Se ENCIENDE con CE3X_URL en el .env del backend.
if [ -f /opt/brokergy-ce3x/programa/python27.dll ]; then
  echo "    Motor de CE3X: lo reconstruyo..."
  if docker compose build ce3x-engine && docker compose up -d ce3x-engine; then echo "    Motor de CE3X OK"
  else echo "    ⚠ El motor de CE3X no se ha construido: sigue el de antes (o ninguno)."; fi
else
  echo "    (Sin /opt/brokergy-ce3x: el motor de CE3X no se construye; se califica en el PC.)"
fi

# ── 3b. El ASISTENTE, solo si está libre ───────
# Su imagen sale de la del backend (FROM brokergy-backend:latest): sin reconstruirla se queda con los
# node_modules viejos —el 23/11/2026 llevaba los del 19/10 y le faltaba jszip, así que el presupuesto
# del instalador no se enlazaba a la oportunidad—. NUNCA con un trabajo en marcha (regla 113): se
# pregunta al vigía (`/estado` → `trabajando`) antes de construir y otra vez antes de recrearlo.
asistente_libre() {
  docker exec brokergy-asistente node -e "fetch('http://127.0.0.1:'+(process.env.ASISTENTE_PUERTO||8091)+'/estado').then(r=>r.json()).then(j=>process.exit(j.trabajando||j.calificando?1:0)).catch(()=>process.exit(2))" 2>/dev/null
}
if docker ps --format '{{.Names}}' | grep -qx brokergy-asistente; then
  if asistente_libre; then
    echo "    Asistente libre: lo reconstruyo con la imagen nueva del backend..."
    docker compose build asistente
    if asistente_libre; then docker compose up -d asistente; echo "    Asistente OK"
    else echo "    ⚠ El asistente ha empezado un trabajo mientras construía: no lo recreo. Luego: docker compose up -d asistente"; fi
  else
    echo "    ⚠ El asistente está trabajando (o no contesta): no lo reconstruyo. Cuando acabe: docker compose build asistente && docker compose up -d asistente"
  fi
fi

# ── 4. Recargar nginx ──────────────────────────
echo "[4/4] Recargando nginx..."
docker compose exec nginx nginx -s reload
echo "    OK"

echo ""
echo "✅ Deploy completado — https://app.brokergy.es"
echo ""
