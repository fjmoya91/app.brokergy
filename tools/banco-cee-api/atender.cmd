@echo off
rem ==========================================================================
rem  Vigilante de la cola «Generar con IA» (botón CE3X de la app).
rem  Déjalo abierto en el PC que tiene el motor, CE3X 3.2 y la llave de la API
rem  (tools\banco-cee-api\.env). Si se cae, se vuelve a levantar a los 30 s.
rem ==========================================================================
title BROKERGY - CEE con IA (cola)
cd /d "%~dp0"
:otra
node banco.mjs atender
echo.
echo El vigilante se ha parado. Vuelvo a arrancarlo en 30 s (Ctrl+C para salir)...
timeout /t 30 /nobreak >nul
goto otra
