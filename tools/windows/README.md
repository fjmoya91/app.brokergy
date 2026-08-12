# Botón "Carpeta Local" — protocolo `brokergylocal:`

El botón **"Carpeta Local"** (expedientes, oportunidades, clientes y lotes) abre la carpeta
directamente en el **Explorador de Windows**, usando el espejo local de Google Drive para
escritorio (`C:\Users\Usuario\Mi unidad\...`).

Como los navegadores **bloquean** abrir rutas locales (`file://`) desde una web por
seguridad, se usa un **protocolo personalizado** `brokergylocal:` que hay que registrar
**una sola vez** en cada PC desde el que uses la app (sirve tanto en `localhost` como en
`https://app.brokergy.es`).

## Instalación / reparación (una vez por PC)

1. Doble clic en **`instalar-carpeta-local.cmd`**.
2. Entra en cualquier expediente y pulsa **"Carpeta Local"**.
3. La primera vez, el navegador preguntará si abrir `brokergylocal`:
   acepta y marca **"Permitir siempre en app.brokergy.es"**.

No necesita permisos de administrador (se instala en `HKEY_CURRENT_USER`).

El instalador **borra cualquier registro anterior** del protocolo antes de escribir el
nuevo, calcula la ruta del handler desde su propia ubicación (así que vale aunque muevas
el repositorio de sitio), avisa al shell del cambio y **verifica** el resultado enseñando
qué se va a ejecutar de verdad.

> **Después de instalar hay que cerrar del todo la app y volver a abrirla.**
>
> Chrome resuelve el handler del protocolo **una vez y lo cachea mientras el proceso
> viva**. Y la app está instalada como **PWA que arranca sola con Windows**
> (`Startup\BROKERGY - Ingeniería Energética.lnk`), así que ese `chrome.exe` puede llevar
> **días o semanas** funcionando: cerrar las ventanas normales de Chrome NO lo cierra, y
> sigue lanzando el handler que tuviera resuelto de antes aunque el registro ya sea otro.
> Medido el 11/08/2026: el registro apuntaba al `.vbs` desde el 10 de junio y la app
> seguía lanzando PowerShell porque su proceso llevaba vivo desde el 7 de agosto.
>
> Cerrar del todo = cerrar la ventana de la app **BROKERGY** (la que no tiene barra de
> direcciones), no solo las pestañas del navegador. Para comprobarlo:
>
> ```bash
> powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -match '--app-id=' } | Select-Object ProcessId"
> ```

`brokergylocal_setup.reg` se mantiene como respaldo, pero solo sirve si el repo está
exactamente en `C:\Proyectos\app.brokergy`. Usa el `.cmd`.

## Por qué el handler es un `.vbs` y NO PowerShell

Es la razón de ser de todo este montaje, así que no se toca:

**`powershell.exe` reserva su ventana de consola ANTES de aplicar `-WindowStyle Hidden`.**
Da igual cómo lo llames: parpadea medio segundo una pantalla negra cada vez que pulsas el
botón. `wscript.exe` es un host de subsistema GUI y **no crea consola nunca**, así que el
Explorador se abre sin que aparezca nada por el medio.

Si algún día vuelve a verse la pantalla negra, lo que hay que mirar es **a qué resuelve
el sistema el protocolo**, no lo que ponga en el `.reg` del repo:

```bash
powershell -ExecutionPolicy Bypass -File tools/windows/verificar-carpeta-local.ps1
```

Usa `AssocQueryString`, la misma API que acaba invocando el navegador. Si contesta
`powershell` o `cmd.exe`, hay un registro viejo vivo: ejecuta el `.cmd` y **reinicia el
navegador**. Rastro adicional en el visor de eventos — cada ejecución del handler viejo
deja un evento 400 en el log "Windows PowerShell" con su línea de comandos completa:

```bash
powershell -Command "Get-WinEvent -FilterHashtable @{LogName='Windows PowerShell';Id=400} -MaxEvents 40 | Where-Object { $_.Message -match 'brokergylocal' } | Select-Object TimeCreated"
```

## Si no se abre la carpeta

- Se copia **siempre** la ruta al portapapeles como respaldo: pégala (`Ctrl+V`) en la
  barra de direcciones del Explorador y Enter.
- Verifica que **Google Drive para escritorio** esté montado y que la base coincida con
  `C:\Users\Usuario\Mi unidad`. Si tu ruta de "Mi unidad" es distinta, ajústala en el
  backend con la variable de entorno `LOCAL_DRIVE_BASE`.

## Desinstalar

Doble clic en **`brokergylocal_uninstall.reg`**.

## Ficheros

| Fichero | Para qué |
|---|---|
| `instalar-carpeta-local.cmd` | Instala/repara el protocolo. **Es el que hay que ejecutar.** ASCII puro a propósito: `cmd.exe` lee el `.bat` byte a byte con la codepage activa, y acentos o caracteres de dibujo desincronizan el parser hasta el punto de ejecutar los propios comentarios. |
| `verificar-carpeta-local.ps1` | Diagnóstico: a qué resuelve el protocolo de verdad. |
| `brokergylocal_handler.vbs` | El handler. Decodifica la ruta y abre el Explorador, sin consola. |
| `brokergylocal_setup.reg` | Respaldo del registro (ruta absoluta fija). |
| `brokergylocal_uninstall.reg` | Desinstala. |

## Detalles técnicos

- Frontend: `handleOpenLocalFolder()` pide la ruta a `GET /api/{expedientes|oportunidades|lotes}/:id/local-path`,
  la copia al portapapeles (silencioso) y lanza `brokergylocal:<base64url>` sin mostrar modal.
- Backend: resuelve el `drive_folder_id` desde `datos_calculo` (fallback: extraerlo del
  `drive_folder_link`) y usa `driveService.getFolderPathSegments()` para subir por las
  carpetas padre en Drive y reconstruir la ruta local exacta (siempre correcta aunque el
  expediente cambie de subcarpeta de estado).
- El path viaja en **base64url conservando el padding `=`** (el `.vbs` lo decodifica con
  MSXML `bin.base64` + `ADODB.Stream` en UTF-8).
- Se usa el esquema `brokergylocal:` **sin `//`** para que el navegador no pase el
  base64 a minúsculas (rompería el case-sensitive).
- El `.vbs` tolera los caracteres que Google Drive sustituye al espejar (`\ / : * ? " < > |`):
  si la ruta exacta no existe, baja carpeta a carpeta buscando la coincidencia real por
  nombre normalizado.
