<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Lo que WhatsApp rompió, y hay que saber (2026-08-25)

**⚠️ `getLabels()` de whatsapp-web.js NO FUNCIONA.** Todas las vías de la
librería (`client.getLabels`, `chat.getLabels`, `chat.changeLabels`,
`getChatsByLabelId`) pasan por `getLabelModel()`, que hace `label.serialize()` y
lee `label.hexColor`. WhatsApp cambió ese modelo y sale un error minificado que
literalmente pone `"r"`. Medido contra una cuenta Business con **16 etiquetas**:
la colección se lee perfectamente y lo que revienta es serializarla. Por eso
`whatsappLabels` lee `WAWebCollections` directamente. Es deuda a propósito:
cuando la librería publique el arreglo, se puede tirar. Lo mismo con
`fetchMessages()`, que dejaba `humanoHaIntervenido` devolviendo siempre null —
o sea, **la protección de no pisar a un compañero estaba muerta y no se notaba**.

**⚠️ Los chats ya no se llaman como el número: `@lid`.** WhatsApp está migrando
de `34612345678@c.us` a identificadores opacos (`71159068520593@lid`). Dos
consecuencias, las dos medidas:
- Escuchar solo `@c.us` deja al bot **sordo** con los chats migrados, y sin
  rastro de que ha pasado nada.
- **Al `@lid` no se le puede ENVIAR**: la cola agotaba los 5 reintentos con otro
  error minificado ("t") mientras el mismo texto al número salía a la primera.
  `destinoDe(fila)` manda siempre al teléfono. El `@lid` sirve para RECONOCER
  quién escribe, no para contestarle.
`getContactLidAndPhone` resuelve lid ↔ teléfono y se cachea de por vida del
proceso (un lid no cambia de dueño).

**⚠️ Las colecciones de WhatsApp Web tardan en cargar tras el `ready`.** Durante
los primeros segundos `Label.getModelsArray()` devuelve una lista VACÍA aunque la
cuenta tenga 16 etiquetas. Dar por buena esa respuesta grababa un "esta cuenta no
tiene etiquetas" para toda la sesión: el bot no contestaba a nadie y el log
afirmaba algo falso. La comprobación de arranque **no se marca como hecha hasta
que la respuesta es concluyente**, y una lista vacía se reintenta.

**⚠️ `requireAuth` NO exige sesión.** Si no hay token pone `req.user = null` y
deja pasar — sirve para SABER quién eres, no para exigirlo. Comprobado el
25/08/2026: unas rutas nuevas montadas con `requireAuth` servían las 16 etiquetas
de la cuenta a un `curl` sin cabeceras. Para cualquier cosa interna, `staffOnly`
o `adminOnly`. La regla 6 ("todas las rutas usan requireAuth o enforceAuth") se
lee mal si no se sabe esto.

**⚠️ `sendText()` ENCOLA, no envía.** Devuelve `{ok:true}` mucho antes de que
WhatsApp haya entregado nada, así que un RESPONDIDO en la bandeja del bot no
distingue "contestado" de "encolado y fallido" — el 25/08/2026 se dio por
entregada una respuesta que había muerto tras 5 reintentos. Se guarda el
`cola_id` en el contexto para poder contrastarlo con `whatsapp_queue`.
