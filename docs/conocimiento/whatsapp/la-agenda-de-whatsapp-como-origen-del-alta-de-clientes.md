<!-- conocimiento · área: whatsapp · las rutas de los enlaces son relativas a la raíz del repo -->

### La agenda de WhatsApp como origen del alta de clientes (2026-10-13)

Quien pide un CEE suelto o una aerotermia casi siempre llega por WhatsApp, así
que su nombre y su número ya están en el móvil. Al darlo de alta (o al mandarle
una oferta) **se elige de la agenda en vez de teclearlo**, que es donde se cuela
la errata del teléfono. Y si ya está en la app, se dice antes de duplicar la ficha.

| Qué | Dónde |
|---|---|
| Lo puro: limpiar el nombre, unir `@c.us`/`@lid`, filtrar | [utils/agendaWhatsapp.js](implementation/backend/utils/agendaWhatsapp.js) · prueba `node implementation/backend/scripts/test_agenda_whatsapp.js` |
| Leer la agenda de la sesión y cruzarla con clientes y partners | [services/whatsappAgenda.js](implementation/backend/services/whatsappAgenda.js) |
| Ruta | `GET /api/whatsapp/contactos/buscar?q=` (`staffOnly`) |
| Búsqueda y teléfono de la ficha (frontend) | [utils/agendaWhatsapp.js](implementation/frontend/src/utils/agendaWhatsapp.js) (`useAgendaWhatsapp`, `tlfDeContacto`) |
| La lista que se pinta | [components/AgendaWhatsapp.jsx](implementation/frontend/src/components/AgendaWhatsapp.jsx) (`ContactosWhatsapp`) |
| Superficies | `ClientePicker` (alta y ficha de CEE directo, y la **oferta**) · `ClienteFormModal` («Traer de WhatsApp», en todo alta de cliente) |

**Dónde sale.**
- **Oferta de CEE**: una sola caja de búsqueda. Salen las fichas «En la app», los
  contactos «En tu WhatsApp» y «Es nuevo: usar "…"». Elegir un contacto rellena el
  nombre, el móvil y el canal WhatsApp. La ficha nace al enviar, igual que el alta
  rápida de siempre. Ya no hay interruptor «Buscar uno que ya existe / Es nuevo».
- **Alta y ficha de un CEE directo**: el mismo buscador. El contacto abre el alta
  del cliente ya rellena.
- **«Nuevo cliente»** (Clientes, expedientes, calculadora…): arriba, «Traer de
  WhatsApp: nombre o teléfono…». Rellena nombre, apellidos, teléfono y el partner.

**REGLA — solo LECTURA, en memoria y en la fila de las demás lecturas.** Una sola
`evaluate` sobre `WAWebCollections.Contact` y `.Chat` (como el renombrado de la
agenda), en `enSerie` de `whatsappMedia` y con plazo. Nada de
`getChats`/`getChatById`/`sendSeen` (regla 39). No se crea ningún chat y no se
escribe en la agenda. Como se busca mientras se escribe, la agenda leída se guarda
**2 minutos** (`WA_AGENDA_CACHE_MS`). Entra el contacto guardado en la agenda y el
no guardado **solo si hay conversación**: si no, la colección trae a todos los
participantes de todos los grupos.

**REGLA — el cruce con la BD avisa, no elige.** El número se casa por los 9
últimos dígitos contra el titular, la persona de contacto y los copropietarios de
cada cliente, y contra los teléfonos de los partners. Como un mismo móvil figura
en fichas de personas distintas (regla 47), se enseñan **todas** las fichas que lo
tienen («Ya está en la app: …» con «Usar su ficha»). Decide la persona: «Es otra
persona» sigue con el alta. El teléfono de un partner se avisa en ámbar.

**REGLA — con la BD caída, 503; nunca «no es cliente»** (regla 38): eso invitaría
a duplicar la ficha. Con WhatsApp desconectado, también 503: la lista lo dice en
una línea y el resto de la pantalla sigue igual.

**El nombre que se propone.** Se quita el prefijo de obra de la casa (`leerPrefijo`:
«RES080_93 David Minaya» → «David Minaya»). El paréntesis final es quién nos lo
trae: si casa con **un solo** partner (acrónimo o primera palabra de la razón
social), se preselecciona, y solo si no había uno ya elegido. «(Foncaman)» →
FONCAMAN CRIPTANA, SL; «(Inst. Miguelturra)» no casa con nadie y no se adivina.
Nombre y apellidos son una propuesta editable: con dos palabras, una y una; con
tres, una y dos; con más, dos y el resto. Sin nada aprovechable en la agenda, se
usa el `pushname` (sin emojis).

**Solo equipo interno**: es la agenda de la empresa. La ruta es `staffOnly` y en
pantalla un 401/403 se calla (el partner ni ve que exista).

#### Pendientes de alta (Clientes → «Pendientes de WhatsApp»)

Un botón en la cabecera de Clientes, con el recuento, abre la lista de los
contactos guardados **con prefijo de la casa** («RES080 Jesús Quero (Foncaman)»,
«CEE Carmen») cuyo número no está en **ninguna** ficha, ni de cliente ni de
partner. El prefijo lo pone una persona cuando el contacto ya es un asunto de
trabajo: si no tiene ficha, el alta se quedó por hacer. «Dar de alta» abre el
formulario de siempre ya relleno (nombre, apellidos, móvil y partner). Al guardar,
el contacto sale de la lista.

| Qué | Dónde |
|---|---|
| Qué obra dice el prefijo (`obraDelPrefijo`, `codigoObra`) | [utils/agendaWhatsapp.js](implementation/backend/utils/agendaWhatsapp.js) |
| La lista | `pendientesDeAlta()` en [services/whatsappAgenda.js](implementation/backend/services/whatsappAgenda.js) · `GET /api/whatsapp/contactos/pendientes-alta` (`staffOnly`) |
| Pantalla | [PendientesWhatsapp.jsx](implementation/frontend/src/features/clientes/components/PendientesWhatsapp.jsx) en `ClientesView` |

**REGLA — lo que dice el prefijo decide si se propone.**
- Sin número («RES080 …») → se propone.
- Una **oportunidad sin cliente** («RES060_OP212 …») → se propone, y el alta la
  **vincula** (el formulario recibe la oportunidad entera, con su dirección y su
  partner).
- Una oportunidad con cliente, un **expediente** o un **CEE** que existen → **no se
  propone**. Esa obra ya tiene su cliente y ese número es otro (el hijo, la pareja).
  Se cuenta al pie para que no parezca perdido.
- Un número que no existe en la app (la numeración vieja, «RES060-08») → se
  propone, con la nota.

Los números se comparan sin año, con guion bajo y sin ceros a la izquierda
(`codigoObra`: «26RES060_OP212» = «RES060_OP212», «RES060-08» = «RES060_8»).

**REGLA — descartar es del EQUIPO y se puede deshacer.** «Descartar» quita de la
lista a un contacto que no va a ser cliente (un lead que no siguió) para todos,
así que se guarda en la BD y no en el navegador. Va en la tabla
`whatsapp_contactos_descartados`, con el teléfono en 9 dígitos, cómo estaba
guardado, quién lo descartó y cuándo
([script](implementation/backend/scripts/whatsapp_contactos_descartados.sql),
aplicado en producción el 13/10/2026). La tabla tiene RLS deny-all, permisos solo
para `service_role` y `REVOKE` a anon/authenticated. Al descartar sale «Deshacer»
al momento, y al pie, «N descartados · Ver» con «Recuperar» en cada uno. No toca
la agenda ni ninguna ficha, y el buscador «En tu WhatsApp» sigue encontrándolo.
Rutas: `POST /api/whatsapp/contactos/descartados` y
`DELETE /api/whatsapp/contactos/descartados/:telefono` (`staffOnly`). La lista
también devuelve `descartados`.

El formulario de alta va **portaleado al body**, como la lista. Dentro de la
página quedaba bajo su `z-10` y se abría DEBAJO de la lista.

Medido el 13/10/2026: **82 pendientes** (43 RES060, 24 RES080, 10 CEE, 3 TER100 y
2 RES020). 28 de ellos no tienen conversación, porque solo están guardados; van al
final, ya que la lista se ordena por la última conversación. Otros 5 se apartaron
por llevar el nº de una obra que ya tiene cliente. Ninguno era una oportunidad sin
cliente.

Probado en local el 13/10/2026 contra la sesión real: «irene» encuentra 3 fichas y
4 contactos que no son clientes. «res080» devuelve 10 contactos con su prefijo
quitado y el aviso de las fichas que ya existen. «quero» → «RES080 Jesús Quero
(Foncaman)» rellena JESÚS / QUERO / su móvil / FONCAMAN CRIPTANA, SL. No se creó
ninguna ficha ni se envió nada.
