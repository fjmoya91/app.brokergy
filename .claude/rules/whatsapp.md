---
paths:
  - "implementation/backend/services/{whatsapp*,bot*}.js"
  - "implementation/backend/routes/whatsapp.js"
  - "implementation/backend/utils/{adjuntoWhatsapp,nombreContactoCliente}.js"
  - "implementation/backend/scripts/*{bot,whatsapp}*"
  - "implementation/frontend/src/features/whatsapp/**"
  - "implementation/frontend/src/components/WhatsappEtiquetas.jsx"
  - "implementation/frontend/src/features/expedientes/components/ChatWhatsappVinculo.jsx"
---
# WhatsApp — sesión, entrega (ACK), adjuntos, etiquetas, agenda y bot de clientes (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/whatsapp/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

13. **WhatsApp en Sidebar**: El botón debe estar posicionado en la sección inferior (entre tabs principales y user profile). Polling del estado: **30s** en sidebar, **8s** en WhatsappSettingsView (reducido desde 5s/2.5s el 2026-04-29 para limitar egress de Supabase — cada request pasa por auth middleware y generaba ~720 req/hora). No bloquear app si servicio no está disponible (graceful degradation con 503).

14. **WhatsApp Session**: `.wwebjs_auth/` y `.wwebjs_cache/` DEBEN estar en `.gitignore`. La sesión es local del servidor.

26. **El bot de WhatsApp solo habla en los chats ETIQUETADOS, en horario y sin tocar dinero**: contesta por la sesión real del VPS, así que sus frenos (etiqueta + lista blanca, 08:00-20:00 Madrid, ventana de silencio, silencio si escribe un humano, tope diario, apagado por defecto) protegen la cuenta de la que dependen TODOS los envíos automáticos. Los datos salen del dossier (`botContexto`, que reusa `buildChecklistData` y `ensureUploadLink`), nunca del prompt; los importes no viajan al dossier. Fuente única del texto: [botPrompt.js](implementation/backend/services/botPrompt.js). Ver "Bot de WhatsApp".

39. **Un mensaje de WhatsApp con el RELOJ no está enviado, y el "escribiendo…" es lo que rompe la sesión**: `sendMessage()` devuelve el id en cuanto el mensaje se INSERTA en el chat, así que ese `{ok:true}` no significa entregado — el 08/09/2026 una propuesta quedó sellada con "✓ whatsapp ok" para el cliente y el instalador con los dos PDF dos horas en el reloj. Lo único que lo dice es el **ACK**: `confirmarEntrega()` lo espera tras `waitUntilMsgSent: true` y, si sigue en 0, es error de verdad → FAILED **sin reintentos** (el mensaje ya existe en el chat: reenviarlo lo duplica) + email al admin; si el ack no se puede leer, no se afirma nada. **NUNCA `getChatById`/`getChats`/`msg.getChat`/`sendSeen` en el camino de envío**: en WhatsApp Web 2.3000.x dejan la sesión enviando sin ACK hasta que se desconecta sola ([wwebjs#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849), sin arreglo publicado). `WWA_TYPING` y `WWA_SEND_SEEN` a `false`; la pausa humana entre mensajes se queda. Fijar la versión de la web (`WWA_WEB_VERSION`) NO sirve: se auto-actualiza igual. Ver "Un mensaje con el RELOJ no está enviado".

39.b **Del MODELO del adjunto se esparcen sus DATOS, nunca sus internos.** `whatsapp-web.js` compone el mensaje de un adjunto con `{ id: newMsgKey, …, ...mediaOptions, ...mediaOptions.toJSON() }`, y el modelo `MediaData` trae dentro un **`__x_id` que vale 1** —así guardan sus campos los modelos de WhatsApp Web—: el `Msg` lo toma como su propio id, se queda sin clave válida y la resolución del remitente revienta con *"Data passed to getter must be a valid model or a plain object"* (o su gemelo *"must include an id property"*). Medido el 17/09/2026 sobre el VPS: **3 envíos de adjunto en 72 h y ninguno salió**, mientras el texto sí —el texto no pasa por ahí—. `soloDatosDelAdjunto()` ([utils/adjuntoWhatsapp.js](implementation/backend/utils/adjuntoWhatsapp.js)) quita las claves `__*` y nada más: comparado campo a campo, se caen 32 claves, todas internas, y ni un valor cambia. **El parche va en NUESTRO código, no en `node_modules`** (la imagen se construye con `npm ci`), la marca de "ya parcheado" va en la FUNCIÓN y no en `window` —la librería reinyecta su código al recargar la página— y se comprueba en cada envío. Tras tocarlo: `node implementation/backend/scripts/test_adjunto_whatsapp.mjs`. Ver "Y el ADJUNTO no salía porque su MODELO pisa la clave del mensaje".

43. **La cartera de INSTALADORES se etiqueta sola en WhatsApp**: al dar de alta o editar un instalador (y en el repaso completo desde el panel de WhatsApp) su chat queda con la etiqueta `INSTALADORES` y, si el número no lo tenías guardado, con su nombre de la BBDD en la agenda. **Un nombre ya guardado NO se toca nunca** —lo puso una persona, a veces con el apodo por el que conoce al instalador— y la lista de etiquetas se manda COMPLETA (`poner()` sustituye, así que va lo que ya tenía MÁS la nuestra). Se etiquetan TODOS los teléfonos que constan (empresa, responsable y contactos de notificación: en 20 de 71 fichas el chat que se usa es el del jefe de obra), deduplicados por los 9 dígitos finales. Fuente única: [whatsappInstaladoresSync.js](implementation/backend/services/whatsappInstaladoresSync.js) + [whatsappContactos.js](implementation/backend/services/whatsappContactos.js). ⚠️ `poner()` fallaba con un chat nunca escrito (`findOrCreateLatestChat` lo devuelve pero `C.Chat.get(@c.us)` sigue vacío porque vive bajo su `@lid`): ahora se crea y se etiqueta en la misma `evaluate`. ⚠️ Un `node scripts/…` NO ve la sesión de WhatsApp (singleton del proceso del servidor), por eso el repaso entra por la ruta con `x-internal-key`. Apagado por defecto (`WA_SYNC_INSTALADORES`) y `dryRun` por defecto en la ruta. Ver "La cartera de instaladores, etiquetada sola en WhatsApp".

94. **El nombre del cliente en la AGENDA de WhatsApp lleva su nº de obra** (2026-09-30): «RES080 Irene Lopez (Gonzagarri)» pasa a «RES080_87 Irene Lopez (Gonzagarri)» — con expediente, su nº sin el año; sin él, su oportunidad (`RES060_OP246`); un CEE directo, `CEE_54`. Botón en el panel de WhatsApp («Nombres de clientes en la agenda», en seco primero) y `POST /api/whatsapp/contactos/renombrar-clientes` (adminOnly o `x-internal-key`, `dryRun` por defecto, a trozos con cursor por teléfono). **Es la EXCEPCIÓN a `guardarSiFalta`**: solo se toca el PREFIJO que la casa escribe delante (`RES060`, `RES080 -`, `26RES080_78`, `CEEI`…; nunca «Termia», «Teresa» ni «RESERVAS») y lo de detrás se conserva letra a letra; un contacto sin prefijo no se renombra. Se casa por teléfono contra titular, persona de contacto y copropietarios; un número en VARIOS clientes no se toca, varias obras abiertas de la misma ficha se preguntan, y **lo que cambiaría la ficha que ya dice el nombre (RES080 → RES060_143) se aparta a «revisar»** — suele ser un teléfono casado con otra persona de la ficha. `saveContactAction` EDITA el contacto (el `@c.us` y su `@lid`), no lo duplica. ⚠️ **WhatsApp LIMITA las ediciones de la agenda**: medido el 30/09/2026, una cada 1,5 s aguantó ~41 y después respondió **429 `rate-overlimit`** a todas (la sesión siguió sana). Va a una cada 20 s (`WA_CONTACTOS_PAUSA_MS`), dos por petición, y **se para al primer 429** (`err.limitado` en `whatsappContactos.guardar`, que ahora devuelve el error como dato: cruzando `evaluate` llegaba minificado como «t»). Fuente única: [utils/nombreContactoCliente.js](implementation/backend/utils/nombreContactoCliente.js) + [whatsappNombresClientes.js](implementation/backend/services/whatsappNombresClientes.js). Tras tocarlo: `node implementation/backend/scripts/test_nombre_contacto_cliente.js`.

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/whatsapp/bot-de-whatsapp-contesta-a-los-chats-etiquetados.md` — Bot de WhatsApp — contesta a los chats ETIQUETADOS (2026-08-25) · 13,1 KB
- `docs/conocimiento/whatsapp/como-se-prueba-sin-gastar-mensajes.md` — Cómo se prueba SIN gastar mensajes · 0,7 KB
- `docs/conocimiento/whatsapp/coste-medido.md` — Coste medido (2026-08-25) · 0,8 KB
- `docs/conocimiento/whatsapp/escalado.md` — Escalado · 1,0 KB
- `docs/conocimiento/whatsapp/etiquetas-de-whatsapp-desde-la-app-whatsapplabels-js-implementat.md` — Etiquetas de WhatsApp desde la app — [whatsappLabels.js](implementation/backend/services/whatsappLabels.js) · 1,7 KB
- `docs/conocimiento/whatsapp/la-cartera-de-instaladores-etiquetada-sola-en-whatsapp.md` — La cartera de instaladores, etiquetada sola en WhatsApp (2026-09-09) · 5,4 KB
- `docs/conocimiento/whatsapp/lo-que-llega-con-el-backend-parado-recuperarperdidos.md` — Lo que llega con el backend PARADO — `recuperarPerdidos()` · 1,4 KB
- `docs/conocimiento/whatsapp/lo-que-whatsapp-rompio-y-hay-que-saber.md` — Lo que WhatsApp rompió, y hay que saber (2026-08-25) · 3,0 KB
- `docs/conocimiento/whatsapp/modulo-whatsapp-novedades.md` — Módulo WhatsApp — Novedades (2026-04-17) · 2,2 KB
- `docs/conocimiento/whatsapp/rutas-y-esquema.md` — Rutas y esquema · 1,0 KB
- `docs/conocimiento/whatsapp/un-mensaje-con-el-reloj-no-esta-enviado.md` — Un mensaje con el RELOJ no está enviado (2026-09-08) · 7,7 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/whatsapp/bot-de-whatsapp-contesta-a-los-chats-etiquetados.md`
  - **REGLA — el prompt describe el PROCESO; los DATOS vienen del dossier.**
  - **REGLA — el bot NO habla de dinero.**
  - **REGLA — al cliente se le nombran las cosas en LENGUAJE DE CASA.**
  - **REGLA — las dos FASES no se mezclan, igual que en `DocsManager`.**
  - **REGLA — con VARIOS asuntos abiertos, se PREGUNTA.**
  - **REGLA — NINGUNA llamada al cliente crudo va sin plazo**
  - **REGLA — se pregunta la etiqueta POR CHAT, nunca listando la etiqueta entera.**
  - **REGLA — las consultas simultáneas se de-duplican**
  - **REGLA — `encolar` va con CANDADO por chat.**
  - **REGLA — un fallo de lectura NO es un "no está etiquetado".**
  - **REGLA — "no está etiquetado" y "no he podido comprobarlo" no son lo mismo.**
  - **REGLA — la FIRMA la pone el código, no el modelo.**
  - **REGLA — con un INSTALADOR, la pista de ENVÍO no decide.**
  - **REGLA — una obra elegida entre varias se ANUNCIA.**
  - **REGLA — cuando el cliente aclara de qué obra habla, se APRENDE y se vuelve a
pensar EN LA MISMA VUELTA.**
  - **REGLA — el vínculo se siembra SOLO, desde los envíos que la app ya hace.**
  - **REGLA — los contactos se ELIGEN, no se teclean.**
  - **REGLA — las tres procedencias se distinguen en pantalla**
- `docs/conocimiento/whatsapp/etiquetas-de-whatsapp-desde-la-app-whatsapplabels-js-implementat.md`
  - **REGLA — se guarda la lista COMPLETA, no la que cambia.**
  - **REGLA — se puede etiquetar SIN haber escrito nunca.**
  - **REGLA — el número se comprueba contra WhatsApp**
- `docs/conocimiento/whatsapp/la-cartera-de-instaladores-etiquetada-sola-en-whatsapp.md`
  - **REGLA — un nombre que YA está en la agenda no se toca jamás.**
  - **REGLA — la etiqueta se AÑADE; la lista se manda COMPLETA.**
  - **REGLA — se etiquetan TODOS los teléfonos que constan**
  - **REGLA — esto NUNCA tumba lo que lo llamó.**
  - **REGLA — el repaso va a TROZOS.**
- `docs/conocimiento/whatsapp/un-mensaje-con-el-reloj-no-esta-enviado.md`
  - **REGLA — lo único que dice que un mensaje ha salido es el ACK**
  - **REGLA — el fallo del texto previo en `sendMedia` NO se traga cuando es de
entrega.**
  - **REGLA — no se llama a `getChatById` / `getChats` / `msg.getChat` / `sendSeen` en el
camino de envío.**
  - **REGLA — del modelo del adjunto se esparcen sus DATOS, nunca sus internos.**
  - **REGLA — el parche va en NUESTRO código, no en `node_modules`.**

<!-- generado:fin -->
