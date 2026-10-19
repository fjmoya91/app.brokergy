' pc_trabajos.vbs — la «vuelta» del PC, SIN ventana: da el latido al VPS y, si el Claude del WhatsApp
' ha dejado un encargo para el PC (presentar un CEE), lo recoge y lanza Claude Code sin pantalla
' (implementation/backend/scripts/asistente_pc.js vuelta). Lo lanza cada 2 minutos la tarea programada
' «Brokergy Trabajos PC» (solo con la sesión iniciada: necesita el escritorio para Chrome y AutoFirma).
' Salida en implementation\backend\scratch\pc_trabajos\vuelta.log.
Dim fso, repo, backend, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
backend = repo & "\implementation\backend"
If Not fso.FolderExists(backend & "\scratch\pc_trabajos") Then fso.CreateFolder(backend & "\scratch\pc_trabajos")
cmd = "cmd /c cd /d """ & backend & """ && node scripts\asistente_pc.js vuelta >> scratch\pc_trabajos\vuelta.log 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
