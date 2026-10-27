# Vigilante de AutoFirma: la RED de seguridad de la firma en la sede. NUNCA acepta nada.
#
# La firma sale sin ventana porque, antes de cada firma, la página lleva `certificado.js`
# (presentar_cee.js preparar): fija el certificado por huella con `headless=true` y AutoFirma
# firma sin preguntar. Si aun así aparece la ventana «Diálogo de seguridad del almacén …», es que
# esa llamada salió SIN el filtro (la página se recargó, o la firma de identificación se disparó
# antes de pegarlo). En el almacén de Windows hay certificados de varias personas: un Intro a
# ciegas podría firmar con el de otro. Por eso el vigilante la CANCELA (Escape), lo dice y sigue
# vigilando; quien presenta vuelve a pegar `certificado.js` y repite la firma.
#
# Uso: powershell -ExecutionPolicy Bypass -File vigilante_autofirma.ps1 [-Segundos 1800] [-Veces 5]
#   Sale con 0 sin haber visto ninguna ventana (lo normal), 2 si ha cancelado alguna.
param([int]$Segundos = 1800, [int]$Veces = 5)

Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
Add-Type -AssemblyName System.Windows.Forms

function Buscar-Dialogo {
  $res = New-Object System.Collections.ArrayList
  [W]::EnumWindows({ param($h, $l)
    if ([W]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 512
      [void][W]::GetWindowText($h, $sb, 512)
      $t = $sb.ToString()
      if ($t -match 'seguridad del almac') { [void]$res.Add([pscustomobject]@{ H = $h; Titulo = $t }) }
    }
    $true }, [IntPtr]::Zero) | Out-Null
  return $res
}

$canceladas = 0
$fin = (Get-Date).AddSeconds($Segundos)
while ((Get-Date) -lt $fin -and $canceladas -lt $Veces) {
  foreach ($d in (Buscar-Dialogo)) {
    $procId = 0; [void][W]::GetWindowThreadProcessId($d.H, [ref]$procId)
    $proc = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    if ($proc -notmatch '^(java|javaw|autofirma)$') { continue }
    [void][W]::ShowWindow($d.H, 9)
    [void][W]::SetForegroundWindow($d.H)
    Start-Sleep -Milliseconds 400
    # El Escape solo si la ventana de delante es la de AutoFirma: si no, iría a la del usuario.
    if ([W]::GetForegroundWindow() -ne $d.H) { Write-Output "SIN_FOCO | $($d.Titulo) | no se ha podido cancelar: ciérrala con Cancelar"; continue }
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    $canceladas++
    Write-Output "CANCELADO_SIN_FILTRO | $($d.Titulo) | $(Get-Date -Format HH:mm:ss) | pega certificado.js y repite la firma"
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Milliseconds 500
}
if ($canceladas -eq 0) { Write-Output "SIN_VENTANAS en $Segundos s"; exit 0 }
exit 2
