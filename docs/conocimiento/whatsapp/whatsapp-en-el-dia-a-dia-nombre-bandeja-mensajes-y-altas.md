<!-- conocimiento · área: whatsapp · las rutas de los enlaces son relativas a la raíz del repo -->

### WhatsApp en el día a día: nombre, bandeja, mensajes, audios y altas (2026-10-13)

El 90 % del trabajo pasa por WhatsApp. Estas nueve piezas acercan el chat a la app,
y todas reutilizan lecturas que ya funcionaban. Todas son **solo lectura** de la
sesión (en memoria, en la fila de lecturas de `whatsappMedia`, con plazo), salvo el
automático del punto 5, que nace apagado. Todo es **solo equipo interno** (`staffOnly`).

| # | Qué | Dónde (backend · pantalla) |
|---|---|---|
| 1 | **Nombre de WhatsApp en la ficha y en el buscador** | `whatsappAgenda.whatsappDeCliente` · `sincronizarNombres` · `clientes.whatsapp_nombres` · [WhatsappCliente.jsx](implementation/frontend/src/features/whatsapp/components/WhatsappCliente.jsx) |
| 2 | **Bandeja «WhatsApp sin contestar»** (Seguimiento) | [whatsappBandeja.js](implementation/backend/services/whatsappBandeja.js) · [WhatsappSinContestar.jsx](implementation/frontend/src/features/whatsapp/components/WhatsappSinContestar.jsx) |
| 3 | **«Buscar en su WhatsApp»** (justificante de la ficha) | `whatsappConversacion` · [AdjuntosWhatsappPicker.jsx](implementation/frontend/src/features/whatsapp/components/AdjuntosWhatsappPicker.jsx) · prop `archivo` de `JustificanteUploader` |
| 4 | **Aviso «adjuntos nuevos sin colocar»** (gestor de documentación) | `whatsappMedia.sinColocar` · `GET /api/oportunidades/:id/whatsapp-media/sin-colocar` · botón de `DocsManager` |
| 5 | **Etiquetas y nº de obra en el nombre, solos** | [whatsappAutoSync.js](implementation/backend/services/whatsappAutoSync.js) |
| 6 | **Últimos mensajes** (ficha, bandeja) | `leerConversacion({ ultimos })` · [UltimosMensajesWhatsapp.jsx](implementation/frontend/src/features/whatsapp/components/UltimosMensajesWhatsapp.jsx) |
| 7 | **Notas de voz transcritas** | `whatsappConversacion.transcribir` · `POST /conversacion/transcribir` · `/conversacion/a-notas` |
| 8 | **Tarjeta de contacto → alta** | `whatsappAgenda.contactosCompartidos` · pestaña «Contactos compartidos» · botón en cada vCard de los mensajes |
| 9 | **Instaladores pendientes de alta** | `whatsappAgenda.instaladoresPendientes` · pestaña «Instaladores» · botón en Partners |

Pruebas puras: `node implementation/backend/scripts/test_agenda_whatsapp.js` (nombre,
filtro, prefijo/obra, instalador, cortesía, teléfonos de una ficha, texto de búsqueda).

**1 · El nombre de WhatsApp.** Cada teléfono de la ficha (titular, persona de contacto,
copropietarios) con cómo está guardado en la agenda y cómo se ha puesto él. Se guarda
un TEXTO en `clientes.whatsapp_nombres` («RES060_225 Ceferino (ISM) · Cefe»), que es lo
que mira el buscador de Clientes (filtra en el navegador sobre el listado: por eso es
texto y no JSONB, regla 22). Es una COPIA: se reescribe al abrir la ficha si cambió,
en el repaso del automático y con `POST /api/whatsapp/contactos/sincronizar-nombres`.
Medido el 13/10/2026: 374 de 502 clientes están en el WhatsApp de la empresa, y se
rellenaron 370 fichas. «alejandra socuellamos» encuentra a EUGENIO MORENO CAÑAS
(26RES080_59), cuyo chat lleva su mujer.

**2 · La bandeja.** Los chats individuales cuyo ÚLTIMO mensaje es del otro y llevan
más de X horas (1, 2, 6 o 24) sin respuesta, con quién es en la app: cliente (con sus
obras, que enlazan), partner o nadie (con «Dar de alta»).

**REGLA — lo reciente PRIMERO.** Ordenada por antigüedad, la cabeza eran chats de
hace tres semanas que ya nadie va a retomar.

**REGLA — la cortesía va APARTE.** «Perfecto», «muchas gracias Fran» o un sticker son
el cierre de una conversación y no esperan nada: van a un grupo plegado
(`esCortesia`, [utils/bandejaWhatsapp.js](implementation/backend/utils/bandejaWhatsapp.js)).
Solo cuenta el TEXTO corto y sin pregunta: un «gracias» con una foto sí se mira.
Medido: de 117 chats, 32 eran cortesía. Quedaron 86 (54 clientes, 13 partners y 19
sin ficha).

**REGLA — «Ya está» es del EQUIPO y vale hasta el siguiente mensaje.** Se guarda en
`whatsapp_chats_atendidos` la hora del último mensaje visto
([script](implementation/backend/scripts/whatsapp_chats_atendidos.sql), aplicado en
producción). Un mensaje posterior vuelve a sacar el chat.

**REGLA — lo que WhatsApp no tiene cargado no se da por contestado.** Un chat sin su
último mensaje en memoria se cuenta aparte («N chats sin su último mensaje cargado»).

**3 · Buscar en su WhatsApp.** Junto al justificante de titularidad de la ficha. Lee
los chats de los teléfonos de la ficha (60 días) y lista documentos y fotos. El
elegido entra por el MISMO camino que uno soltado encima: se sube y se LEE, y compara
IBAN y titular.

**4 · El aviso de adjuntos.** El botón «💬 Traer fotos del WhatsApp» se resalta con
«N adjuntos nuevos sin colocar · de quién · cuándo».

**REGLA — solo los chats del CLIENTE.** Son los `recomendado` de
`contactosDeOportunidad`: el del instalador trae fotos de otras obras.

**REGLA — ligero.** UN lote de mensajes antiguos, 14 días, y 10 min de caché por
oportunidad, porque se pide al abrir el gestor. Al colocar se olvida el aviso. Sin
WhatsApp no avisa, sin error.

**5 · El automático.** Al dar de alta un cliente (`POST /api/clientes`), al nacer un
expediente (`createExpediente`), al cambiar el estado de una oportunidad
(`PATCH /:id/estado`) y al nacer un CEE directo, `programarCliente(id)` lo apunta. Un
minuto después (para juntar los avisos de una operación) etiqueta su chat y le pone el
nº de obra delante del nombre. Usa las mismas funciones y las mismas reglas que los
repasos manuales. Cada 6 h, entre las 9 y las 20 h, hace un repaso de toda la cartera.

**REGLA — nace APAGADO** (`WA_AUTO_SYNC=true`, solo en el VPS): escribe en la agenda
REAL, y en local la sesión es la misma cuenta. Para revisarlo antes de encenderlo:
`GET /api/whatsapp/auto-sync/probar/:idCliente` dice EN SECO qué le haría a un
cliente. El estado y lo último que ha hecho están en `GET /api/whatsapp/auto-sync`. El
repaso ya se lanza con `POST /auto-sync/repaso`.

⚠️ Al probarlo apareció un fallo que ya existía: `whatsappLabels.chatAbierto` no
encontraba los chats que viven bajo su `@lid` (el `user` del lid es OPACO, no el
teléfono), así que el repaso de etiquetas de clientes los daba por «sin
conversación». Ahora pregunta antes a `getCurrentLid`, como la lectura de
conversaciones. ⚠️ Además, en la cuenta no existían las etiquetas RES060, RES093,
TER100, TER173, CEE, PROPUESTA ni CERRADO, así que esas no se ponían. **Ahora se
crean desde la app**: `POST /api/whatsapp/etiquetas/crear-faltantes` (`dryRun` por
defecto) crea las de tipo y estado que falten con `whatsappLabels.crear`. Usa
`labelAddAction` de `WAWebBizLabelEditingAction`, porque en la 2.3000.x la colección
ya no trae `addNewLabel`, y el siguiente color libre. Una que ya existe no se duplica.

**6 · Últimos mensajes.** Los N últimos de un chat (`ultimos`, un lote como mucho).
Cada adjunto tiene «Ver», cada audio «Transcribir» y cada tarjeta de contacto «Dar
de alta» (si ese número no está ya en la app).

**7 · Audios.** `transcribir(msgId)` baja el audio (solo de un chat leído aquí) y lo
transcribe con Gemini, con el mismo encargo que el asistente («literalmente, no
resumas»). Se guarda en memoria por mensaje. «Guardar en notas» añade la línea a
`clientes.notas` con la fecha.

**8 · Contactos compartidos.** Las vCard recibidas en chats individuales en 30 días,
solo de lo cargado en memoria, cuyo número no tiene ficha ni está descartado. Si las
pasó un partner, el alta sale con él como prescriptor.

**9 · Instaladores pendientes.** Contactos con la etiqueta INSTALADORES o con un nombre
del ramo («Inst. …», «Instalaciones», «Fontanería», «Calefacción») que no están en
Partners ni en Clientes. «Dar de alta» abre `InstaladorFormModal` relleno.

**REGLA — lo del paréntesis es QUIÉN LO TRAE.** «Cris Truji (Inst. Miguelturra)» es
gente de ese instalador, no un instalador, y «Aerotermia» es lo que quiere un cliente.
Solo cuenta lo de fuera del paréntesis, y la etiqueta INSTALADORES (puesta por una
persona) manda.
