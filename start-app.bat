@echo off
echo ===================================================
echo   INICIANDO SISTEMA DE CONSULTA CATASTRAL
echo ===================================================
echo.

:: 1. Start Backend in a new window
echo [1/2] Arrancando Backend (Node.js)...
start "Backend API (Port 3000)" cmd /k "cd implementation\backend && echo Instalando dependencias (si faltan)... && npm install && echo Iniciando Servidor... && node server.js"

:: Wait a moment for backend to spin up
timeout /t 5 /nobreak >nul

:: 2. Start Frontend in a new window
echo [2/2] Arrancando Frontend (React)...
start "Frontend App (Port 5173)" cmd /k "cd implementation\frontend && echo Instalando dependencias (si faltan)... && npm install && echo Iniciando Vite... && npm run dev"

echo.
echo ===================================================
echo   TODO LISTO!
echo   La web se abrira automaticamente en unos segundos.
echo   Si no, visita: http://localhost:5173
echo ===================================================
echo.
pause
