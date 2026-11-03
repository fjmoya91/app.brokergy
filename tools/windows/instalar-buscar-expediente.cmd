@echo off
rem instalar-buscar-expediente.cmd - compila BuscarExpediente.cs en tools\windows\bin y crea los
rem accesos directos "Buscar expediente" (escritorio y menu Inicio; el del menu con Ctrl+Alt+B) y,
rem si ya esta anclado a la barra de tareas, le pone la ruta y el icono del .exe nuevo.
rem Volver a lanzarlo tras tocar el .cs. ASCII PURO: con acentos cmd.exe desincroniza el parser.
rem NO en %LOCALAPPDATA%: lanzado desde la app de Claude (paquete MSIX), Windows desvia lo que se crea
rem en AppData a ...\Packages\Claude_...\LocalCache y el .exe no existe para el resto del sistema.
setlocal
set "SRC=%~dp0BuscarExpediente.cs"
set "ICO=%~dp0buscar-expediente.ico"
set "DEST=%~dp0bin"
set "EXE=%DEST%\BuscarExpediente.exe"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%DEST%" mkdir "%DEST%"
taskkill /im BuscarExpediente.exe /f >nul 2>&1

"%CSC%" /nologo /codepage:65001 /target:winexe /optimize "/out:%EXE%" "/win32icon:%ICO%" "/resource:%ICO%,buscar-expediente.ico" /r:System.Windows.Forms.dll /r:System.Drawing.dll "%SRC%"
if errorlevel 1 (
    echo ERROR al compilar BuscarExpediente.cs
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; foreach ($p in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) { $l = $w.CreateShortcut((Join-Path $p 'Buscar expediente.lnk')); $l.TargetPath = $env:EXE; $l.IconLocation = $env:EXE + ',0'; $l.Description = 'Abre la carpeta local de un expediente'; if ($p -like '*Programs') { $l.Hotkey = 'CTRL+ALT+B' }; $l.Save(); Write-Host ('Acceso directo: ' + $l.FullName) }; Get-ChildItem ($env:APPDATA + '\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar') -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object { $l = $w.CreateShortcut($_.FullName); if ($l.TargetPath -like '*BuscarExpediente.exe') { $l.TargetPath = $env:EXE; $l.IconLocation = $env:EXE + ',0'; $l.Save(); Write-Host ('Anclaje de la barra: ' + $_.Name) } }"

echo.
echo Listo: %EXE%
echo Doble clic en "Buscar expediente" del escritorio, o Ctrl+Alt+B desde cualquier sitio.
timeout /t 8
