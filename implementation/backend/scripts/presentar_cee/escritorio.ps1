# Lo que el navegador no deja hacer desde la página, hecho con el teclado y el ratón REALES de
# Windows. La extensión de Chrome no llega a:
#   · los avisos `alert()` de la sede («Si va a presentar más de una solicitud…», «Vas a ser
#     redirigido a la pasarela…», «Se van a firmar los datos…»): mientras están abiertos la página
#     no responde, ni a capturas ni a JavaScript;
#   · el desplegable de TARJETAS guardadas de Chrome en la pasarela de Redsys: es del navegador, no
#     de la página, y no se abre con un clic simulado.
#
# Uso (PowerShell 5.1):
#   escritorio.ps1 aviso    [-Ventana 'Portal de la Junta'] [-Segundos 8] → pulsa «Aceptar» del aviso y dice su texto
#   escritorio.ps1 leer     [-Ventana 'Portal de la Junta']   → dice el texto del aviso abierto, sin tocarlo
#   escritorio.ps1 pestana  [-Ventana 'Pantalla de pago Redsys'] → activa esa pestaña (sin traerla delante)
#   escritorio.ps1 captura  -Salida C:\…\pantalla.png [-Zona x,y,ancho,alto] [-Ancho 1280]
#   escritorio.ps1 clic     -X 1128 -Y 310                     → clic izquierdo real en esa posición
#   escritorio.ps1 teclas   -Teclas '{DOWN}' [-Ventana 'Pantalla de pago Redsys']
#   escritorio.ps1 frente   [-Ventana 'Pantalla de pago Redsys']
#
# `aviso` y `leer` van por UI AUTOMATION (la accesibilidad de Windows): pulsan el botón «Aceptar» del
# cuadro de Chrome SIN traer la ventana delante y sin teclas, así que no hay Intro que pueda caer en
# otra ventana (27/10/2026: en el PC nuevo, con la app de Claude delante, el Intro iba a la app).
#
# `frente` (y `teclas`, `clic` tras él) trae Chrome delante con una pulsación de Alt antes de
# SetForegroundWindow: sin ella Windows no cede el primer plano a un proceso que no lo tiene y la
# ventana se queda detrás (medido el 27/10/2026). Después COMPRUEBA qué ventana quedó delante y, si
# no es la pedida, para con NO_DELANTE: nunca una tecla ni un clic a ciegas.
#
# Las coordenadas son PÍXELES DE PANTALLA (no los de la captura de la extensión). Ojo: la franja
# «Claude empezó a depurar este navegador» aparece y desaparece y mueve la página ~55 px: se captura
# justo antes de pinchar y se calcula sobre ESA captura.
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet('aviso', 'leer', 'pestana', 'captura', 'clic', 'teclas', 'frente')][string]$Accion,
  [int]$Segundos = 8,
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
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
# Con la pantalla escalada (125 % en el PC nuevo), un proceso que no es «DPI-aware» captura en píxeles
# REALES recortados a la medida escalada (1536×864 de 1920×1080) pero hace los clics en píxeles
# ESCALADOS: el clic sobre «Número de tarjeta» caía fuera del campo (27/10/2026). Así, captura y clic
# usan los mismos píxeles reales de la pantalla entera.
[void][Esc]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes

function Titulo([IntPtr]$h) { $sb = New-Object System.Text.StringBuilder 512; [void][Esc]::GetWindowText($h, $sb, 512); $sb.ToString() }

function Al-Frente([string]$titulo) {
  $script:hallada = [IntPtr]::Zero
  [Esc]::EnumWindows({ param($h, $l)
      if ([Esc]::IsWindowVisible($h) -and (Titulo $h) -like "$titulo*Chrome*") { $script:hallada = $h; return $false }
      $true }, [IntPtr]::Zero) | Out-Null
  if ($script:hallada -eq [IntPtr]::Zero) { Write-Output "SIN_VENTANA | ninguna ventana de Chrome empieza por «$titulo»"; exit 1 }
  # Alt pulsado y soltado: sin él Windows no deja cambiar el primer plano y la ventana se queda detrás.
  [Esc]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Esc]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  if ([Esc]::IsIconic($script:hallada)) { [void][Esc]::ShowWindow($script:hallada, 9) }
  [void][Esc]::SetForegroundWindow($script:hallada)
  Start-Sleep -Milliseconds 400
  $delante = Titulo ([Esc]::GetForegroundWindow())
  if ($delante -notlike "$titulo*") { Write-Output "NO_DELANTE | delante está «$delante»: no se manda nada"; exit 1 }
}

# Activa, por UI Automation, la pestaña cuyo título empieza por «$titulo» (seleccionándola en la barra
# de pestañas), sin traer la ventana delante. Chrome solo enseña el aviso de la pestaña ACTIVA de su
# ventana: la de la sede puede estar detrás de la de la extensión («Claude in Chrome»).
function Activar-Pestana([string]$titulo) {
  $AE = [System.Windows.Automation.AutomationElement]; $TS = [System.Windows.Automation.TreeScope]
  $cw = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'Chrome_WidgetWin_1')
  $ct = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
  foreach ($w in $AE::RootElement.FindAll($TS::Children, $cw)) {
    if ($w.Current.Name -like "$titulo*") { return $true }
    $t = $w.FindAll($TS::Descendants, $ct) | Where-Object { $_.Current.Name -like "$titulo*" } | Select-Object -First 1
    if ($t) { $t.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); Start-Sleep -Milliseconds 500; return $true }
  }
  return $false
}

# El cuadro del aviso de Chrome en la ventana «$titulo…», por UI Automation: su botón y su texto.
function Buscar-Aviso([string]$titulo, [int]$segundos) {
  [void](Activar-Pestana $titulo)
  $AE = [System.Windows.Automation.AutomationElement]; $TS = [System.Windows.Automation.TreeScope]
  $cw = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, 'Chrome_WidgetWin_1')
  $cb = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $ct = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
  $fin = (Get-Date).AddSeconds($segundos)
  do {
    foreach ($w in ($AE::RootElement.FindAll($TS::Children, $cw) | Where-Object { $_.Current.Name -like "$titulo*" })) {
      $b = $w.FindAll($TS::Descendants, $cb) | Where-Object { $_.Current.Name -in @('Aceptar', 'OK') } | Select-Object -First 1
      if (-not $b) { continue }
      $texto = ''; $p = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($b)
      for ($i = 0; $i -lt 3 -and $p -and -not $texto; $i++) {
        $texto = (($p.FindAll($TS::Descendants, $ct) | ForEach-Object { $_.Current.Name.Trim() } | Where-Object { $_ }) -join ' ')
        $p = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($p)
      }
      return @{ boton = $b; texto = $texto }
    }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $fin)
  return $null
}

# Si el cuadro no aparece en la accesibilidad (a veces Chrome no lo publica hasta que su ventana
# pasa delante, 26RES080_96), se trae Chrome delante —Alt + SetForegroundWindow, sin teclas ni
# clics— y se busca otra vez.
function Buscar-Aviso-Insistiendo([string]$titulo, [int]$segundos) {
  $a = Buscar-Aviso $titulo ([Math]::Max(2, [int]($segundos / 2)))
  if ($a) { return $a }
  $script:hallada = [IntPtr]::Zero
  [Esc]::EnumWindows({ param($h, $l)
      if ([Esc]::IsWindowVisible($h) -and (Titulo $h) -like "$titulo*Chrome*") { $script:hallada = $h; return $false }
      $true }, [IntPtr]::Zero) | Out-Null
  if ($script:hallada -ne [IntPtr]::Zero) {
    [Esc]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Esc]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [void][Esc]::SetForegroundWindow($script:hallada); Start-Sleep -Milliseconds 500
  }
  return Buscar-Aviso $titulo ([Math]::Max(2, [int]($segundos / 2)))
}

switch ($Accion) {
  'aviso' {
    $a = Buscar-Aviso-Insistiendo $Ventana $Segundos
    if (-not $a) { Write-Output "SIN_AVISO | ningún aviso abierto en «$Ventana» (o su pestaña no es la de delante en su ventana)"; exit 1 }
    $a.boton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Write-Output "AVISO_ACEPTADO | $($a.texto)"
  }
  'leer' {
    $a = Buscar-Aviso-Insistiendo $Ventana $Segundos
    if (-not $a) { Write-Output "SIN_AVISO | $Ventana"; exit 1 }
    Write-Output "AVISO | $($a.texto)"
  }
  'pestana' {
    if (Activar-Pestana $Ventana) { Write-Output "PESTANA_ACTIVA | $Ventana" } else { Write-Output "SIN_PESTANA | $Ventana"; exit 1 }
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
