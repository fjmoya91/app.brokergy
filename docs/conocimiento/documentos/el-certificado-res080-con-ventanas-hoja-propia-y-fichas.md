<!-- conocimiento · área: documentos · las rutas de los enlaces son relativas a la raíz del repo -->

## El Certificado RES080 con VENTANAS: la comparativa en hoja propia y las fichas del marco y del vidrio (2026-10-13)

Destapado al dejar listo para firmar **26RES080_59** (5 ventanas: 3 balconeras a la calle, una
balconera y una ventana al patio). Dos fallos del generador, los dos en local (sin desplegar).

**REGLA — la comparativa de marco y vidrio va SIEMPRE en una hoja propia** («Características de las
ventanas», tras la de huecos antes/después). Con cinco ventanas las dos tablas de huecos y la
comparativa no cabían en la hoja de alto fijo: la comparativa saltaba a una hoja SIN cabecera.
Medido con `check_res080_paginas.mjs`: **desbordaba 257 px**; el medidor no lo veía porque ningún caso
llevaba huecos que cambian (caso nuevo «5 ventanas que cambian · descripción larga»). El corte no es
condicional, como en el CIFO. Está en [res080Doc.js](implementation/frontend/src/features/expedientes/logic/res080Doc.js)
y en su espejo [CertificadoRes080Modal.jsx](implementation/frontend/src/features/expedientes/components/CertificadoRes080Modal.jsx).

**REGLA — el generador del servidor adjunta TODAS las fichas, como el modal**: `resolveAnnexAttachments`
([cifoService.js](implementation/backend/services/cifoService.js)) usa `resolveAllFichaSlots(exp)` —
bomba de calor + marco + vidrio— y no solo `resolveFichaSlots`. Antes, por `generar_cifo` (MCP) el
certificado decía «se adjunta ficha técnica completa del marco y del cristal en anexos» y no las llevaba.
Las fichas se copian del catálogo con `POST /:id/fichas-tecnicas/auto-copy` (`marco` · `cristal`).

Dos cosas de datos que salieron en el caso, sin cambio de código:
- **La ficha del marco GEALAN S 8000 del catálogo** (Acrobat Distiller 9) no la lee `pdf-lib`
  («Expected instance of PDFDict») y `mergePdfs` la SALTA sin fallar. Se subió al expediente una copia
  reparada (PyMuPDF, `garbage=4, clean=True`); la del catálogo sigue sin reparar.
- **`ft_aerotermia_cal_id` / `_acs_id` guardaban el nº del CATÁLOGO (211)** en vez del id del fichero de
  Drive; como el id manda sobre el enlace, la ficha de la aerotermia tampoco se adjuntaba.

Tras tocarlo: `node implementation/backend/scripts/check_res080_paginas.mjs`.
