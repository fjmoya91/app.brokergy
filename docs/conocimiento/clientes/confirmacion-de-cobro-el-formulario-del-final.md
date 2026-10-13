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
la factura sale marcada como lo que es: icono apagado, chapa ámbar con lo que cuesta
de más ("Más lento y 52,50 € más caro") y el motivo —las dos consecuencias, primero
el retraso y después el dinero— en su propio texto. **No se bloquea**: es una
elección legítima del cliente, pero dos opciones pintadas igual se leen como
equivalentes y ésta le cuesta dinero. La marca es `desaconsejada` + `aviso` en la
opción, y la pinta el componente `Opcion`, nunca cada pantalla por su cuenta.

**REGLA — cambiar de IBAN exige justificante NUEVO.** El que consta va impreso en el
Convenio de Cesión ya firmado; un justificante anterior acredita **esa** cuenta, que
es justo la que el cliente está cambiando. Se comprueba en las dos capas (la vista
lo pide, el POST responde 400 sin él). Si repite el IBAN que ya teníamos no se le
pide nada: ése se acreditó al aceptar la propuesta. La comparación es **sin espacios
y en mayúsculas** — el cliente lo escribe como se lo enseña su banco, y un cambio de
formato no es un cambio de cuenta.

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

**REGLA — el justificante del banco NO se le manda al cliente**: el de una remesa
lleva los nombres, cuentas e importes de todos los del lote.

**REGLA — la reseña: lo que se vio es lo que sale.** El texto, el teléfono y el
canal se fijan al programarla (como `propuestaProgramada`); el despachador no
recompone nada. Solo sale entre las 9:00 y las 21:00 de Madrid, y nace APAGADO
(`RESENA_PROGRAMADA_ENABLED`): el backend del portátil escribiría a clientes reales.
Sin `GOOGLE_RESENA_URL` no se programa ninguna, y al PARTNER no se le pide.
El esfuerzo se cuenta con los requerimientos que CONSTAN (`requerimientosDe`), como
la enhorabuena: sin ninguno se cuenta el proceso, no se inventan.

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
