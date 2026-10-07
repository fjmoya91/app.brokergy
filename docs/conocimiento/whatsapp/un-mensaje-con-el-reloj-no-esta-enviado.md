<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Un mensaje con el RELOJ no está enviado (2026-09-08)

Pasó esto: se mandó la propuesta 26RES060_OP118 al cliente y al instalador, la app
dijo **"✓ enviado"** por los dos WhatsApp, y los dos PDF llevaban **dos horas** en el
chat con el reloj. Nadie se enteró. En la misma franja se perdieron además un aviso
al grupo de expedientes (que la cola marcó `SENT`) y dos avisos más.

### Por qué la app decía que sí

`client.sendMessage()` devuelve el mensaje en cuanto se **INSERTA** en el chat, no
cuando se entrega. En `whatsapp-web.js/src/util/Injected/Utils.js`:

```js
const [msgPromise, sendMsgResultPromise] = ...addAndSendMsgToChat(chat, message);
await msgPromise;                                    // ← solo la inserción local
if (options.waitUntilMsgSent) await sendMsgResultPromise;   // ← por defecto, false
```

Ese id de vuelta era lo que se tomaba por entregado, y con él se sellaba
`propuesta_versiones` (`"status":"ok"`), el historial y `whatsapp_queue`.

**REGLA — lo único que dice que un mensaje ha salido es el ACK** (`-1` error · `0`
pendiente · `1` servidor · `2` entregado · `3` leído). `confirmarEntrega()` en
[whatsappService.js](implementation/backend/services/whatsappService.js) lo espera
(`WWA_ACK_ESPERA_MS`, 25 s) después de `waitUntilMsgSent: true`. Si sigue en 0:
error de verdad → el modal lo dice, la cola lo marca **FAILED sin reintentos** —el
mensaje YA existe en el chat, y reenviarlo se lo manda dos veces al cliente— y sale
un email al admin. Si el ack **no se puede leer** no se afirma nada: un falso
negativo duplica mensajes, que es peor que un log.

**REGLA — el fallo del texto previo en `sendMedia` NO se traga cuando es de
entrega.** Con caption largo el mensaje va aparte y el PDF después; ese `catch` con
`console.warn` dejó en los dos chats el PDF a pelo, sin una línea que lo explicara.

### La causa: el "escribiendo…" rompe la sesión

**REGLA — no se llama a `getChatById` / `getChats` / `msg.getChat` / `sendSeen` en el
camino de envío.** Para pintar el indicador de "escribiendo" hay que pedir el chat, y
en la rama **2.3000.x** de WhatsApp Web eso deja la sesión tocada: a partir de ahí
todo sale con id y sin ACK, y acaba desconectándose sola. Es el cuadro de
[wwebjs#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849) —mismas
versiones que aquí, 1.34.7 + 2.3000.x, con *"Failed to find row in chat table"*— y no
tiene arreglo publicado: 1.34.7 es la última en npm y el repo no toca el envío desde
julio. Re-vincular **alivia solo un rato** (al que lo reportó, ~17 min).

`WWA_TYPING` y `WWA_SEND_SEEN` nacen a `false`. Era cosmética anti-bot y costaba que
no llegara NADA. **La pausa humana entre mensajes se conserva** (`WWA_TYPING_MS` +
`randomDelay`): es lo que de verdad espacia los envíos; lo que se quita es el globito.

### Lo que NO era, para no repetir el camino

| Se probó | Resultado |
|---|---|
| Fijar una versión anterior de WhatsApp Web (`WWA_WEB_VERSION`) | **No sirve**: la web se auto-actualiza igual. Se dejó la palanca, apagada. Quedó funcionando con la 2.3000.1046973889, más nueva que la que "rompía" |
| Borrar el service worker y la caché de Chrome del perfil | No cambia nada por sí solo |
| Cuenta capada / el agente de IA de WhatsApp | **No**: la recepción iba bien y lo enviado desde el móvil salía con ack 2. Solo fallaba lo que mandaba el dispositivo vinculado |

**Lo que lo arregló**: quitar `getChatById`/`sendSeen`, **reiniciar el VPS** (llevaba
112 días) y **re-vincular** el dispositivo desde el móvil (Ajustes → Dispositivos
vinculados → quitar el viejo, que salía con *"Historial de chat: En pausa"*, y
escanear el QR). Medido tras el arreglo: texto y documento a las 13:58 con **ack 2**.

### Cómo se diagnostica (sin enviar nada)

El ACK real solo se ve por dentro. Conectando por CDP al Chrome que ya corre
—`/app/.wwebjs_auth/session-brokergy-main/DevToolsActivePort` da el puerto— se leen
los mensajes y su ack con `window.require('WAWebCollections')`, y una captura de la
página enseña si WhatsApp ha dejado un modal delante (la primera vez había uno de
"Novedades en WhatsApp Web" tras actualizarse). Es **lectura**: no manda nada y no
gasta un mensaje a un cliente real.

⚠️ NO navegar (`page.goto` / `location.href`) sobre esa página: deja el Chrome
atascado y hay que reiniciar el contenedor para recuperar la sesión.

**Si vuelve a pasar** — plan B del mismo hilo, ya en orden de coste: arrancar Chrome
en modo *headful* con Xvfb y subir Puppeteer/Chrome (toca el Dockerfile); y la
solución de fondo, salir de whatsapp-web.js (Baileys / wppconnect), que es un
proyecto aparte.

### Y el ADJUNTO no salía porque su MODELO pisa la clave del mensaje (2026-09-17)

Segundo capítulo, distinto y con la misma cara: *"ENVIADO PARCIALMENTE · email ✓ ·
WhatsApp ✗ Data passed to getter must be a valid model or a plain object"*. Medido
sobre el VPS: en 72 h hubo **3 envíos de adjunto y ningún "Media enviada"** — el
texto sí salía (en los tres casos el texto previo se entregó y el PDF se quedó por
el camino), así que lo roto era **solo el adjunto**, no la sesión.

`whatsapp-web.js` compone el mensaje de un adjunto así:

```js
{ id: newMsgKey, from, to, …, ...mediaOptions, ...mediaOptions.toJSON() }
```

`mediaOptions` es el MODELO `MediaData` que devuelve `processMediaData`, y
esparcirlo mete además sus campos internos. Los modelos de WhatsApp Web guardan
cada propiedad en un `__x_<nombre>`, y uno de ellos es **`__x_id`, que vale 1**: el
constructor del `Msg` lo toma como su propio id, con lo que el mensaje deja de
tener una clave válida y la resolución del remitente (`getValidatedSender` →
`getSender`) recibe `undefined`.

**REGLA — del modelo del adjunto se esparcen sus DATOS, nunca sus internos.**
`soloDatosDelAdjunto()` ([utils/adjuntoWhatsapp.js](implementation/backend/utils/adjuntoWhatsapp.js))
quita las claves `__*` y nada más: los valores buenos siguen llegando por
`toJSON()`, que la propia librería esparce a continuación. Comparado campo a campo
contra el objeto de antes: se caen **32 claves, todas internas**, y **ni un valor
cambia** (clientUrl, deprecatedMms3Url, directPath, mediaKey, encFilehash,
filehash, size, mimetype, filename, type).

**REGLA — el parche va en NUESTRO código, no en `node_modules`.** La imagen se
construye con `npm ci`, así que un parche dentro del paquete no sobrevive al
siguiente build (es lo contrario que `autoscript.js`, que está vendorizado en el
repo). `asegurarParcheAdjuntos()` envuelve `window.WWebJS.processMediaData` en la
página, **y la marca de "ya parcheado" va en la FUNCIÓN, no en `window`**: la
librería reinyecta su código al recargar la página, y con la marca en `window` el
parche se perdería justo después de una reconexión, en silencio. Por eso se
comprueba en CADA envío, que cuesta un `evaluate`.

⚠️ La función de limpieza viaja a la página **por su código fuente**
(`String(soloDatosDelAdjunto)`): dentro del navegador no hay `require`, y tenerla
dos veces —una probada y otra inyectada— es tenerla mal el día que se corrija una.

**Cómo se diagnosticó, sin enviar un solo mensaje**: conectando por CDP al Chrome
que ya corre se replica lo que hace la librería hasta **construir** el modelo
`Msg` (sin `addAndSendMsgToChat`, que es lo que envía) y se bisecciona clave a
clave. Ahí se ve que con texto el modelo se construye y con el adjunto no, y que
el único campo que lo tumba es `__x_id`. Es el mismo camino de lectura de la
sección anterior y el que hay que repetir si vuelve a romperse.

```bash
node implementation/backend/scripts/test_adjunto_whatsapp.mjs
```
