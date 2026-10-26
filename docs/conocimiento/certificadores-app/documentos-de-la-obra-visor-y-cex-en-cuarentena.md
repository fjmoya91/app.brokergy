<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Los documentos de la obra: visor, firmar desde el visor, versiones y el `.cex` en cuarentena (2026-10-26)

Fran, probando la 2026EXT_1 como certificador, ya con la envolvente validada: «la página no me permite
ver el PDF, me da un error» y «una vez que lo firmo, no me sale como firmado». Pidió «algún apartado
para ver los documentos, un visor de PDF, que el mismo visor donde aparezca el certificado ya me
permita darle a firmar», subir «el .cex nuevo o la última versión», y que lo vea el certificador «e
incluso nosotros como admin». Decidido: el apartado entero, para los dos, con el `.cex` en cuarentena.

### Los dos fallos

- **El PDF no se abría (`ERR_BLOCKED_BY_CLIENT`)**: `/fichero` sirve con `Content-Security-Policy:
  default-src 'none'; sandbox` (la defensa contra un SVG/HTML disfrazado: [seguridad-de-la-app.md](docs/conocimiento/certificadores-app/seguridad-de-la-app.md)).
  Chrome no deja abrir su visor de PDF dentro de un documento con `sandbox`. Quitar el `sandbox` no
  es la salida: es lo que protege el origen de la app.
- **«No sale como firmado»**: en producción la firma SÍ estaba guardada (`cee.firma` con `coincide`,
  la obra VALIDADO). Lo que veía era el botón grande «Certificado», que abría el PDF SIN firmar, y el
  visor bloqueado no le dejaba comprobar nada.

**REGLA — los PDF de la obra se pintan DENTRO de la app, nunca en una pestaña**: `VisorPdf`
([Documentos.jsx](implementation/frontend/src/certificadores/obra/Documentos.jsx)) pide los bytes a
`/fichero` con axios (`arraybuffer`) y los pinta con pdf.js (cargado al abrir). Descargar es un
`<a download>` con un blob de esos bytes. Así `/fichero` mantiene el `sandbox`. pdf.js se queda con el
ArrayBuffer que recibe: se le pasa una copia, o «Descargar» y «Firmar» se quedan sin bytes.

### El apartado «Documentos»

`GET /obras/:id/documentos` (certificador: `certappOnly` y obra SUYA o 404; admin: `adminOnly`) →
`documentos.listar` ([documentos.js](implementation/backend/services/certapp/documentos.js)). Sin
entregar (ni LISTO ni VALIDADO), `{ hay: false, entregado: false }`. Si no:

| Clave | Qué |
|---|---|
| `certificado` · `firmado` · `xml` · `cex` · `croquis` | Lo actual de cada clase, con el MISMO criterio que la entrega (`elegirFicheros`: el más reciente; el firmado, solo si es posterior al PDF) |
| `anteriores` | Lo demás de «1. CEE» y lo de su «OLD» (`_OLD{n}`), lo más nuevo primero |
| `cuarentena` | Los `.cex` que ha subido el certificador |
| `firma` · `firma_anterior` · `xml_resumen` | La firma guardada y, del XML cargado, letras, kWh/m², superficie, zona y fecha |

Cada documento: `{ id, clase, nombre, fecha, bytes, autor, actual, pdf, url }`. `autor` es
`certificador`, `IA` o `BROKERGY`, por el nombre (sin el `_OLD`). `url` es el `/fichero` firmado. El
enlace de Drive (`drive`) va SOLO en la del admin. Lo que no es de una clase (el PDF del Catastro,
notas) no se enseña.

En la obra del certificador ([ObraCerrada.jsx](implementation/frontend/src/certificadores/obra/ObraCerrada.jsx)):

- La fila «Certificado firmado» del principio abre el visor con el firmado.
- El botón principal es «Ver, validar y firmar» (LISTO) o «Ver y firmar». Abre el visor sobre el
  certificado actual, y su pie trae **«Firmar con AutoFirma»** con los bytes que se están viendo.
- Al firmar se recargan la obra y los documentos, y el visor se reabre sobre el firmado.
- La sección «Documentos» (`#documentos`) tiene el certificado (firmado: chip verde y «Ver»; sin
  firmar: «Ver y firmar»), «Ver el original sin firmar», el XML con su resumen, el `.cex` y el croquis.
  Debajo, «¿Lo has terminado en tu CE3X?» para subir `.xml`, `.pdf` o `.cex`, sus `.cex` subidos y
  «Versiones anteriores (n)», plegado.

El admin ([Admin.jsx](implementation/frontend/src/certificadores/admin/Admin.jsx), `ObraAdmin`) tiene
la misma lista y el mismo visor, sin firmar y con «Abrir en Drive».

### El `.cex` del certificador, en cuarentena

Antes, un `.cex` subido daba 415 `CEX_NO`. Fran quiere que el certificador pueda dejar su última
versión.

**REGLA — el `.cex` que sube el certificador se guarda en CUARENTENA y NUNCA se abre**: es un pickle de
Python, y CE3X lo abre en el equipo de BROKERGY. `firma.guardarCexEnCuarentena` lo guarda en «1. CEE /
CEX DEL CERTIFICADOR (NO ABRIR)» como `{nº} - CEE AAAA-MM-DD HHhMM.cex.cuarentena`:

- Ninguna búsqueda de «el `.cex`» lo encuentra (`elegirFicheros` mira la extensión `.cex`), ni el
  agente ni el PC lo califican.
- Se descarga con el nombre `.cex` (`tipos.nombreDescarga`, en `/fichero`) para que el certificador lo
  abra en SU CE3X.
- Si Drive no da la subcarpeta (`getOrCreateSubfolder` devuelve el padre cuando falla), 502
  `DRIVE_FALLO`: nunca se guarda suelto en «1. CEE».
- Hasta 20 por obra (409 `CUARENTENA_LLENA`). Evento `DEFINITIVO`.
- Para el registro siguen contando el XML y el PDF.

Si alguien de BROKERGY quiere usar uno, lo descarga, lo revisa y lo pasa a mano: no hay camino
automático.

### Lo que queda

- AutoFirma no se puede probar en la demo (`?demo=1`): el visor y el modal se abren, pero no firma.
- Las versiones anteriores no se pueden restaurar desde la app: se ven y se descargan.

Tras tocarlo: `test_certapp_unidad.js` (clase y autor por el nombre, `nombreDescarga`, el `.cex` en
cuarentena fuera de `elegirFicheros`, la subida a su subcarpeta, sin subcarpeta y llena) y
`test_certapp_rutas.js` (`/documentos` sin sesión 401, ajena 404, BORRADOR vacío, VALIDADO sin
enlaces de Drive, admin con `drive`, el `.cex.cuarentena` se descarga como `.cex`).
