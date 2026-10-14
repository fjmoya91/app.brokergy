<!-- conocimiento · área: cee-directos · origen: sesión del 2026-10-14 · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El PROCEDIMIENTO: de la oferta a la entrega (2026-10-14)

Hasta aquí había piezas sueltas (oferta, factura, aviso de «registrado», candado de
cobro, entrega automática) y cada encargo se cobraba en un momento distinto: factura
antes de presentar, con el inicial ya registrado o al llegar el final. El usuario
fijó el camino normal, que la app sigue SIEMPRE, y dejó los atajos para una persona.

| # | Paso | Quién mueve | Qué hace la app |
|---|---|---|---|
| 1 | Presupuesto enviado y **aceptado** | Cliente | Nace el expediente (ver «La OFERTA») |
| 2 | CEE inicial (o único) **FIRMADO y con VISTO BUENO** | Técnico / nosotros | Aviso al equipo «toca emitir la factura» con `?cee=<id>&facturar=1`, que abre el popup de la factura |
| 3 | **Factura** emitida y enviada | Nosotros | El mensaje dice que el certificado está hecho y firmado, y lleva el **enlace para subir el justificante** (`/subir-cee-docs/:id?need=JUSTIFICANTE_PAGO`). En un DOBLE cubre los dos certificados |
| 4 | El cliente **sube el justificante** | Cliente | Aviso al equipo con el fichero y `?cee=<id>&cobro=1` → popup **«Confirmar cobro»** |
| 5 | **Confirmar cobro** (un clic) | Nosotros | Cobrado + factura PAGADA en la hoja + entrega automática si ya está registrado |
| 6 | **Entrega**: firmado, registro, etiqueta, tasa (si está) y guía | Sola | En un DOBLE, con el enlace para subir la **factura de la instalación** |
| 7 | (DOBLE) El cliente **sube la factura de la instalación** | Cliente | Aviso al equipo «ya puedes encargar el CEE final». Hasta entonces la pelota del final es del **CLIENTE** |
| 8 | (DOBLE) CEE final registrado | Técnico | Ya cobrado: la entrega del final sale sola |

El registro del inicial va **en paralelo** al cobro (paso 2 → presentar), y la entrega
sale cuando coinciden las dos mitades, como siempre (ver «La entrega al cliente se
dispara SOLA»).

**REGLA — la factura se propone con el certificado FIRMADO y con el VISTO BUENO**
(decisión del usuario): la fase REVISADA o ya registrada, o —certificador de la casa,
que no se valida aparte— el encargo de presentarlo hecho. Firmado sin revisar no:
se facturaría un certificado que puede haber que rehacer. Lo comprueba
`firmadoConVistoBueno` y lo disparan los TRES sitios donde se completa: el visto
bueno (`approve-cee`), el encargo de presentar (`presentacionCeeService.guardarEncargo`)
y la subida del PDF firmado (rejilla y enlace del técnico). Avisa UNA vez por encargo
(`documentacion.aviso_facturar`) y no si ya hay factura o está cobrado.

**REGLA — subir el justificante NO marca cobrado: se avisa y una persona lo CONFIRMA**
(decisión del usuario). Un justificante equivocado o falso liberaría los
certificados; el popup lo enseña y recuerda mirarlo en el banco. Confirmar es el
mismo `PATCH /:id/cobrado` del botón de la cabecera.

**REGLA — el justificante va a «3. PRESUPUESTO Y FACTURAS» y el técnico no lo ve.**
Es un apartado del MISMO enlace del cliente (`ceeDirectoDocsService`,
`JUSTIFICANTE_PAGO`, solo cuando hay factura emitida), pero `vista()` lo quita salvo
con `conPago` (el enlace del cliente y el equipo; nunca la ficha del técnico ni su
página del encargo) y se guarda donde se guardan los importes, que no se hace
público. La factura de la instalación (`DOC_FACTURAS`, solo DOBLE) sí va a
«4. DOCUMENTACIÓN PARA CEE»: dice qué equipos se han puesto, que es lo que modela el
CEE final. El buzón de fotos no propone ninguno de los dos (`checklist()` sin fila).

**REGLA — con la factura YA enviada, el aviso de «registrado» la RECUERDA**
(`facturaPendiente` en `ceeDirectoRegistradoClienteMsg`), con el enlace del
justificante; no anuncia otra ni dice «te enviaremos nuestra factura». Y el aviso al
equipo al registrarse (`siguienteTrasRegistro`, las tres superficies) dice «falta el
pago» en vez de ofrecer emitirla.

**Los atajos** (de una persona, nunca del automático): «Generar factura» cuando se
quiera; «Avisar al cliente» al registrarse, con o sin factura; y **«Entregar sin
esperar al pago»** en el panel de entrega (solo ADMIN, con confirmación, cuando lo
único que falta es el cobro: `sinCobro` en `POST /:id/entrega`; queda sellado
`sin_cobrar` y en el historial).

**El panel «Procedimiento»** de la ficha (`ProcesoCee.jsx`, `GET /:id/proceso`) pinta
los pasos con su estado, de quién es la pelota y el gesto de lo que toca hoy
(emitir la factura, confirmar el cobro), más los dos enlaces del cliente para
copiar. Importes, enlaces y justificante solo para ADMIN. Fuente única:
[ceeDirectoProceso.js](implementation/backend/services/ceeDirectoProceso.js).

⚠️ Los avisos del procedimiento van al EQUIPO (`WHATSAPP_ADMIN_CHAT` y
`ADMIN_EMAIL`), también desde local; al cliente este servicio no le escribe nunca.

Prueba (sin BD ni red): `node implementation/backend/scripts/test_proceso_cee_directo.mjs`.
