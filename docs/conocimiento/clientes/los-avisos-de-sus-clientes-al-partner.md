<!-- conocimiento · área: clientes · las rutas de los enlaces son relativas a la raíz del repo -->

## Los avisos de sus clientes, al PARTNER (2026-10-15)

Hay instaladores que quieren llevar ellos la relación con el cliente: que los
WhatsApp, emails y peticiones de documentación les lleguen a ellos y no al
titular. Eso existía desde el 23/09/2026, pero **cliente a cliente**: el
interruptor «¿Los avisos los recibe el partner?» de la ficha del CLIENTE
([PartnerComoContacto.jsx](implementation/frontend/src/features/clientes/components/PartnerComoContacto.jsx)),
que guarda `clientes.contacto_es_partner` y deja en `persona_contacto_*` una COPIA
del comercial del partner (`contactoClienteDesdePartner` en
[notifyContacts.js](implementation/backend/services/notifyContacts.js)). Medido el
15/10/2026: JOSE VICENTE RUIZ SL lo tenía activado a mano en sus 10 clientes;
Luis Gil-Ortega, en ninguno de sus 3. Y en la ficha del partner no había nada:
«¿cómo lo habilito para que siempre le lleguen a él?» no tenía respuesta.

Ahora la ficha del partner tiene el interruptor **«Los avisos de sus clientes, al
partner»** (`prescriptores.avisos_al_partner`, solo el equipo interno), y
[services/avisosAlPartner.js](implementation/backend/services/avisosAlPartner.js)
lo aplica.

**REGLA — la marca del partner no es un tercer modo de elegir destinatario: solo
ENCIENDE `contacto_es_partner` en sus clientes.** Hay ~30 sitios que eligen a quién
escribir leyendo `persona_contacto_*` + `notificaciones_contacto_activas`; la copia
existe para que todos acierten sin tocarlos. Si cada uno tuviera que mirar también
el partner, alguno se quedaría atrás mandándole el mensaje al cliente.

**REGLA — actúa en tres momentos, y en ninguno más:**
- Al **guardar la ficha del partner con la marca recién CAMBIADA**
  (`PATCH /api/prescriptores/:id`): encendida, se activa en TODOS sus clientes;
  apagada, se retira de los que la tenían (dejar la copia sería seguir
  escribiéndole a él sin la marca que lo explica). El popup dice a cuántos.
- Al **dar de alta un cliente** de ese partner por cualquier camino: la ficha
  (`POST /api/clientes`), la aceptación pública (`/aceptar` en `public.js`, ANTES
  del acuse, que ya le llega a él), la landing y la skill `alta-oportunidad`
  (`createLead` → `leadService`) y la oferta de CEE directo (`ceeOfertaService`).
- Al **cambiarle el partner** a un cliente desde su ficha (`PUT /api/clientes/:id`).

Volver a guardar la ficha del partner sin tocar la marca NO reaplica nada: así un
cliente concreto se puede EXCLUIR desde su ficha y la excepción se respeta.

**REGLA — el navegador solo manda la marca si se ha CAMBIADO.** La ficha del
partner (`PrescriptorDetailModal`) se abre desde sitios que pueden no traer el
campo; si se mandara siempre, un `false` por omisión se leería como «apagar» y le
quitaría el desvío a todos sus clientes al guardar cualquier otra cosa. El backend,
además, compara con lo guardado antes de aplicar.

**Sin teléfono ni email en la ficha del partner no hay a quién desviar**: el PATCH
deshace la marca y responde 400 (`AVISOS_PARTNER_SIN_CANAL`), igual que la ficha
del cliente (`aplicarContactoPartner`). Un partner sin email (Luis) solo recibe
los WhatsApp: los emails al cliente no salen a nadie hasta que se le ponga uno, y
entonces se copia solo (`resincronizarClientesDelPartner`).

**REGLA — a la persona de contacto se le escribe a SU email o a ninguno** (2026-10-28).
Los tres sitios que eligen el email «del cliente» —`avisoCliente` en
[ceeRegistradoAviso.js](implementation/backend/services/ceeRegistradoAviso.js),
`resolveSolicitudContacto` en `routes/expedientes.js` y `contactoCliente` en
[ceeDirectoService.js](implementation/backend/services/ceeDirectoService.js)—
caían al email del TITULAR cuando el contacto no tenía el suyo. Así, el aviso de «CEE
inicial presentado» de 26RES060_253 salió con «¡Hola Félix!» (CALINDSA, sin email)
al buzón de la familia del titular. Ahora, si se le habla al contacto (`tercero`),
el email es solo el suyo; sin él sale el WhatsApp y no sale email. Con el desvío
marcado pero sin nadie detrás, sigue siendo el titular. Prueba:
`node implementation/backend/scripts/test_aviso_cee_registrado.js`.

Los documentos (Anexo I, Convenio, CIFO) siguen a nombre del TITULAR, y en la
propuesta el titular sigue siendo una fila más, sin marcar (ver «La propuesta al
TITULAR, aunque sus avisos vayan al instalador»).

Columna: `scripts/prescriptores_avisos_al_partner.sql` (aplicada el 15/10/2026).
Primer partner con la marca: Luis Gil-Ortega (46238217-…).
