# La BIENVENIDA: a quien escribe por primera vez, el formulario y el vídeo, solos (2026-11-09)

Lo pidió Fran el 09/11/2026: «Lo que quiero es que al cliente, de manera automática, se le envíe ya un mensaje para que a
través del formulario ya rellene sus datos y se queden registrados». Hasta ahora, a quien preguntaba por WhatsApp le
contestaba él a mano y después le pedía al asistente «da de alta esta oportunidad». Ahora la primera respuesta sale sola
con el enlace del formulario «Calcula tu ayuda». La oportunidad nace del formulario, por el mismo camino que cualquier
lead web, y el aviso a administración lo dice («enlace de wa», `landing_funnel.ref`) cuando esté publicado el formulario rediseñado.

Fuente única:
- [services/bienvenidaWhatsapp.js](../../../implementation/backend/services/bienvenidaWhatsapp.js): la sesión, la BD y la vuelta;
- [utils/bienvenidaWhatsapp.js](../../../implementation/backend/utils/bienvenidaWhatsapp.js): el texto, a quién no y el horario;
- tabla en [scripts/wa_bienvenidas_schema.sql](../../../implementation/backend/scripts/wa_bienvenidas_schema.sql);
- prueba: `node implementation/backend/scripts/test_bienvenida_whatsapp.js` (32 casos, sin WhatsApp ni BD).

## Por qué así y no con el «mensaje de bienvenida» de WhatsApp Business

WhatsApp Business ya trae un mensaje de bienvenida automático, pero salta con cualquiera que lleve **14 días sin
escribir**. Eso incluye a los clientes con un expediente en marcha y a los instaladores. La app sí sabe quién es nuevo de
verdad, porque tiene la cartera.

## Lo que se manda

Dos mensajes: el texto y, detrás, el vídeo de las ayudas como VÍDEO, no como documento. Es el de
`brokergy-marketing/2026-10_clientes-ayudas-aerotermia`, en la versión de la web (720×1280, 4,9 MB, 2:33). No habla del
factor multiplicador, y Fran dijo que no hace falta: «es lo que necesitamos para tramitar solo».

> Hola, gracias por escribirnos.
>
> Puedes calcular ahora mismo la ayuda que te corresponde, desde el móvil y en un par de minutos:
> https://app.brokergy.es/calcula-tu-ayuda?ref=wa
>
> Lo ideal es que lo hagas estando en casa: con el botón «Usar mi ubicación» localizamos tu vivienda en el Catastro y
> sacamos su referencia catastral sin que tengas que buscarla. Es muy importante que selecciones la vivienda correcta
> (en un piso, tu planta y tu puerta), porque la ayuda se calcula con sus datos.
>
> Después te hace unas preguntas sobre la caldera y la obra, y al terminar te mandamos la propuesta con tus dos ayudas:
> el bono CAE y la deducción en la Renta.
>
> Si lo prefieres, mándanos por aquí la dirección de la vivienda (o su referencia catastral), una foto de la caldera y
> otra de su placa de características (la pegatina con los datos), y el presupuesto si ya lo tienes, y te lo calculamos
> nosotros.

Pie del vídeo: «Y en este vídeo te contamos en dos minutos las ayudas que hay.»

- Sin emojis y sin presentarse: el cliente ha escrito primero y sabe a quién.
- «Estando en casa» y «la vivienda correcta» los pidió Fran el 09/11/2026: el formulario busca la casa con la
  ubicación del móvil (su botón dice «Usar mi ubicación (siempre y cuando estés en casa)»), y una vivienda equivocada da
  una ayuda equivocada.
- El enlace lleva `ref=wa` y nunca un dato personal.
- **El vídeo sale solo cuando el texto ha salido de la cola con su ACK.** `sendText` encola y `sendMedia` va directo:
  sin esperar, el vídeo llegaría antes que el mensaje que lo presenta.
- Si el vídeo no sale, se manda su ENLACE detrás del texto (el MP4 se ve en el navegador del móvil).

## A quién NO

**REGLA — solo a quien es NUEVO de verdad, y un «no lo he podido comprobar» es un NO.** Se le escribe solo si no hay
ninguna pista de que ya le conocemos:

- **Ya está en la app.** Se mira en:
  - clientes (titular, persona de contacto, representante y copropietarios);
  - partners (todos sus teléfonos y los contactos de aviso);
  - usuarios, certificadores de la app y solicitudes de instalador;
  - los descartados de «Pendientes de WhatsApp»;
  - quien ya recibió algo de la app (`whatsapp_queue`).

  Se casa por los 9 últimos dígitos. Medido el 09/11/2026: 631 teléfonos en 0,4 s.
- **Es de la casa:** el móvil personal de Fran (su chat con el asistente) y el de administración.
- **Está guardado en la agenda del móvil:** si Fran lo guardó, lo conoce.
- **Es una cuenta de empresa (WhatsApp Business).** Los instaladores y los proveedores suelen tenerla; un particular,
  casi nunca.
- **El chat no es nuevo:** ya le hemos escrito, tiene etiquetas, o su primer mensaje cargado es de hace más de 6 h.
- **No es un móvil español:** un fijo, o un número de fuera (spam).
- **Tipos que no son de alguien que pregunta:** una tarjeta de contacto (un instalador pasando un cliente), una
  ubicación, un aviso del sistema.

Si la BD no responde o WhatsApp no da el chat, no se escribe y no se recuerda la decisión: el siguiente mensaje lo
reintenta (como la regla 38: un fallo de lectura no es «es nuevo»). **Una bienvenida por teléfono, para siempre**
(índice único en `wa_bienvenidas`).

## Cómo funciona

1. **La ráfaga.** El cliente manda «Hola», «quería información de las ayudas» y una foto en el mismo minuto: se decide
   UNA vez, a los 90 s del último. Así se lee una sola vez el chat, y si Fran contesta en ese rato, ya no sale.
2. **Lo de la sesión se lee con UNA evaluación** de las colecciones de WhatsApp Web (`Chat` y `Contact` de ese chat),
   en la fila de lecturas (`enSerie`) y con plazo. Nada de `getChatById`, `getChats`, `msg.getChat` ni `sendSeen` (regla
   39). Un `@lid` saca su número del propio WhatsApp Web y, si no lo tiene, de `getContactLidAndPhone`. Un «no» se
   recuerda 24 h, para no releer con cada mensaje el chat de alguien de la agenda.
3. **Se apunta** en `wa_bienvenidas` como PENDIENTE, con su hora: ahora si es la franja de la casa (regla 205: de 7 a 21 h de Madrid, todos los días, porque contesta a quien ha escrito); si
   no, la apertura siguiente. Quien escribe a las 23:30 la recibe a las 7:00.
4. **La vuelta** (cada minuto) la manda. **Justo antes vuelve a leer el chat**: si le ha contestado una persona de la casa
   (`onMensajePropio`, lo que no ha apuntado la app) o ya hay un mensaje nuestro, queda DESCARTADA y no sale. La fila se
   TOMA con un UPDATE condicionado antes de mandar, así que dos servidores encendidos no la mandan dos veces.

**Sin reintentos.** Un envío que falla queda en ERROR: el mensaje puede estar ya en el chat, y reenviarlo lo duplicaría
(regla 39).

## Los frenos

La cuenta es la de TODOS los envíos automáticos de la app.

- **Nace APAGADA** (`WA_BIENVENIDA_ENABLED`). Encendida, va en **MODO COPIA**: apunta lo que habría mandado (COPIA) y no
  sale nada. Para escribir de verdad, `WA_BIENVENIDA_MODO=real`.
- **`WA_BIENVENIDA_PRUEBA=tel,tel`:** con esto puesto SOLO se atiende a esos teléfonos, y se les escribe aunque ya nos
  conozcan, para poder probar. Un teléfono de prueba se puede repetir pasados 10 min.
- **Topes en el CÓDIGO:** 30 al día, 10 a la hora y 2 por vuelta.
- Rutas, **adminOInterno**:
  - `GET /api/whatsapp/bienvenidas`: estado y lo apuntado;
  - `POST /api/whatsapp/bienvenidas/vuelta`: una vuelta a mano, en seco por defecto.

## Cómo se pone en marcha (orden)

1. Aplicar `wa_bienvenidas_schema.sql` en Supabase.
2. Desplegar con `WA_BIENVENIDA_ENABLED=true` en el VPS, todavía en modo copia. Unos días: se mira a quién le habría
   escrito (`GET /api/whatsapp/bienvenidas`) y si alguno no debía.
3. `WA_BIENVENIDA_MODO=real` + `WA_BIENVENIDA_PRUEBA=<móvil personal de Fran>`. Fran escribe desde su móvil y le llegan
   el texto y el vídeo. Así se comprueba el vídeo de verdad, que en local no se puede.
4. Quitar `WA_BIENVENIDA_PRUEBA`.

## Lo que no se ha podido probar en local

Local no tiene la sesión (es la misma cuenta que el VPS), así que la lectura del chat en WhatsApp Web (`LEER_CHAT`) y
el envío del vídeo están probados con WhatsApp simulado.

- Los campos que lee `LEER_CHAT`, `isAddressBookContact` y `msgs` del chat, son los mismos que ya usan la agenda y la
  lectura de tarjetas de contacto.
- `isBusiness` es nuevo.
- Los pasos 2 y 3 son la prueba de verdad.
