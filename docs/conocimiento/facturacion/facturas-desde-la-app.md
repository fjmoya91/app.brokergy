<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

### Facturas desde la app: series ING y FML, rectificativas y VERI*FACTU (2026-10-24)

**Por qué.** Es la fase 2 de «Presupuestos con PARTIDAS». Fran, 24/10/2026: «sigue con las facturas
desde la app… termina todo». Se pidió que fuese tan fácil como Holded, que las dos series de AppSheet
(**ING**, BROKERGY; **FML**, Fran como profesional facturando a la sociedad con retención de IRPF)
saliesen de aquí y que el MCP pudiera hacer, emitir y mandar una factura hablando. VERI*FACTU obliga
a las sociedades desde el 1/1/2027 y al resto desde el 1/7/2027 (RDL 15/2025); AppSheet no lo cumple,
así que tiene que dejar de usarse antes de esa fecha.

| Qué | Dónde |
|---|---|
| Series, IRPF, NIF, revisión para emitir, rectificativas, estado visible, payload del PDF, mensaje (fuente ÚNICA) | [logic/factura.js](implementation/frontend/src/features/facturacion/logic/factura.js) |
| El PDF (la réplica de AppSheet, ampliada: IRPF, rectificativa, QR, fecha de operación) | [logic/facturaCee.js](implementation/frontend/src/features/cee-directo/logic/facturaCee.js) `buildFacturaCeeHtml` |
| Borradores, emitir, PDF, envío, cobro, rectificar, duplicar, importar el histórico, lo que emiten otros servicios | [services/facturaService.js](implementation/backend/services/facturaService.js) |
| Huella, registro de alta, XML, QR, envío SOAP (apagado) | [services/verifactuService.js](implementation/backend/services/verifactuService.js) |
| El libro de AppSheet, ahora por serie (ING por defecto) | [services/facturaSheetService.js](implementation/backend/services/facturaSheetService.js) |
| Rutas | [routes/facturacion.js](implementation/backend/routes/facturacion.js) → `/emisores` · `/facturas` · `/facturas/proximo` · `/facturas/:id` · `/emitir` · `/pdf` · `/mensaje` · `/enviar` · `/cobro` · `/rectificar` · `/duplicar` · `/facturas/desde-presupuesto/:id` · `/facturas/importar` |
| Pantallas | `FacturasLista` · `FacturaModal` · editor de emisores, en la subpestaña Facturas (solo ADMIN); «Facturar» en un presupuesto aceptado |
| MCP | `listar_facturas` · `crear_factura` · `facturar_presupuesto` · `duplicar_factura` · `emitir_factura` · `enviar_factura` · `cobro_factura` · `rectificar_factura` |
| Esquema | [scripts/facturacion_schema.sql](implementation/backend/scripts/facturacion_schema.sql) (`facturacion_emisores`, `facturas_emitidas`) |
| Histórico de AppSheet | `node implementation/backend/scripts/importar_facturas_appsheet.js` (en seco; `--escribir`; `--serie FML`) |
| Pruebas | `test_facturas.mjs` (sin red) · `check_factura_paginas.mjs` (medidor, 420 facturas) · `test_factura_cee.js` y `test_factura_gestion.js` (contra una COPIA del libro) |

**REGLA — una factura se calcula en UN sitio, y la retención y los suplidos no son base.** `calcularFactura`
de `logic/factura.js` (sobre `totalesFactura` de facturaCee): IVA por línea, el **IRPF se resta** del
total a pagar (2.250 € + 472,50 € de IVA − 337,50 € de IRPF = **2.385 €**, la 26FML_18) y un **suplido**
(la tasa) no lleva IVA ni descuento ni entra en la base sujeta. Para VERI*FACTU, `ImporteTotal` = base
sujeta + cuota: **sin suplidos y sin la retención** (2.722,50 € en la FML; 181,50 € en un CEE de 150 €
con su tasa). El servidor recalcula siempre; nunca se fía de las cifras del navegador.

**REGLA — nace BORRADOR; EMITIR le da el número y desde ahí no se borra ni se cambia: se rectifica.**
Un borrador no tiene número, se edita y se borra. Emitir (con candado contra el doble clic): refresca
el cliente desde su ficha, pasa `revisarParaEmitir` (sin NIF o sin importe no sale; un NIF que no
cuadra, sin domicilio o una partida al 0 % que no es suplido, se avisa), exige el emisor de la serie,
numera, guarda la **foto** del cliente y del emisor (un IBAN que cambia no cambia una factura emitida),
encadena VERI*FACTU y hace el PDF. Si el PDF falla, la factura YA está emitida y se rehace con el mismo
número (`POST /:id/pdf`). **Del cliente con ficha, el borrador guarda aparte lo tecleado SOLO para
esa factura (`cliente_propio`: lo que difiere de la ficha) y al emitir manda la ficha DE ESE DÍA con
eso encima.** Antes el borrador guardaba la copia entera y esa copia ganaba: un NIF o un domicilio
corregidos en la ficha después de crear el borrador no llegaban a la factura (lo vio la revisión del
24/10/2026). El editor ya enseña la ficha de hoy (`detalle` la refresca en los borradores); una
rectificativa repite la foto de la factura que rectifica, no la ficha. «Crear ficha» desde la factura la
da de alta YA con el NIF y el domicilio tecleados (el alta rápida de las ofertas solo pone nombre,
teléfono y email). El MCP lo hace en dos pasos: `emitir_factura` en modo «revisar» (enseña el
número que tocará, los errores y los avisos) y solo con el «sí» del usuario, «emitir». El editor
también enseña el número antes del «sí», el de la rectificativa incluido (`/facturas/proximo?tipo=R4`). **Enviarla es
otro «sí»**, con el mensaje entero a la vista (`SendActionOverlay` en la app; borrador y luego «enviar»
en el MCP).

**REGLA — numeración: las ordinarias, en el libro de AppSheet mientras conviva; las rectificativas,
en la app.** `{YY}ING_{n}` y `{YY}FML_{n}` los sigue reservando la hoja (la fila ES la reserva, como en
los CEE directos), porque AppSheet todavía emite en las mismas series. La FML se escribe en sus
pestañas `FACTURAS FML` y `DETALLE FACTURA FML` (con `IRPF (15%)` en negativo; su detalle NO está
desplazado como el de ING). Las rectificativas van en serie propia (art. 6.1.a RD 1619/2012):
`R-{YY}{SERIE}_{n}`, numeradas por la tabla (`correlativo`, `numero` UNIQUE, reintento si choca), y se
anotan también en el libro. El día que AppSheet se apague, la numeración ordinaria puede pasar a la
tabla sin cambiar el formato.

**REGLA — una rectificativa dice a cuál rectifica y por qué** (art. 15 RD 1619/2012). Se prepara en
BORRADOR desde la emitida: por defecto la ANULA entera (sus mismas líneas con las unidades en
negativo, «−1 × 150,00 €»); si es parcial, se editan las líneas. Tipo **R4** (error u otra causa, lo
normal) o **R1** (impago, descuento o devolución posterior, art. 80 LIVA); en VERI*FACTU va por
diferencias (`TipoRectificativa` I) con la factura rectificada. Si anula la factura entera, la
original pasa a RECTIFICADA (en el libro solo se le añade la observación: marcarla PAGADA sería
falso).

**REGLA — los datos de Fran (FML) viven en la BD, no en el código.** `facturacion_emisores` tiene una
fila por serie: la ING (la sociedad, datos públicos) la siembra el esquema; la **FML** (DNI, domicilio,
IBAN de una persona física) se da de alta desde Facturación → Emisores o en la BD. El repositorio es
público. Sin la fila de su serie, una factura no se emite («Faltan los datos del emisor de la serie
FML»). La FML lleva por defecto 15 % de IRPF y la observación de socios que prestan servicios
profesionales a su sociedad; la sociedad no es su cliente habitual, así que se teclea como cliente
fiscal o se elige su ficha.

**REGLA — la cadena de huellas se guarda ya; el envío a Hacienda y el QR, cuando haya certificado.** Cada factura
que emite la app (también las de los CEE directos y las de la gestión CAE) lleva su registro de alta
con la **huella SHA-256 encadenada a la anterior del MISMO emisor** (`vf_nif`, `vf_orden`, índice único:
la cadena no se bifurca aunque se emitan dos a la vez). Las huellas cuadran con los tres ejemplos del
documento de la AEAT (`test_facturas.mjs`) y la hora va con el huso de Madrid. El envío SOAP está
**apagado** (`VERIFACTU_ENVIO_ENABLED`, `VERIFACTU_CERT_PATH`, `VERIFACTU_CERT_PASS`,
`VERIFACTU_ENTORNO`): sin envío el registro queda NO_REMITIDO y la factura sale **sin QR** (el QR solo
se pone si el registro se remite). El QR: nivel M, 32 mm, «QR tributario:» encima y «VERI*FACTU»
debajo, arriba y centrado en la primera hoja. Las facturas importadas de AppSheet **no** se encadenan:
no las generó este sistema. Antes de encenderlo hay que firmar la declaración responsable del sistema
(es software propio: `SISTEMA` en verifactuService) y poner el certificado de la sociedad en el
servidor.

**REGLA — lo que emiten los CEE directos y la gestión CAE también entra en el registro.**
`ceeFacturaService.emitir` y `facturaGestionCae.emitir` siguen emitiendo como siempre y, además, llaman
a `facturaService.registrarEmitida` (origen CEE_DIRECTO / GESTION_CAE; encadena VERI*FACTU); su PDF, sus
envíos y un cambio de fecha se anotan con `actualizarRegistrada` (un cambio de fecha deja dicho en el
registro que hay que subsanarlo) y su cobro con `marcarCobroPorNumero`. Todo best-effort: nunca tumba la
emisión. Esas facturas **se rehacen desde su expediente**; las de la gestión CAE también se cobran
allí (la remesa): desde la pestaña, 409. Con una COPIA del libro (las pruebas fijan
`APPSHEET_FACTURAS_SHEET_ID`) no se registra nada: `ES_LIBRO_REAL`.

**REGLA — una factura de un CEE directo es del CEE, se haga donde se haga, y cobrarla COBRA el CEE**
(25/10/2026, Fran: «tiene que haber vinculación entre uno y otro para saber que pertenece a lo mismo»).
Caso: la 26ING_89 nació en la pestaña del presupuesto 2026PCEE_5 y se envió desde aquí; la ficha de
2026CEE_61 seguía en «Factura enviada — Toca emitirla», porque todo el CEE (procedimiento, «toca
facturar», a quién se entrega, el «ya tiene factura» de su popup, el cobro) lee
`documentacion.facturas_emitidas`, y eso solo lo escribía su popup. Ahora:
- **El enlace**: `cee_directo_id`, que pone el presupuesto (`desdePresupuesto`) o, si no, el nº de
  expediente `{AAAA}CEE_{n}` escrito en la factura (`ceeDeExpediente`, al crear y al editar el borrador).
- **El reflejo**: al emitir, enviar o quedar rectificada, `reflejarEnCee` reescribe su copia de
  metadatos en la ficha del CEE (`ceeFacturaService.reflejarDeFacturacion`: `origen: 'FACTURACION'`,
  `factura_id`, envíos, PDF, estado) y anota el historial. Su PDF se sirve desde la pestaña; rehacerlo o
  cambiarle la fecha desde el popup del CEE, 409 (es de aquí). Una anulada por rectificativa no cuenta
  como la factura del encargo.
- **El cobro**: «Cobrada» de una factura con `cee_directo_id` (de la pestaña o del popup del CEE) llama a
  `ceeFacturaService.cobrarExpediente`, la MISMA función que «Marcar cobrado» de la ficha: el CEE queda
  cobrado (con la fecha elegida), sus facturas PAGADAS en la hoja y, con el registro subido, sale la
  entrega de los certificados (respeta `CEE_ENTREGA_AUTO`). El aviso lo dice («2026CEE_61 queda cobrado y
  se lanza la entrega»). Si el CEE tiene OTRA factura sin cobrar, 409: el CEE solo sabe «cobrado» o no y
  la daría por pagada también. «Deshacer» le quita la marca al CEE.
- **El mensaje**: al enviarla desde la pestaña sale el MISMO mensaje y al mismo destinatario que desde
  el popup del CEE (`previsualizarEnvio` → `ceeFacturaService.envioDeFacturacion`): dice en qué punto
  está el certificado y lleva el **enlace para subir el justificante de pago**. El genérico no lo
  llevaba y la 26ING_89 salió sin él. Al subirlo, el equipo recibe «Confirmar cobro» con el fichero: se
  mira en el banco y UN clic cobra el CEE y lanza la entrega. Subirlo **no** lo da por pagado (regla del
  procedimiento de los CEE directos: un justificante equivocado o falso soltaría los certificados).
La 26ING_89 se reflejó a mano el 25/10/2026 (era la única factura de la pestaña con CEE y sin reflejo).

**REGLA — con una COPIA del libro tampoco se archiva en la contabilidad REAL, y una prueba manda a la
papelera TODO lo que emite.** El 24/10/2026 aparecieron dos PDF «26ING_87» en «ING / FACTURAS VENTAS /
2026 / 10. OCTUBRE»: la buena, la de FONCADIA (honorarios de gestión CAE de 25RES060_73, emitida ese
día, fila 106 del libro), y otra a nombre de INERSOS creada el 19/10 a las 16:12. La segunda no era una
factura: `test_factura_gestion.js` emitió contra la copia del libro (que llegaba a la 86) mientras se
preparaba el commit `7409849a`, y como desviaba a su carpeta la variable vieja (`…_CAE_…`) en vez de
`CONTABILIDAD_FACTURAS_ING_FOLDER_ID`, el PDF cayó en la carpeta real; la prueba solo limpiaba la copia
y su carpeta. No estaba en el libro ni en la BD ni le llegó a nadie (WhatsApp y email simulados). Ahora
`archivarFacturaIngenieria`/`archivarFacturaAutonomo` se niegan a escribir en las raíces reales sin el
libro real (`soloConLibroReal`) y la prueba manda a la papelera la copia de contabilidad y la de «5.
FACTURAS» del expediente. El PDF de prueba se apartó a «_DUPLICADOS Y NO CONTABLES» con su motivo en el
nombre; la serie sigue en la 26ING_87 y la siguiente libre es la 88.

**REGLA — el PDF va en hojas de alto FIJO y se MIDE: `check_factura_paginas.mjs`.** La plantilla es la
réplica de AppSheet (idéntica píxel a píxel en una factura de CEE) con lo nuevo: sin la marca BROKERGY
en la FML, «Total factura» + «Retención IRPF (x %)» + «Total a pagar» con IRPF, el bloque de la
rectificada, la fecha de operación y el QR. Medido el 24/10/2026: la primera hoja gasta **432 px** antes
de la primera fila (AppSheet estimaba 384) y la fila «Página 1 de N» hay que contarla; con eso se
recalibraron los altos y se pagina en dos pasadas. Siete estilos de 1 a 60 líneas: «Ninguna hoja
desborda (420 facturas medidas)». Tras tocar la plantilla: el medidor y `test_factura_cee.js`.

**La vista previa, a la vista y con «Descargar PDF»** (25/10/2026, Fran: «que tengamos la
previsualización directamente del pdf, igual que el ppto»). Estaba escondida en el «···». Ahora el pie
del editor lleva el botón «Vista previa», como el del presupuesto (en el móvil, solo el icono): en un
borrador, en cuanto tiene una partida, y en una emitida, siempre. El visor (`VistaPreviaA4`) trae
«Descargar PDF», que baja el PDF de verdad:
- **una emitida**: el PDF ARCHIVADO (`GET /facturas/:id/pdf`), el mismo que recibe el cliente;
- **un borrador**: lo que hay AHORA en el editor, sin guardar, pintado por el servidor
  (`POST /facturas/vista-previa/pdf` → `facturaService.pdfVistaPrevia`, `adminOClaveInterna`). Sale sin
  número, y no se guarda ni se archiva nada.

Esa ruta va declarada ANTES que `POST /facturas/:id/pdf` (rehacer el PDF), o «vista-previa» se leería
como un id. «Ver el PDF» del «···» pasa a llamarse «Abrir el PDF archivado».

**El histórico de AppSheet.** `importarLibro` (botón «Importar de AppSheet» o el script) trae las dos
series con origen APPSHEET, en seco por defecto; una que ya está no se toca salvo el cobro (mientras
AppSheet conviva, la hoja manda en ESTADO). Las cifras que se guardan son las de la HOJA y, si sus
líneas no suman lo mismo, se avisa. Leído el 24/10/2026: **18 FML y 105 ING, todas cuadran al
céntimo**, después de corregir el lector: las cinco primeras de 2025 (25ING_2 a _6) guardan el
descuento como IMPORTE en euros (100 = 100 € sobre 200) y no como fracción; leído como % eran 10.000 %.

**Duplicar la del mes.** La FML es la misma cada mes: `duplicar` crea un borrador con fecha de hoy y el
MES del concepto y de la fecha de operación avanzado uno («septiembre 2026» → «octubre 2026»;
diciembre pasa a enero del año siguiente).

**Quién la ve.** Las facturas, solo ADMIN (rutas con `adminOClaveInterna`: el MCP entra con la clave
interna); cambiar un emisor e importar el histórico, `adminOnly`. Un TRABAJADOR ve presupuestos y
artículos, no facturas.

#### El listado y el editor de facturas en «carta de pago» (24/10/2026)

Mismo encargo que el de los presupuestos (regla 164 y la auditoría de uso; ver «El listado y el editor
en carta de pago» en [presupuestos-con-partidas.md](docs/conocimiento/facturacion/presupuestos-con-partidas.md)).
Ficheros: [FacturasLista.jsx](implementation/frontend/src/features/facturacion/components/FacturasLista.jsx)
y [FacturaModal.jsx](implementation/frontend/src/features/facturacion/components/FacturaModal.jsx)
(que exporta también `CobroDialog`, `RectificarDialog`, `ChipEstado` y `EtiquetaOrigen`; «Para hoy» usa
el mismo `CobroDialog`).

**Los chips.** «Por emitir» (borradores) · «Por cobrar» (el de entrada) · «Vencidas» · «Cobradas» ·
«Rectificativas» · «Todas», y dos interruptores de serie, ING y FML (URL `serie`). El listado se pide
una vez (`GET /facturas`) y se filtra en el navegador. `/` lleva al buscador; «+ Nuevo» y la N son del
armazón (el listado abre el editor con `nuevo=ING|FML` o `abrir={id}`).

**REGLA — «Por cobrar» no tiene año: lo que se debe se debe desde cuando sea.** Sale la más antigua
primero, con «emitida hace N d» y «venció hace N d», y arriba el total, lo vencido y cuatro tramos por
antigüedad desde la FECHA de la factura: 0-30, 31-60, 61-90 y más de 90 días (en ámbar, nunca en rojo).
Medido el 24/10/2026: **18.023,49 € en 17 facturas, 13.229,05 € vencido en 11**; tramos 4.794,44 /
2.385,00 / 2.728,09 / 8.115,96 €; la más antigua, 25ING_1, emitida hace 644 días. Con la API caída, el
aviso de error y nunca un 0,00 € (regla 38). El selector de periodo (`t`: `AAAA`, `AAAA-Tn` o `todo`;
por defecto el año en curso) **solo sale en Cobradas, Rectificativas y Todas**, y Cobradas filtra por la
fecha de COBRO (`fecha_pago`), no por la de emisión. Al buscar, la búsqueda cruza el chip de entrada y
el periodo.

**Cada fila dice lo que toca**, y lo demás va en «···»: borrador → «Emitir»; de un CEE directo o de la
gestión CAE sin cobrar → «Ir al CEE» / «Ir al expediente» (se cobran allí: la pestaña responde 409); de
la app y sin enviar → «Enviar»; pendiente → **«✓ Cobrada»**. El chip de origen solo sale en las de
fuera (CEE directo, gestión CAE): «APPSHEET» en casi todas las filas era ruido. «Sin enviar» solo en
las de origen APP (lo importado se envió desde AppSheet).

**Cobrar en un toque.** «✓ Cobrada» la marca cobrada HOY (`POST /facturas/:id/cobro`
`{ pagada: true, fecha: hoy }`, como el diálogo) y saca un aviso con **«Deshacer»** (la vuelve a
pendiente, sin preguntar: es deshacer lo que se acaba de hacer) y **«Cambiar fecha»** (abre el
diálogo). Cobrada otro día: «···» → «Cobrada otro día…», o «Marcar cobrada» en el editor; el diálogo
trae Hoy / Ayer y no deja una fecha futura. Antes eran cuatro gestos (abrir, cobrar, fecha, confirmar).

**El editor** es el mismo panel lateral que el del presupuesto (720 px, no se cierra al pulsar fuera).
La **serie se elige una vez**, en un chip de la cabecera con su menú (en una rectificativa no se
cambia). El **número previsto** sale en la cabecera («Se emitirá como 26ING_88»: `GET
/facturas/proximo` con serie, tipo y fecha) y se vuelve a pedir al pulsar Emitir («Preparando…») para que
la confirmación diga el número; es una PREVISIÓN: el de verdad lo da el libro al emitir. Una FML nueva
sin cliente se factura a la sociedad: el cliente sale de los datos del emisor ING. Los errores van junto
a su bloque, y sin cliente o sin partidas basta UNA frase (no «falta el nombre», «falta el NIF» y
«falta el cliente» a la vez). **UNA acción principal**: en borrador, «Emitir 26ING_88 · total» o lo que
falta («Elige el cliente», «Falta el emisor»); emitida, «Enviar al cliente» (de la app y sin enviar) →
«Marcar cobrada» → «Ver el PDF». Tras emitir, el resumen trae dentro «Enviarla al cliente» (regla
29.d): sigue siendo otro gesto, con su borrador a la vista en `SendActionOverlay`.

**Rectificar por partidas.** El diálogo trae una casilla por partida y «Todas» arriba, y el **motivo**
se pregunta una vez (es obligatorio y sale en la rectificativa). R4 por defecto; R1 (impago, descuento
o devolución, art. 80 LIVA) a un clic. Con todas marcadas no se mandan líneas y el servidor la copia
entera en negativo (`lineasRectificativa`); con una parte, se mandan solo esas, ya en negativo. Nace
BORRADOR: el editor se abre con una nota de lo que lleva, y hay que revisarla y emitirla.
