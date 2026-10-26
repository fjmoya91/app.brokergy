<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La FACTURA se emite contra el libro de facturas de AppSheet (2026-09-23)

Botón **🧾 Generar factura** en la ficha del CEE directo (solo ADMIN). Popup con
vista previa → **Emitir** → enviar por email/WhatsApp. El libro de facturas de
Brokergy es la hoja **"APP PPTO Y FACTURAS"** (Google Sheets), de la que tira
también la app de AppSheet con la MISMA serie `{YY}ING_{n}`.

| Qué | Dónde |
|---|---|
| Líneas, totales, mensaje y el HTML del PDF (fuente única: popup + backend) | [logic/facturaCee.js](implementation/frontend/src/features/cee-directo/logic/facturaCee.js) |
| Hablar con la hoja (número, filas, cliente, PDF en su carpeta) | [facturaSheetService.js](implementation/backend/services/facturaSheetService.js) |
| Emitir, rehacer PDF, enviar, sincronizar cobro | [ceeFacturaService.js](implementation/backend/services/ceeFacturaService.js) |
| Rutas | `GET|POST /api/cee-directos/:id/factura` · `GET|POST /:id/factura/:numero/pdf` · `POST /:id/factura/:numero/enviar` (**adminOnly**) |
| Popup | `FacturaCeeModal.jsx` |
| Prueba (contra una COPIA de la hoja, nunca la real) | `node implementation/backend/scripts/test_factura_cee.js` |

**Desde el 24/10/2026**, si el expediente nació de un presupuesto con PARTIDAS, la factura propone
ESAS líneas (`documentacion.oferta.lineas`) en vez de las dos de siempre. El ID ARTÍCULO de la hoja
sale del `appsheet_id` del artículo del catálogo (o del importe de la tasa / del alcance); una
partida cuyo artículo no existe en la hoja (la legalización FV) va con el ID vacío. Ver «Presupuestos
con PARTIDAS» (área facturacion), que también cuenta la fase 2: las facturas desde la app.

**REGLA — esta app NO tiene numeración propia.** Lee la hoja, toma el mayor
correlativo de TODOS los años + 1 (la hoja pasó de 25ING_37 a 26ING_38: no se
reinicia en enero) y **escribe su fila en el acto: la fila ES la reserva**.
Después relee: si otra fila (AppSheet) se llevó el mismo número entre medias, la
nuestra salta al siguiente. Dentro del proceso un candado impide dos emisiones a
la vez; contra AppSheet no hay candado posible y lo cubre esa relectura.

**REGLA — se escribe LO MISMO que escribe AppSheet** (medido sobre 26ING_70 · _75 ·
_77): cabecera en FACTURAS (`USUARIO` = la cuenta de AppSheet, CLIENTE = el NIF,
ruta `/appsheet/data/…/FACTURAS/{nº} - {razón social}.pdf` en "PDF FACTURA"),
líneas en DETALLE FACTURA enlazadas por el `id` y con el ID del ARTÍCULO del
catálogo de la hoja, y el cliente en CLIENTES **solo si su NIF no está** (si está,
no se toca: esa ficha es de la otra app). ⚠️ DETALLE FACTURA tiene las cabeceras
**desplazadas una columna** desde "DESCUENTO %" (G es un IRPF fantasma de 0,15 que
AppSheet escribe en todas las filas); se replica tal cual, y **antes de escribir
se comprueba que las cabeceras siguen siendo esas** — si alguien reordena la
hoja, se para en vez de escribir importes en la columna que no es.

**REGLA — el PDF es una RÉPLICA EXACTA de `facturaAppsheetHtml.js`**
(appsheet-factura-pdf): comparado contra el PDF real de 26ING_75, idéntico. Solo
cambian las tipografías, auto-alojadas (regla 25.b). Se guarda en la carpeta
`FACTURAS` junto a la hoja (sustituyendo el de ese nombre, como el script de
Apps Script) y una copia en "3. PRESUPUESTO Y FACTURAS" del expediente.

**REGLA — un número emitido no se tira.** Si el PDF falla después de reservar el
número, la factura queda registrada sin PDF y se rehace con el mismo número desde
el popup. El registro vive en `documentacion.facturas_emitidas[{nº}]` (solo
metadatos, por RPC de MERGE) y **el PUT del autoguardado no lo puede pisar**: la
ficha reenvía `documentacion` entera desde su copia.

**REGLA — "Marcar cobrado" marca PAGADAS sus facturas en la hoja** (ESTADO +
FECHA DE PAGO), y al revés: es el mismo hecho, y si no el libro seguiría diciendo
que se debe. Best-effort y en diferido: la hoja no puede tumbar el cobro. Una
segunda factura del mismo expediente exige confirmarlo (409 sin `otraMas`).

**REGLA — se EMITE y se ENVÍA en el mismo gesto, con el mensaje a la vista.** El
popup ya trae en el paso de preparar a quién se manda (WhatsApp / email del
contacto del destino) y el texto (`mensajeFactura`, que dice QUÉ se factura
—`trabajoFacturado`, sacado de las líneas— y pide el justificante de pago porque
el certificado no se entrega sin cobrar). El botón pasa a «Emitir y enviar». El
nº no existe hasta emitir: el mensaje enseña el que TOCARÍA y, si sale otro, se
sustituye antes de enviar. El envío llama a la MISMA ruta `/:numero/enviar` de
después; si falla, la factura queda emitida y se reenvía desde el propio popup.

**REGLA — la FECHA de una factura emitida se CAMBIA, el número NO** (`POST
/:id/factura/:numero/fecha`, adminOnly; botón 📅 Fecha en la lista del popup). Se
escriben FECHA FACTURA y FECHA VENCIMIENTO en la hoja (el vencimiento se desplaza
lo mismo, conservando el plazo), se corrige el registro (`cambios_fecha[]`) y el
historial, y se REHACE el PDF: el nuevo sustituye al viejo en la carpeta FACTURAS y
en la del expediente, y el viejo va a la PAPELERA de Drive aunque se llamara
distinto. Si ya se había enviado, se dice: el cliente tiene la de la fecha
anterior y hay que reenviársela. Una fecha que rompe el orden correlativo de la
serie (una anterior con fecha posterior, o al revés) se AVISA y no se bloquea
(`fechasDeLaSerie`). Probado contra la copia en `test_factura_cee.js` (paso 6b).

**REGLA — el PDF se guarda en TRES sitios** (2026-10-19): la carpeta FACTURAS de la
hoja, «3. PRESUPUESTO Y FACTURAS» del expediente y **contabilidad**, en «00. S2E2 / 04.
CONTABILIDAD / ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS / {año} / {n. MES}» por la
fecha de la factura y con el mismo nombre (`archivarFacturaIngenieria` en
[facturaContabilidad.js](implementation/backend/services/facturaContabilidad.js);
variable opcional `CONTABILIDAD_FACTURAS_ING_FOLDER_ID`). La de «CAE - SERVICIOS CAE» es
SOLO para las facturas a los Sujetos Obligados. Al cambiar la fecha, la copia del mes
anterior se retira. El popup dice qué copia no se pudo guardar.

**REGLA — el `id` que se escribe en la hoja lleva siempre una letra a-d o f.** Con
USER_ENTERED, un id de solo cifras o con una «e» entre cifras se convierte en NÚMERO
(«399e4412» → 3,99E+44, visto el 19/10/2026) y la factura no se vuelve a encontrar.

**Desde el 24/10/2026 cada factura emitida aquí entra también en el REGISTRO de facturas** de la
pestaña Facturación (`facturas_emitidas`, origen CEE_DIRECTO): `emitir` llama a
`facturaService.registrarEmitida`, que además la encadena en VERI*FACTU; el PDF, los envíos y un
cambio de fecha se anotan con `actualizarRegistrada`, y el cobro (`sincronizarCobro`) con
`marcarCobroPorNumero`. Best-effort: no puede tumbar la emisión. Se sigue rehaciendo desde
la ficha del CEE (desde la pestaña, 409). La plantilla del PDF es ahora la de todas las facturas
(`buildFacturaCeeHtml` admite IRPF, rectificativa, QR y fecha de operación sin cambiar una factura de
CEE) y su paginación se recalibró con lo MEDIDO: 432 px antes de la primera fila en la primera hoja
(AppSheet estimaba 384), la fila «Página 1 de N» contada y dos pasadas. Ver «Facturas desde la app»
(área facturacion) y regla 166.

**Desde el 25/10/2026 también al revés: la factura hecha en la pestaña Facturación se ve AQUÍ, y
cobrarla allí cobra el CEE.** Si es de este CEE (nació de su presupuesto o lleva su nº de expediente),
al emitirla, enviarla o rectificarla se escribe su reflejo en `documentacion.facturas_emitidas[{nº}]`
(`reflejarDeFacturacion`, con `origen: 'FACTURACION'` y `factura_id`), así que el procedimiento, el
«toca facturar», a quién se entrega y el popup la ven como cualquier otra. Su PDF es el de la pestaña;
rehacerlo o cambiarle la fecha desde aquí, 409. Y «Marcar cobrado» de la ficha y «Cobrada» de la
pestaña son la MISMA función, `cobrarExpediente` (cobro + facturas PAGADAS + entrega). Y enviarla desde
la pestaña manda el mensaje de AQUÍ (`envioDeFacturacion`), con el enlace del justificante. Caso: 26ING_89
de 2026CEE_61. Ver «Facturas desde la app».

**El mensaje de un DOBLE con el final ya registrado** (25/10/2026, 2026CEE_61): dice que los dos
certificados están hechos y registrados y que al pagar se le mandan los dos (`finalRegistrado` en
`contextoMensaje` → `mensajeFactura`). Antes le pedía la factura de la instalación «cuando esté
terminada», con la obra hecha y el final ya registrado.

**Desde el 19/10/2026 emite también en esta serie la fase 7 del lote** (la factura de
los honorarios de gestión CAE, al cliente o a su instalador: `facturaGestionCae.js`,
ver «Confirmación de cobro»). Usa el mismo `facturaSheetService.emitir` y el mismo
PDF: cualquier cambio aquí le afecta, y se prueba con `test_factura_gestion.js`.

La Sheets API tiene que estar activa en el proyecto de GCP del OAuth
(651872791732) — se activó el 23/09/2026. Variables opcionales:
`APPSHEET_FACTURAS_SHEET_ID`, `APPSHEET_FACTURAS_FOLDER_ID`, `APPSHEET_USUARIO`.
