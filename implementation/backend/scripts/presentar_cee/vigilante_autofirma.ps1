# Vigilante de AutoFirma: acepta la ventana de selección de certificado SOLO si es la del almacén
# de Mozilla Firefox (donde solo está el certificado personal de Fran). Con el almacén de Windows
# (seis certificados, de varias personas) NO toca nada y sale con código 2.
#
# Por qué basta un Intro: con UN solo certificado AutoFirma usa un JOptionPane normal con
# OK/CANCEL y el foco inicial en «Aceptar» (CertificateSelectionDialog.java: `certs.length > 1 ?
# new CertOptionPane(...) : new JOptionPane()`). Con varios, el foco va a la lista: por eso, si el
# título no es el de Firefox, no se pulsa nada.
#
# Uso: powershell -ExecutionPolicy Bypass -File vigilante_autofirma.ps1 [-Segundos 300] [-Veces 1]
param([int]$Segundos = 300, [int]$Veces = 1)

Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
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

$hechas = 0
$fin = (Get-Date).AddSeconds($Segundos)
while ((Get-Date) -lt $fin -and $hechas -lt $Veces) {
  foreach ($d in (Buscar-Dialogo)) {
    $procId = 0; [void][W]::GetWindowThreadProcessId($d.H, [ref]$procId)
    $proc = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    # AutoFirma 1.9 titula el almacén de Firefox «Diálogo de seguridad del almacén NSS» (medido el 15/10/2026).
    $esFirefox = $d.Titulo -match 'NSS$|Mozilla|Firefox' -and $d.Titulo -notmatch 'junto|SO\b|Windows'
    $esAutofirma = $proc -match '^(java|javaw|autofirma)$'
    if (-not ($esFirefox -and $esAutofirma)) {
      Write-Output "ALMACEN_EQUIVOCADO | $($d.Titulo) | proceso: $proc  -> no se toca"
      exit 2
    }
    [void][W]::ShowWindow($d.H, 9)
    [void][W]::SetForegroundWindow($d.H)
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    $hechas++
    Write-Output "ACEPTADO | $($d.Titulo) | $(Get-Date -Format HH:mm:ss)"
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Milliseconds 500
}
if ($hechas -eq 0) { Write-Output "SIN_DIALOGO en $Segundos s"; exit 1 }
exit 0
