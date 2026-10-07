<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando (2026-09-01 · ofertas 2026-09-10)

Los envíos que ya existían son de UN documento de UN lote (firmar el Anexo I, firmar la
oferta). Éstos son de otra naturaleza: **un solo correo por varios lotes**, que es como
se trabaja con él — "te mando las facturas de los lotes 001 a 004, y aun pagándolas os
ahorráis 19.564 €". Cuatro correos iguales el mismo día son la forma de que no conteste
a ninguno.

| Qué | Dónde |
|---|---|
| Qué se puede pedir, el texto y el asunto | [peticionesSo.js](implementation/frontend/src/features/lotes/logic/peticionesSo.js) |
| El envío | `POST /api/lotes/peticion-so` (**adminOnly**, de la COLECCIÓN) |
| Botón | Cabecera de `LotesResumen` |
| Popup | `PedirAlSoModal`, que reutiliza `EnviarLoteDocModal` con `onSendOverride` |
| Qué se pediría hoy, sin enviar nada | `node implementation/backend/scripts/test_peticiones_so.mjs [ESTADO] [--simular-ofertas]` |

### Las DOS peticiones que hay (2026-09-10)

| Petición | Qué manda | Cuándo se ofrece |
|---|---|---|
| `firma_ofertas` | Las ofertas de verificación, **para que las firme** | El lote no ha pasado de `PTE. FIRMA OFERTA S.O.`, tiene la oferta subida y **sin** `signed_link` |
| `pago_verificacion` | Las facturas del verificador, para que las pague | El lote **ya está verificado** (tiene informe o dictamen), tiene la factura y sin `pagado_at` |

**REGLA — el ORDEN es de prioridad, y se pintan TODAS las aplicables.** La firma va
primero porque bloquea el ARRANQUE de la verificación; el pago se reclama con el
trabajo ya hecho. Pueden coincidir —firmar las ofertas de unos lotes y reclamar el
pago de otros—, y esconder la segunda detrás de la primera obliga a resolver una
para descubrir que había otra.

**REGLA — un lote al que TODAVÍA NO LE TOCA no se cuenta ni se nombra.** Medido el
10/09/2026: la petición de firma proponía pedirle al S.O. que firmara la oferta de
LOTE-2025-002 y 003, **ya subidos a MITECO** (su oferta no tiene `signed_link`
porque se firmó fuera de la app), y el "se quedan fuera" del pago listaba seis
lotes, entre ellos uno ya cobrado y cuatro que aún esperan la oferta. Un aviso que
sale siempre y nunca hay que atender es el que enseña a ignorar la lista entera —
mismo criterio que `soloSiExiste` en el índice del paquete (regla 40). El tramo se
expresa por su ÚLTIMO estado contra el orden de `LOTE_ESTADOS` (`hastaEstado`), no
enumerando los excluidos, que habría que ampliar con cada estado nuevo; y para el
pago se mira el HECHO (`haVerificado`: informe o dictamen subidos), no el estado,
que se mueve a mano y en los lotes anteriores a la app no describe este tramo.

**REGLA — el popup es UNO para todas las peticiones.** Lo que cambia entre ellas
—qué se adjunta (`docs`), cómo se llama (`sustantivo`), quién se queda fuera y por
qué (`fuera`)— lo aporta la propia petición, no un `if` dentro de `PedirAlSoModal`:
dos popups gemelos divergirían justo en la parte delicada, que es la lista de lo que
va adjunto. La ruta también es una (`PETICIONES_SO` en `routes/lotes.js`): las dos
son el mismo gesto —un correo con N adjuntos, uno por lote— y solo cambian en qué
documento viaja y qué se sella. `/solicitar-pago-verificacion` sigue viva y delega,
porque un navegador sin refrescar sigue posteando ahí.

**La OFERTA se sube ARRASTRÁNDOLA** a la fase 3, como los firmados de la fase 2. La
suelta tiene dos significados y **los decide el estado, no una pregunta**: sin oferta,
lo único que puede llegar es la del verificador; ya enviada a firmar, lo que vuelve es
la FIRMADA por el S.O., que entra por el camino de los firmados (`oferta_verificacion`
ya está en `TIPOS_FIRMABLES`, así que se le leen las firmas antes de registrarla).
Con la oferta subida y aún sin enviar **no se acepta suelta**: ahí lo que toca es
mandarla, y un PDF soltado en ese momento sería un reemplazo silencioso del que se va
a mandar a firmar. Y el popup que sale al subirla dice que, con varios lotes en
marcha, conviene decir que NO y mandarlas todas juntas.

**REGLA — el botón va en el CUADRO DE MANDO, no en la cabecera de la vista.** Actúa
sobre el conjunto que se está viendo (respeta el filtro) y las cifras que manda son
literalmente las de esas tarjetas. Junto a "+ Nuevo lote" parecería que actúa sobre todos
los lotes, y ahí vive *crear*, que es otro orden de cosas.

**REGLA — el botón DICE lo que va a pedir y por cuánto** ("Pedir el pago de la
verificación · 4.883 €"): es lo que decide si se manda hoy o se espera a que entre otro
lote. **Y si no hay nada que pedir, no hay botón**: uno deshabilitado con un tooltip
obliga a pulsarlo para descubrir por qué.

**REGLA — un lote sin su factura se queda FUERA, y se DICE.** No se puede reclamar lo que
no se puede adjuntar, pero callarlo es peor que excluirlo: se manda el correo creyendo
que van los cuatro y el S.O. paga tres. El aviso va en el SUBTÍTULO del modal, que está
siempre a la vista — el del cuerpo (`extraBody`) queda por debajo del mensaje y hay que
desplazarse hasta él.

**REGLA — pedirlo una vez NO cierra la petición.** Que se lo hayamos pedido no significa
que lo haya pagado: el sello no apaga el botón, lo convierte en **"Volver a pedir el pago"**
(apagado, porque ya no urge igual) y el correo, en un **recordatorio** que dice desde cuándo
está pendiente y qué se frena mientras tanto — mandarle otra vez el mismo "te adjunto las
facturas" es de plantilla. Se reinsiste solo cuando NINGUNO está por pedir; con mezcla sale
el correo normal con todos los adjuntos, que es la razón de ser de esta petición.

**REGLA — lo que cierra la petición es COBRARLO, y eso se marca en la factura.** La vida de
una factura del lote es *subida → remitida → reclamada → **pagada***, y el último sello
faltaba: una ya cobrada seguía figurando como pendiente y el botón se la volvía a reclamar al
S.O., que es la peor forma de reclamar. Se marca desde su fila en la fase 4
(`POST /api/lotes/:id/documentos/:key/pago`, **adminOnly** — es dinero), con o sin
justificante; y **subir el justificante la da por pagada**, porque el papel es la prueba
—mismo criterio que el justificante de registro del MITECO—. El justificante va a la carpeta
de documentación del lote con nombre canónico (`4.5 Justificante de pago LOTE-2026-004`), no
se queda en un correo, y al reemplazarlo el anterior se **archiva en OLD**: un documento de
cobro no se tira. Una factura pagada sale de la reclamación en las dos capas —`peticionesSo`
la excluye y el importe del botón pasa a ser lo que queda por cobrar, y la ruta de envío
responde **409** si alguno de los lotes pedidos ya consta pagado, porque entre que la pantalla
se pinta y se pulsa puede haberlo marcado otra persona—. Solo se puede pagar lo que es una
FACTURA (`importe` en su slot): un informe o un dictamen no se pagan.

**REGLA — un envío que ya salió tiene que VERSE.** Antes, al pedirlo, el botón simplemente
desaparecía: no se podía insistir y tampoco quedaba en pantalla ninguna señal de que el
correo había llegado a salir. Ahora se sella **a quién, cuándo y cuántas veces**
(`pago_solicitado_to` / `_at` / `_veces`) y se dice en los tres sitios donde se mira: bajo el
botón del cuadro de mando ("✓ Pedido hace 3 días a jesus@… · ya recordado"), en el subtítulo
del popup y en la fila de la factura de la fase 4. El historial del lote lo registra aparte,
distinguiendo "Pedido" de "Recordado (2ª vez)".

**REGLA — los adjuntos se preparan ANTES de mandar nada**, y si falta la factura de
alguno de los lotes pedidos NO sale el correo (mismo criterio que el envío conjunto al
instalador). `documentos_so[factura_verificador].pago_solicitado_at` sella lo pedido y es
lo que apaga el botón: sin él, el mismo correo se le manda al S.O. cada vez que alguien
entra en la pantalla.

El importe de cada factura sale del PDF (`importe`, leído por el OCR) y, si esa factura
se subió antes de que la app supiera leerlo, de `lotes.coste_verificacion` — es la misma
cifra tecleada a mano. Sin ese respaldo el botón anunciaba 1.564 € donde había 4.883.

**REGLA — el correo saluda a QUIEN LO RECIBE, no al que firma.** El representante legal
es quien firma los documentos y casi nunca quien lee el correo del día a día (aquí firma
Pedro José y el correo lo lee Jesús, el director de operaciones): saludar al firmante
delata que el texto está hecho con una plantilla. Las personas del S.O. se ofrecen como
**botones con su cargo** (`toSuggestions`, de `soContactos.destinatarios`) y **al cambiar
de destinatario el saludo se rehace solo** (`messageFor`) — salvo que el mensaje ya se
haya editado a mano, que entonces no se toca. El resto de contactos siguen disponibles
para ponerlos en copia.

⚠️ **El campo de COPIA no puede ir en mayúsculas.** La regla global de `index.css` pone en
mayúsculas todo `input` que no sea `type="email"`, y el de CC admite varias direcciones
separadas por comas, así que no puede declararse `email`. Lleva la clase de escape
`no-uppercase` (que usa `!important`, o la regla global le gana por especificidad).

Para añadir otra petición (firmar algo, confirmar una fecha) basta con otra entrada en
`PETICIONES`: la decisión de si se puede pedir, el texto del correo y el asunto viven
juntos ahí.
