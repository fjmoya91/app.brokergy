# Comprueba el montaje para presentar sin clics: Firefox con su almacén y las preferencias de AutoFirma.
# Solo LEE. Las preferencias Java van codificadas en el registro: «/X» = mayúscula, «\» = «/», «//» = «\».
# Uso: powershell -ExecutionPolicy Bypass -File comprobar_montaje.ps1 [-Titular MOYA_LOPEZ]
#   -Titular: el principio del alias que debe ser el ÚNICO certificado del almacén de Firefox.
param([string]$Titular = '')
function Decodificar([string]$s) {
  $s = $s.Replace('//', [string][char]1)
  $s = [regex]::Replace($s, '/(.)', { param($m) $m.Groups[1].Value.ToUpper() })
  $s.Replace('\', '/').Replace([string][char]1, '\')
}

$ok = $true
$ff = @(@("$env:ProgramFiles\Mozilla Firefox\firefox.exe", "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe") | Where-Object { Test-Path $_ })
if ($ff) { "OK  Firefox instalado" } else { "FALTA  Firefox no está instalado"; $ok = $false }

$clave = 'HKCU:\Software\JavaSoft\Prefs\es\gob\afirma\standalone\ui\preferences'
$prefs = @{}
if (Test-Path $clave) { $k = Get-Item $clave; foreach ($n in $k.GetValueNames()) { $prefs[(Decodificar $n)] = Decodificar ([string]$k.GetValue($n)) } }
$almacen = $prefs['defaultKeystore']; $enNavegador = $prefs['useDefaultStoreInBrowserCalls']
if ($almacen -match 'Mozilla|Firefox' -and $almacen -notmatch 'junto') { "OK  AutoFirma: almacén por defecto = $almacen" } else { "FALTA  AutoFirma: almacén por defecto = '$almacen' (debe ser Mozilla Firefox, no «junto a almacén de SO»)"; $ok = $false }
if ($enNavegador -eq 'true') { "OK  AutoFirma: se usa también en las llamadas desde el navegador" } else { "FALTA  AutoFirma: marcar «Usar también en las llamadas a Autofirma desde el navegador»"; $ok = $false }

# Lo que de verdad importa: qué certificados VE AutoFirma en ese almacén (el selector de Firefox
# enseña además los de Windows por su «OS Client Cert Token», pero AutoFirma no los carga).
$cli = "$env:ProgramFiles\AutoFirma\Autofirma\AutofirmaCommandLine.exe"
$alias = @(& $cli listaliases -store mozilla 2>$null | Where-Object { $_ -and $_ -notmatch '^Buscando' })
# El alias lleva el NIF al final: se enseña solo el nombre.
$nombres = @($alias | ForEach-Object { ($_ -replace '_+[0-9XYZ][0-9]{7}[A-Z]$', '') -replace '_', ' ' })
if ($alias.Count -eq 1 -and (-not $Titular -or $alias[0] -like "$Titular*")) { "OK  AutoFirma ve en Firefox UN certificado: $($nombres[0])" }
elseif ($alias.Count -eq 1) { "FALTA  El certificado del almacén de Firefox es de $($nombres[0]), no de $Titular"; $ok = $false }
else { "FALTA  AutoFirma ve en Firefox $($alias.Count) certificados ($($nombres -join ', ')): debe haber UNO, el de quien presenta"; $ok = $false }

if ($ok) { "`nMONTAJE LISTO" } else { "`nMONTAJE INCOMPLETO" }
