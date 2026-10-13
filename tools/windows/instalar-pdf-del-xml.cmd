@echo off
rem ==========================================================================
rem instalar-pdf-del-xml.cmd - el PDF del CEE sale solo al guardar su XML.
rem
rem   instalar-pdf-del-xml.cmd           lo pone en el inicio de Windows y lo arranca ya
rem   instalar-pdf-del-xml.cmd quitar    lo quita del inicio y lo para
rem
rem Pone un acceso directo "BROKERGY PDF del CEE" en la carpeta Inicio del usuario
rem (sin permisos de administrador) que lanza pdf_del_xml.vbs con wscript: sin
rem ventana. ASCII PURO a proposito: cmd.exe lee el .cmd con la codepage activa
rem y un acento desincroniza el parser.
rem ==========================================================================
setlocal
set "VBS=%~dp0pdf_del_xml.vbs"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BROKERGY PDF del CEE.lnk"

if /I "%~1"=="quitar" goto quitar

if not exist "%VBS%" (echo No encuentro %VBS% & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath=\"$env:SystemRoot\System32\wscript.exe\"; $s.Arguments='\"'+$env:VBS+'\"'; $s.WorkingDirectory=(Split-Path $env:VBS); $s.Description='Hace el PDF oficial del CEE al guardar su XML'; $s.Save()"
if not exist "%LNK%" (echo No se ha podido crear el acceso directo. & exit /b 1)
echo Acceso directo creado en el inicio de Windows:
echo   %LNK%
call :parar
start "" "%SystemRoot%\System32\wscript.exe" "%VBS%"
echo Arrancado. Lo que hace queda en %LOCALAPPDATA%\Brokergy\pdf-del-xml.log
exit /b 0

:quitar
if exist "%LNK%" del "%LNK%"
call :parar
echo Quitado del inicio y parado.
exit /b 0

:parar
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'pdf_del_xml\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
exit /b 0
