' ─────────────────────────────────────────────────────────────────────────────
' brokergylocal_handler.vbs — handler del protocolo "brokergylocal:" de Brokergy-App.
'
' Lo lanza wscript.exe (que NO crea ventana de consola, a diferencia de PowerShell),
' registrado en brokergylocal_setup.reg como:
'     wscript.exe "ruta\brokergylocal_handler.vbs" "%1"
'
' Recibe la URL  brokergylocal:<base64url-de-la-ruta>  , la decodifica (UTF-8) y abre
' el Explorador de Windows en esa carpeta. SIN parpadeo de consola.
'
' El path llega en base64url (con padding '=') para no romperse con espacios, acentos
' ni barras en la URL del protocolo.
' ─────────────────────────────────────────────────────────────────────────────

Option Explicit

Dim args, url, path, sh, fso
Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit

url = args(0)

' Quitar el esquema y posibles barras iniciales/finales que pueda añadir el navegador
url = Replace(url, "brokergylocal:", "")
Do While Len(url) > 0 And Left(url, 1) = "/" : url = Mid(url, 2) : Loop
Do While Len(url) > 0 And Right(url, 1) = "/" : url = Left(url, Len(url) - 1) : Loop

path = Base64UrlToUtf8(url)
If Len(path) = 0 Then WScript.Quit

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

If fso.FolderExists(path) Then
    ' Abrir la carpeta directamente en el Explorador (sin esperar, sin consola)
    sh.Run "explorer.exe """ & path & """", 1, False
Else
    MsgBox "No existe la carpeta local:" & vbCrLf & path, vbExclamation, "Brokergy - Carpeta local"
End If

' Decodifica base64url (UTF-8) usando MSXML (bin.base64) + ADODB.Stream
Function Base64UrlToUtf8(s)
    On Error Resume Next
    Base64UrlToUtf8 = ""
    If Len(s) = 0 Then Exit Function
    s = Replace(s, "-", "+")
    s = Replace(s, "_", "/")

    Dim xml, node, bytes, stream
    Set xml = CreateObject("MSXML2.DOMDocument.6.0")
    Set node = xml.createElement("b64")
    node.dataType = "bin.base64"
    node.text = s
    bytes = node.nodeTypedValue
    If IsEmpty(bytes) Then Exit Function

    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1            ' binario
    stream.Open
    stream.Write bytes
    stream.Position = 0
    stream.Type = 2            ' texto
    stream.Charset = "utf-8"
    Base64UrlToUtf8 = stream.ReadText
    stream.Close
End Function
