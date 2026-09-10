# Instala el proyecto CEE en local y comprueba que funciona de verdad.
#
#   Ejecutar en PowerShell. No hace falta administrador.
#   Si algo falla, para y dice EXACTAMENTE que ha fallado.
#
# Comprueba git y Python, baja el repositorio, lo deja en C:\Proyectos\CEE con
# su propio git, instala las dependencias, pasa los 92 tests y analiza la
# vivienda real de Pedro Munoz contrastando los numeros que tienen que salir.

$ErrorActionPreference = 'Stop'

$destino = 'C:\Proyectos\CEE'
$rama    = 'claude/catastro-geometry-ce3x-mvp-fx8f6d'
$repo    = 'https://github.com/fjmoya91/app.brokergy.git'
$tmp     = Join-Path $env:TEMP 'cee-clon-tmp'

function Paso($n, $texto) { Write-Host "`n[$n/6] $texto" -ForegroundColor Cyan }
function Bien($texto)     { Write-Host "      OK  $texto" -ForegroundColor Green }
function Morir($texto)    { Write-Host "`nFALLO: $texto`n" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 0. requisitos
Paso 0 'Comprobando git y Python'

try { $g = (git --version) } catch { Morir 'No hay git. Instalalo desde https://git-scm.com/download/win y vuelve a ejecutar esto.' }
Bien $g

$py = $null
foreach ($cmd in @('python', 'py')) {
    try {
        $v = (& $cmd -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $v) { $py = $cmd; $version = $v; break }
    } catch { }
}
if (-not $py) { Morir 'No hay Python. Instalalo desde https://www.python.org/downloads/ MARCANDO "Add python.exe to PATH".' }

$partes = $version.Split('.')
if ([int]$partes[0] -lt 3 -or ([int]$partes[0] -eq 3 -and [int]$partes[1] -lt 10)) {
    Morir "Python $version es demasiado antiguo. Hace falta 3.10 o superior."
}
Bien "Python $version  (comando: $py)"

if (Test-Path (Join-Path $destino 'src')) {
    Write-Host "`n      $destino ya tiene un proyecto dentro." -ForegroundColor Yellow
    $r = Read-Host '      Escribe SI para sobreescribirlo, cualquier otra cosa para parar'
    if ($r -ne 'SI') { Write-Host '      Parado sin tocar nada.'; exit 0 }
}

# ------------------------------------------------------------------- 1. clonar
# Si este script ya vive dentro de un clon (tools\ con un src\ al lado), se usa
# ese y no se vuelve a bajar nada.
$yaClonado = $null
if ($PSScriptRoot) {
    $candidato = Split-Path $PSScriptRoot -Parent
    if (Test-Path (Join-Path $candidato 'src')) { $yaClonado = $candidato }
}

if ($yaClonado) {
    Paso 1 'El proyecto ya esta bajado, no se vuelve a clonar'
    $origen = $yaClonado
    $limpiarTmp = $false
    Bien $origen
} else {
    Paso 1 'Bajando el repositorio (te pedira login de GitHub la primera vez)'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    git clone --branch $rama --depth 1 $repo $tmp
    if ($LASTEXITCODE -ne 0) { Morir 'No se pudo clonar. Revisa la conexion y el acceso al repositorio.' }
    $origen = Join-Path $tmp 'catastro-geometry'
    $limpiarTmp = $true
    if (-not (Test-Path (Join-Path $origen 'src'))) { Morir "El clon no trae la carpeta esperada ($origen)." }
    Bien 'Repositorio bajado'
}

if ($origen -eq $destino) { Morir "El origen y el destino son el mismo sitio ($destino)." }

# ------------------------------------------------------------------- 2. copiar
Paso 2 "Copiando el proyecto a $destino"
robocopy $origen $destino /E /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy usa 0-7 para exito (1 = ficheros copiados). 8 o mas es error de verdad.
if ($LASTEXITCODE -ge 8) { Morir "robocopy fallo con codigo $LASTEXITCODE" }
$global:LASTEXITCODE = 0
if ($limpiarTmp -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force }
Bien "Copiado en $destino"

# ---------------------------------------------------------------------- 3. git
Paso 3 'Dandole su propio git'
Set-Location $destino
if (Test-Path (Join-Path $destino '.git')) {
    Bien 'Ya tenia git, no se toca'
} else {
    git init -q
    git add .
    git -c user.name='CEE' -c user.email='cee@local' commit -q -m 'CEE - geometria catastral para CE3X'
    Bien 'Repositorio local creado con su primer commit'
}

# -------------------------------------------------------------- 4. dependencias
Paso 4 'Instalando dependencias (tarda un par de minutos)'
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet -r requirements.txt
if ($LASTEXITCODE -ne 0) { Morir 'Fallo pip install. Copia el error y mandamelo.' }
& $py -c "import shapely, pyproj, lxml, matplotlib, folium"
if ($LASTEXITCODE -ne 0) { Morir 'Las dependencias no cargan.' }
Bien 'Dependencias instaladas'

# --------------------------------------------------------------------- 5. tests
Paso 5 'Pasando los tests'
$salidaTests = & $py -m pytest -q 2>&1 | Out-String
if ($salidaTests -match '(\d+) passed') {
    Bien "$($Matches[1]) tests en verde"
} else {
    Write-Host $salidaTests
    Morir 'Los tests no pasaron.'
}

# ----------------------------------------------------- 6. la vivienda de verdad
Paso 6 'Analizando la vivienda real (sin pedirle nada a Catastro)'
$cache = Join-Path $destino 'ejemplos\4410205WJ0641S-pedro-munoz\cache'
$salida = & $py -m src.main 4410205WJ0641S0001JH --offline --skip-lidar --cache $cache --floor-height 2.70 2>&1 | Out-String

# Los numeros que TIENEN que salir. Si no salen, algo se ha corrompido por el camino.
$esperado = @{
    '29 cerramientos'  = '29 cerramientos'
    'suelo 191,50 m2'  = 'SUELO\s+TERRENO\s+-\s+191\.50'
    'cubierta 117,32'  = 'CUBIERTA\s+AIRE_EXTERIOR\s+-\s+117\.32'
    'particion 74,18'  = 'ESPACIO_NO_HABITABLE_SUPERIOR\s+-\s+74\.18'
}
$fallos = @()
foreach ($k in $esperado.Keys) { if ($salida -notmatch $esperado[$k]) { $fallos += $k } }

if ($fallos.Count -gt 0) {
    Write-Host $salida
    Morir ("No cuadran los numeros esperados: " + ($fallos -join ', ') +
           ". Los datos de ejemplo pueden haberse corrompido al copiar.")
}
Bien 'Los numeros cuadran con la referencia'

# ------------------------------------------------------------------------ final
Write-Host "`n===============================================" -ForegroundColor Green
Write-Host " LISTO. El proyecto esta en $destino" -ForegroundColor Green
Write-Host "===============================================`n" -ForegroundColor Green
Write-Host " El plano de la vivienda:  $destino\output\geometry_debug.png"
Write-Host " El mapa sobre ortofoto :  $destino\output\debug_map.html"
Write-Host " La tabla para CE3X     :  $destino\output\ce3x_geometry.csv"
Write-Host "`n Ahora abre Claude Code en esa carpeta:"
Write-Host "     cd $destino"
Write-Host "     claude"
Write-Host "`n (o en la app de escritorio: abrir carpeta -> $destino)"
Write-Host " CLAUDE.md se carga solo y la sesion arranca con todo el contexto.`n"

try { Invoke-Item (Join-Path $destino 'output\geometry_debug.png') } catch { }
