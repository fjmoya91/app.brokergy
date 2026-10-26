<!-- conocimiento · área: clientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Confirmación de cobro — el formulario del final (2026-09-07)

Cuando el CAE está concedido y vamos a ingresarle el bono, al cliente le llega UN
enlace (`/cobro/:expedienteId?token=`) que hace dos trabajos y en este orden:
**cualificarlo** para la venta cruzada (tarifa de luz · fotovoltaica · deducción del
IRPF) y **confirmar sus datos de cobro**, que es el trabajo de verdad — el que evita
la transferencia a una cuenta equivocada.

Sustituye al formulario externo de Tally ("⚡ Confirmación de Datos de Pago y
Optimización de tu Aerotermia"). Traerlo dentro no es dejar de pagar una
herramienta: aquí los datos YA están, así que el formulario llega **relleno** y lo
único que se le pide es confirmar; y la respuesta cae en el expediente en vez de en
una hoja aparte.

| Qué | Dónde |
|---|---|
| QUÉ se pregunta y con qué palabras | [logic/cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) |
| A QUIÉN, con qué datos y los textos del mensaje | [cobroService.js](implementation/backend/services/cobroService.js) |
| Lo que ve el cliente | [ConfirmarCobroView.jsx](implementation/frontend/src/features/cobro/views/ConfirmarCobroView.jsx) |
| Rutas públicas | `GET|POST /api/public/cobro/:expedienteId?token=` |
| Rutas internas (staffOnly) | `GET /:id/cobro` · `POST /:id/cobro/enviar` · `GET /cobro/leads` |
| Cuándo se propone | bloque **COBRO** de [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js) |
| Prueba sin BD y sin enviar nada | `node implementation/backend/scripts/test_cobro_form.js` |

**REGLA — el formulario NUNCA retiene el cobro.** Es una confirmación de datos, no
un peaje: los tres bloques comerciales son OPCIONALES y llevan su "Prefiero no
contestar". Lo único obligatorio son los datos de cobro y —cuando aplica— la forma
de pago.

**REGLA — lo obligatorio va AL FINAL y lo opcional delante.** Al revés, el cliente
cierra la pestaña en cuanto termina lo suyo y no contesta nada más; así, las tres
preguntas están en el camino hacia lo que ha venido a hacer. Es el mismo orden del
formulario de Tally, y no es casualidad.

**REGLA — la forma de pago SOLO se le pregunta a quien asume el coste de gestión.**
Con `inputs.discountCertificates` activo, Brokergy ya lo absorbió y su Convenio de
Cesión **no menciona ninguna deducción** (ver la regla del convenio): preguntarle
cómo prefiere pagarlo le cobraría algo que su contrato no dice. El importe sale de
`result.caeMaintenanceCost` —lo que de verdad calculó la simulación que aceptó— y
solo cae a **250 € sin IVA** si el expediente no trae nada; ése es el MISMO valor de
reserva que `certificatesCost` en `calculation.js`, o el formulario le anunciaría una
cifra distinta de la que se le descontó.

**REGLA — las dos opciones NO cuestan lo mismo, y se dice ANTES de elegir.** El
descuento se aplica sobre la **BASE, sin IVA** (250 €); por factura hay que
repercutirlo (302,50 €) y además el ingreso no sale hasta que esté abonada. Así que
la factura sale marcada como lo que es: título apagado, chapa ámbar con lo que cuesta
de más ("Más lento y 52,50 € más caro") y el motivo —las dos consecuencias, primero
el retraso y después el dinero— en su propio texto. **No se bloquea**: es una
elección legítima del cliente, pero dos opciones pintadas igual se leen como
equivalentes y ésta le cuesta dinero. La marca es `desaconsejada` + `aviso` en la
opción, y la pinta el componente `Opcion`, nunca cada pantalla por su cuenta.

**REGLA — cambiar de IBAN exige justificante NUEVO.** El que consta va impreso en el
Convenio de Cesión ya firmado; un justificante anterior acredita **esa** cuenta, que
es justo la que el cliente está cambiando. Se comprueba en las dos capas (la vista
lo pide, el POST responde 400 sin él). Si repite el IBAN que ya teníamos no se le
pide nada: ése se acreditó al aceptar la propuesta. La comparación es **solo con letras
y números, en mayúsculas** — el cliente lo escribe como se lo enseña su banco, y un
cambio de formato no es un cambio de cuenta. **Y el MISMO criterio en las dos capas**
(`normalizarIban` en `cobroForm.js`, `normIban` en el POST): el 16/10/2026 un cliente
pulsó «Sí, es correcta» y le saltó «Has cambiado el número de cuenta» — su IBAN estaba
guardado con guiones (`ES49-xxxx-…`), el navegador los quitaba y el servidor no, así
que comparaba dos cadenas distintas de la misma cuenta. Afectaba a 21 de 291 fichas
(20 con guiones, una con una coma al final).

**REGLA — el IBAN nuevo no se pisa en silencio.** El aviso al staff (WhatsApp +
email) empieza por el cambio, con el anterior a la vista y si trae justificante o no:
es lo único de ese mensaje que hay que revisar antes de ordenar la transferencia.

**REGLA — no se promete fecha de ingreso.** Ni en el mensaje, ni en la pantalla de
"gracias". Depende del pago del Sujeto Obligado; una fecha aquí es una reclamación
garantizada dentro de dos semanas.

**REGLA — el bloque de placas llega PRECONTESTADO** con lo que el cliente dijo en la
captación (`instalacion.fotovoltaica`), marcado como heredado y anunciado en
pantalla. Volver a preguntárselo de cero es lo que hace que un formulario parezca
que no se lee. Y lo que conteste aquí **se vuelca de vuelta** al expediente: es la
misma pregunta, y de ahí la leen el CEE y el CE3X.

**REGLA — los datos van a `clientes`, no a una tabla de datos bancarios.** Es la
MISMA tabla y los mismos campos que rellena la firma de la propuesta
(`numero_cuenta`), y el justificante va al MISMO slot
(`documentacion.justificante_titularidad_link`), que es donde ya lo busca el barrido
de "qué falta". En `documentacion.cobro` solo quedan metadatos (regla 21) y se
escriben SIEMPRE con la RPC de MERGE: el token, el envío, las respuestas y el
justificante se sellan en momentos distintos.

**Se manda desde el LOTE, cuando el S.O. ya nos ha pagado** (2026-10-05). Hasta esa
fecha el formulario NO se había enviado nunca: no había ningún botón —ni en el lote
ni en el expediente— y solo lo proponía el parte diario, que está apagado (medido:
ningún expediente tenía token de cobro). Ahora es la **fase 7 del lote, "Pago a los
clientes"** ([CobroClientesPanel.jsx](implementation/frontend/src/features/lotes/components/CobroClientesPanel.jsx)
sobre `GET /api/lotes/:id/cobros`, staffOnly): una fila por cliente con la cuenta
que consta, en qué punto está (sin pedir · pedido N veces · ✓ confirmada · ⚠ cuenta
cambiada), la forma de pago elegida con lo que hay que HACER (descontar 250 € o
**emitir la factura y cobrarla ANTES del ingreso**), los leads y, para el ADMIN, el
bono y el importe a transferir. «Pedir la confirmación» abre un popup con el
borrador de cada cliente (editable) y lo manda de uno en uno por
`POST /api/expedientes/:id/cobro/enviar`, que sella el envío y el historial.

| Qué | Dónde |
|---|---|
| Contexto (quién asume la gestión), máscara del IBAN, TEXTO del mensaje, qué hacer con la forma de pago | [cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) — `contextoCobro`, `mascaraIban`, `componerMensajeCobro`, `tareaFormaPago` |
| La fila de cada expediente del lote | `filaCobro` en [cobroService.js](implementation/backend/services/cobroService.js) |
| Ver el formulario como el cliente, sin tocar nada | **`/cobro/demo`** (datos de mentira, no llama a la API) |
| Traer las respuestas antiguas de Tally | `node implementation/backend/scripts/importar_cobro_tally.js "<csv>" [--execute]` |
| Pruebas | `node implementation/backend/scripts/test_cobro_form.js` |

**REGLA — el momento es "PTE. PAGO BROKERGY A CLIENTE"**, no "CAE EMITIDO – PTE PAGO
BROKERGY" (ahí el S.O. todavía no ha pagado). Lo comparten la fase 7, la ruta del
lote (`LOTE_PAGO_CLIENTE`, que solo crea borradores y tokens en ese estado) y el
radar (`LOTE_EN_PAGO`).

**REGLA — el mensaje dice la NOTICIA, el MOTIVO (la seguridad) y la cuenta que
tenemos ENMASCARADA** ("ES59 3190 •••• •••• •••• 3118": país, control y entidad —el
banco es lo que se reconoce— y los 4 últimos). En un WhatsApp o un email el IBAN
NUNCA va entero: se reenvían y se quedan en móviles ajenos. Entero solo detrás del
token. Al PARTNER que lleva el contacto del cliente no se le enseña ni la máscara.

**REGLA — el ENLACE va en un SEGUNDO WhatsApp, y el mensaje lo firma Fran**
(2026-10-15). Metido en mitad del texto, el enlace con su token se partía en tres
líneas y no se reconocía como lo que hay que pulsar. Ahora `componerMensajeCobro`
lo deja al FINAL, tras la firma («Un saludo, *Fran Moya* · BROKERGY · Ingeniería
Energética», `FIRMA_COBRO`), con una línea breve encima («👉 Confirma aquí tu número
de cuenta:»), y el texto lo anuncia «a continuación 👇»;
`POST /api/expedientes/:id/cobro/enviar` lo parte con `separarEnlaceCobro` y manda
el texto y, aparte, la línea 👉 con el enlace (que sale con su vista previa). El enlace se manda
SIEMPRE, aunque se haya borrado al retocar el texto en el popup. El email va en uno
solo, con el enlace al final. El envío desde el parte (`/acciones` →
`solicitar-faltantes`) sigue saliendo en UN mensaje, con el enlace al final.

**REGLA — el sello del envío se escribe lo ÚLTIMO** (2026-10-15). La ruta sellaba
`cobro.enviado_at` con el merge y después reescribía `documentacion` entera para el
historial con la copia leída al principio: el sello desaparecía. Los cinco de LOTE
con 25RES060_57, _61, _63, _66 y _73 salieron el 15/10 a las 11:36 (el historial lo
apunta) pero `cobro` se quedó solo con el `token`, y la fase 7 seguía ofreciendo
«Pedir». Ahora el historial va primero, con lectura fresca, y el sello después.

**REGLA — el mensaje y la portada dicen LO QUE SE LE INGRESA, y solo con el ahorro
VERIFICADO** (`bonoVerificado`: `computeExpedienteFinancials` —la MISMA función del
panel económico y del lote— importada en el servidor). «Tu ayuda: 1.840,00 €» y,
si asume la gestión, «descontando nuestros honorarios te ingresaremos 1.590,00 €»;
la pregunta de la forma de pago dice en cada opción lo que le LLEGA. Sin verificado
no se dice ninguna cifra (con el estimado se anunciaría una que no cuadra con la
transferencia), y el panel del lote avisa (`con_importe`).

**REGLA — el ESFUERZO se cuenta con lo que DE VERDAD pasó** (`requerimientosDe` +
`textoEsfuerzo`): los informes de inexactitudes y de la G.A. del lote (o sus pasos
por un estado de REQUERIMIENTO) y el requerimiento que obligó a re-firmar los
anexos. Con alguno: «hemos tenido que contestar N requerimientos… pero por fin lo
tenemos aquí»; sin ninguno se cuenta el PROCESO (verificación, Ministerio, emisión)
y no se inventan requerimientos. En el mensaje en bloque del parte, sin cifra (van
expedientes de lotes distintos).

**REGLA — un expediente MIGRADO sin CEE también tiene bono verificado** (2026-10-14).
`computeExpedienteFinancials` solo calculaba el verificado dentro de la rama con CEE
leído; los migrados de AppSheet no lo tienen, así que con su ahorro verificado
metido el formulario, la fila del lote y la remesa los dejaban **sin cifra** (medido
en el lote de Iberdrola de 2023, «PAQUETE 2 - 2023 (PRE APP)»: 8 de 9). Ahora la
rama sin CEE lo calcula con el precio PACTADO (`economico_override.cae_client_rate`)
o, si falta, el implícito de la propuesta guardada (bono ÷ MWh) — nunca el 95 €/MWh
por defecto, que no fue el de ningún migrado. El panel económico del expediente
enseña ese mismo verificado.

⚠️ Los euros de estos textos van con `eurEs` (punto de miles SIEMPRE y espacio fijo
antes del €): `toLocaleString('es-ES')` saca «1840,00 €» en cuatro cifras.

**REGLA — en el formulario la cuenta se CONFIRMA con dos botones** («Sí, es
correcta» / «No, es otra») y va lo PRIMERO del último paso: un campo relleno que se
deja como está no se distingue de un descuido. Con «otra», campo y justificante.
**Sin cuenta en la ficha y sin justificante en el expediente, también se exige
justificante** (convenio firmado sin IBAN) — en la vista y en el POST.

**REGLA — quién asume la gestión lo dice el EXPEDIENTE antes que la simulación**:
`instalacion.economico_override.discount_certificates` / `certificates_cost` y
después los inputs (`discount_certificates` y `discountCertificates`, las dos
claves). Antes solo se leía `inputs.discountCertificates`.

El parte diario (bloque `COBRO`) y la página de acciones siguen funcionando, con el
mismo texto (`cobroLoteWa`, ya con la cuenta enmascarada por expediente).

### Después de confirmar: remesa SEPA → justificante → aviso → reseña (2026-10-13)

Hasta aquí la fase 7 pedía la cuenta y enseñaba quién había contestado; el pago se
hacía a mano en el banco y al cliente no se le volvía a decir nada. Ahora sigue en
la misma fase, todo **adminOnly** (cuentas e importes):

1. **Saber que han contestado TODOS.** El aviso al staff de cada confirmación
   (WhatsApp + email, `routes/public.js`) cuenta los del lote: «LOTE-X: 3 de 5 han
   confirmado» y, con el último, «✅ ya han confirmado TODOS… genera la remesa SEPA»
   (el asunto del email lo dice también). La fase 7 lo pinta en verde.
2. **Remesa SEPA para BBVA.** «🏦 Remesa SEPA (BBVA)» abre la lista: quién entra,
   por cuánto y quién se queda fuera **con su motivo**; descarga un `pain.001.001.03`
   (una transferencia por cuenta) que se sube en BBVA net cash
   → Ficheros → Transferencias SEPA, y lo guarda en la documentación del lote.
3. **Justificante.** «📎 Subir justificante de la transferencia»: el PDF del banco,
   a la documentación del lote, marcado en los expedientes elegidos.
4. **Aviso + reseña.** Al subirlo se abre el popup: a cada cliente, que ya está
   transferido (importe, cuenta ENMASCARADA y el concepto con el que lo verá) y,
   PROGRAMADA, la petición de reseña en Google. Las dos se ven y se retocan antes de
   pulsar; la reseña sale sola a su hora (por defecto, 2 días hábiles después a las
   11:00) y se puede cancelar desde la fila (✕).

| Qué | Dónde |
|---|---|
| Qué entra en la remesa y por cuánto, el aviso, la reseña y su despachador | [pagoClientesService.js](implementation/backend/services/pagoClientesService.js) |
| El fichero SEPA (puro) | [utils/sepaTransferencia.js](implementation/backend/utils/sepaTransferencia.js) |
| Los TEXTOS (aviso de transferencia, reseña, concepto) | `componerMensajeTransferencia`, `componerMensajeResena`, `conceptoTransferencia` en [cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) |
| Los tres popups | [PagoClientesModals.jsx](implementation/frontend/src/features/lotes/components/PagoClientesModals.jsx) |
| Rutas (adminOnly) | `GET|POST /api/lotes/:id/remesa-sepa` · `POST /:id/transferencia` · `GET /:id/transferencia/:expId/borradores` · `POST …/avisar` · `POST …/resena/cancelar` |
| Sellos | `documentacion.cobro.remesa` · `.transferencia` · `.resena` (objetos ENTEROS: la RPC funde solo el primer nivel de `cobro`) |
| Pruebas | `node implementation/backend/scripts/test_remesa_sepa.js` |

**REGLA — el importe es el VERIFICADO menos los honorarios si eligió descontarlos**,
con `bloquePago` (los 250 € por defecto si el expediente no trae coste): la MISMA
cuenta que pinta la fila de la fase 7. Medido en seco sobre LOTE-2026-004 el
13/10/2026: con `costeGestion` = 0 en la simulación, una primera versión no
descontaba nada y la remesa salía 1.000 € más alta.

**REGLA — fuera de la remesa, y se DICE por qué**: sin confirmar la cuenta, sin
ahorro verificado, sin elegir forma de pago, con un IBAN que no pasa el dígito de
control, o con FACTURA pedida hasta que se marque «ya cobrada». Un IBAN malo en el
fichero hace que el banco rechace la remesa ENTERA, así que ni se genera.

**REGLA — el fichero REPRODUCE el que BBVA ya aceptó** (remesa del 02/10/2026, 5
pagos, `remesa_BBVA_2026-10-02_5pagos.xml`): ordenante «SOLUCIONES SOSTENIBLES PARA
EFICIENCIA ENERGETICA SL» —sin «BROKERGY»— con Id `B19350222000` (NIF + sufijo
`000`) en `InitgPty` y en `Dbtr`, BIC `BBVAESMMXXX`, `BtchBookg` = false,
`MsgId` «BRKGY» + fecha y hora de Madrid y ejecución el mismo día. Comparadas
etiqueta a etiqueta el 13/10/2026: la misma estructura, sin una de más ni de menos.
No se cambia sin probarlo antes en el banco.

**REGLA — los textos del fichero van en el juego SEPA**: sin tildes ni eñes, y el
guion bajo del nº de expediente pasa a guion. Por eso el concepto es
«AYUDA CAE 26RES093-3 BROKERGY» y el mensaje al cliente dice ESE texto, el que verá
en su banco. Con varios cedentes con cuenta propia el ingreso se parte por cuotas
en céntimos y el resto va a la última cuenta.

**REGLA — la remesa se hace con los que SE ELIJAN, y el que ya tiene justificante no
vuelve a salir** (23/10/2026, decisión del usuario al empezar a pagar): el popup de la
remesa es una lista para marcar («Marcar todos / Ninguno», «N de M»), así se puede
pagar a unos hoy y a otros otro día. Con el justificante subido (`cobro.transferencia`)
el cliente está PAGADO: no sale en la lista de la remesa ni en la del justificante
(solo se cuenta, «No salen los N que ya están pagados»), el servidor lo deja fuera con
el motivo «Ya transferido el …» aunque alguien lo pida por la API, y el botón del panel
dice cuántos quedan por pagar y desaparece cuando no queda nadie. Lo que va en una
remesa SIN justificante sí sigue saliendo: el banco pudo no ejecutarla, y generarla otra
vez la sustituye.

**REGLA — el justificante del banco NO se le manda al cliente**: el de una remesa
lleva los nombres, cuentas e importes de todos los del lote.

**REGLA — la reseña: lo que se vio es lo que sale.** El texto, el teléfono y el
canal se fijan al programarla (como `propuestaProgramada`); el despachador no
recompone nada. Solo sale entre las 9:00 y las 21:00 de Madrid, y nace APAGADO
(`RESENA_PROGRAMADA_ENABLED`): el backend del portátil escribiría a clientes reales.
Sin `GOOGLE_RESENA_URL` se usa el enlace de la ficha de Google que lleva la carta de
pago (desde el 22/10/2026; antes no se programaba ninguna), y al PARTNER no se le pide.
El esfuerzo se cuenta con los requerimientos que CONSTAN (`requerimientosDe`), como
la enhorabuena: sin ninguno se cuenta el proceso, no se inventan.

### El punto del pago, en la TARJETA del lote (2026-10-24)

El estado del lote no se mueve al pagar, así que el listado de Lotes decía «PTE. PAGO
BROKERGY A CLIENTE» en LOTE-2025-001 con los cinco transferidos y el justificante subido.
Ahora `GET /api/lotes` trae `pago_clientes` (`resumenPagoLote` en
[pagoClientesService.js](implementation/backend/services/pagoClientesService.js): cuántos
hay en cada paso —sin pedir · pedida · confirmada · remesa · pagado— y los que faltan con
su paso) y la tarjeta lo pinta con
[logic/pagoClientesLote.js](implementation/frontend/src/features/lotes/logic/pagoClientesLote.js):
todos con justificante → chapa **«PAGADO A CLIENTES»** (y si falta avisar a alguno);
alguno → **«PAGADO EXCEPTO N»** y quién falta con su paso; ninguno → la chapa de siempre
con el **subestado** debajo («📨 Cuenta pedida · 0/5 confirmadas», «🏦 Remesa generada ·
falta subir el justificante»…).

**REGLA — es una LECTURA de los sellos, no un cambio de estado**: el lote sigue en «PTE.
PAGO BROKERGY A CLIENTE» (lo usan la remesa, el radar y las carpetas de Drive) y pasar a
FINALIZADO sigue siendo a mano. **Sin importes ni cuentas** (la lista la ve todo el staff)
y `cobro` no sale al navegador: lleva el token del formulario.

### La CARTA DE PAGO del Bono CAE (2026-10-22)

Al subir el justificante del banco, cada cliente transferido tiene su **carta de pago**:
un PDF de UNA hoja (diseño cerrado de Claude Design, aprobado por Fran) con el importe,
la fecha de la transferencia, titular, vivienda, RC, instalador, actuación, ahorro
VERIFICADO, la cuenta por sus 4 últimas cifras y la petición de reseña (botón + QR). Va
adjunta al aviso de transferencia, por WhatsApp (en tres mensajes, ver abajo) y por
email (adjunto), con los textos de Fran. Antes de llevarlo a la app se probó con
25RES060_29 (Antonio Manjavacas) enviado SOLO a Fran por los dos canales.

| Qué | Dónde |
|---|---|
| Plantilla (no se rediseña: solo `{{variables}}`) | [plantillas/carta_pago_bono_cae.html](implementation/backend/plantillas/carta_pago_bono_cae.html) |
| Datos, render, control de calidad, número, Drive, envío | [cartaPagoService.js](implementation/backend/services/cartaPagoService.js) |
| Textos (WhatsApp, asunto y cuerpo del email) | `componerMensajeCartaPago` en [cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) |
| Numeración y registro | tabla `cartas_pago` + RPC `carta_pago_numero` ([cartas_pago_schema.sql](implementation/backend/scripts/cartas_pago_schema.sql)) |
| Se genera | al subir el justificante (`POST /api/lotes/:id/transferencia` → `cartasDeTransferencia`) |
| A mano (adminOnly) | popup de aviso «Generar / Rehacer» · ficha del expediente, «Datos Económicos» (`/api/expedientes/:id/carta-pago`) |
| Pruebas | `node implementation/backend/scripts/test_carta_pago.js` |

**REGLA — la plantilla NO se rediseña.** Sale de la exportación de Claude Design
desempaquetada: las fuentes (Antonio e Inter, solo latino), el logo y el QR van
incrustados como data URI, así que renderiza sin red y no pide nada a Google (regla
25.b). Lo único añadido son las clases de recorte de las celdas.

**REGLA — la carta no se guarda ni se envía si no pasa el control de calidad**: 1
página, el contenido cabe en 1123 px, las fuentes cargadas, ninguna `{{` suelta y el
enlace de la reseña CLICABLE dentro del PDF. Una variable sin dato es un error, nunca
un hueco. Si falla, queda una incidencia LEVE en el expediente
(`expediente_incidencia_append`, atómica) y el popup lo dice con «⚠ Sin carta de pago».

**REGLA — lo largo se RECORTA, el diseño no se toca.** Titular, vivienda e instalador
admiten 2 líneas (la dirección casi nunca cabe en una: «C/ HUERTO PEDRERO, 20 · CAMPO DE
CRIPTANA»); si la hoja no cabe, se prueba con solo la vivienda a 2 líneas y, por último,
todo a una con elipsis. Probado con nombre y dirección muy largos e importe de 6 cifras.

**REGLA — el número no cambia.** `CP-AAAA-NNNN`, correlativo por año, una fila por
expediente (`expediente_id` único): rehacer o reenviar conserva número y fecha de
emisión. La RPC bloquea por año (advisory lock) para que dos cartas a la vez no saquen
el mismo.

**REGLA — los datos son los de la REMESA, no un recálculo**: el importe es el que se
transfirió (`cobro.transferencia.importe` / `remesa.importe`: verificado − honorarios),
la fecha la de ejecución de la remesa y la cuenta, las 4 últimas cifras de sus máscaras.
El IBAN entero no se lee en este servicio ni sale en logs. Con varios cedentes, todas
las terminaciones. El ahorro es el VERIFICADO.

**REGLA — con la carta, la reseña programada sale DESMARCADA**: el texto de la carta
ya la pide, y con las dos se le pediría dos veces. Al partner, ni reseña ni cuenta.
(Desde el 24/10/2026 lo programado con carta es el RECORDATORIO «¿te ha llegado?», que
sale MARCADO porque no repite la petición: ver más abajo.)

**REGLA — por WhatsApp son TRES mensajes: el INGRESO, la CARTA y la RESEÑA** (Fran,
25/10/2026, al ver el de 25RES060_66): 1) «✅ *Ya te hemos transferido tu Bono CAE:
8.099,51 €*», la cuenta por sus 4 cifras en negrita y que la carta va detrás; 2) el PDF,
sin pie; 3) «⭐ *¿Te ha gustado cómo lo hemos llevado?* Déjanos una reseña…», con el
ENLACE en la SEGUNDA línea, y debajo la idea de la página «¿te ha llegado?» (las familias
que esperan su ingreso) y la firma de Fran. **El enlace va arriba y el mensaje es corto
(≤ 400 caracteres, lo vigila el test)**: WhatsApp pliega los mensajes largos tras «Leer
más» y un enlace al final no se ve (Fran, 25/10/2026; le pasaba al de confirmar la cuenta). Antes era
un solo texto de dos frases: sin formato, la reseña se comía la noticia y, como
`sendMedia` saca un texto de varias líneas a su propia burbuja, WhatsApp le ponía ENCIMA
la tarjeta gris de «search.google.com». Ahora los textos van con `linkPreview: false`
(opción de `sendMedia`, solo para los textos que acompañan al adjunto) y la reseña es
`textoDespues`. En el popup se ven los tres; la reseña se edita y, **vacía, no sale**. Si
falla SOLO la reseña no se reintenta (duplicaría ingreso y carta): sale en
`envio_errores` para mandarla a mano. Textos: `whatsapp` y `whatsapp_resena` de
`componerMensajeCartaPago` (null al partner o sin enlace). El email no cambia.

**El EMAIL tiene su propio diseño** (Fran, 22/10/2026: «el que teníamos era una castaña»):
[plantillas/email_carta_pago_bono_cae.html](implementation/backend/plantillas/email_carta_pago_bono_cae.html),
en tablas con estilos en línea (Gmail, Outlook, Apple Mail, móvil), con su texto plano
(`multipart/alternative`, mismo contenido). Remitente «Fran Moya · BROKERGY»
`<franciscojavier.moya@brokergy.es>`, y las respuestas le llegan a él.

**REGLA — el asunto lleva el nº de EXPEDIENTE delante y la cifra**:
«25RES060_29 · Tu Bono CAE de 3.030,62 € ya está en tu cuenta». El encargo del diseño
proponía el asunto sin expediente; Fran lo quiso delante. El nº de carta va dentro.

**REGLA — las imágenes del email van ALOJADAS** (Gmail no enseña base64) en
`frontend/public/email/carta-pago/`, que sirve nginx en `https://app.brokergy.es/email/carta-pago`
(`CARTA_PAGO_ASSETS_URL`). Antes de enviar se comprueba que respondan 200; si no, van
incrustadas como CID desde la copia de `plantillas/email_carta_pago/`, así que el email
nunca sale con imágenes rotas. Las dos copias tienen que ser IGUALES (lo comprueba el test).

**Monedas y billetes cayendo DETRÁS de la cabecera** (logo + nº de carta; croquis de Fran,
22/10/2026): `dinero-cayendo.gif`, 900×144 (1,5× de 600×96), 32 fotogramas, ~250 KB,
generada con `scripts/gif_dinero_cayendo.py` (Pillow), como fondo de la celda de la
cabecera (`background` + `background-image`, `cover`). Primero se probó como tira encima
del importe; Fran la quiso detrás del logo y el importe arriba, como estaba. NO como fondo
de todo el email (pesaría MB). Outlook de escritorio no pinta fondos: ahí sale la cabecera
de siempre.

**REGLA — un FONDO no se incrusta**: las imágenes en `<img>` caen a CID si no están
alojadas, pero un fondo CID no lo pinta Gmail. Para probar el email antes de un deploy, las
imágenes se suben a mano a `/opt/brokergy/implementation/frontend/dist/email/carta-pago/`
del VPS (se hizo el 22/10/2026); el deploy las regenera desde `public/`.

**REGLA — las imágenes del email se ven en MODO OSCURO**: el cliente oscurece el email
pero no las imágenes. Por eso el GIF va con fondo TRANSPARENTE (1 bit: el borde se corta
al 50 % con el color del propio canto, sin halo blanco; `disposal=2`). Con fondo blanco
la tira salía como un rectángulo blanco sobre el email oscuro.

**REGLA — en oscuro, el logo BLANCO (sin contorno ni relieve, Fran 22/10/2026)**: el
logo es negro sobre transparente y desaparecía. Van dos (`logo-claro` negro, visible;
`logo-oscuro` blanco, oculto). Apple Mail y Outlook avisan del modo oscuro
(`prefers-color-scheme`, `[data-ogsc]`) y se cambian. Gmail NO avisa: invierte los colores
(el bloque negro del importe sale blanco) pero no las imágenes. En las APPS de Gmail
(`u + .body`, con `class="body"` en el `<body>`, y SOLO dentro de `max-width:620px`) va el
logo blanco con `mix-blend-mode: difference`: sobre fondo claro se ve negro y sobre oscuro
blanco. **Solo en móvil, porque Gmail del ORDENADOR no admite `mix-blend-mode`**: sin el
límite de ancho ocultó el logo negro y el blanco quedó invisible (22/10/2026). Y el
contorno blanco se descartó: Fran lo vio «con relieve».

⚠️ Las imágenes subidas a mano al `dist/` del VPS **las borra el siguiente deploy de
cualquier sesión** (reconstruye `dist/` desde `public/`): pasó a los 40 min. Hasta el
commit, antes de cada prueba se comprueba que responden 200.

**REGLA — Gmail pinta la dirección como enlace azul a Maps**: un carácter invisible no
basta; la celda lleva la clase `sin-enlace` y el `<style>` del email pinta su enlace del
color del texto (y `a[x-apple-data-detectors]` para Apple Mail).

**Las PRUEBAS, a un Gmail, no a franciscojavier.moya@brokergy.es**: el 22/10/2026 de 7
pruebas enviadas de ese buzón a sí mismo, Hostinger aceptó las 7 (250, sin el 451 de la
cuota) y solo entregó 4 en su propio INBOX (comprobado por IMAP, solo lectura); la
misma a franciscojavier.moya.s2e2@gmail.com llegó en segundos a la bandeja de entrada.

**REGLA — el diseño le habla al TITULAR**: a su persona de contacto o al partner sale el
texto corto, sin HTML. En el popup, con el email de diseño, se ve el email tal cual
llega (vista previa) y solo se edita el asunto.

**REGLA — el envío nace con visto bueno.** La carta se genera sola; el envío espera al
popup (WhatsApp y email marcados por defecto). `CARTA_PAGO_ENVIO_AUTO=true` lo
manda solo al subir el justificante; en local, siempre apagado.

El PDF se guarda en «5. FACTURAS» del expediente como
`CARTA_PAGO_{expediente}_{numero}.pdf`; en `documentacion.cobro.carta_pago`, solo
metadatos (número, enlace, sha256, fecha, envío), por la RPC de merge.

### «¿Te ha llegado?» — el RECORDATORIO, la reseña y la documentación para la Renta (2026-10-24)

Fran no sabía quién dejaba reseña tras la carta. Ahora el flujo se cierra: a los **2 días
hábiles** de la carta sale un recordatorio (WhatsApp + email) con el enlace
`/cobro/:id/recibido?token=` (el token del cobro):

1. **«✅ Sí, me ha llegado» / «Todavía no»** → `cobro.recepcion`; «todavía no» avisa al
   equipo en el momento (`WHATSAPP_ADMIN_CHAT` + `ADMIN_EMAIL`).
2. **La reseña**, que pasa a ser la protagonista AL CONFIRMAR el ingreso (el momento de
   más alegría; a quien dice «todavía no» no se le pide), con el texto de Fran
   condensado: muchas familias en su misma situación esperan su ingreso; su reseña es
   lo que más les ayuda a confiar en que, aunque se retrase, sale adelante. Debajo, la
   prueba social REAL («Más de 60 familias ya han cobrado su Bono CAE con BROKERGY»,
   `familiasCobradas`: FINALIZADOS + transferidos de los lotes en pago, redondeado a la
   decena hacia abajo; por debajo de 20 no se dice). «Ya la he dejado» → `cobro.resena_cliente`.
3. **Su documentación**: el enlace a su portal (`/mi-expediente`), SIEMPRE a la vista.

**El enlace del mensaje es CORTO** (`app.brokergy.es/r/K7M2Q9XA`, [enlaceCorto.js](implementation/backend/services/enlaceCorto.js)):
el largo con token parece un timo en un WhatsApp. Se guarda en `app_settings` (`r:<código>`,
sin tabla nueva) y se sella en `cobro.enlace_recibido`. **El código ES el secreto**: 8
caracteres de un alfabeto sin 0/O/1/I/L (se dictan) y la ruta que lo resuelve
(`GET /api/public/r/:codigo`) frena a 30 fallos por IP cada 10 min; solo redirige DENTRO de
la app (rutas que empiezan por `/`, nunca `//`).

**La estética es la de la CARTA** (24/10/2026, Fran: «que sea TOP TOP»): crema, tinta,
tarjetas blancas, Antonio 700 auto-alojada (`/fonts/Antonio-700-latin.woff2`, sacada de la
carta) para cifras y titulares, el degradado naranja→verde y una sola palabra en lima. El
cliente viene de la carta en PDF y del email: la página es su continuación, no el CRM oscuro.
Sin emojis. El importe protagonista y, al confirmar, un check que se DIBUJA (SVG + keyframes).

En la fase 7 cada cliente lleva «💶 Le ha llegado» · «⚠ Dice que NO le ha llegado» ·
«⭐ Dice que dejó reseña». El despachador (el de las reseñas programadas) no lo manda a
quien ya confirmó Y dejó reseña.

| Qué | Dónde |
|---|---|
| Página, acciones y aviso al equipo | [recepcionCobroService.js](implementation/backend/services/recepcionCobroService.js) · `GET/POST /api/public/cobro/:id/recibido` |
| Textos (recordatorio, reseña, campaña de la Renta) | `componerMensajeRecordatorioCobro`, `textoPeticionResena`, `componerMensajeCampanaRenta` en [cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) |
| La página | [RecibidoCobroView.jsx](implementation/frontend/src/features/cobro/views/RecibidoCobroView.jsx) · demo en `/cobro/demo/recibido` |
| Programarlo | el popup del aviso de transferencia (sale MARCADO con carta) → `pagoClientesService.barrer` |
| Campaña de la Renta (marzo), en seco | `node implementation/backend/scripts/campana_renta.js [--anio 2026] [--solo <nº>]` |

**REGLA — la reseña NO es la llave de los documentos.** Fran lo planteó como «un
chantaje que no lo parezca» y se descartó: Google prohíbe pedir reseñas a cambio de algo
(puede borrarlas o penalizar la ficha), los certificados son del cliente y retenerlos en
campaña de Renta es una reclamación, y «Ya la he dejado» no se puede comprobar. Se hace
con RECIPROCIDAD: la reseña se pide en el momento de alegría (al confirmar el ingreso) y la
documentación está SIEMPRE visible, haga lo que haga con la reseña.

**REGLA — «dejó reseña» es lo que DICE el cliente**: Google no dice quién escribe cada
reseña. Se rotula «dice que dejó reseña».

**El portal, «Para tu declaración de la Renta»** (24/10/2026): una tarjeta en la portada
que abre la MISMA guía que se envía (`guiaIrpfService.paraCliente` →
`resumenRentaCliente` en [logic/guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js)):
la deducción, dónde se marca en Renta Web, los datos con sus rótulos LITERALES, los
certificados antes/después, la guía en PDF —**generada al momento** si nunca se le envió
(`/portal/doc/:uuid/guia_irpf`), sin guardarla— y sus papeles. Cada CEE sale ahora en sus
TRES papeles (certificado, etiqueta y justificante de registro); antes solo el primero que
hubiera. Mismo candado que los certificados: hasta 'DOC. COMPLETA' no se enseña. Medido
con 26RES060_131: 60 %, G → A, B22966733, 10.404,25 €.

Y el portal entero, con la misma estética de la carta (24/10/2026):
- **Cobrado es cobrado**: el DTO trae `cobro: { pagado, importe, fecha }` (de
  `documentacion.cobro`, nada más: ni token ni cuentas) y, pagado, la tarjeta dice «Bono
  CAE cobrado», el importe con céntimos y «Transferido el …», sin «Estimado». Antes decía
  «que cobrarás · Estimado» a quien ya había cobrado.
- **Lo de la PROPUESTA frente a lo REAL** (26/10/2026, Fran: «poner lo que se le pasó en la
  propuesta y lo que realmente ha cobrado. Eso cuando sea más. Cuando sea menos, lo que ha
  cobrado»). Cobrado y MAYOR que la propuesta: debajo del importe, tres casillas «Propuesta ·
  Cobrado · De más» (la última en verde). Se comparan BRUTOS: el bono de la propuesta con el
  cobrado ANTES de los honorarios (`cobro.bono` = transferido + `remesa.descuento`), y si se
  descontaron se dice en una línea («Tu bono, X €, menos 250,00 € de la gestión, como
  elegiste»). Menor o igual (o por menos de 1 €): solo lo cobrado. Solo se compara con una
  propuesta GUARDADA (`dinero.deLaPropuesta`): el bono calculado al vuelo de un migrado sin
  propuesta no es lo que se le dijo. Medido sobre los 13 cobrados de la app: compara en 4
  (25RES060_53: 7.997 € → 8.027 €, +30 €).
- **Con el CAE emitido y sin transferir**, el bono es el VERIFICADO (`dinero.bonoConfirmado`,
  `computeExpedienteFinancials(...).caeVerificado`, el mismo de la remesa): «Bono CAE que vas a
  cobrar · Confirmado», «El CAE ya está emitido: estamos preparando tu transferencia» y la
  misma comparación si es mayor. Antes decía «Te lo transferimos cuando se emita el CAE» con
  el CAE ya emitido. ⚠️ El portal sabe que está cobrado SOLO por `cobro.transferencia` (el
  justificante subido en la fase 7): un pago hecho fuera de la app no lo ve (25RES060_54 y
  los cuatro de «PAQUETE 1 - 2025 (PRE APP)», 26/10/2026).
- **El IRPF sin porcentaje fijo**: decía «(60 % de la obra)» a todos, y a un piso le
  corresponde el 40 %.
- **«Copiar» en cada dato de Renta Web** (`resumenRentaCliente` trae `copiar` por fila:
  lo que se TECLEA — la clave `1`, la RC, solo el NIF, la cantidad como `10404,25`);
  antes/después en dos tarjetas con la LETRA grande; los papeles AGRUPADOS por certificado.
- **«Descargar todo (ZIP)»**: `GET /api/public/portal/zip/:uuid?token=` con lo DISPONIBLE de
  `buildDocumentos` (lo bloqueado no entra) + la guía, con nombres legibles y numerados
  (`crearZip`). Medido con 26RES060_131: 11 ficheros, 8 MB, ~12 s.
- La tarjeta de la Renta es la PROTAGONISTA de la portada con la documentación completa
  o cobrado («Tu documentación, lista para la Renta», 60 % · G→A · lo pagado).
- ⚠️ Un papel cuyo enlace apunta a un fichero BORRADO de Drive se lista igual y falla al
  bajarlo (el ZIP lo salta): en 26RES060_131, el CIFO y el Anexo I firmados (24/10/2026). La campaña de la Renta le tocaría
hoy a 79 clientes (los dos CEE registrados y la documentación completa).

### Regalarle la gestión desde el lote (2026-10-14)

Botón **«🎁 No cobrarle la gestión (250 €)»** en la fila de cada cliente de la fase 7
(solo ADMIN, `POST /api/lotes/:id/cobros/:expId/gestion-bonificada`
`{ bonificada }`). Sella `documentacion.cobro.gestion_bonificada = { at, por }` con
la RPC de merge (`null` lo deshace) y apunta el cambio en el historial del lote.

**REGLA — el regalo NO es «Descuento Certificados».** Aquel lo pactó el convenio y
por eso el mensaje calla; éste es un detalle de ahora a quien su convenio sí le
cobraba la gestión, y el mensaje lo DICE: «🎁 Además, tenemos un detalle contigo: no
te cobramos nuestros honorarios de gestión (250,00 €). Es un regalo por tu
paciencia durante la tramitación…» (con requerimientos; si no, «por tu confianza»).
Lo repiten la portada del formulario y el aviso de transferencia («Va íntegra…»).
`contextoCobro` devuelve `clienteAsumeCoste: false` + `gestionBonificada` (el coste
que se le habría pedido), así que el formulario no pregunta la forma de pago y la
remesa no descuenta nada, aunque ya hubiera contestado «descuento» o «factura».

**REGLA — con la remesa generada ya no se cambia** (409): el importe del fichero
del banco es el que es. Si se regala DESPUÉS de pedirle la cuenta, la fila avisa de
que hay que reenviarle el mensaje para que lo sepa.

**`cobro` está en `CLAVES_PROTEGIDAS`** de `mergeDocumentacion`: solo lo escriben
`cobroService.sellar` y sus scripts; una copia vieja de la ficha borraba la marca.

⚠️ El margen de Brokergy NO baja con el regalo en el panel económico ni en el
listado (no leen `documentacion.cobro`): son 250 € menos que la cifra que enseñan.

### Validar la cuenta A MANO desde el lote (2026-10-19)

Muchos clientes desconfían del enlace («¿esto es un timo?, ¿es ciberseguridad?») y
llaman en vez de pulsarlo. Botón **«✓ Validar a mano»** en la fila de cada cliente
sin confirmar de la fase 7 (solo ADMIN, `POST /api/lotes/:id/cobros/:expId/validar-manual`
`{ validar, forma_pago, nota }`). Abre un popup con la cuenta ENTERA que consta, la
forma de pago (solo si asume la gestión y no se le ha regalado; por defecto
«descontada») y una nota («Confirmada por teléfono con el cliente»).

Sella `documentacion.cobro` con la RPC de merge como si hubiera contestado:
`completado_at`, `origen: 'manual'`, `validado_manual = { at, por, nota }`,
`respuestas.forma_pago`, `iban_anterior` = la de la ficha e `iban_cambiado: false`,
y lo apunta en el historial del lote. La chapa dice «✓ Confirmada a mano» y la fila,
quién y cuándo. Con eso la remesa lo lleva igual que a los demás.

**REGLA — a mano solo se confirma la cuenta que YA consta.** Si el cliente da otra,
se cambia en su ficha con el justificante de titularidad (la regla del IBAN nuevo
sigue en pie) y después se valida. Sin cuenta en la ficha o con una que no pasa el
dígito de control, la ruta responde 400.

**REGLA — se puede deshacer solo lo validado a mano y sin remesa** (409 si no): lo
que confirmó el propio cliente no se borra desde aquí.

Medido en seco el 19/10/2026 sobre el lote de 25RES060_26 (8 pendientes de 9): los 8
entrarían en la remesa; 25RES060_29, con la gestión regalada, por el bono íntegro.

### La FACTURA de la gestión, al cliente o a su INSTALADOR (2026-10-19)

Cuando el cliente pide factura de los honorarios, o el INSTALADOR pide que se le
facture a él (pasa mucho), botón **«🧾 Emitir factura de la gestión»** en la fila de
la fase 7 (solo ADMIN; resaltado en ámbar si el cliente eligió «factura»). El popup
([FacturaGestionModal.jsx](implementation/frontend/src/features/lotes/components/FacturaGestionModal.jsx))
pregunta **a quién se factura** —cliente o instalador, con sus datos fiscales
editables— y la emite y envía con el mensaje a la vista. **«Vista previa»** la enseña
antes de emitir con el MISMO visor y el MISMO HTML que la de los CEE directos
(`VistaPreviaA4` + `buildFacturaCeeHtml`, con lo escrito en ese momento y el nº que
tocaría); una vez emitida, «Ver PDF» abre el de verdad.

| Qué | Dónde |
|---|---|
| Línea, observaciones y los dos mensajes (fuente única) | [logic/facturaGestion.js](implementation/frontend/src/features/lotes/logic/facturaGestion.js) |
| Emitir, PDF, enviar, marcar cobrada | [facturaGestionCae.js](implementation/backend/services/facturaGestionCae.js) |
| Rutas (adminOnly) | `GET|POST /api/lotes/:id/cobros/:expId/factura-gestion` · `POST …/enviar` · `POST …/pagada` · `GET …/pdf` |
| Registro | `documentacion.cobro.factura_gestion` (objeto entero, RPC de merge) |
| Prueba (contra una COPIA del libro; sella en memoria) | `node implementation/backend/scripts/test_factura_gestion.js [nº]` |

**REGLA — va al MISMO libro de facturas que los CEE directos** (hoja «APP PPTO Y
FACTURAS», serie `{YY}ING_{n}`, `facturaSheetService`): esta app no numera; lee la
hoja, reserva escribiendo la fila y relee, así AppSheet y la app nunca repiten
número ni rompen el orden de fechas. El concepto es el artículo que YA existía en el
catálogo de la hoja, **«Gestión técnica y administrativa ayuda BONO ENERGÉTICO CAE»**
(`529a035b`, 250 € + 21 %); el precio, los honorarios del expediente (`bloquePago`).
El PDF es el mismo de AppSheet (`buildFacturaCeeHtml`).

**REGLA — el PDF se guarda en TRES sitios** (decisión del usuario, 2026-10-19):
1. la carpeta **FACTURAS** del libro de AppSheet, con su nombre `{nº} - {razón social}.pdf`
   (de ahí la abre su app; si esto falla, falla el PDF);
2. **contabilidad**: `ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS / {año} / {n. MES}`,
   por la FECHA DE LA FACTURA, con `archivarFacturaIngenieria` y el MISMO nombre que en
   AppSheet («26ING_87 - {a quién}.pdf»), como las que ya se copiaban a mano. **No** en
   «CAE - SERVICIOS CAE»: esa es solo para las facturas a los Sujetos Obligados
   (decisión del usuario, 2026-10-19);
3. **«5. FACTURAS» del expediente**, con nombre PROPIO
   («26ING_87 - HONORARIOS GESTION CAE BROKERGY - {a quién}.pdf»): esa carpeta es la de
   las facturas de la OBRA y el paquete del S.O. coge las que se llaman «… - facturas»,
   así que la nuestra no se confunde con ellas.

Las dos últimas son best-effort: el popup dice cuál no se pudo guardar. Rehacer el
PDF sustituye las tres (mismo nombre).

**REGLA — emitirla FIJA la forma de pago en «factura».** Si no, la remesa descontaría
además los 250 € del ingreso y se cobrarían dos veces. Una factura por expediente
(409 a la segunda); con la remesa generada o la gestión regalada no se emite, y con
la factura emitida ya no se puede regalar.

**REGLA — «✓ Marcar cobrada» la marca PAGADA también en la hoja** (ESTADO + FECHA DE
PAGO) y es lo que deja entrar al cliente en la remesa, con la ayuda ÍNTEGRA. Sin
cobrar, la remesa lo deja fuera diciendo por qué (el check del popup de la remesa
sigue valiendo para facturas cobradas por fuera).

**REGLA — al instalador, tono profesional** (sin emojis, sin el nº de expediente; el
cliente se nombra con la obra), a su contacto COMERCIAL (regla 44). Las observaciones
de su factura dicen de qué cliente y qué obra es. Al cliente se le dice que la
ayuda se ingresa al cobrarla, sin fecha.

Probado el 19/10/2026 contra una copia del libro con 25RES060_26 facturado al
instalador: 26ING_87, fila y línea con el artículo, PDF, envío, 409 a la segunda,
fuera de la remesa sin cobrar y dentro (2.642,19 € íntegros) tras marcarla cobrada.

### Avisar al INSTALADOR de que sus clientes ya han cobrado (2026-10-14)

Hasta aquí el instalador no se enteraba de nada: ni al pedir la cuenta ni al
transferir. Ahora, en la fase 7, **«📣 Avisar a los instaladores»** (adminOnly,
`GET /api/lotes/:id/aviso-instaladores` · `POST …/aviso-instaladores/:instId`,
[avisoInstaladoresCobro.js](implementation/backend/services/avisoInstaladoresCobro.js)).

**REGLA — UN mensaje por instalador y LOTE, no uno por expediente**, al contacto
COMERCIAL (regla 44; sin él, al canal general y en plural, «Os escribimos…»). El
instalador sale de la misma cascada que el listado (`instalacion.instalador_id` →
`instalador_asociado_id` → oportunidad).

**REGLA — se manda cuando sus clientes YA HAN COBRADO** (decisión del usuario): el
texto dice «ya hemos abonado», así que el grupo solo se puede marcar cuando TODOS sus
clientes del lote tienen `cobro.transferencia`; si no, dice cuántos faltan y la ruta
responde 409. Nunca sale solo: borradores revisables en el popup.

**REGLA — tono PROFESIONAL** (sin emojis, sin «es de fiar»): de cada cliente,
nombre y apellidos (`nombrePropio`), la dirección de la OBRA (`direccionObra`: la de
la instalación, sin notas internas entre paréntesis, con el municipio) y la ayuda
cobrada; **nunca el nº de expediente**. Con varios, el total. Los requerimientos se
cuentan si los hubo. Cierra con «¡Seguimos!». Texto: `componerMensajeInstaladorCobro`
en [cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js).

El envío se sella en cada expediente (`documentacion.cobro.aviso_instalador`, RPC de
merge) y en el historial del lote; el popup marca por defecto los listos sin avisar.

### La bandeja — pestaña **Venta cruzada**

`features/cobro/views/RespuestasCobroView.jsx` sobre `GET /api/expedientes/cobro/respuestas`
(staffOnly). Es lo que antes se miraba en Tally: quién ha contestado, qué ha dicho
y a quién hay que llamar.

**REGLA — pestaña PROPIA, no un rincón de otra.** Va en el grupo *Cartera* y la ve
todo el staff. No en **Seguimiento**, que responde "qué expediente está atascado":
meter ahí trabajo comercial diluye lo único que hace útil al parte, que todo lo que
sale es un expediente parado. Y no en el **Cuadro de mando**, que es ADMIN-only por
los importes — esta lista no lleva un euro y la trabaja quien hace las llamadas.

**REGLA — arranca en los INTERESADOS y el resto se pide.** El conmutador
*Interesados · Todas* existe porque son dos usos distintos: llamar y analizar.
Abriéndola entera, una lista de llamadas se convierte en un inventario. "Ya tengo
quien me lleve la renta" **también se guarda y se enseña** (en gris): saber que no
hay que llamar ahorra la llamada igual que saber que sí.

**REGLA — el CSV exporta lo que estás VIENDO**, con el filtro y la búsqueda
aplicados. Un botón que exporta "todo" mientras la pantalla enseña otra cosa es la
forma más fácil de mandar el fichero equivocado. Separador `;` y BOM: sin ellos,
Excel en español abre una sola columna y se come los acentos.

**La marca de "contactado" se persiste** (`documentacion.cobro.contactado`, con
quién y cuándo) — es lo que separa una bandeja de trabajo de una lista que se relee
entera cada semana. Se puede quitar: la RPC funde, así que desmarcar escribe `null`,
no borra la clave.

Los rótulos de las columnas salen de `BLOQUES`, la MISMA fuente que las preguntas:
una cabecera escrita a mano aquí envejece en cuanto cambie un bloque.

⚠️ El token se **persiste** (no es HMAC con caducidad como `accionToken`): entre que
se le manda y cobra pueden pasar semanas, y caducarlo a los 14 días obligaría a
reenviarlo justo cuando el cliente por fin lo mira. Se compara en **tiempo
constante** — detrás de ese enlace se puede reescribir un IBAN.
