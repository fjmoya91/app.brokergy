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

**REGLA — lo que SALE hacia beCAE lo pulsa una persona y se confirma con la lista de ficheros.** (Salvo la oferta firmada, desde el 18/11/2026: ver «La oferta firmada, sola, a beCAE».)
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

### La oferta, sola: de beCAE al lote y al S.O. (2026-11-17)

Petición de Fran (17/11/2026, tras hacerlo a mano en LOTE-2024-020): cuando Marwen emite la
oferta, que se traiga y se mande al S.O. **«como si se enviase automáticamente si la cargamos
nosotros. Tiene que ser el mismo mensaje»**. Lo hace
[ofertaVerificadorAuto.js](implementation/backend/services/ofertaVerificadorAuto.js).

- **No hay webhooks** (guía v1.6.0). Cada 15 min se mira beCAE para los lotes CANDIDATOS: con
  `verificacion_api.num_solicitud` y SIN `oferta_verificacion` en el lote. El correo de Marwen
  con «oferta» en el asunto (buzón de los firmados, `LOTE_SO_SMTP_*`, solo lectura, cada 5 min)
  solo ADELANTA esa mirada: el PDF que cuenta es el de beCAE (tipo `oferta`).
- No se trae si en beCAE ya está la `oferta_firmada` (LOTE-2025-001 y 2025-003 la tienen en
  beCAE y no en la app: se dejan), ni si esa oferta de beCAE ya se trajo una vez
  (`verificacion_api.oferta_auto.doc_id`).
- **Traer** = `subirDocumentoLote(…, 'oferta_verificacion')`, la MISMA función que la ruta
  `POST /:id/documentos/:slot` (sacada de ella, no copiada): Drive con su nombre canónico,
  importe leído a `coste_verificacion`, historial y estado.
- **Enviar** = `enviarDocumentoLote(…)`, la de `POST /:id/enviar-documento/:key`, con
  `noReenviar`: si la oferta consta enviada (`sent_at`) no sale. El texto es
  `mensajeDocLote` de
  [mensajesDocLote.js](implementation/frontend/src/features/lotes/logic/mensajesDocLote.js),
  el mismo módulo del que saca el modal su texto por defecto (comparado byte a byte con el
  que tenía el modal). Al email de notificaciones del S.O. con copia a Brokergy, solo email.
- **Se retiene** (y se avisa a Fran por WhatsApp y email) si el importe no se ha leído, si el
  lector deja avisos o si el S.O. no tiene email de notificaciones. Si sale, también se avisa.
- Nace APAGADO: `OFERTA_VERIFICADOR_AUTO=true` lo enciende. Medido en seco el 17/11/2026: los 20
  lotes con solicitud de beCAE dan «nada que hacer» (LOTE-2024-020 incluido: su oferta ya está
  y enviada). Su oferta real, pasada por el mismo lector: base 869 €, sin avisos → habría
  salido sola.

**REGLA — la oferta que llega de beCAE se trae y se envía por las MISMAS funciones y con el
MISMO texto que a mano, y nunca sale si no se ha leído su importe limpio o si ya consta
enviada.**

### La solicitud, sola: Anexo I, fichas y solicitud al S.O. (2026-11-18)

Petición de Fran (18/11/2026): que, igual que la oferta, cuando llega la solicitud de beCAE se
mande sola al S.O. con el Anexo I y las fichas. Lo hace el mismo
[ofertaVerificadorAuto.js](implementation/backend/services/ofertaVerificadorAuto.js)
(`revisarSolicitudes`), con su propio interruptor.

- **Candidatos**: lotes con `verificacion_api.num_solicitud` cuya fase 2 no ha salido
  (`analizarProceso(…).soEnviado` falso). Si el lote no tiene la solicitud del verificador, se
  trae con `traerSolicitudDeBecae`, la misma de `GET /:id/marwen`.
- **Espera de 1 hora** desde que la solicitud entró en el lote (`uploaded_at`). Casi siempre
  llega segundos después de pulsar «Enviar por API», con Fran delante y el popup «¿La enviamos
  al S.O.?» abierto. Si la manda él, el Anexo I va con su firma de Proveedor. El automático
  cubre lo que se quedó sin mandar.
- **Enviar** = `enviarAlSo(…)`, la lógica de `POST /:id/enviar-so` sacada a función, con
  `noReenviar` (409 si el Anexo I o una ficha ya constan enviados). El lote se lee con
  `loteCompleto`, lo mismo que devuelve `GET /:id` a la ficha. Los documentos y el texto salen
  de [envioSoDocs.js](implementation/frontend/src/features/lotes/logic/envioSoDocs.js)
  (`docsEnvioSo`, `mensajeEnvioSo`), de donde los saca también el popup. Comparado con el popup
  anterior en LOTE-2024-020, -2026-016, -018 y -019: mismo texto y mismos documentos.
- **El Anexo I va SIN la firma de Brokergy** (el servidor no tiene el certificado). **Decidido
  por Fran el 18/11/2026**: cuando el S.O. lo devuelve firmado, el buzón (regla 141) no lo
  registra con una sola firma y se contrafirma con `scripts/contrafirmar_anexo_i_lote.js`.
- Como el popup por defecto: mes en curso, fecha del convenio por defecto, firma el apoderado
  PRINCIPAL, al email de notificaciones del S.O. con copia a Brokergy y sin aviso por WhatsApp.
- **Se retiene** si el S.O. no tiene email, si el lote no tiene la Oferta lote (€/MWh, la
  columna Precio saldría vacía), si falta alguna ficha o si el Anexo I no cuadra con los
  expedientes. Se avisa UNA vez por solicitud (`verificacion_api.solicitud_auto.retenida_para`)
  y se sigue mirando: si se arregla, sale.
- Nace APAGADO: `SOLICITUD_SO_AUTO=true`. En seco el 18/11/2026: los 20 lotes con solicitud de
  beCAE ya habían salido al S.O. y dan «nada que hacer». Lo que mandaría para un lote concreto,
  con sus PDF y sin enviar nada: `node implementation/backend/scripts/probar_envio_so_auto.mjs
  LOTE-…`.

**REGLA — la fase 2 que sale sola sale por `enviarAlSo` con los documentos y el texto de
`envioSoDocs.js`, los del popup; nunca antes de una hora desde que llegó la solicitud, nunca
dos veces, y avisando de que el Anexo I va sin la firma de Brokergy.**

### La oferta firmada, sola, a beCAE (2026-11-18)

Petición de Fran (18/11/2026), tras aceptar a mano la del LOTE-2024-020 (0035-S22 → «Oferta
aceptada» a las 13:30): «automatiza también la subida de la oferta firmada». **Cambia lo que
decía la regla 212** («lo que sale hacia beCAE lo pulsa una persona»): para la oferta firmada,
ya no. Lo hace `revisarOfertasFirmadas` de
[ofertaVerificadorAuto.js](implementation/backend/services/ofertaVerificadorAuto.js).

- **Candidatos**: lotes con solicitud de beCAE cuya `oferta_verificacion` ha vuelto FIRMADA por
  el S.O. (`signed_file_id`, la registra el buzón o la fase 3) y sin
  `verificacion_api.subidas.oferta_firmada`.
- **Subir** = `subirABecae(…, { tipo: 'oferta_firmada' })`, la lógica de
  `POST /:id/marwen/subir` sacada a función (el botón «⬆ Aceptar la oferta en beCAE» la usa
  igual). Primero en seco (dice el fichero y las ofertas de beCAE) y luego de verdad.
- **Se retiene** (aviso a Fran, uno por firmada) si la firmada no es la de la oferta VIGENTE en
  beCAE —la última que lista—: se compara su nombre original («02. V20261827_Oferta_Estandarizada_1F.pdf»)
  sin `_fdo` ni «(1)». Si Marwen emitió otra después, subir la vieja sería aceptar otra cosa.
- **Espera 30 min** desde `signed_at`, por si la sube una persona.
- Si en beCAE ya está (subida a mano en su web), se sella `oferta_firmada_auto.ya_en_becae_at`
  y no se vuelve a mirar.
- Nace APAGADO: `OFERTA_FIRMADA_BECAE_AUTO=true`. En seco el 18/11/2026: los 17 lotes con
  oferta firmada ya la tienen en beCAE → nada que hacer.

**REGLA — la oferta firmada sale sola a beCAE solo si es la de la oferta vigente en beCAE, por
la MISMA función del botón, y se avisa a Fran de que queda aceptada.**

### El informe de inexactitudes, solo: del correo al lote, y Claude prepara la contestación (2026-11-18)

Petición de Fran (18/11/2026): «cuando llega informe de inexactitudes que se suban a la app y a
ser posible que CLAUDE se ponga a preparar la contestación». La API no descarga los documentos
del EXPEDIENTE (ver abajo): el PDF llega por correo («Inexactitudes_v3 del expediente CAE-2035
(LOTE-2026-015)», de cae@marwen.es, con «05. Inexactitudes_CAE-2035_v3.pdf») al buzón de los
firmados. Lo hace [inexactitudesCorreo.js](implementation/backend/services/inexactitudesCorreo.js),
cada 10 min, en solo lectura.

1. **Subir** = `subirDocumentoLote(…, 'informe_inexactitudes')`, la de «Subir» en la fase 4:
   Drive con su nombre canónico, cada inexactitud a incidencia de su expediente (regla 159) y el
   lote a REQUERIMIENTO VERIFICADOR.
2. **Encargar** la contestación al Claude del WhatsApp (`pedirTarea`, como el agente tras la
   aceptación), con un texto que compone el servidor (`instruccionContestacion`): solo las
   abiertas, el escrito anterior como modelo, el borrador en «{ronda}. REQUERIMIENTO» como
   `.txt`, sin cambiar lo que mueva ahorro, importes o fechas (se propone), y sin enviar nada a
   nadie. El escrito definitivo lo firma Fran (el servidor no tiene su certificado).
3. **Avisar** a Fran por WhatsApp y email: qué ha llegado, cuántas abiertas, y si Claude se ha
   puesto.

**REGLA — un informe se identifica por el NOMBRE de su PDF y solo entra si es más nuevo que el
último del lote.** Las versiones de Marwen se saltan números (CAE-2059: v0, v1, v2, v3, v5) y no
casan con la ronda de la app (el `_v1` de CAE-2041 es nuestro informe 2).

**REGLA — un informe anterior al informe de verificación o al dictamen del lote no se sube
solo: lo reabriría.** Medido en seco el 18/11/2026: el v3 de CAE-1991 (LOTE-2026-014, 12/11) no
está en la app y el lote tiene dictamen del 13/11 y está en el MITECO. Subirlo lo habría devuelto
a REQUERIMIENTO VERIFICADOR. Con 30 días de buzón, solo entraba el v3 de CAE-2035.

Nacen APAGADOS: `INEXACTITUDES_CORREO_ENABLED=true` sube; `INEXACTITUDES_AGENTE_ENABLED=true`
además encarga. En local no hay Claude del servidor (`ASISTENTE_URL`): el encargo dice que no
está conectado.

**Primer uso, 18/11/2026: el v3 de CAE-2035 (LOTE-2026-015)**, llegado a las 14:06. Subido con
`importarInformesDelBuzon({ dryRun: false, lote: 'LOTE-2026-015', encargar: false, avisos: false })`
→ «Informe de inexactitudes 3»: 8 inexactitudes, las nº 1–6 cerradas (2 incidencias cerradas por
el verificador) y 2 nuevas, abiertas tras la revisión técnica: **nº 7** (E2, el SCOP se calculó
con una sola de las dos bombas que calientan según el CEE final) y **nº 8** (E8, la foto muestra
la unidad ERLA16DAV37 y la ficha aportada es la ERLA16DAV3).

### El cierre de la verificación, solo: informe, dictamen y factura del correo al lote (2026-11-18)

Petición de Fran (18/11/2026), al llegar los de CAE-2059: «Acabamos de recibir el informe de
verificación y dictamen. A ver cómo se podría automatizar». Marwen manda dos correos al buzón de los
firmados, y siempre igual (medido en los siete cierres desde el 21/10/2026):

| Correo | Adjuntos | Slot del lote |
|---|---|---|
| «Informe de verificación y Dictamen CAE-2059 (LOTE-2026-018)» | «06. Informe de Verificacion_CAE-2059_2F.pdf» · «08. Dictamen Favorable_CAE-2059_2F.pdf» | `informe_verificacion` · `dictamen_favorable` |
| «Factura Expediente CAE-2059 (LOTE-2026-018)», unos 15 min después | «FV20261486 INTERNACIONAL DE ALCOHOLES, S.A.pdf» | `factura_verificador` |

Los de antes del 28/10 no traen el lote en el asunto («Factura expediente CAE-1834»): se busca el lote
por su `expediente_verificador`, y solo si hay UNO.

Lo hace [verificacionCorreo.js](implementation/backend/services/verificacionCorreo.js), cada 10 min y en
solo lectura. Cada PDF entra por `subirDocumentoLote`, la de «Subir» en la fase 4, y con ella su
lectura (ver [las-cifras-del-lote-se-leen-de-sus-documentos.md](docs/conocimiento/lotes/las-cifras-del-lote-se-leen-de-sus-documentos.md)):
el informe propone los ahorros e inversiones casados con cada expediente, el dictamen sella su nº, fecha
y decisión, y la factura pasa su base imponible a `coste_verificacion`. Con el dictamen, el lote pasa
a VERIFICADO, como a mano. El informe va antes que el dictamen, porque el dictamen se casa por el ahorro.

**REGLA — el ahorro verificado que casa sin duda se GUARDA SOLO; pagar MENOS de lo declarado lo decide
el ADMIN** (Fran, 18/11/2026, el mismo día: sustituye a «se sigue aplicando a mano»). Al subirse el
informe, `subirDocumentoLote` guarda lo casado por número y sin dudas, y deja el resto para revisar
(ver [el-ahorro-verificado-se-guarda-solo-y-el-menor-se-decide-al-pagar.md](docs/conocimiento/lotes/el-ahorro-verificado-se-guarda-solo-y-el-menor-se-decide-al-pagar.md)).
El aviso a Fran dice lo leído, si cuadra, lo guardado, lo que queda por revisar y, en ámbar, los
verificados MENORES que lo declarado, que se deciden en la fase 7 antes de pagar.

**REGLA — un slot que ya tiene documento no se toca.** No son múltiples: subir otro lo reemplazaría.
Marwen mandó dos veces el cierre de CAE-1834 (21/10, a las 10:14 y a las 13:48).

Nace APAGADO: `VERIFICACION_CORREO_ENABLED=true`. En seco el 18/11/2026, con 40 días de buzón, solo
subía los tres de LOTE-2026-018; todos los anteriores ya estaban en sus lotes.

**Primer uso, 18/11/2026: LOTE-2026-018 (CAE-2059).** Subido con
`importarVerificacionDelBuzon({ dryRun: false, lote: 'LOTE-2026-018', avisos: false })`:
- el lote pasó a VERIFICADO, con las 28 incidencias subsanadas al verificarse;
- dictamen MW-2059/26, DICTAMEN FAVORABLE, 18-11-2026, 596.516 kWh;
- 10 de 10 actuaciones casadas y la suma cuadra con el total;
- factura FV20261486, 2.000,00 € de base → coste de verificación.

**La sección 7 de la oferta (firmante) sale con el CIF del S.O. en la casilla del DNI y el
nombre de Fran** (LOTE-2024-020, 17/11/2026). No es nuestro: el paso 1 del envío por API no
lleva ningún campo de DNI; manda `SE_cif` (el CIF del S.O.) y como contacto
(`SE_contacto`/`SE_email`/`SE_telefono`) lo que se escribe en el popup de envío, que es Fran.
Marwen compone la sección 7 con eso. **Decidido por Fran el 17/11/2026: se deja así**. Poner de
contacto al representante del S.O. haría que los avisos de beCAE le llegaran a él y no a
nosotros.

### Lo que NO hace la API

- **Contestar las inexactitudes** sigue siendo en el portal
  ([contestar-inexactitudes-en-el-portal-de-marwen.md](docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md)).
- Descargar los documentos del EXPEDIENTE (plan, informe de inexactitudes, informe de
  verificación, dictamen): la descarga es solo de la SOLICITUD. Siguen llegando por correo
  (el informe de inexactitudes ya lo recoge solo `inexactitudesCorreo.js`, y el plan
  `equipoVerificacion.js`).

### Estados (los que devuelve de verdad, no solo los de la guía)

- Solicitud: Pendiente documentación · Pendiente recibir oferta · Ofertado · **Oferta aceptada**
  (la guía dice «Aceptada») · Solicitud rechazada.
- Expediente: Aceptado · Previo · En ejecución · En resolución · Reestudio documental ·
  Pendiente IDV + Dictamen · HDTED · Finalizado.

Tras tocarlo: `node implementation/backend/scripts/test_marwen_api_v16.js` (con `--vivo LOTE-…`
lee de Marwen en solo lectura), `node implementation/backend/scripts/test_becae_acciones.mjs` y
`node implementation/backend/scripts/test_inexactitudes_lote.js`. Lo de la oferta y la solicitud
solas, la oferta firmada y el informe de inexactitudes del correo:
`node implementation/backend/scripts/test_oferta_verificador_auto.js` y, en seco sobre un lote
real, `probar_envio_so_auto.mjs LOTE-…`, `revisarOfertasFirmadas({ dryRun: true })` e
`importarInformesDelBuzon({ dryRun: true })`.
