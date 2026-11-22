# La ficha de la OBRA es la misma con expediente y sin él, y la propuesta se ve y se pasa desde dentro (2026-11-21)

## La ficha de la OBRA es la misma con expediente y sin él, y la propuesta se ve y se pasa desde dentro (2026-11-21)

Fran, el mismo día de publicarla, entrando como RCA: «cuando pulso sobre una de mis obras, me lleva a la
vista de la oportunidad… hay que darle una vuelta a la vista de las obras, para ver todo, la factura,
etc.». Medido ese día: de las **11 obras de RCA, 6 no tenían expediente** (5 ENVIADA, 1 PTE ENVIAR), y la
fase 1 abría esas en la calculadora de siempre, oscura, dentro de la cáscara crema. Más de la mitad de
su cartera no enseñaba ni los pasos, ni el presupuesto, ni lo que venía después.

| Qué | Dónde |
|---|---|
| La lista «Todo lo de esta obra» (pura, probada) | `caminoDeObra` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) |
| El detalle de la obra, la propuesta y el equipo previsto | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js) (`propuestaDe`, `equipoPrevisto`, `versionQueSeEnsena`) |
| El PDF de la propuesta y «ya se la he pasado» | `GET /obras/:id/propuesta/pdf` · `POST /obras/:id/propuesta/pasada` |
| La ficha | [views/ObraView.jsx](implementation/frontend/src/features/instalador/views/ObraView.jsx) |
| La acción de la propuesta | `PropuestaAccion` en [views/AccionesObra.jsx](implementation/frontend/src/features/instalador/views/AccionesObra.jsx) |
| Banco sin API | `/instalador-demo.html?seccion=obras&obra=26RES060_OP904` (le toca pasarla) · `…OP902` (preparándola) · `…OP909` (espera al cliente) · `&accion=propuesta` |
| Pruebas | `node implementation/backend/scripts/test_app_instalador.js` · `test_navegacion_instalador.mjs` |

**REGLA — TODA obra se abre en su ficha; la calculadora solo queda detrás de «Corrige el cálculo».**
`abrirObra` ya no mira `con_expediente`, y un enlace directo (`?obra=`) tampoco. La oportunidad de siempre
(`onAbrirOportunidad`) se abre SOLO desde la fila «¿Ha cambiado algo? Corrige el cálculo», que sale
mientras el cliente no ha aceptado (`se_puede_corregir`: sin expediente y paso ≤ 2). Volver desde ahí
deja al instalador en la obra, no en la lista.

**REGLA — «Todo lo de esta obra» es UNA lista, de la propuesta al cobro, y la arma el SERVIDOR.** Nueve
filas en el orden en que pasan: la propuesta · tu presupuesto · certificado energético inicial · tu
factura · certificado de la instalación · legalización RITE · fotos de la obra · certificado energético
final · el bono de tu cliente. Cada una con su **tono**: `ok` (hecho) · `tu` (le toca) · `nos` (lo
llevamos nosotros o se espera al cliente) · `luego` (aún no toca: círculo a trazos y texto gris) · `info`
(las fotos: un sitio al que entrar, no cuenta en «N de 8 listos»). La fila con `accion` se abre dentro de
la obra; sin ella no se pulsa. Antes había dos tarjetas («Presupuesto y factura» y «Fotos y papeles») que
repetían la factura y que una obra sin expediente no tenía. Quien trae la obra pero NO la instala no ve
las filas del certificado ni del RITE, y su fila de la factura no se abre.

**REGLA — sin enviar, la propuesta la llevamos NOSOTROS; el instalador no tiene la tarea de enviarla.**
La fase 1 ponía «Te toca a ti: Envía la propuesta al cliente → Enviarla» en LEAD y PTE ENVIAR, y ese
botón abría una calculadora **sin botón de enviar**: en el popup, ENVIAR, «Copiar enlace» y «Archivar»
son de ADMIN, y `send-proposal` / `send-media` son `staffOClaveInterna` (regla 102: lo que sale de la casa
es del equipo interno). Ahora esos estados son paso 1 · «Lo llevamos nosotros», y la acción dice «la
estamos preparando; te la mandamos por WhatsApp» con un botón para escribirnos si corre prisa. Si algún
día el instalador debe poder enviarla él, hay que darle un camino de envío propio: no basta con devolverle
la tarea.

**REGLA — ENVIADA le toca al instalador solo si la propuesta le llegó SOLO a él.** Es lo normal con los
partners (regla 136: se le manda a él para que se la pase al cliente; 4 de las 5 enviadas de RCA estaban
así). Lo decide `entregaPropuesta` sobre `propuesta_versiones` —la MISMA función que pinta «→ solo al
instalador» en el listado interno—: `instalador && !cliente` → paso 2 · «Te toca» con la tarea «Pásale la
propuesta a tu cliente»; si ya la tiene el cliente, «Espera al cliente».

**REGLA — el instalador pasa la propuesta con SU WhatsApp; la app no envía nada.** El botón es un
`wa.me` al teléfono de su cliente con un texto corto (sin emojis, sin presentarse) y el enlace de
aceptación de siempre, `/firma/<uuid de la oportunidad>` —el mismo que ya recibe en nuestro mensaje (regla
100)—, armado en el navegador con el `uuid` de la obra. «Copiar el enlace» hace lo mismo para otro canal.
Como lo que hace con su WhatsApp no lo vemos, **lo DICE él**: «Ya se la he pasado» apunta en la versión
vigente un envío `{ channel: 'instalador', modo: 'CLIENTE', status: 'ok' }`. Con eso la obra deja de
tocarle y el listado interno pasa a «→ cliente + instalador». No cambia el estado ni manda nada.
⚠️ `propuesta_version_merge` **sustituye** la lista de `envios`: se manda la que había MÁS el nuevo.

**REGLA — de la propuesta sale a la app una lista BLANCA; el PDF, por proxy y sin id del navegador.**
`propuesta_versiones` lleva teléfonos y correos de los destinatarios y el enlace de Drive: se lee en el
servidor (subcampo, regla 22) y solo salen `estado` (preparando · enviada · aceptada), `version`, `fecha`,
`aceptada_el`, `tiene_pdf` y `la_tiene`. El PDF es el `drive_id` de la versión que se enseña —la que
ACEPTÓ el cliente si está sellada (`aceptada_at`, regla 25), si no la vigente—: la ruta no acepta ningún
id (probado: `?driveId=` ajeno se ignora). Caso real: 26RES060_OP254 tiene la v3 aceptada y una v4 enviada
después; se enseña la v3.

**El equipo.** Sin expediente (o con él, mientras no haya equipo apuntado y la obra no esté hecha) se
enseña el del CÁLCULO como «Equipo previsto»: el del catálogo (`inputs.aerothermiaModel` → `aerotermia`)
o el tecleado a mano, la potencia y si lleva agua caliente; sin nº de serie. «Se quita» / «Se quitó»
según el paso; en una hibridación, «Caldera» a secas (puede mantenerse, regla 154).

**Lo que NO cambia.** Los guardianes (`enforceAuth` + beta + «la obra es suya», 404 a lo ajeno), el
despacho de la fase 2, la factura y los trámites (siguen siendo de quien INSTALA y con expediente), y lo
que ve cualquier usuario fuera de la beta.

**Comprobado el 21/11/2026**: `test_app_instalador.js` 236/236 (añade la tabla nueva, la lista, la obra
enviada solo al instalador, que no se escapan destinatarios, el PDF y «ya se la he pasado»),
`test_navegacion_instalador.mjs` 79/79, no-regresión 26/26, escaparate 81/81, catálogo 74/74, auditoría de
rutas y `npm run build`. Y en LECTURA contra las 11 obras reales de RCA: todas devuelven su ficha (4 «le
toca pasarla», 1 espera al cliente, 1 preparándola, 5 con expediente) y el PDF de una propuesta sale por
el proxy (2,1 MB). No se ha probado con una sesión real de RCA ni se ha pulsado «Ya se la he pasado» contra
la base (escribe en producción).

### Y con la sesión real de RCA, la obra salía VACÍA (2026-11-22)

Fran, entrando como RCA en el ordenador: el panel de la derecha de «Obras» sin nombre, sin pasos y con
«…» en la factura y en «Todo lo de esta obra». `GET /api/instalador-app/obras/:id` responde `{ obra }` desde
la fase 1, y `apiReal().obra` devolvía la envoltura tal cual: el detalle «llegaba» (por eso decía «Sin
presupuesto») pero sin un solo campo, y la ficha entera igual. Nadie lo vio porque el banco de pruebas
devolvía la obra a pelo. **REGLA — el detalle se desenvuelve en UN sitio, `obraDeRespuesta` de
`AppInstalador.jsx`, y el demo devuelve la MISMA forma que el servidor y pasa por ella.** Además, el enlace
del escaparate en la ficha del partner (CRM) apuntaba al antiguo `instaladores.brokergy.es/escaparate/…`:
ahora es `brokergy.es/encuentra-tu-instalador/{marketplace_slug}/`, la ficha que genera `brokergy-web`.
