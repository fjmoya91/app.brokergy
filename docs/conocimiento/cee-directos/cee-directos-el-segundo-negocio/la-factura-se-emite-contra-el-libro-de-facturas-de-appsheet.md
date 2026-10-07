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

La Sheets API tiene que estar activa en el proyecto de GCP del OAuth
(651872791732) — se activó el 23/09/2026. Variables opcionales:
`APPSHEET_FACTURAS_SHEET_ID`, `APPSHEET_FACTURAS_FOLDER_ID`, `APPSHEET_USUARIO`.
