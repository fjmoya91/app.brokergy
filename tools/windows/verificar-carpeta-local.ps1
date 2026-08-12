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
exit 0
