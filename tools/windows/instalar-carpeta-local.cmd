@echo off
setlocal EnableExtensions

REM ---------------------------------------------------------------------------
REM  Instala / repara el protocolo "brokergylocal:" - boton "Carpeta Local".
REM
REM  OJO: este fichero es ASCII PURO a proposito. cmd.exe lee el .bat byte a byte
REM  con la codepage activa, asi que acentos o caracteres de dibujo desincronizan
REM  el parser y acaba intentando ejecutar los propios comentarios. Nada de
REM  tildes ni "chcp" aqui dentro; la documentacion con acentos va en README.md.
REM
REM  Frente al .reg suelto, este instalador:
REM    1. BORRA cualquier registro anterior del protocolo. Imprescindible: el
REM       handler original era un PowerShell inline y, aunque llevara
REM       "-WindowStyle Hidden", powershell.exe reserva su consola ANTES de
REM       aplicar el parametro, asi que parpadeaba una pantalla negra.
REM       Sobrescribir el valor no basta si quedan restos de la version vieja.
REM    2. Calcula la ruta del .vbs desde su propia ubicacion, asi que sigue
REM       funcionando aunque muevas el repositorio de sitio.
REM    3. Avisa al shell con SHChangeNotify para que Explorador y navegadores
REM       refresquen su cache de asociaciones sin reiniciar Windows.
REM    4. VERIFICA con la misma API que usa el navegador (AssocQueryString) y
REM       muestra que se va a ejecutar de verdad.
REM
REM  No necesita permisos de administrador: todo va en HKEY_CURRENT_USER.
REM ---------------------------------------------------------------------------

set "HANDLER=%~dp0brokergylocal_handler.vbs"
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"

echo.
echo ===========================================================
echo   Brokergy - Carpeta Local   [protocolo brokergylocal:]
echo ===========================================================
echo.

if not exist "%HANDLER%" (
    echo [ERROR] No encuentro el handler:
    echo         %HANDLER%
    echo         Deja este .cmd junto a brokergylocal_handler.vbs.
    goto :fin
)
if not exist "%WSCRIPT%" (
    echo [ERROR] No encuentro wscript.exe en %WSCRIPT%
    echo         Windows Script Host hace falta para abrir la carpeta sin consola.
    goto :fin
)

echo [1/4] Borrando cualquier registro anterior del protocolo...
reg delete "HKCU\Software\Classes\brokergylocal" /f >nul 2>&1

echo [2/4] Registrando el handler sin consola...
reg add "HKCU\Software\Classes\brokergylocal" /ve /t REG_SZ /d "URL:Brokergy Local Folder" /f >nul
reg add "HKCU\Software\Classes\brokergylocal" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\brokergylocal\DefaultIcon" /ve /t REG_SZ /d "%SystemRoot%\System32\imageres.dll,-112" /f >nul
reg add "HKCU\Software\Classes\brokergylocal\shell\open\command" /ve /t REG_SZ /d "\"%WSCRIPT%\" \"%HANDLER%\" \"%%1\"" /f >nul
if errorlevel 1 (
    echo [ERROR] No se pudo escribir en el registro.
    goto :fin
)

echo [3/4] Avisando al shell del cambio de asociacion...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -Namespace W -Name S -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);'; [W.S]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)" >nul 2>&1

echo [4/4] Comprobando que el sistema resuelve el protocolo...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verificar-carpeta-local.ps1"

echo.
echo ===========================================================
echo   Listo. IMPORTANTE: cierra y vuelve a abrir el navegador.
echo   Mientras esta abierto cachea el handler del protocolo, y
echo   hasta reiniciarlo seguiria lanzando el handler viejo.
echo ===========================================================

:fin
echo.
pause
endlocal
