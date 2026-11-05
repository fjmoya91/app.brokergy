<!-- conocimiento · área: expedientes · las rutas de los enlaces son relativas a la raíz del repo -->

## Pasar a DOC. COMPLETA es haberlo VALIDADO TODO (2026-11-05)

Fran, 05/11/2026 (26RES060_198 y _202), al pasar dos expedientes a DOC. COMPLETA: «quiero que valides
toda la documentación igual que cuando lo hago yo desde la aplicación, marcando como validado para que
aparezca en la carpeta 10. EXPEDIENTE CAE. Esto debe hacerse siempre. Cuando lo pasemos a DOC.
COMPLETA es porque se supone que se ha validado todo».

**REGLA — antes de cambiar el estado a DOC. COMPLETA, se VALIDA cada documento firmado, uno por
uno, como el ✓ de la pestaña Documentación.** Validar no es solo pintar un verde. La ruta
`POST /api/expedientes/:id/documentos/validar` (`{ field }`) hace tres cosas: comprueba que la firma
cubre el documento (`leerFirmasPdf`; si está rota responde **409** `firma_rota`), copia el fichero a
**«10. EXPEDIENTE CAE»** (lo que antes había con ese nombre va a OLD) y sella
`documentacion.docs_validados[field]`. La carpeta 10 es la que audita el verificador, así que un
expediente en DOC. COMPLETA con algún documento sin validar entra en el lote con esa carpeta incompleta.
Y en DOC. COMPLETA manda el estado: entra en el lote aunque tenga incidencias
(ver «Armar el lote», `docs/conocimiento/lotes/`).

Qué se valida (son los slots de `DOCUMENTO_VALIDABLE_LABELS`, en
[docValidacion.js](implementation/backend/utils/docValidacion.js)):

| Campo | Documento | Cuándo |
|---|---|---|
| `anexo_i_signed_link` | Anexo I | siempre |
| `anexo_cesion_signed_link` | Convenio de Cesión | siempre (se valida SOLO al contrafirmarlo Brokergy con certificado; si no, a mano) |
| `cert_cifo_signed_link` | Certificado CIFO (o Certificado RES080) | siempre |
| `facturas_combined_link` | Facturas | siempre |
| `cert_rite_drive_link` | Certificado RITE | siempre |
| `anexo_fotografico_signed_link` | Anexo Fotográfico | siempre (se valida SOLO al firmarlo Brokergy con certificado) |
| `cert_rite_signed_link` | Memoria RITE | si está |
| `ficha_res060_signed_link` | Ficha RES | si está (la firma el S.O. después: no bloquea) |

Medido ese día: los 28 RES060 que ya estaban en DOC. COMPLETA tenían validados los seis primeros (27 y
28 de 28; la Memoria RITE, 6). En el 198 y el 202 solo lo estaba el Anexo Fotográfico.

**REGLA — después, y solo después, el cambio de estado**, por la ruta del selector de la app
(`PATCH /api/expedientes/:id/estado` `{ nuevo_estado: 'DOC. COMPLETA' }`), que además mueve la carpeta
a «05. DOC. COMPLETA» (`syncExpedienteFolderAsync`, ver «Carpetas de Drive por estado»). Nunca un
`update` directo de `estado` en la BD: la carpeta se quedaría en «04. EN CURSO».

**REGLA — un 409 de firma rota PARA.** No se valida con `forzar` sin el «sí» de Fran para ese
documento: se dice qué firma no cubre qué y se pide otra copia. Y un documento que se vuelve a firmar
(un CIFO de requerimiento, por ejemplo) se valida OTRA VEZ al llegar, porque subir el firmado nuevo
invalida la validación anterior (`invalidarValidacionDocs`).

Desde un script, con la sesión del robot (regla 125):
`node implementation/backend/scripts/justificar.js api POST api/expedientes/<id>/documentos/validar --json f.json`.
En Git Bash, la ruta va **sin la barra inicial**: `/api/...` se convierte en una ruta de Windows
(`C:/Program Files/Git/api/...`) y el servidor responde 405.
