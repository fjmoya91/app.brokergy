# Comprueba a qué programa resuelve el sistema el protocolo "brokergylocal:",
# usando AssocQueryString — la MISMA API que acaba invocando el navegador cuando
# pulsas "Carpeta Local". Mirar el registro a mano no sirve como comprobación:
# lo que importa es lo que resuelve el shell, no lo que hay escrito en una clave.
#
# Lo llama instalar-carpeta-local.cmd, pero se puede ejecutar suelto para
# diagnosticar:  powershell -ExecutionPolicy Bypass -File verificar-carpeta-local.ps1

$src = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class BrokergyAssoc {
    [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern uint AssocQueryString(int flags, int str, string pszAssoc,
                                                string pszExtra, StringBuilder pszOut, ref uint pcchOut);
    public static string Query(int what) {
        var sb = new StringBuilder(2048);
        uint n = 2048;
        return AssocQueryString(0, what, "brokergylocal", "open", sb, ref n) == 0
            ? sb.ToString() : null;
    }

    // Cuando se escribio por ultima vez la clave del protocolo. Es la fecha con la
    // que hay que comparar la antiguedad de los navegadores abiertos: un chrome.exe
    // anterior sigue usando la asociacion que resolvio al arrancar.
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int RegOpenKeyEx(IntPtr hKey, string subKey, int opts, int sam, out IntPtr res);
    [DllImport("advapi32.dll")]
    private static extern int RegQueryInfoKey(IntPtr hKey, IntPtr cls, IntPtr clsLen, IntPtr res,
        IntPtr cSub, IntPtr subLen, IntPtr clsLen2, IntPtr cVal, IntPtr valLen, IntPtr dataLen,
        IntPtr sd, out long lastWrite);
    [DllImport("advapi32.dll")]
    private static extern int RegCloseKey(IntPtr hKey);

    public static object KeyLastWrite() {
        IntPtr h;
        // HKEY_CURRENT_USER = 0x80000001, KEY_READ = 0x20019
        if (RegOpenKeyEx((IntPtr)unchecked((int)0x80000001),
                         @"Software\Classes\brokergylocal\shell\open\command", 0, 0x20019, out h) != 0)
            return null;
        long ft;
        int rc = RegQueryInfoKey(h, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero,
                                 IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out ft);
        RegCloseKey(h);
        if (rc != 0) return null;
        return DateTime.FromFileTime(ft);
    }
}
'@
Add-Type -TypeDefinition $src -ErrorAction Stop

$comando = [BrokergyAssoc]::Query(1)   # ASSOCSTR_COMMAND

if (-not $comando) {
    Write-Host '   El protocolo NO esta registrado en este equipo.' -ForegroundColor Red
    Write-Host '   Ejecuta instalar-carpeta-local.cmd.'
    exit 1
}

Write-Host "   $comando"
Write-Host ''

if ($comando -match 'powershell|cmd\.exe') {
    # powershell.exe reserva su consola antes de aplicar -WindowStyle Hidden:
    # de ahi el parpadeo de pantalla negra que motivo cambiar a wscript.
    Write-Host '   MAL - el handler es una consola: parpadeara una ventana negra.' -ForegroundColor Red
    Write-Host '   Ejecuta instalar-carpeta-local.cmd y reinicia el navegador.'
    exit 1
}

if ($comando -notmatch 'wscript') {
    Write-Host '   AVISO - el handler no es el .vbs esperado.' -ForegroundColor Yellow
    exit 1
}

# El .reg apunta al .vbs por ruta absoluta: si el repo se movio, el protocolo
# esta registrado pero senala a un fichero que ya no existe.
if ($comando -match '"([^"]*brokergylocal_handler\.vbs)"') {
    $vbs = $Matches[1]
    if (-not (Test-Path -LiteralPath $vbs)) {
        Write-Host "   MAL - el handler apunta a un fichero que no existe:" -ForegroundColor Red
        Write-Host "   $vbs"
        Write-Host '   Vuelve a ejecutar instalar-carpeta-local.cmd desde su nueva ubicacion.'
        exit 1
    }
}

Write-Host '   OK - abre el Explorador directamente, sin ventana negra.' -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# El registro puede estar PERFECTO y el boton seguir roto: Chrome resuelve el
# protocolo UNA VEZ y lo cachea mientras el proceso viva, y la app arranca como
# PWA con Windows, asi que ese chrome.exe puede llevar semanas vivo lanzando el
# handler viejo. Ha pasado dos veces (11/08/2026 y 25/08/2026) y las dos el
# diagnostico de arriba decia "OK". Por eso esta comprobacion no es opcional.
# ─────────────────────────────────────────────────────────────────────────────
$sospechosos = @()
$registrado = [BrokergyAssoc]::KeyLastWrite()
if ($registrado) {
    $sospechosos = Get-Process chrome, msedge, brave, opera -ErrorAction SilentlyContinue |
        Where-Object { $_.StartTime -and $_.StartTime -lt $registrado }
}

# Rastro forense directo: cada ejecucion del handler VIEJO (PowerShell inline)
# deja un evento 400 en el log "Windows PowerShell" con la linea de comandos.
# OJO: el patron se construye por concatenacion y se excluye -NonInteractive
# porque, si no, este mismo script casa con su propio filtro (falso positivo).
$proto = 'brokergy' + 'local:'
$viejo = Get-WinEvent -LogName 'Windows PowerShell' -MaxEvents 600 -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -eq 400 -and $_.Message -match $proto -and
                   $_.Message -match ('Window' + 'Style Hidden') -and
                   $_.Message -notmatch 'NonInteractive' } |
    Select-Object -First 1

if ($viejo -or $sospechosos) {
    Write-Host ''
    Write-Host '   PERO el handler VIEJO (PowerShell) sigue en uso.' -ForegroundColor Red
    if ($viejo) {
        Write-Host ("   Ultima vez que se ejecuto: {0}" -f $viejo.TimeCreated)
    }
    if ($registrado) {
        Write-Host ("   El protocolo se registro el:  {0}" -f $registrado)
    }
    foreach ($p in $sospechosos) {
        $pwa = ''
        try {
            $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
            if ($cl -match '--app-id=') { $pwa = '   <-- ventana de la APP (PWA)' }
        } catch {}
        Write-Host ("   {0} PID {1} vivo desde {2}{3}" -f $p.ProcessName, $p.Id, $p.StartTime, $pwa)
    }
    Write-Host ''
    Write-Host '   Sintoma tipico: con carpetas cuyo nombre lleva COMA el Explorador' -ForegroundColor Yellow
    Write-Host '   abre "Documentos" en vez de la carpeta (el handler viejo pasaba la'
    Write-Host '   ruta a explorer.exe SIN comillas y la coma la parte por la mitad).'
    Write-Host ''
    Write-Host '   ARREGLO: cierra del todo el navegador -incluida la ventana de la app'
    Write-Host '   BROKERGY, la que no tiene barra de direcciones- y vuelve a abrirlo.'
    exit 2
}

exit 0
