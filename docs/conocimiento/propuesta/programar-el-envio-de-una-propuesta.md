<!-- conocimiento · área: propuesta · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## PROGRAMAR el envío de una propuesta (2026-09-19)

Botón de **reloj pegado a ENVIAR** en el popup de la propuesta: se elige día y hora
—o uno de los cinco atajos— y sale sola, con el ordenador apagado.

| Qué | Dónde |
|---|---|
| El despachador (alta, cancelación, barrido, envío, aviso) | [propuestaProgramada.js](implementation/backend/services/propuestaProgramada.js) |
| Tabla | `propuestas_programadas` (`scripts/propuestas_programadas.sql`) |
| Rutas | `POST /:id/propuesta/programar` · `GET /:id/propuesta/programadas` · `DELETE /:id/propuesta/programada/:progId` (**enforceAuth**) |
| El panel del reloj | [ProgramarEnvioPanel.jsx](implementation/frontend/src/features/calculator/components/ProgramarEnvioPanel.jsx) |
| Fechas y atajos (puro, probable desde Node) | [logic/programarEnvio.js](implementation/frontend/src/features/calculator/logic/programarEnvio.js) |
| Pruebas | `node scripts/test_propuesta_programada.js` · `node scripts/test_programar_envio.mjs` |

**REGLA — el despachador NO vuelve a decidir nada.** El envío lo orquesta el
NAVEGADOR (a quién, por dónde, con qué texto), así que al programar se guarda el
PLAN YA HECHO —grupos, mensaje por persona, canales— junto al documento tal y como
se revisó, y a su hora solo se replica. Si recompusiera el mensaje saldría una
propuesta distinta de la que se aprobó, y nadie estaría delante para verlo. Por eso
`messageFor` y `planDeEnvio` son fuente única del popup: el envío a mano y el
programado no pueden decir cosas distintas.

**REGLA — se delega en las MISMAS rutas** (`propuesta/version`, `send-proposal`,
`version/:v`, `estado`, `comentarios`), llamadas con `x-internal-key` como hace
`routes/acciones.js`. Así el número de versión, el PDF archivado en Drive, la vista
web del enlace, el movimiento de la carpeta y la línea del historial son los mismos
que enviándola a mano. Esas cuatro rutas pasan a `internalKeyOrAuth`, y
`nombreUsuario(req)` lee `body.usuario` en la llamada interna: queda a nombre de
quien lo programó, no de "Sistema".

**REGLA — el HTML va en columnas TEXT propias, nunca en `datos_calculo`.** Pesa 353
KB de media y hasta 1,35 MB (regla 21), y se BORRA al terminar: de una programada ya
enviada hace falta su rastro, no su documento, que queda archivado como versión.
Ningún listado selecciona `html_pdf`/`html_email` (`SIN_HTML`).

**REGLA — nace APAGADO** (`PROPUESTA_PROGRAMADA_ENABLED`, `true` solo en el VPS).
Dos backends contra la misma base —el del VPS y el de un portátil— barrerían la
misma tabla, y desde LOCAL saldría con su WhatsApp y su SMTP a un cliente real.
Misma palanca que `CEE_ENTREGA_AUTO` y `BOT_WHATSAPP_ENABLED`. **Y la pantalla lo
DICE**: si no, se programa, no pasa nada a su hora y parece roto.

**REGLA — el claim es ATÓMICO** (`update … eq('estado','PENDIENTE')`): quien pierde
la carrera se retira. Es lo que impide que la misma propuesta salga dos veces.

**REGLA — sin PDF no sale NADA** y **siempre se avisa al staff** (WhatsApp +
email), salga bien, a medias o mal: un envío programado ocurre con nadie delante, y
"¿llegó mi propuesta?" no puede tener por respuesta abrir el expediente.

**REGLA — enviar a mano CANCELA lo programado** de esa propuesta. Acaba de salir;
dejarlo vivo se la manda al cliente por segunda vez. Se avisa en el banner ANTES de
pulsar, y la cancelación queda en el historial. Lo que ya está `ENVIANDO` no se
puede cancelar: su PDF se está rasterizando y puede haber salido — decir que se ha
retirado algo que ya viajó es peor que no poder retirarlo.

**REGLA — la hora se compone en LOCAL** (`new Date('2026-09-21T09:00')`), nunca
partiendo un ISO: a las 00:30 en España el ISO ya dice el día anterior. El servidor
solo compara el instante contra `now()`, así que su huso (UTC) no interviene.

**REGLA — el calendario deja elegir HOY.** Su `min` es hoy, no el valor por
defecto: quien quiere mandarla dentro de una hora la manda HOY, y cerrar el día de
hoy deja fuera medio día de envíos legítimos. Que la hora sea posterior a *ahora* lo
decide `esValido`, que es quien sabe la hora — el calendario solo sabe de días. Y
cuando la hora elegida ya ha pasado se **dice por qué** («Esa hora ya ha pasado»),
porque el botón se apaga solo y un botón apagado sin explicación se lee como una
avería. Por lo mismo, **«En 1 hora» va el primero de los atajos**: es el único que
sirve para HOY a cualquier hora —los demás son horas fijas y a media tarde ya han
pasado todas— y se redondea al múltiplo de 5 minutos, que es el paso del campo.

El panel se **portalea a `document.body`** (regla 29.b) —el popup tiene
`overflow-hidden` y lo recortaría justo por el pie— y en móvil es hoja inferior. Un
fallo al programar se enseña DENTRO del panel: el aviso del popup queda detrás.
