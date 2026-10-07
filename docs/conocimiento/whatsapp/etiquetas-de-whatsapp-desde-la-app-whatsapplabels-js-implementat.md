<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Etiquetas de WhatsApp desde la app — [whatsappLabels.js](implementation/backend/services/whatsappLabels.js)

Las etiquetas son de WhatsApp, no del bot: organizan la cartera (Pagado, EN
CURSO, RES080, SAT…) y una de ellas, además, enciende el asistente. Se gestionan
desde la **ficha del cliente**
([WhatsappEtiquetas.jsx](implementation/frontend/src/components/WhatsappEtiquetas.jsx)),
porque son del CHAT: el mismo teléfono es el mismo chat aunque tenga tres obras,
y es en la ficha del cliente donde se mira el teléfono.

Rutas: `GET /api/whatsapp/etiquetas` · `GET|PUT /api/whatsapp/etiquetas/:telefono`.

**REGLA — se guarda la lista COMPLETA, no la que cambia.** La operación de
WhatsApp es "deja el chat con exactamente estas etiquetas"; mandar solo una le
borraría al chat todas las demás, que son de otra persona y de otro trabajo.

**REGLA — se puede etiquetar SIN haber escrito nunca.** Una etiqueta se pone
sobre un chat, y dar de alta a un cliente y clasificarlo antes de hablar con él
es el caso normal. `asegurarChat()` usa `findOrCreateLatestChat`, lo mismo que
hace WhatsApp al abrir una conversación desde la agenda: **no se envía nada ni se
notifica al cliente**, solo aparece el chat vacío en la lista del móvil. Solo lo
hace el PUT: abrir una ficha (GET) no puede crear conversaciones.

**REGLA — el número se comprueba contra WhatsApp** (`queryWidExists`), nunca se
compone el id a mano. Etiquetar un id inventado **no da error**: no hace nada,
que es peor que fallar.
