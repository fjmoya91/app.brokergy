<!-- conocimiento · área: cee · las rutas de los enlaces son relativas a la raíz del repo -->

## El aviso de «CEE inicial presentado» pide SOLO lo que falta, y sale solo cuando presenta la casa (2026-10-25)

Al registrarse el CEE inicial, al cliente y al instalador se les manda el aviso de «ya se pueden emitir
facturas y pagos» con lo que tienen que fotografiar. Era un texto FIJO —«caldera y su placa, desmontaje,
montaje de la aerotermia, placas nuevas»—: a un RES080 de ventanas y tejado le hablaba de aerotermia y
no de sus ventanas, y al cliente que ya nos había mandado la caldera se la volvía a pedir. Además, cuando
el CEE lo presenta la casa (skill `presentar-cee`, Claude en el PC de Fran), el aviso esperaba a que
alguien pulsara «📱 Notificar al Cliente» en el email del registro.

Decisión de Fran (25/10/2026): que cada vez que el agente presente el CEE inicial, el mensaje salga solo
al cliente y al instalador, y que pida solo lo necesario para justificar según sea 060, 080 o 093.

| Qué | Dónde |
|---|---|
| Lo que falta, los textos y el aviso automático | [services/ceeRegistradoAviso.js](implementation/backend/services/ceeRegistradoAviso.js) (antes en `routes/expedientes.js`) |
| El disparo al subir el justificante la casa | `devolver` de [presentacionCeeService.js](implementation/backend/services/presentacionCeeService.js), por `POST /:id/presentacion-cee/devuelto` con clave interna |
| El email del cliente | `sendCeeInicialRegistradoClientEmail(…, fotos)` de [emailService.js](implementation/backend/services/emailService.js) |
| El popup de la app al subir el registro | `POST /:id/notify-registration` (mismo bloque de fotos) |
| Ver los textos de una obra, en seco | `node implementation/backend/scripts/probar_aviso_cee_registrado.js <nº> [--muestra]` |

**REGLA — las fotos que se piden son LAS QUE FALTAN, del mismo checklist que su enlace de subida.**
`pendientesObra` toma `buildDocsView` (reconciliado con Drive, el alcance del EXPEDIENTE: ficha, ACS,
emisor, envolvente) y se queda con lo que justifica la ACTUACIÓN (destino `EXPEDIENTE`; ni lo opcional,
ni lo prescindible, ni lo marcado «no necesario»). Lo parte en **«Antes de empezar la obra» (después ya no
se pueden hacer)** y **«Durante y al terminar la obra»** —ahí va la caldera ya quitada, que es el
desmontaje—, y dice **lo que ya tenemos** para que no lo repita. El enlace va filtrado (`?need=`) a lo que
falta. Así un RES080 pide sus ventanas, tejado y fachada antes y después; un RES093, la hibridación y el
depósito junto a la caldera que se queda.

**REGLA — al cliente en lenguaje de casa y sin facturas; al instalador con las etiquetas técnicas, las
facturas y su enlace `rol=instalador`.** Las facturas las emite el instalador.

**REGLA — si no se puede saber qué falta, la lista de SIEMPRE.** `pendientesObra` devuelve `null` ante un
fallo (y no una lista vacía, que se leería como «no falta nada»): un fallo de Drive no puede dejar un
aviso sin fotos que pedir. Si de verdad no falta nada, se dice («no tienes que mandarnos nada más») y no
va enlace.

**REGLA — el CEE INICIAL que presenta la CASA avisa SOLO, una vez, al cliente y al instalador.** Solo por
la ruta interna (`req.internalCall`: la skill `presentar-cee` con la clave), solo en un expediente CAE,
solo en la fase inicial y solo si ESA subida ha pasado la fase a REGISTRADO (`ya_registrado` falso: un
justificante repetido no vuelve a escribir). El email al equipo sale entonces **sin** el botón «Notificar
al Cliente» (no se genera el token) y el historial del expediente dice a quién ha salido y por qué canal,
o que no ha salido. Lo que sube un técnico o quien presenta por su enlace sigue igual: decide el equipo
desde el email o el popup. Un fallo del aviso no tumba la subida.

**El email «al cliente», con el desvío al contacto, es el del CONTACTO o ninguno** (2026-10-28,
26RES060_253: el «¡Hola Félix!» había ido al email de la titular). Ver «Los avisos de sus
clientes, al PARTNER».

**Apagado en LOCAL** (`CEE_REGISTRO_AVISO_AUTO=false`): local escribe en producción. Encendido por defecto
(en el VPS no hace falta tocar el `.env`).

**Lo probado** (25/10/2026, en local, en seco, sin enviar nada): `probar_aviso_cee_registrado.js
26RES060_245 --muestra` — en 26RES060_245 y 26RES060_249 ya estaban la caldera y su placa: no se piden y
se dice que las tenemos; 26RES080_95 pide antes caldera, placa, termo, ventanas, tejado y fachada, y
después máquinas, armario del suelo radiante, caldera quitada, ventanas, tejado y fachada terminados;
26RES093_17 tiene la placa pero no la caldera en su sala, y pide la hibridación. No se ha disparado un
registro real (subiría a Drive y escribiría al cliente).

⚠️ El checklist pide la máquina nueva (unidad exterior e interior) en TODO expediente, también en un
RES080 que solo cambiara envolvente: es el mismo criterio que su enlace de subida, no de este aviso.

**Tras tocarlo:** `node implementation/backend/scripts/test_aviso_cee_registrado.js`,
`test_presentacion_cee.js` y `probar_aviso_cee_registrado.js <nº>` con un expediente aceptado.
