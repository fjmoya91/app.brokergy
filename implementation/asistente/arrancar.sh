#!/bin/sh
# Arranque del contenedor «asistente». El repo (/opt/brokergy) está montado en /repo.
set -e
B=/repo/implementation/backend
# Los scripts piden sus dependencias en ../node_modules: en el servidor viven en la imagen.
[ -e "$B/node_modules" ] || ln -s /app/node_modules "$B/node_modules"
mkdir -p "$B/scratch/asistente"
rm -f "$B/scratch/asistente/vigia.lock"       # un lock de una vida anterior del contenedor no vale
cd "$B"
exec node scripts/asistente_vigia.js --servidor
