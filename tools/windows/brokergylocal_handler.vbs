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
' ROBUSTEZ ante caracteres ilegales: Windows no permite  \ / : * ? " < > |  en nombres
' de carpeta, y Google Drive para escritorio los sustituye al sincronizar (p.ej. "/"
' por un espacio). Si la ruta exacta no existe, ResolvePath() baja carpeta a carpeta
' buscando la coincidencia REAL en disco (comparación normalizada), así funciona sea
' cual sea la sustitución que haya hecho Google. Futuros casos quedan cubiertos.
' ─────────────────────────────────────────────────────────────────────────────

Option Explicit

Dim args, url, path, resolved, sh
Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit

url = args(0)

' Quitar el esquema y posibles barras iniciales/finales que pueda añadir el navegador
url = Replace(url, "brokergylocal:", "")
Do While Len(url) > 0 And Left(url, 1) = "/" : url = Mid(url, 2) : Loop
Do While Len(url) > 0 And Right(url, 1) = "/" : url = Left(url, Len(url) - 1) : Loop

path = Base64UrlToUtf8(url)
If Len(path) = 0 Then WScript.Quit

resolved = ResolvePath(path)

Set sh = CreateObject("WScript.Shell")
If Len(resolved) > 0 Then
    ' Abrir la carpeta directamente en el Explorador (sin esperar, sin consola)
    sh.Run "explorer.exe """ & resolved & """", 1, False
Else
    MsgBox "No existe la carpeta local:" & vbCrLf & path, vbExclamation, "Brokergy - Carpeta local"
End If

' ── Resolución de ruta tolerante a caracteres ilegales ───────────────────────
' Devuelve la ruta REAL en disco. Si la ruta exacta existe, la usa tal cual.
' Si no, baja segmento a segmento y, para el segmento que no encaje, busca la
' subcarpeta cuyo nombre NORMALIZADO coincida (tolerando \ / : * ? " < > | y "_").
Function ResolvePath(targetPath)
    Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")
    ResolvePath = ""
    If fso.FolderExists(targetPath) Then ResolvePath = targetPath : Exit Function

    Dim parts : parts = Split(targetPath, "\")
    If UBound(parts) < 0 Then Exit Function

    Dim cur : cur = parts(0)                         ' la unidad, p.ej. "C:"
    If InStr(cur, ":") > 0 And Right(cur, 1) <> "\" Then cur = cur & "\"
    If Not fso.FolderExists(cur) Then Exit Function

    Dim i, seg, candidate, best
    For i = 1 To UBound(parts)
        seg = parts(i)
        If Len(seg) > 0 Then
            candidate = fso.BuildPath(cur, seg)
            If fso.FolderExists(candidate) Then
                cur = candidate
            Else
                best = FindBestSubfolder(fso, cur, seg)
                If Len(best) = 0 Then Exit Function   ' segmento no resoluble → falla
                cur = best
            End If
        End If
    Next
    ResolvePath = cur
End Function

Function FindBestSubfolder(fso, parentPath, wantName)
    FindBestSubfolder = ""
    If Not fso.FolderExists(parentPath) Then Exit Function
    Dim want : want = NormName(wantName)
    Dim subf
    For Each subf In fso.GetFolder(parentPath).SubFolders
        If NormName(subf.Name) = want Then
            FindBestSubfolder = subf.Path
            Exit Function
        End If
    Next
End Function

' Normaliza para comparar: ilegales-Windows y "_" → espacio, colapsa espacios,
' recorta, minúsculas. Así "C/ CATISLLO" y "C  CATISLLO" (y "C_ CATISLLO") coinciden.
Function NormName(s)
    Dim r : r = LCase(s)
    Dim bad : bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|", "_")
    Dim k
    For k = 0 To UBound(bad)
        r = Replace(r, bad(k), " ")
    Next
    Do While InStr(r, "  ") > 0
        r = Replace(r, "  ", " ")
    Loop
    NormName = Trim(r)
End Function

' ── Decodificación base64url (UTF-8) con MSXML (bin.base64) + ADODB.Stream ────
Function Base64UrlToUtf8(s)
    On Error Resume Next
    Base64UrlToUtf8 = ""
    If Len(s) = 0 Then Exit Function
    s = Replace(s, "-", "+")
    s = Replace(s, "_", "/")
    Dim xml, node, bytes, st
    Set xml = CreateObject("MSXML2.DOMDocument.6.0")
    Set node = xml.createElement("b64")
    node.dataType = "bin.base64"
    node.text = s
    bytes = node.nodeTypedValue
    If IsEmpty(bytes) Then Exit Function
    Set st = CreateObject("ADODB.Stream")
    st.Type = 1
    st.Open
    st.Write bytes
    st.Position = 0
    st.Type = 2
    st.Charset = "utf-8"
    Base64UrlToUtf8 = st.ReadText
    st.Close
End Function
