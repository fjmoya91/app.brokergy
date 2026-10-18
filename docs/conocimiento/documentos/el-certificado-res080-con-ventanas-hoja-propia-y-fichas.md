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

### El final IDENTIFICA lo que cambia, y el emparejamiento quita el «- CAMBIA» (2026-10-14)

Lo pidió Fran al revisar el CEE final de **26RES080_83**: «siempre que sea un RES080 deben aparecer
identificadas cuáles son las ventanas que cambian», también en el croquis. El inicial era del técnico
(CE3X 2.3, huecos «V1», «V2») y el final salía con los mismos nombres: en el PDF no se distinguía qué
ventana se había cambiado.

**REGLA — en el final de un RES080, lo que se reforma lleva «- CAMBIA» en el nombre** (como en el
plano, regla 66): «V1 - CAMBIA» y sus puentes «PT Contorno de hueco-V1 - CAMBIA». Y el croquis del final
(`… - CEE FINAL_CROQUIS.pdf`) las marca. La lista de comprobación vive en la skill `generar-cee-final`.

**REGLA — el inicial y el final se casan por nombre SIN el sufijo.** Al renombrar, el certificado RES080
dejó de ver qué huecos cambiaban (`«v1-»` no empieza por `«v1 - cambia»` ni al revés) y la revisión dijo
«ningún cerramiento cambia» (NO APTO). `claveNombre` quita `\s*-\s*cambia` en `res080Doc.js` y en su
espejo `CertificadoRes080Modal.jsx` (ahí NO se quita el guion final: con `startsWith`, «v10» casaría con
«v1»), y en `radiografiaCee.compararEnvolventes`, que casa por IGUALDAD y quita además el «-» que CE3X
pega al nombre en el XML. Tras tocarlo: `check_res080_paginas.mjs` y `test_revision_cee.js` (ese día ya
fallaban 4 comprobaciones de la guía de transmitancias, ajenas a esto).

**El croquis del final es SIEMPRE el de la app** (Fran, mismo día: «no hagas el mío, haz el que haces
con la app envolvente»). Con un inicial hecho por el técnico en CE3X no hay trabajo de envolvente: se
monta desde su `.cex` (skill `generar-cee-final`, punto 6) y se guarda SOLO el trabajo. Dos arreglos en
[croquisCee.js](implementation/backend/services/cee/croquisCee.js): un hueco cuyo cerramiento del `.cex`
no casa con una pared del plano («FNO» frente a «FBNO3») va a la planta única —o a la primera hoja—
en vez de perderse (el croquis decía «0 huecos»), y un hueco «Conocidas» enseña «Conocido · Uf» y
«Ug · g» en vez de «—». Tras tocarlo: `node implementation/backend/scripts/test_croquis_movil.js`.
