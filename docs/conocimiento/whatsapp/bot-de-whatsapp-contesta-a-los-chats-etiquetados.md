<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Bot de WhatsApp — contesta a los chats ETIQUETADOS (2026-08-25)
⚠️ **APAGADO en producción desde 2026-10-05**: la etiqueta MOIA es ahora el chat de Fran con su asistente (ver la sección anterior).


Un asistente que responde por la MISMA sesión de WhatsApp del VPS con la que ya
salen los avisos de la app, y **solo en los chats que lleven la etiqueta**
`MOIA` (`BOT_WHATSAPP_ETIQUETA`). Contesta a lo que más se pregunta: **qué
documentación hay que aportar** y **cuál es el siguiente paso**. Todo lo demás
lo escala a una persona.

### Las tres piezas, y por qué están separadas

| Fichero | Responde a |
|---|---|
| [botPrompt.js](implementation/backend/services/botPrompt.js) | **QUÉ** contesta — el META PROMPT + el dossier redactado |
| [botContexto.js](implementation/backend/services/botContexto.js) | **CON QUÉ** contesta — teléfono → expediente → qué falta → enlaces |
| [botWhatsapp.js](implementation/backend/services/botWhatsapp.js) | **CUÁNDO** contesta — etiqueta, horario, agrupación, frenos |
| [botCerebro.js](implementation/backend/services/botCerebro.js) | La llamada a Gemini con `responseSchema` (gemelo del OCR) |

El prompt vive en su propio fichero porque **no es código**: es la formación del
asistente y se va a retocar diez veces más que la mecánica. Quien cambie lo que
dice toca `botPrompt`; quien cambie cuándo habla, `botWhatsapp`.

**REGLA — el prompt describe el PROCESO; los DATOS vienen del dossier.** Un
proceso escrito en el prompt envejece con el negocio; un dato metido en el
prompt nace mintiendo. "Qué falta" sale de `buildChecklistData` —el MISMO
barrido que ve el admin— y de `v_expedientes_lifecycle`; los enlaces, de
`ensureUploadLink`. Si el bot calculara su propia versión de lo que falta, le
diría al cliente algo distinto de lo que dice la app.

**REGLA — el bot NO habla de dinero.** Ni el bono, ni la inversión, ni cuándo se
cobra. El dossier ni siquiera lleva importes, así que la regla no depende solo
de que el modelo obedezca: no tiene el dato. Se redacta el dossier a mano en vez
de volcarle el expediente en JSON justamente por esto — un `JSON.stringify`
metería un importe en el prompt el día que alguien añada un campo, sin que nadie
tocara la regla.

**REGLA — al cliente se le nombran las cosas en LENGUAJE DE CASA.** Las
etiquetas del barrido las escribió un ingeniero ("Placa de la unidad interior /
DEPOSITO ACS") y con ellas casan el Anexo Fotográfico y el CIFO, así que no se
tocan; el bot las traduce con `labelCliente` (tabla `LABEL_CLIENTE` de
`reformaUploadService`, fuente única), y así le nombra las fotos **igual que la
pantalla a la que lo manda**.

**REGLA — las dos FASES no se mezclan, igual que en `DocsManager`.** Con el CEE
inicial sin registrar la obra ni siquiera puede empezar: pedirle la foto de la
máquina nueva instalada es pedirle una foto imposible, y una lista de tareas
imposibles hace que deje de mirar la lista entera. `fase_activa` parte los
pendientes en *ahora* / *más adelante*, y lo que es del instalador se separa de
lo que es del cliente.

**REGLA — con VARIOS asuntos abiertos, se PREGUNTA.** Un teléfono puede resolver
a varios clientes (medido: uno figura en 5 fichas) y un instalador tiene
decenas. Contestar por el primero es contestar por el equivocado la mitad de las
veces, así que el dossier viaja marcado `ambiguo` y el bot pide la dirección o
el titular antes de decir nada concreto.

### Los frenos — y por qué son innegociables

No es la API oficial: es la cuenta REAL pilotada por un Chrome. Si se bloquea,
**se cae con ella todo lo automático** (el parte diario, los encargos al
certificador, la entrega de los CEE directos).

- **Etiqueta** + `BOT_WHATSAPP_CHATS_PRUEBA` (lista blanca, para la fase de
  pruebas: se comprueba ADEMÁS de la etiqueta).
- **Horario 08:00-20:00 Madrid.** Fuera de él no contesta —un mensaje automático
  a las 23:40 delata al bot y además nadie puede recoger un escalado a esa
  hora—, pero **el mensaje no se pierde**: se guarda con `responder_after` en la
  próxima apertura. Por eso hay tabla y no un buffer en memoria como
  `uploadNotifier`: un reinicio nocturno se comería la pregunta.
  El horario se calcula **siempre contra el huso**, nunca con `getHours()`: el
  servidor va en UTC y España cambia de hora dos veces al año.
- **Ventana de silencio de 25 s.** El cliente manda "Buenas tardes" · la
  pregunta · "Gracias" en el mismo minuto (caso real): se agrupa en UNA fila y
  se responde una vez. Contestar al primero es contestar a un saludo.
- **Si un HUMANO ha escrito, el bot calla.** Los mensajes del bot también son
  `fromMe`, así que se distinguen por el TEXTO: lo que manda queda registrado, y
  un `fromMe` que no case con ninguna respuesta suya de las últimas 24 h es de
  una persona. Un `fromMe` posterior a la llegada del mensaje = alguien se
  adelantó → se descarta.
- **Tope diario** (`BOT_WHATSAPP_MAX_DIA`, 40) y **apagado por defecto**.
- **LISTA BLANCA de tipos de mensaje.** WhatsApp emite sus propias
  notificaciones de sistema (`e2e_notification`, `notification_template`,
  "se desactivaron los mensajes temporales") por el MISMO evento y con el cuerpo
  vacío. Con una lista negra, cualquier tipo nuevo de Meta despertaría al bot
  para contestar a un mensaje que el cliente no ha escrito.
- **Sin lista blanca de chats, el bot NO ARRANCA** (salvo `BOT_WHATSAPP_TODOS=true`).
  Salir del modo prueba tiene que ser una decisión escrita, no lo que pasa por
  descuido al poner `enabled=true`.

### El camino de entrada no puede colgarse — `scripts/test_bot_robustez.js`

Un mensaje entrante desemboca en llamadas a Puppeteer, y ese Chrome es el mismo
del que depende TODA la app para enviar.

**REGLA — NINGUNA llamada al cliente crudo va sin plazo** (`conPlazo`,
`BOT_WHATSAPP_PLAZO_WA_MS`). Una promesa que no resuelve nunca deja `barriendo`
en `true` y **el bot muere en silencio**: ni contesta ni avisa. Con plazo, lo
peor que pasa es que el mensaje se reintente en el barrido siguiente. Hay además
un cinturón (`BARRIDO_MAX_MS`) que libera el cerrojo si un barrido se eterniza.

**REGLA — se pregunta la etiqueta POR CHAT, nunca listando la etiqueta entera.**
`getChatsByLabelId` acaba en `Promise.all(chatIds.map(getChatById))`: hidrata un
objeto `Chat` completo por cada chat etiquetado, o sea 50 evaluaciones en
Puppeteer por consulta. `getChatLabels(chatId)` es UNA, y solo del chat que
acaba de escribir. La lista completa queda para el panel, bajo petición.
Se cachea con **TTL asimétrico**: 5 min el positivo (una etiqueta rara vez se
quita) y 60 s el negativo, que es el que decide cuánto tardas en ver efecto tras
etiquetar un chat — con 5 minutos parece que no funciona y acabas reiniciando el
backend para nada.

**REGLA — las consultas simultáneas se de-duplican** (`consultasEnVuelo`). Tres
mensajes seguidos del mismo cliente son el caso NORMAL, no el raro: sin esto,
disparan tres consultas idénticas a Puppeteer a la vez.

**REGLA — `encolar` va con CANDADO por chat.** Es un leer-y-luego-escribir, y
los mensajes que hay que agrupar son justamente los que llegan a la vez: dos que
entren en el mismo instante leen los dos "no hay fila abierta", insertan los dos
y **el cliente recibe dos respuestas a la misma pregunta**. Basta un candado en
memoria porque la sesión de WhatsApp es un singleton atado a un teléfono. El
barrido lo refuerza despachando **una fila por chat y vuelta**.

**REGLA — un fallo de lectura NO es un "no está etiquetado".** Si la sesión se
cae, `estaEtiquetado` devuelve `false` (ante la duda, callar) pero deja
`etiquetaCache.error` puesto, y `despachar` lo usa para NO descartar el mensaje:
se reintenta cuando WhatsApp vuelva. Y si ni siquiera se puede escalar (Supabase
o WhatsApp caídos), la fila se cierra como DESCARTADO en vez de reintentarse
cada 30 s para siempre.

**REGLA — "no está etiquetado" y "no he podido comprobarlo" no son lo mismo.**
Si la sesión se cae entre el barrido y la comprobación, la lista de chats viene
vacía; descartar ahí tiraría la pregunta de un cliente que sí estaba etiquetado.
Con `etiquetaCache.error` puesto, se espera al siguiente barrido.

**REGLA — la FIRMA la pone el código, no el modelo.** Aunque el prompt la pida,
la escribe distinta cada vez (con guion, sin negrita, en dos renglones), y en un
chat donde unas veces contesta una persona y otras el asistente esa línea es lo
único constante. `asegurarFirma()` limpia las variantes y pone la buena; al
prompt se le dice **que no firme**.

### De QUÉ obra habla — `botVinculos` + tabla `whatsapp_chat_expediente`

El teléfono dice QUIÉN escribe; no dice DE QUÉ. Medido el 2026-08-25 sobre
expedientes vivos: **219 de 257 teléfonos (85 %) resuelven a una sola obra**,
así que con los clientes el problema casi no existe. Pero el peor caso son **33
obras vivas en el mismo chat** (un instalador), y son justo los que más
escriben.

Tres procedencias, de más a menos fiable:

| Origen | Qué es | Vigencia |
|---|---|---|
| `manual` | Lo ha fijado una persona desde la ficha | no caduca |
| `conversacion` | El propio cliente ha dicho de qué obra habla | 8 h |
| `envio` | Le hemos escrito nosotros desde ese expediente | 72 h |

**REGLA — con un INSTALADOR, la pista de ENVÍO no decide.** Que le mandáramos un
aviso el martes desde una obra no dice por cuál de sus treinta pregunta hoy: se
le pregunta, que es lo que haría cualquiera. Sí valen las otras dos —lo fijado a
mano es una decisión tomada, y lo que él mismo acaba de decir es la respuesta
literal a esa pregunta—. Lo controla `elegir(..., { permitirEnvio })`, que
`botContexto` pone a `rol === 'cliente'`.

**REGLA — una obra elegida entre varias se ANUNCIA.** El dossier lleva
`elegidoPor` y `otrosAsuntos`, y el prompt obliga a empezar con "Sobre la obra
de X:" y a ofrecer el cambio. Una suposición que no se anuncia es una suposición
que el cliente no puede corregir: se le contesta por la obra equivocada y no se
entera ninguno de los dos.

**REGLA — cuando el cliente aclara de qué obra habla, se APRENDE y se vuelve a
pensar EN LA MISMA VUELTA.** El cerebro devuelve `asunto_elegido` (el número
entre corchetes del dossier), se siembra el vínculo y se rehace la respuesta. Si
no, a "la de Tomelloso, ¿qué me falta?" habría que contestarle "vale, ¿y qué
necesitas?" y hacerle repetir la pregunta que acaba de hacer.

**REGLA — el vínculo se siembra SOLO, desde los envíos que la app ya hace.**
`botVinculos.sembrarEnDiferido(tlf, oportunidadId)` en los avisos del expediente
y en "solicitar lo que falta". Va en `setImmediate` y **nunca lanza**: el aviso
al cliente es el trabajo, el vínculo es una comodidad.

Es una TABLA y no un campo en `expedientes` porque la relación es N:M en los dos
sentidos: un chat habla de varias obras (el instalador) y una obra puede tener
dos chats (el titular y el instalador). Un campo obligaría a elegir uno.

Rutas para la ficha (staffOnly): `GET/POST /api/expedientes/:id/whatsapp-chats`
y `DELETE .../:telefono`. Esquema en `scripts/bot_whatsapp_vinculos.sql`; test
en `scripts/test_bot_vinculos.js`.

**En la app va en SEGUIMIENTO**, al final
([ChatWhatsappVinculo.jsx](implementation/frontend/src/features/expedientes/components/ChatWhatsappVinculo.jsx)):
ahí es donde vive la comunicación con el cliente y el certificador, no en
Instalación (datos técnicos) ni en la cabecera (ya llena). Oculto al
certificador (`readOnly`), que no tiene por qué ver a qué número se le escribe.

**REGLA — los contactos se ELIGEN, no se teclean.** El `GET` devuelve además los
teléfonos que ya constan en el expediente (cliente, instalador y sus personas de
contacto, vía `resolveSolicitudContacto`) y se ofrecen como botones. Teclear un
móvil a mano es la forma más fácil de vincular el chat equivocado, y los buenos
ya están en la ficha. El campo manual se queda para el caso en que quien escribe
sea un número que no consta.

**REGLA — las tres procedencias se distinguen en pantalla** (Fijado · Aprendido ·
Automático). Una es una decisión y las otras dos son una conjetura con fecha de
caducidad: presentarlas igual haría creer que el bot tiene una certeza que no
tiene. Y **el botón de quitar va en las tres**, también en la automática: una
pista que apunta a la obra equivocada es justo lo que hay que poder borrar sin
esperar a que caduque.

⚠️ La validación del teléfono estaba SOLO en el navegador y el backend tragaba
`"123"` como chatId. `aChatId` aplica ahora el mismo criterio que
`whatsappService.normalizePhone` (9 dígitos → +34; con prefijo, 10-15) y devuelve
`null` si no cuela; la ruta lo traduce a **400**, no a 500 — un teléfono mal
tecleado no es una avería. `soltar()` NO valida, a propósito: hay que poder
borrar precisamente lo que se guardó mal.

⚠️ **Un 429 de Gemini NO escala** —sería mandarle al cliente un "te contesta un
compañero" porque hemos pedido demasiado rápido—: se reprograma el mensaje y
**se corta el barrido entero**, porque los siguientes chocarían con la misma
cuota. El manejo se mantiene aunque ahora casi no salte: ver "La API de Gemini
va en NIVEL DE PAGO".
