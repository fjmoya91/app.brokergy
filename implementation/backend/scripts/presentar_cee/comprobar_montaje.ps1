# Comprueba que este PC puede firmar en la sede sin que nadie pulse: AutoFirma instalada y el
# certificado PERSONAL de quien presenta, vigente y con su clave, en el almacén de Windows.
# Ya NO hace falta Firefox: la firma se fija por huella (certificado.js de presentar_cee.js).
# Solo LEE. Uso: powershell -ExecutionPolicy Bypass -File comprobar_montaje.ps1 [-Titular MOYA_LOPEZ]
param([string]$Titular = 'MOYA_LOPEZ')
$titular = ($Titular -replace '_', ' ').ToUpper()
$ok = $true

$cli = "$env:ProgramFiles\AutoFirma\Autofirma\AutofirmaCommandLine.exe"
if (Test-Path $cli) { "OK  AutoFirma instalada" } else { "FALTA  AutoFirma no está instalada ($cli)"; $ok = $false }

$certs = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object {
  $_.HasPrivateKey -and $_.NotBefore -lt (Get-Date) -and $_.NotAfter -gt (Get-Date) -and
  $_.Subject -match "^CN=$([regex]::Escape($titular))\b" -and $_.Subject -notmatch '\(R:' } | Sort-Object NotAfter -Descending)
if ($env:CEE_PRESENTA_HUELLA) { $certs = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $env:CEE_PRESENTA_HUELLA.Trim() -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) }) }
if ($certs.Count) {
  $c = $certs[0]
  # El nombre de la FNMT lleva el NIF al final: no se enseña.
  $nombre = $c.GetNameInfo('SimpleName', $false) -replace '\s*-\s*[0-9XYZ]\d{7}[A-Z]$', ''
  "OK  Certificado personal: $nombre ($($c.GetNameInfo('SimpleName', $true)), hasta $($c.NotAfter.ToString('dd/MM/yyyy')))"
  if ($certs.Count -gt 1) { "    (hay $($certs.Count) vigentes: se usa el que caduca más tarde)" }
  if ($c.NotAfter -lt (Get-Date).AddDays(30)) { "AVISO  caduca en menos de un mes: renuévalo" }
} else { "FALTA  No hay en el almacén de Windows un certificado personal vigente de $titular (con su clave privada)"; $ok = $false }

# Lo que pusiera el montaje viejo de Firefox no estorba (la huella está también allí), pero se dice.
$clave = 'HKCU:\Software\JavaSoft\Prefs\es\gob\afirma\standalone\ui\preferences'
if ((Test-Path $clave) -and ((Get-Item $clave).GetValue('use/Default/Store/In/Browser/Calls') -eq 'true')) {
  "INFO  AutoFirma usa en el navegador su almacén por defecto (montaje viejo con Firefox): vale igual si el certificado también está allí; si no, desmarca «Usar también en las llamadas a Autofirma desde el navegador»"
}

if ($ok) { "`nMONTAJE LISTO" } else { "`nMONTAJE INCOMPLETO" }
