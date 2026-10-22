# Las coordenadas UTM se rotulan «ETRS89 · huso 30 N» (2026-10-22)

**Decisión del usuario.** En todo documento que imprime las coordenadas de la obra, el
sistema de referencia se escribe igual: **«ETRS89 · huso 30 N»**. Antes cada documento lo
decía a su manera («huso 30 ETRS89», «ETRS89» a secas o nada).

Las coordenadas son las que siembra el Catastro por la referencia catastral, en
EPSG:25830 (ETRS89 / UTM huso 30 norte), así que el rótulo es fijo.

**Dónde va** (al añadir un documento con coordenadas, se pone igual):

| Documento | Fichero | Cómo |
|---|---|---|
| Convenio de Cesión | `expedientes/utils/docGenerators.js` (`husoSuffix`) | en el texto: «coordenadas UTM (ETRS89 · huso 30 N)» |
| CIFO | `expedientes/logic/cifoDoc.js` | detrás del valor: «X: … · Y: … (ETRS89 · huso 30 N)» |
| Certificado RES080 | `expedientes/logic/res080Doc.js` y su espejo `CertificadoRes080Modal.jsx` | detrás del valor |
| Anexo Fotográfico | `anexoFotograficoDoc.js` (frontend y backend) | en el rótulo |
| Solicitud de verificación (PDF) | `lotes/logic/solicitudVerificacion.js` | en el rótulo |
| Solicitud de verificación por API (Marwen) | `solicitudVerificacion.js` → `SE_coordenadas_utm` | detrás del valor: «X: …, Y: … (ETRS89 · huso 30 N)» (2026-10-22, lo pidió el usuario) |
| Listado del Anexo del lote | `lotes/logic/anexoListado.js` | cabecera de la columna |
| Borrador del certificado RITE y guía JE6 | `rite-generator/lib/generar_borrador_certificado.py`, `generar_guia_je6.py` | en el rótulo |
| CIFO de la skill | `skills/generar-anexo-cifo/scripts/generar_cifo.py` | detrás del valor |

**REGLA — en el CIFO y el RES080 va detrás del VALOR, no en el rótulo**: las hojas son de alto
fijo y la columna del rótulo es estrecha; en el valor cabe en la misma línea. Medido con
`check_cifo_paginas.mjs`, `check_res080_paginas.mjs` y `check_anexo_cesion_2pag.mjs`: ninguna
hoja desborda.

**REGLA — la comprobación de la API mira la X y la Y, no «alguna cifra».** `validarActuaciones`
([routes/lotes.js](implementation/backend/routes/lotes.js)) daba por buenas las coordenadas si el
texto tenía cualquier dígito; con el rótulo («89», «30») habría dejado pasar unas vacías. Ahora
exige `X: <cifra>` y `Y: <cifra>`.

**Lo que NO lleva el rótulo:** el Anexo del MITECO (`anexoActuacionService.js`), que es el
impreso oficial y tiene su propia casilla «Huso».
