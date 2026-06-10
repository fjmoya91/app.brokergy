# Botón "Carpeta Local" — protocolo `brokergylocal:`

El botón **"Carpeta Local"** del detalle de expediente (visible solo para ADMIN, junto
al botón **Drive**) abre la carpeta del expediente directamente en el **Explorador de
Windows**, usando el espejo local de Google Drive para escritorio
(`C:\Users\Usuario\Mi unidad\...`).

Como los navegadores **bloquean** abrir rutas locales (`file://`) desde una web por
seguridad, se usa un **protocolo personalizado** `brokergylocal:` que hay que registrar
**una sola vez** en cada PC desde el que uses la app (sirve tanto en `localhost` como en
`https://app.brokergy.es`).

## Instalación (una vez por PC)

1. Doble clic en **`brokergylocal_setup.reg`** → **Sí** para confirmar el aviso.
2. Entra en cualquier expediente y pulsa **"Carpeta Local"**.
3. La primera vez, el navegador preguntará si abrir `brokergylocal`:
   acepta y marca **"Permitir siempre en app.brokergy.es"**.

No necesita permisos de administrador (se instala en `HKEY_CURRENT_USER`).

El handler es `brokergylocal_handler.vbs` lanzado con **wscript** (no PowerShell),
así que **no parpadea** ninguna ventana de consola: abre el Explorador directamente.

> Si ya tenías instalada una versión anterior (con PowerShell y pantalla negra),
> vuelve a hacer doble clic en `brokergylocal_setup.reg` para actualizar el comando.
> El `.reg` apunta a `brokergylocal_handler.vbs` **por ruta absoluta** dentro del repo
> (`C:\Proyectos\app.brokergy\tools\windows\`); si mueves el repo, edita esa ruta en el
> `.reg` y vuelve a importarlo.

## Si no se abre

- Se copia **siempre** la ruta al portapapeles como respaldo: pégala (`Ctrl+V`) en la
  barra de direcciones del Explorador y Enter.
- Verifica que **Google Drive para escritorio** esté montado y que la base coincida con
  `C:\Users\Usuario\Mi unidad`. Si tu ruta de "Mi unidad" es distinta, ajústala en el
  backend con la variable de entorno `LOCAL_DRIVE_BASE`.

## Desinstalar

Doble clic en **`brokergylocal_uninstall.reg`**.

## Detalles técnicos

- Frontend: `ExpedienteDetailView.jsx` → `handleOpenLocalFolder()` pide la ruta a
  `GET /api/expedientes/:id/local-path`, la copia al portapapeles (silencioso) y lanza
  `brokergylocal:<base64url>` sin mostrar modal.
- Backend: la ruta (solo `adminOnly`) resuelve el `drive_folder_id` desde
  `datos_calculo` (ni `oportunidades` ni `expedientes` tienen esa columna; fallback:
  extraerlo del `drive_folder_link`) y usa `driveService.getFolderPathSegments()` para
  subir por las carpetas padre en Drive y reconstruir la ruta local exacta (siempre
  correcta aunque el expediente cambie de subcarpeta de estado).
- El path viaja en **base64url conservando el padding `=`** (el `.vbs` lo decodifica con
  MSXML `bin.base64` + `ADODB.Stream` en UTF-8).
- Se usa el esquema `brokergylocal:` **sin `//`** para que el navegador no pase el
  base64 a minúsculas (rompería el case-sensitive).
