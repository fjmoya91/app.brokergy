' asistente_memoria.vbs — sincroniza, SIN ventana, la memoria de Claude Code de este PC con la del
' asistente de WhatsApp del VPS (implementation/backend/scripts/asistente_memoria.js sincronizar).
' Lo lanza la tarea programada «Brokergy Memoria Asistente». Salida en el log de al lado.
Dim fso, repo, backend, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
backend = repo & "\implementation\backend"
cmd = "cmd /c cd /d """ & backend & """ && node scripts\asistente_memoria.js sincronizar >> scratch\asistente_memoria.log 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
