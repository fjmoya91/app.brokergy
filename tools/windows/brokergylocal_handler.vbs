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

' ─── CARPETA MOVIDA O RENOMBRADA (2026-10-02) ─────────────────────────────────
' La ruta la calcula el servidor con lo que dice Drive AHORA, pero Google Drive para
' escritorio aplica los movimientos y renombrados con retraso, y a veces no los
' aplica nunca. Medido el 02/10/2026 sobre 80 expedientes: 3 no se abrian, los 3
' porque la app habia movido la carpeta de estado (04. EN CURSO -> 05. DOC. COMPLETA)
' y en el disco seguia en la de antes, en dos casos desde mayo y julio. En Drive hay
' UNA sola carpeta por expediente: lo desfasado es el espejo local.
' Por eso, si un segmento no existe, se busca la carpeta por su CODIGO (lo que va
' antes de " - ": 26RES060_210, 2026CEE_54, LOTE-2025-003...) en la misma carpeta y
' subiendo uno y dos niveles (las carpetas de estado y de lote vecinas). Es la MISMA
' carpeta de Drive, asi que lo que se guarde ahi acaba en su sitio.
'
' Para probarlo sin abrir ninguna ventana:
'     cscript //nologo brokergylocal_handler.vbs "brokergylocal:<b64>" /print
' ─────────────────────────────────────────────────────────────────────────────

Option Explicit

Dim args, url, path, resolved, sh, imprimir, gNearest, gNota, rxCodigo
Dim gExacto, gMejor, gMejorFecha, gSufijo, gPorSufijo, gNumSufijo
Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit
imprimir = False
If args.Count > 1 Then imprimir = (LCase(args(1)) = "/print")

Set rxCodigo = New RegExp
rxCodigo.Pattern = "^\d{2,4}(RES|TER|CEE)"   ' carpeta de un expediente o CEE directo
rxCodigo.IgnoreCase = True

url = args(0)

' Quitar el esquema y posibles barras iniciales/finales que pueda añadir el navegador
url = Replace(url, "brokergylocal:", "")
Do While Len(url) > 0 And Left(url, 1) = "/" : url = Mid(url, 2) : Loop
Do While Len(url) > 0 And Right(url, 1) = "/" : url = Left(url, Len(url) - 1) : Loop

path = Base64UrlToUtf8(url)
If Len(path) = 0 Then WScript.Quit

gNearest = "" : gNota = ""
resolved = ResolvePath(path)

If imprimir Then
    WScript.Echo "pedida   : " & path
    WScript.Echo "resuelta : " & resolved
    WScript.Echo "cercana  : " & gNearest
    WScript.Echo "nota     : " & gNota
    WScript.Quit
End If

Set sh = CreateObject("WScript.Shell")
If Len(resolved) > 0 Then
    ' Abrir la carpeta directamente en el Explorador (sin esperar, sin consola)
    sh.Run "explorer.exe """ & resolved & """", 1, False
ElseIf Len(gNearest) > 3 Then
    ' Ni por nombre ni por codigo: Drive aun no la ha bajado a este PC (recien creada,
    ' o el espejo va muy atrasado). Se ofrece la carpeta mas cercana que SI existe.
    If MsgBox("No encuentro esta carpeta en el PC:" & vbCrLf & path & vbCrLf & vbCrLf & _
              "Puede que Google Drive todavia no la haya sincronizado (carpeta nueva, " & _
              "movida o renombrada hace poco)." & vbCrLf & vbCrLf & _
              "Abrir la carpeta mas cercana que si existe?" & vbCrLf & gNearest, _
              vbYesNo + vbQuestion, "Brokergy - Carpeta local") = vbYes Then
        sh.Run "explorer.exe """ & gNearest & """", 1, False
    End If
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
                ' Movida de carpeta de estado o renombrada, y el espejo sin enterarse
                If Len(best) = 0 Then best = FindMoved(fso, cur, seg)
                If Len(best) = 0 Then gNearest = cur : Exit Function
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

' ── Carpeta movida o renombrada ───────────────────────────────────────────────
' El CODIGO es lo que va antes de " - " y tiene que llevar alguna cifra: los
' segmentos fijos ("1. CEE", "CEE INICIAL") no lo tienen y no se buscan asi.
Function ClaveDe(seg)
    ClaveDe = ""
    Dim p : p = InStr(seg, " - ")
    If p < 2 Then Exit Function
    Dim k : k = Trim(Left(seg, p - 1))
    Dim rx : Set rx = New RegExp
    rx.Pattern = "\d"
    If Len(k) >= 5 And rx.Test(k) Then ClaveDe = NormName(k)
End Function

' "26res060 210 luis..." lleva la clave "26res060 210"; "26res060 2100 ..." NO:
' lo que sigue a la clave no puede ser una letra ni una cifra.
Function CasaClave(normName, clave)
    CasaClave = False
    If Left(normName, Len(clave)) <> clave Then Exit Function
    If Len(normName) = Len(clave) Then CasaClave = True : Exit Function
    Dim c : c = Mid(normName, Len(clave) + 1, 1)
    CasaClave = Not ((c >= "a" And c <= "z") Or (c >= "0" And c <= "9"))
End Function

Function FindMoved(fso, cur, seg)
    FindMoved = ""
    Dim clave : clave = ClaveDe(seg)
    If Len(clave) = 0 Then Exit Function
    Dim nombre : nombre = NormName(seg)
    Dim p : p = InStr(seg, " - ")
    gSufijo = "" : gPorSufijo = "" : gNumSufijo = 0
    If Len(Trim(Mid(seg, p + 3))) >= 6 Then gSufijo = NormName(Mid(seg, p + 3))

    ' Nivel 0: la misma carpeta (renombrada). Niveles 1 y 2: las carpetas de estado
    ' y de lote vecinas (movida). Nunca mas arriba: seria recorrer media unidad.
    Dim base, prof, lvl, ya
    base = cur : ya = ""
    For lvl = 0 To 2
        If Len(base) <= 3 Then Exit For
        If lvl = 0 Then prof = 1 Else prof = 3
        gExacto = "" : gMejor = "" : gMejorFecha = 0
        BuscarClave fso, base, clave, nombre, prof, ya
        If Len(gExacto) > 0 Then FindMoved = gExacto : Exit For
        If Len(gMejor) > 0 Then FindMoved = gMejor : Exit For
        ya = base
        base = fso.GetParentFolderName(base)
    Next

    ' De OPORTUNIDAD a EXPEDIENTE cambia el codigo (26RES060_OP205 -> 26RES060_210) y
    ' el cliente sigue igual: si el espejo no se ha enterado, solo casa por el nombre
    ' del cliente. Se acepta SOLO si es la unica carpeta con ese nombre: un cliente
    ' con dos obras haria abrir la que no es.
    If Len(FindMoved) = 0 And gNumSufijo = 1 Then FindMoved = gPorSufijo
    If Len(FindMoved) > 0 Then gNota = "en otra ubicacion: Drive no ha aplicado aun el cambio en este PC"
End Function

Sub BuscarClave(fso, carpeta, clave, nombre, prof, excluir)
    On Error Resume Next
    Dim carp : Set carp = fso.GetFolder(carpeta)
    If Err.Number <> 0 Then Err.Clear : Exit Sub
    Dim sf, n, p
    For Each sf In carp.SubFolders
        n = NormName(sf.Name)
        If CasaClave(n, clave) Then
            If n = nombre Then gExacto = sf.Path : Exit Sub
            If Len(gMejor) = 0 Or sf.DateLastModified > gMejorFecha Then
                gMejor = sf.Path : gMejorFecha = sf.DateLastModified
            End If
        ElseIf rxCodigo.Test(sf.Name) Then
            ' La carpeta de OTRO expediente: no se baja a ella, solo se mira su cliente
            If Len(gSufijo) > 0 Then
                p = InStr(n, " - ")
                If p > 0 Then
                    If Mid(n, p + 3) = gSufijo Then
                        If gPorSufijo <> sf.Path Then gNumSufijo = gNumSufijo + 1
                        gPorSufijo = sf.Path
                    End If
                End If
            End If
        ElseIf prof > 1 And sf.Path <> excluir And UCase(sf.Name) <> "OLD" Then
            ' Carpetas de estado y de lote: ahi si puede estar
            BuscarClave fso, sf.Path, clave, nombre, prof - 1, excluir
            If Len(gExacto) > 0 Then Exit Sub
        End If
    Next
End Sub

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
