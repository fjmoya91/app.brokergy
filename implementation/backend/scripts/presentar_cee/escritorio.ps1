# Lo que el navegador no deja hacer desde la página, hecho con el teclado y el ratón REALES de
# Windows. La extensión de Chrome no llega a:
#   · los avisos `alert()` de la sede («Si va a presentar más de una solicitud…», «Vas a ser
#     redirigido a la pasarela…», «Se van a firmar los datos…»): mientras están abiertos la página
#     no responde, ni a capturas ni a JavaScript;
#   · el desplegable de TARJETAS guardadas de Chrome en la pasarela de Redsys: es del navegador, no
#     de la página, y no se abre con un clic simulado.
#
# Uso (PowerShell 5.1):
#   escritorio.ps1 aviso    [-Ventana 'Portal de la Junta']   → trae Chrome al frente y pulsa Intro
#   escritorio.ps1 captura  -Salida C:\…\pantalla.png [-Zona x,y,ancho,alto] [-Ancho 1280]
#   escritorio.ps1 clic     -X 1128 -Y 310                     → clic izquierdo real en esa posición
#   escritorio.ps1 teclas   -Teclas '{DOWN}' [-Ventana 'Pantalla de pago Redsys']
#
# Las coordenadas son PÍXELES DE PANTALLA (no los de la captura de la extensión). Ojo: la franja
# «Claude empezó a depurar este navegador» aparece y desaparece y mueve la página ~55 px: se captura
# justo antes de pinchar y se calcula sobre ESA captura.
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet('aviso', 'captura', 'clic', 'teclas', 'frente')][string]$Accion,
  [string]$Ventana = 'Portal de la Junta',
  [string]$Salida = '',
  [string]$Zona = '',   # "x,y,ancho,alto" (texto: con -File no llega un array)
  [int]$Ancho = 0,
  [int]$X = 0, [int]$Y = 0,
  [string]$Teclas = ''
)

Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class Esc {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
}
"@
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Al-Frente([string]$titulo) {
  $script:hallada = [IntPtr]::Zero
  [Esc]::EnumWindows({ param($h, $l)
      if ([Esc]::IsWindowVisible($h)) {
        $sb = New-Object System.Text.StringBuilder 512
        [void][Esc]::GetWindowText($h, $sb, 512)
        if ($sb.ToString() -like "$titulo*Chrome*") { $script:hallada = $h; return $false }
      }
      $true }, [IntPtr]::Zero) | Out-Null
  if ($script:hallada -eq [IntPtr]::Zero) { Write-Output "SIN_VENTANA | ninguna ventana de Chrome empieza por «$titulo»"; exit 1 }
  [void][Esc]::SetForegroundWindow($script:hallada)
  Start-Sleep -Milliseconds 400
}

switch ($Accion) {
  'aviso' {
    Al-Frente $Ventana
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Write-Output "AVISO_ACEPTADO | $Ventana"
  }
  'frente' {
    Al-Frente $Ventana
    Write-Output "AL_FRENTE | $Ventana"
  }
  'teclas' {
    if ($Ventana) { Al-Frente $Ventana }
    [System.Windows.Forms.SendKeys]::SendWait($Teclas)
    Write-Output "TECLAS | $Teclas"
  }
  'clic' {
    [void][Esc]::SetCursorPos($X, $Y); Start-Sleep -Milliseconds 300
    [Esc]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60
    [Esc]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Write-Output "CLIC | $X,$Y"
  }
  'captura' {
    if (-not $Salida) { Write-Output 'Falta -Salida'; exit 1 }
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $z = @($Zona -split '[,; ]+' | Where-Object { $_ } | ForEach-Object { [int]$_ })
    if ($z.Count -eq 4) { $bmp = $bmp.Clone((New-Object System.Drawing.Rectangle $z[0], $z[1], $z[2], $z[3]), $bmp.PixelFormat) }
    if ($Ancho -gt 0 -and $bmp.Width -gt $Ancho) {
      $alto = [int]($bmp.Height * $Ancho / $bmp.Width)
      $r = New-Object System.Drawing.Bitmap $Ancho, $alto
      [System.Drawing.Graphics]::FromImage($r).DrawImage($bmp, 0, 0, $Ancho, $alto)
      $bmp = $r
    }
    $bmp.Save($Salida, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "CAPTURA | $Salida | pantalla $($b.Width)x$($b.Height)"
  }
}
