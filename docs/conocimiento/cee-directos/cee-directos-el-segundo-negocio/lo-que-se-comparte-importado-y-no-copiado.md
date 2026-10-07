<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Lo que se comparte, IMPORTADO y no copiado

| Qué | Cómo |
|---|---|
| `CeeModule` / `CeeDocumentsGrid` | props `apiBase` (por defecto `/api/expedientes`) y `secciones` |
| Página de subida del técnico (`SubirCeeView`) | prop `endpoint` (por defecto `cee-upload`) |
| Slots del CEE y su detección por sufijo | `CEE_SLOTS` y `matchSlot`, exportados de `ceeUploadService` |
| Drive, email, WhatsApp, `seguimientoTracking`, `buildCertClienteData` | tal cual |

**REGLA — un endpoint nuevo del módulo CEE se declara en LAS DOS rutas**
(`expedientes.js` y `ceeDirectos.js`). El módulo llama a `${apiBase}/${id}/…` sin
saber en qué negocio está: si solo se añade en una, el botón queda muerto en la otra.

**REGLA — el gemelo se ESCRIBE, no se bifurca.** `ceeDirectoUploadService` no es un
`if (esCeeDirecto)` dentro de `ceeUploadService`: aquel resuelve la carpeta leyendo
`oportunidades.datos_calculo`, escribe en `expedientes` y dispara
`expedienteFolderSync`, que mueve la carpeta entre las 13 carpetas de estado del CAE.
Meter las dos realidades en la misma función convierte el camino que está en
producción en el sitio donde se rompe lo nuevo, y al revés.
