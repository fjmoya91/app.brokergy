<!-- conocimiento · área: transversal-backend · las rutas de los enlaces son relativas a la raíz del repo -->

### Rutas públicas por enlace: el token vale para UNA obra, y lo que escriben en `documentacion` va clave a clave (2026-11-21)

**Por qué.** Al despachar la app del instalador (fase 2) a las rutas públicas de siempre se vieron
cinco puntos débiles que ya estaban en el enlace del cliente y del instalador
([app-del-instalador-fase-2.md](docs/conocimiento/instalador-app/app-del-instalador-fase-2.md), «Lo que
queda»). La app los rodeaba en `routes/instaladorApp.js`; el enlace no. Este cambio los cierra en
[routes/public.js](implementation/backend/routes/public.js).

| Qué | Dónde |
|---|---|
| ¿Es este fichero de ESTA obra? (miniatura, fichero de la app) | [utils/ficheroDeLaObra.js](implementation/backend/utils/ficheroDeLaObra.js), `esFicheroDeLaObra` |
| ¿Se puede borrar desde ESTE apartado? | `ficheroBorrableDelApartado` en `routes/public.js` |
| Lo que la subida del CIFO / RITE escribe en `documentacion` | [utils/documentacionAtomica.js](implementation/backend/utils/documentacionAtomica.js), `escribirSubidaEnDocumentacion` |
| Pruebas | `test_rutas_publicas_obra.js` (23) y `test_app_instalador_no_regresion.js` (26) |

#### 1. `DELETE /api/public/reforma-docs/:uuid/:slot` solo borra lo de ESA obra y ESE apartado

**REGLA — con un token válido solo se borra un fichero de ESA obra y de ESE apartado; si no, 404 y
no se toca ni Drive ni `reforma_uploads`.** Antes se borraba en Drive cualquier `driveId` que llegara:
con el token de su obra, cualquiera podía borrar cualquier fichero del Drive de Brokergy.

Es suyo si está apuntado en `reforma_uploads[slot]` de la obra (por `driveId`, o por nombre si no
llega), que es el criterio del DELETE de la app. **Y también** si está en Drive y no en la BD, porque
el gestor lo enseña (Drive manda, regla 20) y el cliente tiene que poder quitarlo: entonces tiene que
estar DIRECTAMENTE en la subcarpeta de ESA obra («12. DOCUMENTOS PARA CEE», o «5. FACTURAS» en
`DOC_FACTURAS`) y llamarse como ese apartado (`fileBelongsToSlot`). En «Otros existentes» vale
cualquier fichero suelto de la subcarpeta, que es lo que ese cajón enseña. Si Drive no contesta, 404.
Con la BD caída, **503** (regla 38).

⚠️ La app del instalador conserva su filtro propio antes de despachar (solo lo apuntado en la BD): es
más estricto, así que el instalador no puede borrar desde la app una foto que solo está en Drive. Si
algún día hace falta, se quita ese filtro y decide la ruta pública.

#### 2. `GET /api/public/reforma-thumb/:uuid/:driveId` solo sirve lo de ESA obra

**REGLA — la miniatura solo se sirve si el fichero es de la obra del token: en su `reforma_uploads`
o colgando de su carpeta de Drive a ≤ 4 niveles.** Antes, cualquier `driveId`. Fuente ÚNICA con
`/thumb` y `/fichero` de la app: `esFicheroDeLaObra` (la de la app se movió a ese util; solo se
cachea lo confirmado). De paso la ruta ya no lee `datos_calculo` entero para comparar el token: se
pide una vez POR FOTO. BD caída, 503.

⚠️ `GET /cee-directo-thumb/:id/:driveId` (los CEE directos) tiene la MISMA debilidad y no se ha tocado.

#### 3. `cifo-upload` y `rite-upload` escriben `documentacion` clave a clave

**REGLA — una subida pública no reescribe `documentacion` entera: escribe solo sus claves, cada una
con su RPC atómica, y el ENLACE el último.** Leían el expediente, subían el PDF a Drive (segundos) y
hacían `update({ documentacion })` con la copia leída antes: lo que otra ruta escribiera en ese hueco
—una validación, una incidencia, el autoguardado, la otra mitad del RITE— se perdía. Es el fallo de la
regla 19 en `documentacion`.

No existe una RPC que funda varias claves de primer nivel, y no se ha creado una (sería una migración
en producción antes del deploy). Se usan las de siempre, en este orden:
1. `merge_expediente_doc_json` → `docs_validados` y `docs_rechazados` con `{ campo: null }`. **Siempre**,
   no solo si la copia leída lo traía: una validación que entrase mientras se subía el fichero
   tampoco puede quedar en verde sobre un PDF que nadie ha revisado. `null` se lee como «sin validar»
   en todas partes (nadie cuenta claves de esos mapas; comprobado en backend, frontend y SQL).
2. `merge_expediente_doc_json` → `historial`, la nota de «nueva versión» de `invalidarValidacionDocs`.
   Solo si el expediente ya tiene historial: sobre una clave que no existe la RPC dejaría un `{}`
   delante (`'{}' || '[…]'`); entonces se omite y se dice en el log.
3. `set_expediente_doc_field` → cada escalar (por `oportunidad_id`). Guarda TEXTO: `cert_cifo_rev`
   pasa a ser «2», y se lee con `Number()` (solo lo lee la propia ruta).

El enlace (`cert_cifo_signed_link`, `cert_rite_drive_link`) va el último: si una RPC falla, la ruta
responde 500, el documento no consta como recibido y el instalador lo vuelve a subir (el PDF ya
subido queda en Drive). La invalidación va la primera para que un documento nuevo no herede nunca el
visto bueno del anterior. Lo que `mergeDocumentacion` protege (sellos que no retroceden) no se ve
afectado: esta ruta nunca pasó por él.

#### 4. `POST /cifo-upload/:id` y `GET /instalador/:id` siguen sin token — decidido

Se ha mirado quién los llama y **no se les pide token**:
- Toda la familia del instalador va sin token y el **UUID del expediente es la credencial** del enlace
  (v4, 122 bits; así está escrito en `fm-declaracion`): `/instalador/:id`, `/subir-cifo/:id` y
  `/subir-rite/:id` los construyen `enlaceInstalador` (`logic/instaladorPendientes.js`), `expedientes.js` (pendientes
  y `solicitar-faltantes`), `contestadorDocumentos`, `seguimientoLote`, `acciones` y
  `DocumentacionModule`, y los leen `SubirInstaladorView`, `FirmarCifoCard`, `SubirRiteCard` y
  `FirmarFmDeclaracionCard`. Pedirlo solo en esas dos rutas no cerraría nada: `cifo-upload/:id/pdf`,
  `rite-upload`, `fm-declaracion` y el `GET cifo-upload/:id` seguirían igual.
- El único token disponible es el `upload_token` de la oportunidad, **el mismo del enlace del cliente**:
  no separaría al instalador del cliente.
- Y rompería todos los enlaces ya enviados por WhatsApp y email, que viven meses.

Si se quiere cerrar, va entero y con un token PROPIO del instalador (firmado, como `llaveObra`) en los
seis constructores y las cuatro tarjetas, aceptando el enlace viejo durante una transición.

#### 5. `rite-upload` ya no llama a `setFolderPublic`, y las respuestas no llevan enlaces de Drive

Hacía «cualquiera con el enlace» la Memoria firmada y el Certificado RITE. **No hacía falta**: nada lee
estos PDF por un enlace anónimo (el OCR de `riteCertificado`, el portal, el gestor y el paquete van por
la API de Drive con su id) y `cifo-upload`, su gemela, nunca lo hizo. Lo que sí rompía la regla 1 era
que la respuesta al instalador llevaba esos enlaces (`fileLink`, `memoria_link`, `certificado_link`):
ninguna pantalla los usaba y se han quitado (`{ success, rev }` y `{ success, memoria, certificado }`).

⚠️ Ojo: la carpeta de cada obra se crea YA pública (`setupOpportunityFolder` → `setFolderPublic`), así
que en las carpetas nuevas el fichero lo hereda igual; quitar la llamada solo cambia algo en carpetas
que no lo sean. `setFolderPublic` sigue en otras tres rutas públicas (`POST /cobro/:id`,
`POST /anexos-datos/:id` y `POST /anexos-upload/:id`) y en una veintena de servicios: decidir si la
carpeta de la obra tiene que ser pública es otra conversación.

**Ninguna escritura real** en las pruebas: Supabase, Drive, WhatsApp, email y la red (axios) simulados.
