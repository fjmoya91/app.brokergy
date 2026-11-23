#!/bin/sh
# La pantalla virtual (el `wx` de CE3X crea su ventana, oculta, y Wine la quiere en un X) y el servicio.
# /tmp limpio: un cerrojo de X o una carpeta de wineserver de antes (del build o de un arranque
# anterior) dejan la primera calificación colgada o sin ventana («invalid window»; medido el 23/11/2026).
rm -rf /tmp/.X99-lock /tmp/.X11-unix /tmp/wine-* /tmp/.wine-* /tmp/ce3x
Xvfb :99 -screen 0 1024x768x24 >/dev/null 2>&1 &
# Que la pantalla esté ANTES del primer trabajo (como mucho 10 s).
i=0; while [ ! -S /tmp/.X11-unix/X99 ] && [ $i -lt 20 ]; do sleep 0.5; i=$((i+1)); done
exec node /opt/servidor.js
