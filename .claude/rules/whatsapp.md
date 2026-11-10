---
paths:
  - "implementation/backend/services/{whatsapp*,bot*,ronda*}.js"
  - "implementation/backend/routes/whatsapp.js"
  - "implementation/backend/scripts/*ronda*"
  - "implementation/backend/utils/{adjuntoWhatsapp,nombreContactoCliente}.js"
  - "implementation/backend/{services,utils}/bienvenidaWhatsapp.js"
  - "implementation/backend/scripts/wa_bienvenidas_schema.sql"
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

26. **El bot de WhatsApp solo habla en los chats ETIQUETADOS, en horario y sin tocar dinero**: contesta por la sesión real del VPS, así que sus frenos (etiqueta + lista blanca, la franja de la casa —7:00-21:00 Madrid desde el 09/11/2026, regla 205—, ventana de silencio, silencio si escribe un humano, tope diario, apagado por defecto) protegen la cuenta de la que dependen TODOS los envíos automáticos. Los datos salen del dossier (`botContexto`, que reusa `buildChecklistData` y `ensureUploadLink`), nunca del prompt; los importes no viajan al dossier. Fuente única del texto: [botPrompt.js](implementation/backend/services/botPrompt.js). Ver "Bot de WhatsApp".

39. **Un mensaje de WhatsApp con el RELOJ no está enviado, y el "escribiendo…" es lo que rompe la sesión**: `sendMessage()` devuelve el id en cuanto el mensaje se INSERTA en el chat, así que ese `{ok:true}` no significa entregado — el 08/09/2026 una propuesta quedó sellada con "✓ whatsapp ok" para el cliente y el instalador con los dos PDF dos horas en el reloj. Lo único que lo dice es el **ACK**: `confirmarEntrega()` lo espera tras `waitUntilMsgSent: true` y, si sigue en 0, es error de verdad → FAILED **sin reintentos** (el mensaje ya existe en el chat: reenviarlo lo duplica) + email al admin; si el ack no se puede leer, no se afirma nada. **Sin id no hay ACK que mirar**: cuando `sendMessage()` resuelve `undefined` (el mensaje ya no está bajo la clave con que se creó; 05/11/2026, texto y vídeo a dos chats nuevos), `confirmarEntrega(…, busqueda)` busca en `Msg` el que acabamos de mandar (`elegirEnviado`, [utils/enviadoWhatsapp.js](implementation/backend/utils/enviadoWhatsapp.js): nuestro, de ese chat por número o `@lid`, de este envío y con ese cuerpo o pie) y, si no aparece, lo dice en el log; nunca se salta el ACK callado. Tras tocarlo: `node implementation/backend/scripts/test_enviado_whatsapp.js`. **NUNCA `getChatById`/`getChats`/`msg.getChat`/`sendSeen` en el camino de envío**: en WhatsApp Web 2.3000.x dejan la sesión enviando sin ACK hasta que se desconecta sola ([wwebjs#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849), sin arreglo publicado). `WWA_TYPING` y `WWA_SEND_SEEN` a `false`; la pausa humana entre mensajes se queda. Fijar la versión de la web (`WWA_WEB_VERSION`) NO sirve: se auto-actualiza igual. Ver "Un mensaje con el RELOJ no está enviado".

39.b **Del MODELO del adjunto se esparcen sus DATOS, nunca sus internos.** `whatsapp-web.js` compone el mensaje de un adjunto con `{ id: newMsgKey, …, ...mediaOptions, ...mediaOptions.toJSON() }`, y el modelo `MediaData` trae dentro un **`__x_id` que vale 1** —así guardan sus campos los modelos de WhatsApp Web—: el `Msg` lo toma como su propio id, se queda sin clave válida y la resolución del remitente revienta con *"Data passed to getter must be a valid model or a plain object"* (o su gemelo *"must include an id property"*). Medido el 17/09/2026 sobre el VPS: **3 envíos de adjunto en 72 h y ninguno salió**, mientras el texto sí —el texto no pasa por ahí—. `soloDatosDelAdjunto()` ([utils/adjuntoWhatsapp.js](implementation/backend/utils/adjuntoWhatsapp.js)) quita las claves `__*` y nada más: comparado campo a campo, se caen 32 claves, todas internas, y ni un valor cambia. **El parche va en NUESTRO código, no en `node_modules`** (la imagen se construye con `npm ci`), la marca de "ya parcheado" va en la FUNCIÓN y no en `window` —la librería reinyecta su código al recargar la página— y se comprueba en cada envío. Tras tocarlo: `node implementation/backend/scripts/test_adjunto_whatsapp.mjs`. Ver "Y el ADJUNTO no salía porque su MODELO pisa la clave del mensaje".

43. **La cartera de INSTALADORES se etiqueta sola en WhatsApp**: al dar de alta o editar un instalador (y en el repaso completo desde el panel de WhatsApp) su chat queda con la etiqueta `INSTALADORES` y, si el número no lo tenías guardado, con su nombre de la BBDD en la agenda. **Un nombre ya guardado NO se toca nunca** —lo puso una persona, a veces con el apodo por el que conoce al instalador— y la lista de etiquetas se manda COMPLETA (`poner()` sustituye, así que va lo que ya tenía MÁS la nuestra). Se etiquetan TODOS los teléfonos que constan (empresa, responsable y contactos de notificación: en 20 de 71 fichas el chat que se usa es el del jefe de obra), deduplicados por los 9 dígitos finales. Fuente única: [whatsappInstaladoresSync.js](implementation/backend/services/whatsappInstaladoresSync.js) + [whatsappContactos.js](implementation/backend/services/whatsappContactos.js). ⚠️ `poner()` fallaba con un chat nunca escrito (`findOrCreateLatestChat` lo devuelve pero `C.Chat.get(@c.us)` sigue vacío porque vive bajo su `@lid`): ahora se crea y se etiqueta en la misma `evaluate`. ⚠️ Un `node scripts/…` NO ve la sesión de WhatsApp (singleton del proceso del servidor), por eso el repaso entra por la ruta con `x-internal-key`. Apagado por defecto (`WA_SYNC_INSTALADORES`) y `dryRun` por defecto en la ruta. Ver "La cartera de instaladores, etiquetada sola en WhatsApp".

94. **El nombre del cliente en la AGENDA de WhatsApp lleva su nº de obra** (2026-09-30): «RES080 Irene Lopez (Gonzagarri)» pasa a «RES080_87 Irene Lopez (Gonzagarri)» — con expediente, su nº sin el año; sin él, su oportunidad (`RES060_OP246`); un CEE directo, `CEE_54`. Botón en el panel de WhatsApp («Nombres de clientes en la agenda», en seco primero) y `POST /api/whatsapp/contactos/renombrar-clientes` (adminOnly o `x-internal-key`, `dryRun` por defecto, a trozos con cursor por teléfono). **Es la EXCEPCIÓN a `guardarSiFalta`**: solo se toca el PREFIJO que la casa escribe delante (`RES060`, `RES080 -`, `26RES080_78`, `CEEI`…; nunca «Termia», «Teresa» ni «RESERVAS») y lo de detrás se conserva letra a letra; un contacto sin prefijo no se renombra. Se casa por teléfono contra titular, persona de contacto y copropietarios; un número en VARIOS clientes no se toca, varias obras abiertas de la misma ficha se preguntan, y **lo que cambiaría la ficha que ya dice el nombre (RES080 → RES060_143) se aparta a «revisar»** — suele ser un teléfono casado con otra persona de la ficha. `saveContactAction` EDITA el contacto (el `@c.us` y su `@lid`), no lo duplica. ⚠️ **WhatsApp LIMITA las ediciones de la agenda**: medido el 30/09/2026, una cada 1,5 s aguantó ~41 y después respondió **429 `rate-overlimit`** a todas (la sesión siguió sana). Va a una cada 20 s (`WA_CONTACTOS_PAUSA_MS`), dos por petición, y **se para al primer 429** (`err.limitado` en `whatsappContactos.guardar`, que ahora devuelve el error como dato: cruzando `evaluate` llegaba minificado como «t»). Fuente única: [utils/nombreContactoCliente.js](implementation/backend/utils/nombreContactoCliente.js) + [whatsappNombresClientes.js](implementation/backend/services/whatsappNombresClientes.js). Tras tocarlo: `node implementation/backend/scripts/test_nombre_contacto_cliente.js`. **Un número que NO está en la agenda se GUARDA solo si se le da el nombre** (2026-10-10, 26RES060_OP264): `renombrarUno({ nombre })` / `alta_oportunidad.js renombrar --nombre "Nombre Apellido (Partner)"` lo guarda como `{nº de obra} {nombre}`; sin `nombre` sigue siendo `sin_agenda` (no se inventa cómo llamar a nadie) y un nombre ya guardado nunca se pisa con el que se pase. Tras tocarlo: `test_renombrar_contacto.js`.

143. **La RONDA de WhatsApp la hace una TAREA PROGRAMADA de Claude Code y, en FASE 1, solo INFORMA a Fran** (2026-10-19): desde la decisión del usuario del 19/10 por la noche, la ANALIZA Claude Code con la suscripción (tarea «ronda-whatsapp», 8:10), leyendo del WhatsApp del VPS con [scripts/ronda_cc.js](implementation/backend/scripts/ronda_cc.js) (`preparar` → `resultado.json` por chat según `ronda_cc_instrucciones.md` → `informe`), con la sesión de producción leída con cuidado (pausa, 3 días, reutilizar). La versión del backend con Gemini sigue hecha y apagada. Lo de abajo vale para las dos: cada noche lee los chats con mensajes nuevos de quien tiene algo vivo (cliente, instalador o certificador con expediente, oportunidad o CEE directo), asigna cada adjunto a su obra, propone su apartado (el repartidor de siempre), saca preguntas sin contestar y promesas, y redacta borradores; a las 9:00 manda el informe por EMAIL y un resumen CORTO al chat del asistente, **que no invita a contestar «sí C1»** (el asistente lee su chat como contexto). **Nace APAGADA** (`WA_RONDA_ENABLED`, solo `true` en el VPS) y no coloca, no anota ni escribe a nadie: lo único que escribe es su estado en `app_settings` y sus ficheros en `scratch/ronda/`; el checklist y el dossier van con `soloLectura` (sin backfill del justificante ni token nuevo). **Los ENLACES y los PÁRRAFOS del borrador los pone el CÓDIGO** (marcas `{ENLACE_*}` y `parrafos[]`): copiados por el modelo, 7 de 41 enlaces salían rotos. Una oportunidad sin propuesta ENVIADA no recibe enlace de aceptar; lo que manda la APP (`whatsapp_queue` o la firma) no cuenta como promesa; un código de obra fuera de la lista es «dudoso». **Se PIENSA solo con varias obras en el chat** (el razonamiento era el 60 % del gasto) y lo nuevo que es solo cortesía no se analiza; el modelo es `WA_RONDA_MODELO` y uno más barato solo entra tras `comparar_rondas.js` contra la pasada de referencia (los 3.6/3.8-flash doblan precio el 01/01/2027). Fuente única: [rondaWhatsapp.js](implementation/backend/services/rondaWhatsapp.js) + [rondaWhatsappIA.js](implementation/backend/services/rondaWhatsappIA.js) + [rondaWhatsappInforme.js](implementation/backend/services/rondaWhatsappInforme.js); rutas `GET/POST /api/whatsapp/ronda…` (**adminOInterno**). Tras tocarlo: `node implementation/backend/scripts/test_ronda_whatsapp.js`; para verla entera, en seco: `ronda_whatsapp_seco.js --dias 1`. Ver "La RONDA NOCTURNA de WhatsApp".

204. **Lo que se le PIDE a alguien por WhatsApp queda ESPERANDO respuesta: se cierra solo al contestar y, si no, se le RECUERDA con plantilla** (2026-11-09, agente autónomo, fase 1). Nace una espera en `wa_esperas` al pedir (`solicitar-faltantes` por WhatsApp → `DOCUMENTACION`; `aceptacionAgente.registrarPedido` → `CEE_INICIAL`), una sola abierta por teléfono + obra + motivo. Se cierra AL MOMENTO con el mensaje que entra de ese teléfono (el listener de la sesión, `alMensajeEntrante`) o con una subida por el enlace (`uploadNotifier`); **un acuse corto («vale», «mañana te lo mando») no la cierra**. **Si una persona de la casa escribe a mano en ese chat, el agente se calla 24 h** (`wa_chat_pausas`): la app apunta lo que manda antes de cada `sendMessage` (`marcarPropio`, los CUATRO de `whatsappService`: un `sendMessage` nuevo sin marca pausaría el chat) y lo propio que llega por `message_create` sin marca es de una persona. La vuelta (cada 5 min, en la franja de la casa y de lunes a viernes: regla 205) recuerda a las 48 h hábiles, una vez, con los topes en el código (uno por persona y día, 30/día, 8/hora, 3/vuelta); después VENCIDA. **En MODO COPIA no sale nada** (`ESPERAS_MODO=real` para escribir) y el resumen va DENTRO del repaso de las 9:00 del asistente (`GET /api/whatsapp/esperas/resumen`), nunca en un aviso aparte. Nace APAGADO (`ESPERAS_ENABLED`). Tabla nueva con RLS y GRANT (regla 150): [wa_esperas_schema.sql](implementation/backend/scripts/wa_esperas_schema.sql). Fuente única: [esperasWhatsapp.js](implementation/backend/services/esperasWhatsapp.js); rutas `GET /api/whatsapp/esperas…` (**adminOInterno**). Tras tocarlo: `node implementation/backend/scripts/test_esperas_whatsapp.js` y, contra el WhatsApp del VPS en seco, `esperas.js seco --dias 14`. Ver "Las ESPERAS".

205. **La FRANJA DE LA CASA: lo que el agente le escribe a un tercero sale de 7 a 21 h (Madrid), como si contestara Fran; leer, se lee siempre** (2026-11-09, Fran: «que sea como si estuviese contestando yo realmente […] para que los clientes no me contesten a las horas»). Fuente única: [utils/horarioWhatsapp.js](implementation/backend/utils/horarioWhatsapp.js). **Contestar** a quien ha escrito (`puedeContestar`): de 7 a 21 h, todos los días. **Escribir sin que nos hayan escrito** —un recordatorio, un «¿cómo va la obra?»— (`puedeInsistir`): la misma franja pero de lunes a viernes (`WA_INSISTIR_FINDE=true` lo abre el fin de semana). Lo que cae fuera se PROGRAMA para la apertura (`siguienteApertura`, en punto), nunca se descarta. Los listeners de la sesión no tienen horario: lo que entra a las 3 de la mañana se lee y se apunta en el momento (una espera se cierra), y la respuesta espera a las 7. Lo usan el agente de la aceptación (antes 9–21), las esperas y el bot (antes 8–20; `BOT_WHATSAPP_HORA_*` lo sigue pudiendo cambiar solo para él); todo lo que se añada al agente que escriba a terceros pasa por aquí, nunca con su propio horario. Las horas, `WA_HORA_DESDE`/`WA_HORA_HASTA`. Tras tocarlo: `node implementation/backend/scripts/test_esperas_whatsapp.js` y `test_aceptacion_agente.js`.

206. **A quien escribe por PRIMERA VEZ se le contesta SOLO, una vez, con el formulario «Calcula tu ayuda» (`?ref=wa`) y el vídeo de las ayudas; solo si es NUEVO de verdad** (2026-11-09, Fran: «que al cliente, de manera automática, se le envíe ya un mensaje para que a través del formulario ya rellene sus datos y se queden registrados»). La oportunidad nace del formulario como cualquier lead web. **No se usa la bienvenida de WhatsApp Business**: salta con cualquiera que lleve 14 días sin escribir, clientes en curso e instaladores incluidos. **Un «no lo he podido comprobar» es un NO**. No se le escribe si: está en la app (clientes con contacto, representante y copropietarios; partners con contactos de aviso; usuarios; certificadores; solicitudes de instalador; descartados; o la app ya le escribió, `whatsapp_queue`; por los 9 dígitos); es de la casa (`ASISTENTE_WHATSAPP_TEL`, administración); está en la agenda del móvil; es cuenta de empresa; o el chat ya tiene mensajes nuestros, etiquetas o historia de más de 6 h; ni si LO QUE DICE ya da a entender que nos conoce (`yaNosConoce`: «Hola Fran», «te llamé», «lo que hablamos», «de parte de»…; 10/11/2026, un número que no estaba en ningún sitio había llamado por teléfono el día antes). Tampoco a lo que no es un móvil español ni a una tarjeta de contacto. Una por teléfono, para siempre (índice único). Se decide UNA vez por ráfaga (90 s tras el último mensaje), leyendo ESE chat con UNA evaluación en `enSerie` y con plazo (regla 39). Se apunta PENDIENTE con la hora de la franja de la casa (regla 205, `puedeContestar`), y justo antes de mandar se relee el chat: si le ha contestado una persona o ya hay un mensaje nuestro, DESCARTADA. **El vídeo sale DESPUÉS de que el texto salga de la cola con su ACK** (si no, llega antes), como vídeo y no como documento, y si falla se manda su enlace. Sin reintentos (ERROR). Topes en el código: 30/día, 10/hora, 2/vuelta. **Nace APAGADA** (`WA_BIENVENIDA_ENABLED`) y en **MODO COPIA** (`WA_BIENVENIDA_MODO=real` para escribir); `WA_BIENVENIDA_PRUEBA` limita a esos teléfonos. Tabla con RLS y GRANT (regla 150): [wa_bienvenidas_schema.sql](implementation/backend/scripts/wa_bienvenidas_schema.sql). Fuente única: [bienvenidaWhatsapp.js](implementation/backend/services/bienvenidaWhatsapp.js) + [utils/bienvenidaWhatsapp.js](implementation/backend/utils/bienvenidaWhatsapp.js); rutas `GET /api/whatsapp/bienvenidas` y `POST …/vuelta` (**adminOInterno**). Tras tocarlo: `node implementation/backend/scripts/test_bienvenida_whatsapp.js`. Ver "La BIENVENIDA".

207. **El CONTESTADOR contesta como Fran a quien tiene algo VIVO, tras 15 min de silencio, en la franja de la casa, mirando antes la BD y la conversación; lo de dinero, quejas, IRPF o cambios va a Fran** (2026-11-10, agente autónomo, fase 2). Un mensaje 1:1 de un teléfono del universo de la ronda (cliente, contacto o instalador con obra viva) se apunta en `wa_contestador` (una fila PENDIENTE por chat; cada mensaje empuja el plazo: se contesta a la ráfaga) y la vuelta (cada 60 s, `puedeContestar`, regla 205) relee el chat: no contesta un chat en pausa (`wa_chat_pausas`, regla 204), ya contestado, de la casa, de un certificador ni de un número sin obra; lo de más de 48 h va a Fran; la cortesía se calla. Si no, `rondaWhatsapp.procesarChat` (adjuntos, obra, dossier en `soloLectura`) con `contestadorCerebro.redactar`: CLAUDE con la SUSCRIPCIÓN por `POST /contestar` del vigía (**carril aparte** de los trabajos de Fran; `claude -p` SIN herramientas, sin `ANTHROPIC_API_KEY`, consumo fuera del tope de 40 trabajos) y Gemini de respaldo. **El código remata**: enlaces por MARCAS, párrafos, sin emojis ni firma, RESPONDER vacío → ESCALAR, acuse ≤ 160 caracteres sin enlace. **Topes en el código**: 3 por chat en 24 h, 40/día, 2/vuelta. **Nace APAGADO** (`CONTESTADOR_ENABLED`) y en **MODO COPIA** (`CONTESTADOR_MODO=real` para escribir): lo que diría va al grupo de Fran con su número (C12) y «manda C12» lo envía tal cual (`POST /contestador/:id/enviar`) solo si el chat no ha cambiado y tiene menos de 24 h. El resumen, dentro del repaso de las 9:00. Tabla con RLS y GRANT (regla 150): [wa_contestador_schema.sql](implementation/backend/scripts/wa_contestador_schema.sql). Fuente única: [contestadorWhatsapp.js](implementation/backend/services/contestadorWhatsapp.js) + [contestadorCerebro.js](implementation/backend/services/contestadorCerebro.js); rutas `GET/POST /api/whatsapp/contestador…` (**adminOInterno**). Tras tocarlo: `node implementation/backend/scripts/test_contestador_whatsapp.js`, `test_ronda_whatsapp.js` y, contra el WhatsApp del VPS en seco, `contestador.js seco --tel …`. Ver "El CONTESTADOR".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/whatsapp/bot-de-whatsapp-contesta-a-los-chats-etiquetados.md` — Bot de WhatsApp — contesta a los chats ETIQUETADOS (2026-08-25) · 13,2 KB
- `docs/conocimiento/whatsapp/como-se-prueba-sin-gastar-mensajes.md` — Cómo se prueba SIN gastar mensajes · 0,7 KB
- `docs/conocimiento/whatsapp/coste-medido.md` — Coste medido (2026-08-25) · 0,8 KB
- `docs/conocimiento/whatsapp/el-contestador-contesta-como-fran.md` — El CONTESTADOR: contesta por WhatsApp como Fran a quien tiene algo vivo (2026-11-10) · 10,1 KB
- `docs/conocimiento/whatsapp/escalado.md` — Escalado · 1,0 KB
- `docs/conocimiento/whatsapp/etiquetas-de-whatsapp-desde-la-app-whatsapplabels-js-implementat.md` — Etiquetas de WhatsApp desde la app — [whatsappLabels.js](implementation/backend/services/whatsappLabels.js) · 1,7 KB
- `docs/conocimiento/whatsapp/la-agenda-de-whatsapp-como-origen-del-alta-de-clientes.md` — La agenda de WhatsApp como origen del alta de clientes (2026-10-13) · 7,6 KB
- `docs/conocimiento/whatsapp/la-bienvenida-a-quien-escribe-por-primera-vez.md` — La BIENVENIDA: a quien escribe por primera vez, el formulario y el vídeo, solos (2026-11-09) · 8,9 KB
- `docs/conocimiento/whatsapp/la-cartera-de-instaladores-etiquetada-sola-en-whatsapp.md` — La cartera de instaladores, etiquetada sola en WhatsApp (2026-09-09) · 5,4 KB
- `docs/conocimiento/whatsapp/la-ronda-nocturna-de-whatsapp.md` — La RONDA NOCTURNA de WhatsApp — fase 1, en seco (2026-10-19) · 11,0 KB
- `docs/conocimiento/whatsapp/las-esperas-lo-que-se-pide-y-se-recuerda.md` — Las ESPERAS: lo que se le pide a alguien por WhatsApp, si contesta y cuándo se le recuerda (2026-11-09) · 5,8 KB
- `docs/conocimiento/whatsapp/lo-que-llega-con-el-backend-parado-recuperarperdidos.md` — Lo que llega con el backend PARADO — `recuperarPerdidos()` · 1,4 KB
- `docs/conocimiento/whatsapp/lo-que-whatsapp-rompio-y-hay-que-saber.md` — Lo que WhatsApp rompió, y hay que saber (2026-08-25) · 3,0 KB
- `docs/conocimiento/whatsapp/modulo-whatsapp-novedades.md` — Módulo WhatsApp — Novedades (2026-04-17) · 2,2 KB
- `docs/conocimiento/whatsapp/rutas-y-esquema.md` — Rutas y esquema · 1,0 KB
- `docs/conocimiento/whatsapp/tras-un-despliegue-el-whatsapp-vuelve-solo.md` — Tras un despliegue el WhatsApp vuelve SOLO: el supervisor y sus plazos (2026-07-23 · 2026-10-19) · 2,0 KB
- `docs/conocimiento/whatsapp/un-mensaje-con-el-reloj-no-esta-enviado.md` — Un mensaje con el RELOJ no está enviado (2026-09-08) · 9,8 KB
- `docs/conocimiento/whatsapp/whatsapp-en-el-dia-a-dia-nombre-bandeja-mensajes-y-altas.md` — WhatsApp en el día a día: nombre, bandeja, mensajes, audios y altas (2026-10-13) · 8,9 KB

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
- `docs/conocimiento/whatsapp/el-contestador-contesta-como-fran.md`
  - **REGLA — cualquier mensaje NUESTRO posterior al suyo lo da por contestado, también lo que salió
     por la app**
  - **REGLA — se ESCALA, no se contesta,**
  - **REGLA — el código remata lo que escribe el modelo**
  - **REGLA — mientras `CONTESTADOR_MODO` no sea `real`, a nadie de fuera le llega nada.**
- `docs/conocimiento/whatsapp/etiquetas-de-whatsapp-desde-la-app-whatsapplabels-js-implementat.md`
  - **REGLA — se guarda la lista COMPLETA, no la que cambia.**
  - **REGLA — se puede etiquetar SIN haber escrito nunca.**
  - **REGLA — el número se comprueba contra WhatsApp**
- `docs/conocimiento/whatsapp/la-agenda-de-whatsapp-como-origen-del-alta-de-clientes.md`
  - **REGLA — solo LECTURA, en memoria y en la fila de las demás lecturas.**
  - **REGLA — el cruce con la BD avisa, no elige.**
  - **REGLA — con la BD caída, 503; nunca «no es cliente»**
  - **REGLA — lo que dice el prefijo decide si se propone.**
  - **REGLA — descartar es del EQUIPO y se puede deshacer.**
- `docs/conocimiento/whatsapp/la-bienvenida-a-quien-escribe-por-primera-vez.md`
  - **REGLA — solo a quien es NUEVO de verdad, y un «no lo he podido comprobar» es un NO.**
- `docs/conocimiento/whatsapp/la-cartera-de-instaladores-etiquetada-sola-en-whatsapp.md`
  - **REGLA — un nombre que YA está en la agenda no se toca jamás.**
  - **REGLA — la etiqueta se AÑADE; la lista se manda COMPLETA.**
  - **REGLA — se etiquetan TODOS los teléfonos que constan**
  - **REGLA — esto NUNCA tumba lo que lo llamó.**
  - **REGLA — el repaso va a TROZOS.**
- `docs/conocimiento/whatsapp/la-ronda-nocturna-de-whatsapp.md`
  - **REGLA — la ronda la ANALIZA Claude Code con la suscripción de Fran y lee del WhatsApp del VPS.**
  - **REGLA — a la sesión de PRODUCCIÓN se la lee con cuidado**
  - **REGLA — FASE 1 = EN SECO.**
  - **REGLA — nace APAGADA**
  - **REGLA — el WhatsApp es CORTO y en fase 1 NO invita a contestar.**
  - **REGLA — los ENLACES del borrador los pone el CÓDIGO, nunca el modelo.**
  - **REGLA — los PÁRRAFOS también los junta el código.**
  - **REGLA — solo se acepta una propuesta que se ENVIÓ.**
  - **REGLA — lo que manda la APP no es una promesa de nadie.**
  - **REGLA — el modelo mira, el código VALIDA.**
  - **REGLA — se PIENSA solo donde hace falta.**
- `docs/conocimiento/whatsapp/las-esperas-lo-que-se-pide-y-se-recuerda.md`
  - **REGLA — un ACUSE no cierra la espera.**
  - **REGLA — la respuesta AUTOMÁTICA de un WhatsApp Business no es una respuesta.**
  - **REGLA — si escribe una PERSONA de la casa, el agente se calla en ese chat 24 h.**
  - **REGLA — los topes van en el CÓDIGO**
  - **REGLA — MODO COPIA de salida**
  - **REGLA — el resumen va DENTRO del repaso de las 9:00 del asistente**
- `docs/conocimiento/whatsapp/tras-un-despliegue-el-whatsapp-vuelve-solo.md`
  - **REGLA — «autenticado» y «arrancando» no tienen el mismo plazo.**
- `docs/conocimiento/whatsapp/un-mensaje-con-el-reloj-no-esta-enviado.md`
  - **REGLA — lo único que dice que un mensaje ha salido es el ACK**
  - **REGLA — el fallo del texto previo en `sendMedia` NO se traga cuando es de
entrega.**
  - **REGLA — no se llama a `getChatById` / `getChats` / `msg.getChat` / `sendSeen` en el
camino de envío.**
  - **REGLA — del modelo del adjunto se esparcen sus DATOS, nunca sus internos.**
  - **REGLA — el parche va en NUESTRO código, no en `node_modules`.**
  - **REGLA — sin id se BUSCA el mensaje; si no aparece, se DICE.**
- `docs/conocimiento/whatsapp/whatsapp-en-el-dia-a-dia-nombre-bandeja-mensajes-y-altas.md`
  - **REGLA — lo reciente PRIMERO.**
  - **REGLA — la cortesía va APARTE.**
  - **REGLA — «Ya está» es del EQUIPO y vale hasta el siguiente mensaje.**
  - **REGLA — lo que WhatsApp no tiene cargado no se da por contestado.**
  - **REGLA — solo los chats del CLIENTE.**
  - **REGLA — ligero.**
  - **REGLA — nace APAGADO**
  - **REGLA — un nombre con VARIOS nº de obra no se renombra, y lo guardado se
COMPRUEBA.**
  - **REGLA — lo del paréntesis es QUIÉN LO TRAE.**

<!-- generado:fin -->
