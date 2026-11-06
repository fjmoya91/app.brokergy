<!-- conocimiento · área: informes · las rutas de los enlaces son relativas a la raíz del repo -->

### INFORMES técnicos — `{AAAA}INF_{n}`: todo lo que no es CAE ni CEE (2026-11-05)

**Por qué.** Fran hace, además del CAE y de los CEE directos, memorias para el Ayuntamiento
(bonificación del IBI o del ICIO, licencias), legalizaciones, informes técnicos y consultorías. Hasta
hoy no tenían sitio en la app: se presupuestaban en Facturación y, al aceptar, «no nacía nada» (regla
165); el seguimiento, la firma, la factura y la entrega iban a mano, por WhatsApp. Fran, 05/11/2026:
«envío de oferta, aceptación, memoria, firma, factura, pago, envío de memoria», todo en la app y
**100 % digital** para el cliente, «tipo la app CEE». Sus cuatro decisiones, literales:

1. «Que para las memorias y los informes sea el mismo 2026INF_n. **Será todo lo que no sea CAE ni CEE.**»
2. «**Carpeta de primer nivel.**» (y reestructurar «Mi unidad», que es otra tarea).
3. El cobro: «**confirmo yo con clic**».
4. Lo que se entrega: «**solo lo firmado**».

| Qué | Dónde |
|---|---|
| Tabla `informes`, numeración, RPC de merge, columnas `informe_id` en `cee_ofertas` y `facturas_emitidas`, `articulos.genera = 'INFORME'` | [scripts/informes_schema.sql](implementation/backend/scripts/informes_schema.sql) |
| Tipos, clases de fichero, nombres, documentación que se pide, ESTADO y PASOS (fuente única, pura) | [utils/informeEstados.js](implementation/backend/utils/informeEstados.js) |
| Carpetas de Drive | [services/informeFolders.js](implementation/backend/services/informeFolders.js) |
| Alta, subidas, firma, factura, cobro, entrega, vista del cliente | [services/informeService.js](implementation/backend/services/informeService.js) |
| Rutas del equipo | [routes/informes.js](implementation/backend/routes/informes.js) → `/api/informes` |
| Rutas del cliente (por token) | [routes/informesPublic.js](implementation/backend/routes/informesPublic.js) → `/api/public/informe/:token` |
| Pantallas | pestaña **CEE directos** (título «CEE directos e informes»): filas con la pastilla violeta «Informe» o rosa «CIT», «+ Nuevo informe» / «+ Nuevo CIT», la ficha `InformeDetailView` (`?informe=<id>`); el cliente, `/informe/:token` (`InformeClienteView`, `/informe/demo` y `/informe/demo-cit`) |
| La línea CIT (certificado de instalación térmica) | [scripts/informes_lineas_cit.sql](implementation/backend/scripts/informes_lineas_cit.sql) y la sección «La segunda línea» de abajo |
| Pruebas | `node implementation/backend/scripts/test_informes.js` |

#### Numeración y tabla

**REGLA — un informe NO va en `expedientes` ni en `cee_directos`: tiene su tabla, `informes`, y su
número `{AAAA}INF_{n}`** (correlativo por año, lo pone un trigger con candado: dos altas a la vez no
repiten número). Un `tipo` (`MEMORIA_AYUNTAMIENTO`, `LEGALIZACION`, `INFORME_TECNICO`, `AUDITORIA`,
`CONSULTORIA`, `OTRO`) solo cambia la etiqueta, el título por defecto y la documentación que se le pide
al cliente; el circuito es el MISMO para todos. La tabla nace con RLS sin policies y el `GRANT` a
`service_role` (regla 150); `documentacion` e `historial` se escriben con sus RPC
(`merge_informe_doc_json`, `append_informe_historial`), nunca leyendo y reescribiendo (reglas 19 y 21),
y el listado pide columnas sueltas (regla 22).

#### Drive

**REGLA — la carpeta raíz es de PRIMER NIVEL: `54. INFORMES TECNICOS`** (o `DRIVE_INFORMES_FOLDER_ID`),
con una carpeta por informe, `{nº} - {CLIENTE}`, y tres subcarpetas: `1. INFORME` (borrador, final y
firmado), `2. DOCUMENTACIÓN` (lo que sube el cliente) y `3. PRESUPUESTO Y FACTURAS` (el presupuesto
aceptado, las facturas y el justificante). **Ninguna ruta de carpeta llega del navegador**: el servidor
coloca cada fichero por su CLASE y le pone su nombre (`{nº} - {TÍTULO}.pdf`, `… (BORRADOR).pdf`,
`…_fdo.pdf`). Una versión nueva de una clase fija archiva la anterior en `OLD`. Un fichero solo se sirve
si está dentro de las carpetas de ESE informe.

#### El circuito

| Paso | Lo que lo marca (sello) | Estado visible | Pelota |
|---|---|---|---|
| Aceptación | presupuesto aceptado o alta a mano | PTE. REDACCIÓN | nuestra |
| Redacción | `borrador_at` → `final_at` | EN REVISIÓN → PTE. FIRMA | nuestra |
| Firma | `firmado_at` (PDF con firma válida de Fran) | PTE. FACTURA | nuestra |
| Factura | `factura_numero` / `factura_enviada_at` | FACTURA SIN ENVIAR → PTE. PAGO | cliente |
| Pago | `justificante_at` → `cobrado` (clic de Fran) | PAGO RECIBIDO → COBRADO · PTE. ENTREGA | nuestra |
| Entrega | `entregado_at` | ENTREGADO | — |

**REGLA — el ESTADO se DERIVA de los sellos y lo escribe SOLO el servidor** (`refrescarEstado`, con
`derivar` de `informeEstados.js`); el navegador nunca manda un estado. Las facturas que cuentan son las
F1 EMITIDA/PAGADA (ni borradores, ni rectificadas, ni rectificativas).

**REGLA — subir un PDF FINAL nuevo deja SIN firmar el informe**: lo firmado ya no es lo último. El
firmado se comprueba con `leerFirmasPdf` (como el CEE): sin firma, 422; firma rota, 422; y se anota si
el firmante no es `INFORME_TECNICO_NOMBRE` (por defecto FRANCISCO JAVIER MOYA). Se firma desde la ficha
con AutoFirma (`FirmarConCertificadoModal`, ancla «El técnico redactor» / «Fdo.»).

**REGLA — la factura es la de la pestaña Facturación, enlazada por `informe_id`.** «Preparar factura»
crea el borrador desde el presupuesto aceptado (serie ING) o, sin presupuesto, uno con el nombre del
informe, y abre Facturación en ese borrador: emitir y enviar son los gestos de siempre (regla 166). El
texto del envío añade: «Por política de empresa, te enviamos el documento firmado una vez abonada la
factura» y el enlace del cliente para subir el justificante. Una factura con `expediente` = un
`{AAAA}INF_{n}` se engancha sola al informe.

**REGLA — subir el justificante NO cobra: avisa, y Fran CONFIRMA con un clic** (como en los CEE
directos). El aviso al equipo lleva `?informe=<id>&cobro=1`. Cobrar la factura en Facturación también
vale: cuando la última F1 emitida del informe queda PAGADA, el informe queda cobrado.

**REGLA — se ENTREGA SOLO lo firmado, a quien PAGA, y una vez.** Al quedar cobrado, la entrega se
dispara sola si `INFORME_ENTREGA_AUTO=true` (en local, APAGADO; `local_sin_envios.cjs` lo apaga); si no,
la hace la ficha con su popup (canales, texto editable, `SendActionOverlay`). La idempotencia se mira
ANTES que nada, el PDF se vuelve a descargar y a comprobar su firma antes de mandarlo, y el destinatario
es el de la factura (si no hay, el cliente). «Entregar sin cobrar» es solo de ADMIN.

#### El cliente

**REGLA — el cliente tiene UNA página, `/informe/:token`, con el estilo «carta de pago» (regla 164)**:
qué pasa ahora con UNA acción protagonista (subir documentación, subir el justificante con el importe
de la factura, o descargar el firmado), la lista de documentación que se le pide según el tipo
(marcando lo ya subido) y los pasos. Descargar el firmado solo se puede con el informe cobrado. El
token es de 32 hex; malformado, 404 sin tocar la BD; con la BD caída, 503 (regla 38). Límite por IP en
lecturas y subidas; los ficheros se tipan por sus BYTES, no por la extensión (40 MB).

#### Cómo nace

- **Desde un presupuesto** (lo normal): un artículo del catálogo con «Abre expediente» = **Informe
  técnico (INF)** (`articulos.genera = 'INFORME'`). Al aceptarlo, nace el informe con el tipo deducido
  del concepto (`tipoDeConcepto`: «Ayuntamiento», «IBI», «ICIO», «licencia» → memoria para el
  Ayuntamiento; «legalización» → legalización…; editable en la ficha), el organismo «Ayuntamiento de
  {municipio}», el PDF de lo aceptado en `3.` y `cee_ofertas.informe_id`. El cliente ve su número y
  el botón «Subir mi documentación» en la misma pantalla de aceptación, y su confirmación lo lleva.
  Si el presupuesto lleva también un CEE, nacen los dos.
- **A mano**: «+ Nuevo informe» en la pestaña CEE directos.

⚠️ **Los artículos que ya existen (memorias, legalizaciones) hay que marcarlos «Informe técnico (INF)»**
en el catálogo después de aplicar el esquema: sin eso, sus presupuestos siguen sin abrir nada.

**Aplicado en producción el 05/11/2026** (con el «sí» de Fran): `informes_schema.sql` en Supabase
(migraciones `informes_schema` e `informes_revoke_anon`) y la carpeta `54. INFORMES TECNICOS` creada en
la raíz de «Mi unidad» (id `1Mi7nykHZeCt9cGAAS_zNGyJtZFlriPYX`; el 54 era el primer número libre tras
«53. GAL - ALTO GUADIANA»). Si el backend corre sin la tabla, `/api/informes` responde 503 y el listado
de CEE directos sale igual (los informes se piden aparte).

#### La segunda línea: `{AAAA}CIT_{n}`, el certificado de instalación térmica (2026-11-05)

Fran, el mismo día: «los RITES será otra línea más igual que CEE e INF, que será **CIT** de certificado
de instalación térmica». Y a las tres preguntas: la carpeta, «**dentro de la 39**»; el RITE de una obra
CAE, «**solo los sueltos**» (el de un expediente sigue en su slot «Certificado RITE» y lo presenta la
skill `presentar-rite` como siempre); lo que se entrega, «**solo el certificado**».

**REGLA — un CIT es un informe de la LÍNEA `CIT`: la MISMA tabla, el MISMO circuito y las MISMAS
pantallas, con su propio correlativo `{AAAA}CIT_{n}`.** `informes.linea` (`INF` por defecto, `CIT`); el
número lo pone `informe_numerar()` con un candado por año y línea, y el único es `(linea, correlativo)`
([scripts/informes_lineas_cit.sql](implementation/backend/scripts/informes_lineas_cit.sql), aditivo). La
línea la deciden el artículo (`articulos.genera = 'CIT'`, «Certificado instalación térmica (CIT)» en el
catálogo), el nº (`lineaDeNumero`, también para enganchar una factura por su `expediente`) o el alta a
mano («+ Nuevo CIT»); el tipo es siempre `INSTALACION_TERMICA` y no sale de su línea (`tipoValido`).

**REGLA — la carpeta de un CIT es `39. LEGALIZACIONES RITE / 2. PRODUCCION / {nº} - {CLIENTE}`** (o
`DRIVE_CIT_FOLDER_ID`; `informeFolders.raiz` recorre la ruta y la crea si falta), con `1. MEMORIA Y
CERTIFICADO`, `2. DOCUMENTACIÓN` y `3. PRESUPUESTO Y FACTURAS`. Lo que ya había suelto en la 39 no se
toca.

**REGLA — un CIT firmado PASA por la presentación antes de facturar.** Su circuito tiene un paso más:
memoria → firma de la memoria → **presentación en Industria (eDICE)** → factura → pago → entrega del
certificado. Firmado y sin `registrado_at`, el estado es **PTE. PRESENTACIÓN** (pelota nuestra). La
memoria la firma el **representante de la empresa instaladora** (no Fran como técnico): se firma con
AutoFirma desde la ficha o se SUBE firmada («Subir memoria firmada»), y en los dos casos pasa por
`leerFirmasPdf` (sin firma o rota, 422), sin comparar el firmante con Fran. La presentación la hace la
skill `presentar-rite`; el impreso sellado que devuelve eDICE (`GenerarPdf.pdf`) se sube como
**Certificado oficial (eDICE)** (clase `CERTIFICADO_OFICIAL`, `… (CERTIFICADO OFICIAL).pdf`): eso pone
`registrado_at` y avisa al equipo de que toca facturar. Si el fichero desaparece de Drive, el sello se
quita al volver a leer los documentos.

**REGLA — de un CIT se entrega SOLO el certificado oficial, y solo cobrado.** `entregable()` devuelve el
`CERTIFICADO_OFICIAL` (un CIT sin registrar no tiene qué entregar) y la entrega comprueba que es un PDF;
el resto (a quien paga, una vez, `INFORME_ENTREGA_AUTO`) es lo de los informes. En la página del
cliente: «Tu certificado registrado» y «Descargar el certificado» (`/informe/demo-cit`). La pastilla del
listado dice **CIT** (rosa) en vez de «Informe» (violeta).

**Aplicado en producción el 05/11/2026** (con el «sí» de Fran): `informes_lineas_cit.sql` en Supabase
(probada la numeración en una transacción deshecha: `2026INF_1`, `2026CIT_1`, `2026CIT_2`) y creada la
carpeta `39. LEGALIZACIONES RITE / 2. PRODUCCION`. ⚠️ El backend de PRODUCCIÓN aún es el anterior: hasta
desplegar, el VPS no conoce la línea CIT (la columna nueva tiene valor por defecto, así que no se rompe).

## El primer caso real: 2026INF_1 (MANUEL EUGENIO SÁNCHEZ, Valdepeñas)

Memoria para la bonificación del IBI de 26RES060_OP310. Su presupuesto **P-26ING_45** se aceptó el
30/10, **antes** de que el artículo «Memoria técnica de actuación» llevara `genera: 'INFORME'`, así que no
abrió informe. Se abrió el 05/11 con un script de un solo uso que hace lo mismo que la aceptación
(`desdePresupuesto` con esa partida marcada), en seco primero: tipo MEMORIA_AYUNTAMIENTO,
«Ayuntamiento de Valdepeñas», PDF del presupuesto en «3. PRESUPUESTO Y FACTURAS», **la factura en
BORRADOR que el agente ya había preparado el 03/11 enlazada** (`informe_id`; `facturar()` habría hecho
otra), y la memoria final (PDF y Word) subida por `subir()`. Quedó en **PTE. FIRMA**.

Lo que enseñó: **con la versión FINAL hecha, la página del cliente ya no pide documentación**
(`pideDocumentacion` mira `final_at`, no solo `firmado_at`): pendiente solo de la firma, le seguía
pidiendo «el presupuesto del instalador».

**06/11/2026 — firma, prueba del circuito entero y factura.** La firmó Claude a petición de Fran
con su certificado **PERSONAL** (MOYA LOPEZ FRANCISCO JAVIER, el técnico redactor; el de representante
de Brokergy es para lo que firma la empresa), sin ventana (`AutofirmaCommandLine` por huella, como
`firmar_cee.js`), en el recuadro «El técnico redactor» de la hoja 8, comprobada con `leerFirmasPdf`
antes de `guardarFirmado`. ⚠️ El `-config` de AutoFirma va con `\n` LITERAL entre claves: con saltos de
línea reales ignora TODO (firma invisible en la hoja 1, rect 0,0,0,0) aunque la firma sea válida.

Antes de mandarle nada a Eugenio, Fran quiso verlo como cliente: **2026INF_PRUEBA** (copia con un
cliente de prueba a su teléfono, `correlativo 0` para no mover la numeración, factura `PRUEBA-2026INF`
marcada EMITIDA a mano, sin hoja, sin contabilidad ni VERI*FACTU), con los envíos por las rutas de
PRODUCCIÓN (clave interna). Recorrido entero: factura por WhatsApp → justificante desde el enlace →
cobro en Facturación → entrega (apagada la automática, `INFORME_ENTREGA_AUTO`: se lanza a mano). Lo que
salió y se corrigió:

- **REGLA — lo que se le dice al cliente CONCUERDA con lo que se entrega**: «tu memoria… ya está
  terminado y firmado» → `concuerda()`/`esFemenino()` en `informeService` (memoria, legalización,
  auditoría, consultoría en femenino).
- El saludo decía «tu memoria para el Ayuntamiento de CL CALDEREROS 15»: ahora «memoria para el
  Ayuntamiento de Valdepeñas, en …» (`queEs`), y el último paso es «Entrega del documento firmado».
- **REGLA — subido el justificante, la página CAMBIA ENTERA a «¡Perfecto, {nombre}! Estamos comprobando
  tu pago»** (Fran: se quedaba en la misma tarjeta con un recuadro verde y no se sabía si había
  terminado): check animado, a dónde le llegará —WhatsApp y email **enmascarados** (`entregaPor` de
  `vistaCliente`, «··· 623», «e···@gmail.com»: el enlace es de token, no de sesión)—, que también podrá
  descargarlo ahí, la factura en pequeño y «¿Te has equivocado de archivo? Sube otro». Sube al principio
  de la página. Banco de pruebas: `/informe/demo-recibido`.

La factura real, **26ING_94**, se emitió y envió (WhatsApp + email) el 06/11 con el «sí» de Fran.
⚠️ Salió con la FECHA DEL BORRADOR (03/11) y la 26ING_93 es del 06/11: `emitir()` conserva la fecha del
borrador. Pendiente de decidir con Fran.
