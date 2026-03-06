@echo off
title BROKERGY - Modo Presentacion
echo ===================================================
echo   INICIANDO MODO PRESENTACION (ACCESIBLE DESDE MOVIL)
echo ===================================================
echo.

:: 1. Start Backend
echo [1/3] Arrancando Backend...
start "Backend" /min cmd /k "cd implementation\backend && node server.js"

:: 2. Start Frontend
echo [2/3] Arrancando Frontend...
start "Frontend" /min cmd /k "cd implementation\frontend && npm run dev"

echo Esperando a que los servicios estabilicen (10s)...
timeout /t 10 /nobreak >nul

:: 3. Start Tunnel
echo [3/3] Abriendo Tunel Publico...
echo.
echo ---------------------------------------------------
echo INSTRUCCIONES:
echo 1. Se abrira una ventana negra de "Localtunnel".
echo 2. Busca la linea que dice "your url is: https://xxxx.localtunnel.me"
echo 3. Copia esa direccion en tu movil.
echo 4. Si pide "Tunnel Reminder", solo dale al boton "Click to Continue".
echo ---------------------------------------------------
echo.

npx localtunnel --port 5173

pause
