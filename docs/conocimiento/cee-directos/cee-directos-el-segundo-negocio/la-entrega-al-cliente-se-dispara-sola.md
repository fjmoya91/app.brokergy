<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La entrega al cliente se dispara SOLA

Condición doble, y las dos mitades llegan en desorden — unas veces se cobra y
días después el certificador sube el registro, otras al revés:

```
cobrado + justificante de REGISTRO subido + PDF firmado subido
```

Por eso **no hay un único disparador**: la comprobación es una sola función
([ceeDirectoEntrega.js](implementation/backend/services/ceeDirectoEntrega.js)) y
la llaman los TRES sitios donde puede completarse la condición — marcar cobrado,
el PUT que pone la fase en REGISTRADO, y la subida del registro desde el enlace
público del certificador. **Quien llegue el segundo es el que envía.**

**REGLA — se le mandan TRES ficheros: el PDF firmado, el justificante de registro y
la ETIQUETA** (+ la guía de la Renta si procede). Hasta el 07/10/2026 eran dos —«la
etiqueta ya va dentro del certificado»—, pero el usuario la quiere en TODAS las
entregas (inicial, final y único): es el papel que se cuelga y el que piden en una
compraventa. Sin etiqueta subida no se entrega (sale en «qué falta»). El `.xml` y el
`.cex` siguen fuera: son ficheros de trabajo del certificador que el cliente no puede
abrir. El reenvío desde la rejilla («Reenviar notificación») es esta MISMA entrega
(`entregar` con `reenviar`): antes tenía su copia, saludaba y escribía al TITULAR en
vez de a la persona de contacto (2026CEE_55) y mandaba la sección entera.

En un encargo DOBLE, la entrega del INICIAL termina con el **enlace para subir la
factura de la instalación** (`DOC_FACTURAS` del enlace del cliente): al subirla nos
llega el aviso de encargar el final (2026-10-14, «El PROCEDIMIENTO»). Si está
cobrado, dice que no hay nada más que pagar. Sin enlace, el texto de antes («avísanos»).

Con el **recibo de la TASA** subido por quien presenta («{nº} – TASA.pdf»), va
también: es opcional (`OPCIONALES_ENTREGA`, `scanSection(…, { conTasa })`), sin él la
entrega sale igual. Y el único requisito que una persona puede saltarse es el
COBRO: «Entregar sin esperar al pago» (`sinCobro`, solo ADMIN y a mano, sellado
`sin_cobrar`); registro, firmado y etiqueta siguen siendo obligatorios.

**REGLA — se le entrega a quien PAGA, que es a quien se emitió la factura**
(2026-10-13, `destinatarioEntrega`). Si la última factura del encargo es del PARTNER
(`facturas_emitidas[n].destino === 'partner'`), los certificados —y la guía de la
Renta— van al partner, por el teléfono y el email por los que se le mandó la factura
(`envios`), y el mensaje es para la empresa: de quién es el certificado y de qué
vivienda, y que le pase la guía al propietario. Sin factura, o facturada al cliente:
el cliente, con su desvío a la persona de contacto. Medido en **2026CEE_54**: la
factura 26ING_81 se emitió a ATERSOL y la entrega automática (inicial + final + guía)
le llegó a Vicente Gavidia, el particular del certificado, que no había pagado nada.
El panel lo dice («el partner: se le facturó la 26ING_81») y el historial también.

**REGLA — la idempotencia se comprueba ANTES que nada.** Los dos disparadores
pueden coincidir en el mismo minuto (marcar cobrado justo cuando entra el
registro) y el cliente recibiría el certificado dos veces. El sello va en
`documentacion.entrega_cliente[fase]` y es **por FASE**: en un encargo doble se
entrega el inicial y meses después el final, así que un sello único daría el
segundo por hecho. Se escribe con la RPC de MERGE.

**REGLA — los adjuntos se vuelven a comprobar al descargarlos.** `estado()` los ve
en Drive, pero entre la comprobación y la descarga alguien puede haberlos movido:
un email de entrega SIN el certificado deja al cliente esperando algo que ya
consta como enviado. Si no bajan los dos, no sale nada.

**En WhatsApp el texto va PRIMERO y aparte**, y cada PDF detrás con una etiqueta
corta ("certificado firmado", "justificante de registro"). Un mensaje largo como
caption de un adjunto hace que mucha gente no llegue a abrir el fichero.

**En LOCAL hay que apagarlo**: `CEE_ENTREGA_AUTO=false` en el `.env`. Si no,
marcar como cobrado un expediente cualquiera mientras se prueba manda un WhatsApp
y un email REALES al cliente REAL. El botón manual de la ficha sigue funcionando
con la variable apagada —ahí hay una persona decidiendo, que es justo lo que le
falta al automático— y el panel **dice en pantalla** que el automático está
apagado: sin ese aviso uno marca cobrado, no pasa nada, y piensa que está roto.

#### «Entregar todo junto» en un DOBLE (2026-10-26)

Fran, 25/10/2026 (2026CEE_61, inicial y final registrados y cobrados a la vez): «un
botón para enviar todo junto con el texto explicativo: 1. CEE inicial 2. etiqueta del
inicial 3. CEE final 4. etiqueta del final 5. guía IRPF. Todo en un único mensaje».
Botón «📦 Entregar todo junto» en la cabecera del panel (solo DOBLE) → popup
[EntregaTodoModal.jsx](implementation/frontend/src/features/cee-directo/components/EntregaTodoModal.jsx)
con lo que falta, a quién, los adjuntos en orden y el texto editable;
`GET|POST /cee-directos/:id/entrega-todo` → `borradorTodo` / `entregarTodo` en
[ceeDirectoEntrega.js](implementation/backend/services/ceeDirectoEntrega.js).

**REGLA — «todo» son CINCO papeles y en ESE orden**: CEE inicial firmado, su etiqueta,
CEE final firmado, su etiqueta y la guía de la Renta (`ORDEN_TODO`). **Sin** los
justificantes de registro ni la tasa. El texto los lista numerados; por WhatsApp va el
texto y detrás cada PDF con su número («3. CEE final firmado»); por email, UN correo
con los cinco. Requisitos: las dos fases REGISTRADAS con su PDF firmado y su etiqueta,
y cobrado (o «sin esperar al pago», solo ADMIN). Lo demás, como la entrega por fase:
a quien PAGA, idempotencia primero (con las DOS fases ya entregadas no sale sin
reenviar; con una sola sí: es el juego completo), adjuntos recomprobados al bajar (si
uno no baja no sale nada), y la guía no frena (si no se puede preparar van cuatro y se
manda el texto generado, aunque se hubiera editado, para no anunciar lo que no va).
**Sella las DOS fases** (`entrega_cliente.inicial|final`, con `todo: true`): el
automático ya no repite ninguna. Es siempre a mano. Prueba:
`node implementation/backend/scripts/test_entrega_todo_cee_directo.js`.

El panel de la ficha (`EntregaCliente.jsx`) enseña **qué falta en lenguaje de
tarea** ("Subir el PDF del CEE firmado"), no un booleano: el automático no puede
explicarse solo. `GET /:id/entrega` usa la MISMA función que el envío, así que la
pantalla no puede decir que está listo mientras el backend dice que no.
