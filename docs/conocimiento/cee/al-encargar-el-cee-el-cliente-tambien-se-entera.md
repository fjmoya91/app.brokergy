<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Al encargar el CEE, el CLIENTE también se entera (2026-09-09)

Encargar el certificado es el primer movimiento del expediente y era **invisible
para el cliente**: firmaba la propuesta y la siguiente noticia que tenía era la
llamada de un técnico que nadie le había anunciado. Ahora el MISMO botón
—«Asignar y notificar» del popup de Notificar Certificador— manda también el aviso
al cliente.

| Qué | Dónde |
|---|---|
| El TEXTO | `encargoCeeClienteMsg` en [recordatorios.js](implementation/backend/services/recordatorios.js) |
| Borrador + destinatario (para el popup) | `GET /api/expedientes/:id/aviso-cliente-cee?phase=` (**staffOnly**) |
| Envío + sello + historial | `POST /:id/notify-certificador`, campos `avisarCliente` · `clienteChannels` · `clienteMessage` |
| Superficie | Bloque «Avisar también al cliente» del popup de `CeeModule` |

**REGLA — el texto lo redacta el BACKEND y el popup solo lo enseña.** Es la misma
regla que el resto de recordatorios (fuente única en `recordatorios.js`): si lo
compusiera el navegador, un envío desde otra superficie diría otra cosa. El popup
lo pide al abrirse (mismo patrón que `approve-cee-links`), lo trae **plegado**
—casi nunca se edita y enseñarlo entero solo aleja el botón— y se despliega con
«Ver el mensaje».

**REGLA — no sale con «Solo asignar».** El texto le dice al cliente que ya le hemos
mandado las instrucciones al técnico; sin encargo enviado eso es falso. Se
comprueba en las dos capas: el frontend solo lo marca al notificar y la ruta exige
que algún canal del certificador haya salido (`channels.length > 0`).

**REGLA — se avisa UNA vez por fase.** Reasignar técnico es el caso normal (el
primero no puede, se pasa a otro) y el cliente no puede enterarse dos veces de que
su trámite acaba de empezar. El sello vive en
`documentacion.aviso_cliente_cee[fase]` y el popup lo dice con la fecha: **no lo
bloquea** —puede hacer falta reenviarlo— pero deja de venir marcado.

**REGLA — «no empieces la obra todavía» solo si la obra NO está hecha.** Las
facturas anteriores al registro del CEE inicial son una incidencia
(`facturaIncidencias` · `FECHA`), así que decírselo AHORA le ahorra el problema;
decírselo a quien ya terminó es echarle en cara algo que no puede deshacer. El
criterio de obra hecha es el mismo del radar (factura, CIFO, RITE o fin de obra
comunicado).

**REGLA — no se promete fecha, se promete el AVISO.** Depende de la agenda del
técnico y de Industria. Lo que sí se cumple es «en cuanto quede registrado te
avisamos».

Va al contacto de notificaciones del cliente (`resolveSolicitudContacto`, la misma
cascada que «solicitar lo que falta»), por **WhatsApp** por defecto —que es donde
lee— y con el email a un clic. Un fallo del aviso **nunca tumba el encargo**: el
certificador ya lo tiene. Y **no se ofrece en CEE directos** (`msgCtx.cae === false`):
allí no hay obra ni trámite de ayuda, y ese texto hablaría de algo que no existe.
