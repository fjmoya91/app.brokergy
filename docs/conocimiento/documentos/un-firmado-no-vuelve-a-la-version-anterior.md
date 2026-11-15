<!-- conocimiento · área: documentos · las rutas de los enlaces son relativas a la raíz del repo -->

## Un FIRMADO no vuelve a la versión anterior por un autoguardado (2026-10-30)

**26RES080_59, 30/10/2026.** El Convenio de Cesión se montó dos veces a mano desde la app
(`POST /documentos/cesion-manuscrita`): a las 17:37 la v1 y a las 17:39 la buena, que
archivó la v1 en `6. ANEXOS CAE/OLD` como «_fdo_OLD1». A las 17:41:55 la subida del Anexo
Fotográfico hizo un `PUT /api/expedientes/:id` con `documentacion` ENTERA, y en esa copia
el Convenio seguía siendo la v1. El merge lo tomó por una firma nueva —le selló
`anexo_cesion_signed_at`— y dejó `anexo_cesion_signed_link` apuntando al fichero de OLD. A
las 17:43 «validar» copió esa v1 a «10. EXPEDIENTE CAE».

Los logs del servidor lo confirman sin hipótesis: entre la subida de las 17:39:33 y el PUT
de las 17:41:55 no hubo ninguna otra escritura ni ninguna relectura del expediente, y el PUT
es el de `uploadSignedPlain` del Anexo Fotográfico.

### Por qué la copia estaba vieja

`DocumentacionModule` guarda su `local` y lo **hidrata una sola vez**, al cambiar de
expediente (`useEffect` sobre `expediente?.id`); los re-fetch posteriores al guardar
refrescan `expediente`, no `local`. Las rutas dedicadas que suben un firmado
(`cesion-manuscrita`, `firmar-subir`, la subida pública del cliente `/anexos-upload` y la
del instalador) escriben el enlace directamente en BD, y la pantalla solo se entera si el
callback lo copia a `local` — `cesion-manuscrita` lo hace al CERRAR el overlay
(`onDone`), no al terminar la petición. Con la v2 fuera de `local`, cualquiera de los
guardados del módulo que reenvían `documentacion` entera (subir otro firmado, marcar
enviado, borrar, guardar el borrador de un modal…) la devuelve a la v1. Es el mismo fallo
que ya costó `_drive_at`, `refirma_at`, `docs_validados` e `incidencias`.

Y lo agravaba el propio merge: el bloque de `BORRADORES_CLIENTE` sella `signedAt` cuando
el enlace «cambia», también cuando **retrocede**, así que la vuelta atrás quedaba con
pinta de firma recién llegada.

### Lo que se cambia

**REGLA — un `*_signed_link` que ya está en BD solo lo cambia un PUT que traiga su
`*_signed_at` POSTERIOR al de BD, y solo lo borra un PUT con la orden
`_firmado_borrado`.** Fuente única: [mergeDocumentacion.js](implementation/backend/utils/mergeDocumentacion.js)
(`CAMPOS_FIRMADO` = los `_signed_link` de `DOCUMENTO_VALIDABLE_LABELS`: Anexo I, Convenio,
CIFO, Ficha RES, Anexo Fotográfico y Memoria RITE). El sello de cada uno es su nombre con
`_at` (`anexo_i_signed_link` → `anexo_i_signed_at`), que en los tres de
`BORRADORES_CLIENTE` coincide con su `signedAt`. Es el mismo criterio que ya tenía la
excepción de `refirma`: lo que no se puede fechar como posterior, no pisa lo de BD. Si se
ignora, lo dice en el log (`[mergeDocumentacion] … se ignora el cambio de una copia vieja`).

- **Llenar un hueco vacío** no necesita sello: no hay versión anterior que perder.
- **El sello no retrocede**, y al aceptar un cambio se queda el MAYOR entre el del
  navegador y el «ahora» del servidor: si el reloj del navegador va adelantado, esa misma
  copia, ya vieja, no podría pasar el filtro después.
- **La orden de borrar** (`_firmado_borrado: '<campo>'`) se consume en el merge y no se
  guarda, así que una copia vieja no puede llevarla. Se compara sin mayúsculas porque el
  PUT pasa el body por `normalizeData`.
- Una copia hidratada ANTES de que llegara la firma (el cliente firmó por su enlace con la
  vista abierta) traía `null` y la BORRABA: eso también queda cerrado.

En el frontend ([DocumentacionModule.jsx](implementation/frontend/src/features/expedientes/components/DocumentacionModule.jsx)):
`uploadSignedPlain` manda ahora el sello de llegada de **cualquier** firmado (antes solo
de los tres con re-firma, y el Anexo Fotográfico, la Ficha o la Memoria RITE ya no se
podrían sustituir), y `handleDeleteSigned` manda la orden de borrar. Los callbacks de las
rutas dedicadas (`onDone` de la Cesión manuscrita, `handleDocumentoFirmado`,
`onSignedComplete`) siguen sin re-guardar: el backend ya escribió.

⚠️ Tras el deploy, una pestaña abierta con el bundle anterior no manda el sello del Anexo
Fotográfico / Ficha / Memoria RITE: sustituir uno que ya existe se ignora (con el aviso en
el log) hasta recargar. Borrar un firmado, igual.

Prueba (pura, sin BD ni Drive):

```bash
node implementation/backend/scripts/test_firmado_no_retrocede.mjs
node implementation/backend/scripts/test_validacion_no_se_pisa.mjs
node implementation/backend/scripts/test_refirma_requerimiento.js
```
