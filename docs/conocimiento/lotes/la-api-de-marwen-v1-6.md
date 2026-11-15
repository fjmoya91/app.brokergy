<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## La API de Marwen v1.6.0: el lote habla solo con beCAE (2026-11-11)

El 11/11/2026 Marwen (David Rodríguez) mandó la «Guía de integración API CAE» v1.6.0. Trae
dos cosas:

1. **Un cambio que nos afectaba**: las respuestas van envueltas en `{ success, message, data }`.
   Al crear la solicitud, el nº ya no llega en la raíz (`num_solicitud`) sino en
   `data.num_solicitud`. Con el código anterior el lote se habría quedado «Enviada por API ·
   nº —», sin el número con el que se habla del lote y con el que vuelve firmada.
2. **Llamadas nuevas**: listar, descargar y subir documentos de la solicitud (solicitud
   firmada, adjuntos, oferta firmada), borrar adjuntos, el estado de la solicitud y del
   expediente (por número o por nº de PEDIDO) y las inexactitudes del expediente.

**REGLA — la respuesta de Marwen se lee en los DOS formatos.** `normalizarCreacion` y
`datosDe` de [marwenService.js](implementation/backend/services/marwenService.js) aceptan el
nuevo (`data.…`) y el anterior (raíz). Probado en `scripts/test_marwen_api_v16.js`.

### Lo que se medía en la web de beCAE y ahora hace el lote

Bloque **«⚡ beCAE en vivo»** encima de las fases del lote
([BecaeEnVivo.jsx](implementation/frontend/src/features/lotes/components/BecaeEnVivo.jsx)), solo
si el lote se envió por API o su verificador es Marwen. Se consulta solo al abrir un lote en
curso y enseña el estado de la solicitud y del expediente, los documentos que hay en beCAE (se
descargan con un clic) y **solo el paso que toca**
([logic/becae.js](implementation/frontend/src/features/lotes/logic/becae.js), `accionesBecae`):

| Antes (a mano, en beCAE) | Ahora |
|---|---|
| Descargar la solicitud de su web y subirla a la fase 1 | Se trae SOLA al enviar por API (`traerSolicitudDeBecae`, 3 intentos) y, si no, al consultar beCAE (`GET /:id/marwen`, al abrir el lote); o con «⬇ Traer la solicitud de beCAE» |
| Subir la solicitud firmada por el S.O. | «⬆ Subir a beCAE la solicitud firmada» |
| Subir los ZIP de las actuaciones | «⬆ Subir a beCAE los ZIP de las actuaciones» (los `E{n}.zip` de la fase 3, todos o ninguno) |
| Bajar la oferta del correo y subirla a la fase 3 | «⬇ Traer la oferta de beCAE» (entra por la misma subida: lee el importe y propone mandarla al S.O.) |
| Subir la oferta firmada (= aceptarla) | «⬆ Aceptar la oferta en beCAE» |
| Teclear el nº de expediente (CAE-…) | Se rellena solo de beCAE si el lote no lo tiene |
| Mirar en beCAE en qué estado está | Chips «Solicitud» y «Expediente»; cada cambio deja una línea en el historial |
| Leer el PDF de inexactitudes con IA | «⌕ Registrar las inexactitudes de beCAE» (con el expediente En resolución o HDTED) |

Rutas (todas `staffOnly`, en [routes/lotes.js](implementation/backend/routes/lotes.js)):
`GET /:id/marwen` · `GET /:id/marwen/documentos/:docId` · `POST /:id/marwen/traer-solicitud`
· `POST /:id/marwen/subir` (`{ tipo, seco, reemplazar }`) · `POST /:id/marwen/inexactitudes`.

**REGLA — en beCAE nuestros lotes se buscan por su PEDIDO, que es su código** («LOTE-2026-016»).
Así sale aunque el lote no se enviara por API; si no aparece, se busca por el nº de solicitud y
de expediente que ya tenga el lote. Medido el 11/11/2026 con LOTE-2026-016, -018 y -019.

**REGLA — lo que SALE hacia beCAE lo pulsa una persona y se confirma con la lista de ficheros.**
`subir` se llama antes en seco y la confirmación dice qué se sube y cuánto pesa. **Subir la
oferta firmada ES aceptarla** y se dice. Si ya hay adjuntos en beCAE, se dice cuáles y se
borran antes (solo se puede sin oferta). Los ZIP van **todos o ninguno**: si falta el
`E{n}.zip` de una actuación, no se sube nada y se dice cuál falta.

**REGLA — la solicitud firmada que genera la APP no se sube nunca**: la que vale es la de beCAE
(regla de la fase 1). Al traerla de beCAE se guarda con `origen: descargada del verificador`, y
esa sí sustituye a la de la app (nunca a una firmada).

**REGLA — los tipos de documento de beCAE se normalizan en UN sitio** (`tipoCanonico` en
[marwenService.js](implementation/backend/services/marwenService.js), 2026-11-13). La API llama a
la solicitud recién creada `solicitud_sin_firmar`, no `solicitud`. Primera prueba real, LOTE-2024-020
→ 0035-S22: el código buscaba `type === 'solicitud'`, así que no la trajo al enviar. El lote se
quedó con la de la app y la ficha no ofrecía «Traer la solicitud» aunque beCAE listaba
«01. Solicitud-0035-S22.pdf». `documentos()` devuelve ya `solicitud`, `solicitud_firmada`, `oferta`,
`oferta_firmada` y `documento_adjunto`, con el nombre de beCAE en `type_becae`. `accionesBecae`
admite además el `_sin_firmar` de lo sellado antes en el lote. Prueba:
`node implementation/backend/scripts/test_becae_acciones.mjs`.

**Se trae SOLA, y en dos momentos**:

1. **Al enviar por API.** Se reintenta 3 veces, cada 4 s, por si beCAE tarda en ofrecer el PDF.
2. **Al consultar beCAE.** Es `GET /:id/marwen`, que la ficha lanza al abrir un lote que está
   con el verificador. Se trae si beCAE la ofrece y el lote tiene solo la de la app (o ninguna),
   sin firmar y **sin mandar al S.O.**

Una de la app que ya salió hacia el S.O. no se cambia sola: le llegó esa. Ahí queda el botón para
que lo decida una persona. Traerla solo baja de beCAE a nuestro Drive: no sale nada a terceros.
Con la del verificador en el lote, la fase 1 queda hecha y «Lo siguiente» pasa al paso 2:
**mandar al S.O. el Anexo I, las fichas y la solicitud para que los firme**. Ese envío sigue
siendo un clic en su popup.

**REGLA — las inexactitudes de la API entran por el MISMO camino que las del PDF** (regla 159):
`aItemsDeInforme` las convierte (`imp` → importante/GRAVE, `nim` → no importante/LEVE, `cerrado`
→ se subsana sola, las actuaciones `[8, 9]` → «8,9», y la acción correctiva va en el texto) y
`registrarInexactitudes(…, { informe })` las cuelga del ÚLTIMO informe subido al lote, que es la
ronda que se contesta. Sin informe en el lote se enseñan pero no se registran. El nº se compara
como TEXTO: las de un requerimiento del gestor llegan como «3-R2» y `Number('3-R2')` es NaN, que
habría duplicado la incidencia en cada consulta. Comprobado en seco con LOTE-2026-018 (CAE-2059):
las 6 inexactitudes de la API casan con las 6 ya registradas del PDF, ninguna nueva.

**REGLA — las inexactitudes tienen LÍMITE de consultas por clave**: Marwen responde 429 con
`Retry-After`. El servicio recuerda la espera y no vuelve a llamar antes (dice cuántos segundos
faltan) y guarda la última respuesta 2 minutos. Por eso el botón solo sale con el expediente
**En resolución** o **HDTED**, como recomienda la guía.

### Lo que NO hace la API

- **Contestar las inexactitudes** sigue siendo en el portal
  ([contestar-inexactitudes-en-el-portal-de-marwen.md](docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md)).
- Descargar los documentos del EXPEDIENTE (plan, informe de inexactitudes, informe de
  verificación, dictamen): la descarga es solo de la SOLICITUD. Siguen llegando por correo.

### Estados (los que devuelve de verdad, no solo los de la guía)

- Solicitud: Pendiente documentación · Pendiente recibir oferta · Ofertado · **Oferta aceptada**
  (la guía dice «Aceptada») · Solicitud rechazada.
- Expediente: Aceptado · Previo · En ejecución · En resolución · Reestudio documental ·
  Pendiente IDV + Dictamen · HDTED · Finalizado.

Tras tocarlo: `node implementation/backend/scripts/test_marwen_api_v16.js` (con `--vivo LOTE-…`
lee de Marwen en solo lectura), `node implementation/backend/scripts/test_becae_acciones.mjs` y
`node implementation/backend/scripts/test_inexactitudes_lote.js`.
