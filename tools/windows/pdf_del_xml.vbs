' pdf_del_xml.vbs - arranca, SIN ventana, el vigilante que hace el PDF oficial del CEE en cuanto
' se guarda su XML en "Mi unidad" (implementation/backend/scripts/pdf_del_xml.js vigilar).
' Lo pone en el inicio de Windows instalar-pdf-del-xml.cmd. Si ya hay uno vigilando, el nuevo se va.
' Lo que hace queda en %LOCALAPPDATA%\Brokergy\pdf-del-xml.log.
Dim fso, repo, backend, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
backend = repo & "\implementation\backend"
cmd = "cmd /c cd /d """ & backend & """ && node scripts\pdf_del_xml.js vigilar"
CreateObject("WScript.Shell").Run cmd, 0, False
