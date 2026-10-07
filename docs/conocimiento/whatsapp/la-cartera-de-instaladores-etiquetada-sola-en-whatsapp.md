<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La cartera de instaladores, etiquetada sola en WhatsApp (2026-09-09)

Un instalador vivía en dos sitios sin nada que los uniera: su ficha en
`prescriptores` y su chat en el móvil, un número suelto entre clientes. La
etiqueta `INSTALADORES` la ponía alguien a mano cuando se acordaba — medido el
09/09/2026: **26 chats etiquetados para 71 fichas**.

| Qué | Dónde |
|---|---|
| Qué teléfonos tiene un instalador y con qué nombre se guardarían | [whatsappInstaladoresSync.js](implementation/backend/services/whatsappInstaladoresSync.js) — `telefonosDeInstalador` |
| La agenda (leer contacto · guardar sin pisar) | [whatsappContactos.js](implementation/backend/services/whatsappContactos.js) |
| Ruta | `POST /api/whatsapp/etiquetas/sincronizar-instaladores` — **adminOnly o `x-internal-key`** |
| Superficie | Panel de WhatsApp: "Ver qué haría" → "Sincronizar ahora" |
| Repaso completo desde el VPS | `cd /opt/brokergy/implementation/backend && node scripts/sincronizar_etiquetas_instaladores.js [--execute]` |
| Prueba de lo puro, en local | `node implementation/backend/scripts/test_sync_etiquetas_instaladores.js` |

**REGLA — un nombre que YA está en la agenda no se toca jamás.** Lo puso una
persona, muchas veces con el apodo por el que de verdad conoce a ese instalador
("Paco el de las calderas"), y machacarlo con la razón social de la BBDD es
hacerle perder la referencia en su propio teléfono. Solo se rellena el hueco de
quien entra como número suelto (`guardarSiFalta`, que mira `isAddressBookContact`
y `isMyContact` — WhatsApp ha ido cambiando cuál de las dos usa).

**REGLA — la etiqueta se AÑADE; la lista se manda COMPLETA.** `poner()` deja el
chat con exactamente lo que se le pasa, así que siempre va lo que ya tenía MÁS la
nuestra. Un instalador está además en "EN CURSO" o en "Pagado", que es trabajo de
otra persona.

**REGLA — se etiquetan TODOS los teléfonos que constan**, no solo el principal:
en 20 de las 71 fichas el número por el que se habla con la obra es el del jefe
de obra o el de administración. Se deduplica por los 9 dígitos finales y manda el
PRIMERO (el de la empresa), porque el mismo número repetido en tres campos es un
solo chat y no puede guardarse tres veces con tres nombres.

**REGLA — esto NUNCA tumba lo que lo llamó.** El enganche del alta/edición va en
`setImmediate` y se traga sus errores: que WhatsApp esté desconectado no puede
hacer fallar el guardado de una ficha. Y solo se dispara si el guardado ha TOCADO
un teléfono (`tocaTelefonos`) — reetiquetar en cada guardado sería una llamada a
Puppeteer por cada cambio de comisión o de nota, contra la sesión de la que
depende todo lo demás.

⚠️ **`poner()` fallaba justo con el caso normal**: un chat al que nunca has
escrito NO entra en `C.Chat` con su `@c.us` —`findOrCreateLatestChat` devuelve
`{chat, created}` y `C.Chat.get(id)` sigue dando `undefined`, porque vive bajo su
`@lid`—, así que el `C.Chat.get` posterior lanzaba "Ese chat ya no existe en
WhatsApp". O sea: etiquetar a alguien recién dado de alta, que es para lo que
existe esto, era lo único que no funcionaba. Ahora se crea y se etiqueta en la
MISMA `evaluate`, conservando el modelo devuelto.

⚠️ **Un script suelto NO ve la sesión de WhatsApp**: es un singleton del proceso
del servidor, así que `node scripts/…` arranca otro proceso y `getStatus()`
devuelve DISCONNECTED aunque esté conectada. Por eso el repaso entra por la ruta
con `x-internal-key` (mismo patrón que el CIFO) en vez de importar el servicio.

**El automático nace APAGADO** (`WA_SYNC_INSTALADORES`), como `CEE_ENTREGA_AUTO` y
`BOT_WHATSAPP_ENABLED`: encendido en LOCAL escribiría en la agenda del teléfono de
verdad. Y `dryRun` es el valor por DEFECTO de la ruta — la llamada que se hace sin
pensar es la que no toca nada. Pausa de `WA_SYNC_PAUSA_MS` (1,5 s) entre chats, y
corte tras 3 tiempos de espera seguidos: 90 operaciones en ráfaga contra ese
Chrome es justo lo que no conviene hacerle.

**REGLA — el repaso va a TROZOS.** Son ~90 teléfonos a segundo y medio y nginx
corta la petición a los 60 s: el repaso entero devolvía un **504 con medio
trabajo hecho y sin informe**, que es la peor combinación (no sabes qué se hizo).
La ruta mira como mucho `WA_SYNC_LIMITE` (12) teléfonos y devuelve en `restantes`
los instaladores que faltan; el script y el botón encadenan las pasadas y enseñan
el avance. Mismo patrón que el paquete de actuaciones de un lote.

⚠️ **El script se ejecuta en el HOST del VPS, no dentro del contenedor**:
`.dockerignore` excluye `scripts/` a propósito. Y en el host no hay
`node_modules` —viven en la imagen—, así que ese script no puede requerir NADA:
lee el `.env` a mano y usa el `fetch` de Node.

Medido el 09/09/2026 al estrenarlo: 71 instaladores, 83 teléfonos, **54 chats
etiquetados** (18 ya la tenían) y solo **6 contactos nuevos** en la agenda — casi
todos estaban ya guardados, que es justo lo que la regla protege. La etiqueta
pasó de 26 a 80 chats. Once números no tienen WhatsApp: son los fijos de empresa.

**Etiqueta que no existe = se dice cómo crearla.** No se puede crear desde la app
(WhatsApp no lo expone y la librería tiene rota toda esa familia — ver "Lo que
WhatsApp rompió"), así que `idEtiqueta()` falla con la lista de las que sí hay.
