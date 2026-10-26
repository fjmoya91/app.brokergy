---
paths:
  - "implementation/frontend/src/features/facturacion/**"
  - "implementation/backend/routes/facturacion.js"
  - "implementation/backend/services/{presupuestoService.js,facturaService.js,verifactuService.js,facturaSheetService.js,contabilidadService.js,gastosDrive.js,facturaContabilidad.js,tipoCambio.js,cuotasAutonomo.js}"
  - "implementation/backend/scripts/{facturacion_schema.sql,sembrar_articulos.js,test_presupuesto_partidas.mjs,check_presupuesto_paginas.mjs,test_facturas.mjs,check_factura_paginas.mjs,importar_facturas_appsheet.js,test_contabilidad.mjs,facturacion_cli.js}"
---
# Facturación — presupuestos con partidas, catálogo de artículos y facturas propias (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/facturacion/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

165. **Un presupuesto con PARTIDAS se calcula en UN sitio y su esquema es ADITIVO** (2026-10-24, Fran: «quitarme de la aplicación de presupuestos y facturas de AppSheet»). Las líneas, lo que arrastra cada artículo (el CEE trae su tasa), las variantes, el saneado y los totales salen de [logic/presupuesto.js](implementation/frontend/src/features/facturacion/logic/presupuesto.js), que usan el editor, el backend (por import() ESM), el MCP y la página donde acepta el cliente: **IVA redondeado POR LÍNEA**, y un **SUPLIDO** (tasa) va sin IVA y sin descuento aunque la línea diga otra cosa (art. 78.Tres.3º LIVA). El servidor guarda las líneas saneadas y recalcula `neto`/`iva`/`total`/`concepto`; nunca se fía de las cifras del navegador. La tabla sigue siendo **`cee_ofertas`** (no se renombra: el backend de producción la usa) y todo lo nuevo es aditivo: sin `lineas`, una oferta antigua se lee con sus columnas de siempre y numera `{AAAA}PCEE_{n}`; con `lineas`, `P-{YY}ING_{n}` (la serie de AppSheet, `presupuestos_ing_seq` desde 40). Un presupuesto **nace BORRADOR** (sin enlace público) y enviarlo es otro gesto; si no sale por ningún canal, se queda en borrador. `alcance` sale de las líneas (`genera` del artículo): sin certificado es NULL y al aceptar **no nace expediente** (se avisa al equipo y al cliente). El PDF va en hojas de alto FIJO que recortan en silencio: los altos de `buildOfertaCeeHtml` se CALCULAN con lo medido (`lineasTexto`: anchos reales de Manrope; cada bloque, su alto en Chrome), sin saltos de hoja que no hagan falta —cuatro partidas caben en UNA hoja (25/10/2026, Fran)—, y los topes de lo que no se parte (300/600 por partida, 2.000 las observaciones) se comprueban con el medidor. **Las observaciones son SOLO el texto libre PARA EL CLIENTE** (25/10/2026, Fran): a la vista en el editor, vacías por defecto, en el PDF y en la página de aceptación («A tener en cuenta»); la política de entrega (`CONDICIONES_PRESUPUESTO`) sale SIEMPRE aparte, y una fila con esa política guardada como observaciones se lee vacía (`observacionesCliente`), o saldría dos veces. Tras tocarlo: `node implementation/backend/scripts/test_presupuesto_partidas.mjs`, `test_oferta_cee.mjs` y `check_presupuesto_paginas.mjs`. Ver "Presupuestos con PARTIDAS".

166. **Una FACTURA nace BORRADOR, se EMITE con número y desde ahí NO se borra ni se cambia: se RECTIFICA; y cada emitida entra en la cadena de VERI*FACTU de su emisor** (2026-10-24, Fran: «sigue con las facturas desde la app… termina todo»). El cálculo es UNO, [logic/factura.js](implementation/frontend/src/features/facturacion/logic/factura.js): el **IRPF se resta** del total a pagar (FML: 2.250 + 472,50 − 337,50 = 2.385 €) y el `ImporteTotal` de VERI*FACTU va **sin suplidos ni retención**. Series: **ING** (BROKERGY) y **FML** (Fran a la sociedad, 15 % de IRPF); las ordinarias las sigue numerando el libro de AppSheet mientras conviva (pestañas `FACTURAS FML`/`DETALLE FACTURA FML` para la FML) y las rectificativas, la tabla: `R-{YY}{SERIE}_{n}`, R4 por defecto y R1 para el art. 80 LIVA, con la factura rectificada y el motivo (art. 15 RD 1619/2012). Al emitir se guardan las FOTOS del cliente (la ficha de ESE día, con lo tecleado solo para esa factura —`cliente_propio`— encima: nunca la copia vieja del borrador) y del emisor. **Los datos de una persona física (DNI, IBAN de la FML) van en `facturacion_emisores`, nunca en el código** (repo público). La huella SHA-256 se encadena a la anterior del MISMO NIF (`vf_nif`, `vf_orden` único) — también lo que emiten `ceeFacturaService` y `facturaGestionCae`, que llaman a `facturaService.registrarEmitida` (best-effort; con una COPIA del libro no se registra: `ES_LIBRO_REAL`); lo importado de AppSheet NO se encadena. **Una factura de un CEE directo es del CEE, se haga donde se haga** (25/10/2026, 26ING_89 de 2026CEE_61): la de la pestaña con `cee_directo_id` (de su presupuesto o de su nº de expediente) se REFLEJA en `documentacion.facturas_emitidas` del CEE al emitirla, enviarla o rectificarla (`reflejarEnCee`), sale con el MENSAJE del CEE —el que lleva el enlace para subir el justificante— (`envioDeFacturacion`), y cobrarla —desde la pestaña o desde el CEE— llama a `ceeFacturaService.cobrarExpediente`, la misma función que «Marcar cobrado»: CEE cobrado, facturas PAGADAS y entrega de los certificados; con otra factura del CEE sin cobrar, 409. La de la gestión CAE se cobra en su expediente. **Con una COPIA del libro tampoco se archiva en la contabilidad REAL** (`soloConLibroReal` en [facturaContabilidad.js](implementation/backend/services/facturaContabilidad.js)) y las pruebas mandan a la papelera TODO lo que emiten: el 19/10/2026 `test_factura_gestion.js` dejó en «ING / FACTURAS VENTAS / 10. OCTUBRE» un PDF de prueba con el número 26ING_87, que el 24/10 tuvo de verdad la de FONCADIA (el de prueba está en «_DUPLICADOS Y NO CONTABLES»). El envío a la AEAT y el QR están APAGADOS hasta tener el certificado (`VERIFACTU_ENVIO_ENABLED`): sin remitir, la factura sale sin QR. Emitir y enviar son dos «sí» distintos (en el MCP, `emitir_factura` revisar → emitir; `enviar_factura` borrador → enviar). **Un presupuesto se factura UNA vez**: `facturasDelPresupuesto` mira lo que nació de él, lo emitido por su CEE directo (`cee_directo_id`) y lo que solo consta en la FICHA de ese CEE (`documentacion.facturas_emitidas`): las importadas de AppSheet llegaron sin el enlace, y el 24/10/2026 la app ofrecía facturar otra vez 2026PCEE_1/3/4/6/7/8, ya facturados (26ING_78–86). Facturas solo ADMIN (`adminOClaveInterna`). El PDF se MIDE: primera hoja 432 px antes de la primera fila. Tras tocarlo: `node implementation/backend/scripts/test_facturas.mjs`, `check_factura_paginas.mjs` y `test_factura_cee.js`. Ver "Facturas desde la app".

170. **El cuadro de mando y el cierre trimestral separan a los DOS contribuyentes y todo es ESTIMADO; los gastos se leen de Drive solo con un gesto, y el paquete para la gestoría COPIA, nunca mueve** (2026-10-24, Fran: «que esté conectada con las carpetas de pagos, cobros… para que pueda hacer los trimestres inmediatamente»). La SOCIEDAD (ING + CAE de `facturas_so`) y el AUTÓNOMO (FML) no se suman nunca: una FML es venta de Fran y GASTO de la SL (con su IVA deducible y la retención que va al 111), y sus cifras salen siempre de `facturas_emitidas`, no de leer su PDF. El cálculo (303 con la ISP devengada y deducida UNA vez, 111, 349 solo con NIF-IVA de un Estado miembro, 130) y el criterio fiscal de cada gasto (combustible al 50 %, ticket sin NIF sin IVA, otra moneda al cambio del BCE del día de la factura —art. 79.Once LIVA, `tipoCambio.js`—, nunca a lo cargado en la tarjeta) están en [contabilidadService.js](implementation/backend/services/contabilidadService.js). Para que salga la situación REAL: la cuota de autónomos y la del colegio son gasto del autónomo sacado de los EXTRACTOS del banco de «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO» ([cuotasAutonomo.js](implementation/backend/services/cuotasAutonomo.js); sin extracto de un mes ya cargado, ESTIMADA en ámbar con el cargo más cercano del mismo año), y las AUTOFACTURAS de Iberdrola/Naturgy de «CAE / FACTURAS VENTAS» que no están en `facturas_so` son venta de la SL en cuanto se leen (`ventaDeDrive`), sin contar dos veces lo que ya es una factura de la app; **su COBRO va en `brk_cobro_fecha` del propio fichero** (25/10/2026: solo lo escribe `cobroVentaDrive`, por `POST /ventas-drive/:fileId/cobro` adminOnly o un script; leerla otra vez o corregirla NO lo borra), y sin él cuenta en «Te deben» de cualquier año, nunca como vencida. **Nada cobrado se queda como debido sin decirlo**: un lote en «PTE. PAGO BROKERGY A CLIENTE» o FINALIZADO con su factura al S.O. sin cobrar es un aviso ámbar del cuadro (`avisosLotesSinCobro`; F-2026CAE_8/9/10 salían como 183.805 € debidos), y con ventas CAE de Drive del año anterior sin leer el titular no compara (`comparacionAnterior`: «87 veces lo de 2025» era con 2025 incompleto). La actividad de un gasto de la SL va como el T3 a mano (`actividadDe`: lo propio de CAE en CAE, lo general y lo de ING en COMUNES; «B - ING» solo a mano). **El modelo de IA solo LEE** y lo leído viaja en las `appProperties` del propio fichero (`brk_*`, sin tabla), con su md5: no se relee lo que no cambia y solo se lee con `POST /gastos/leer`, nunca al abrir la pantalla. El paquete reproduce «ENTREGA GESTORÍA / {AAAA-Tn (mes-mes)}» del T3 hecho a mano (E-/R-/O-/AE-/AG- y el libro de ocho hojas), no duplica lo que ya está y no pisa un libro existente; con la clave interna solo en seco (`?seco=1`). La FML emitida se archiva en «FML - SERVICIOS AUTONOMO / VENTAS» y una copia, como gasto de la SL, en «ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS» en el mes que FACTURA (`archivarFmlComoGastoSl`). En pantalla (la pestaña es la excepción de la regla 164, prefijo `.fx-`): «Hoy» abre al ADMIN, el TRABAJADOR solo ve Presupuestos y Artículos, la FML nunca entra en «Facturado» de BROKERGY, y con la BD caída sale el aviso, nunca 0,00 € (regla 38). Tras tocarlo: `node implementation/backend/scripts/test_contabilidad.mjs`, `test_facturas.mjs` y `node implementation/frontend/scripts/check-hooks.mjs`; la pantalla se prueba en el banco `fx-demo-5186` (bloquea toda escritura: local = producción). Ver "Cuadro de mando y cierre trimestral" y "Cuadro de mando y trimestres en pantalla".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/facturacion/cuadro-de-mando-y-trimestres-en-pantalla.md` — Cuadro de mando y trimestres en pantalla: el armazón de Facturación, «Hoy» y «Trimestres» (2026-10-24) · 10,7 KB
- `docs/conocimiento/facturacion/facturas-desde-la-app.md` — Facturas desde la app: series ING y FML, rectificativas y VERI*FACTU (2026-10-24) · 19,7 KB
- `docs/conocimiento/facturacion/presupuestos-con-partidas.md` — Presupuestos con PARTIDAS: la pestaña Facturación sustituye a AppSheet (2026-10-24) · 22,4 KB
- `docs/conocimiento/facturacion/trimestres-y-contabilidad.md` — Cuadro de mando y cierre trimestral: dos contribuyentes, gastos leídos de Drive y el paquete para la gestoría (2026-10-24) · 22,2 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/facturacion/cuadro-de-mando-y-trimestres-en-pantalla.md`
  - **REGLA — el ADMIN abre en «Hoy» y lo ve todo; el TRABAJADOR solo Presupuestos y Artículos.**
  - **REGLA — lo que se ve vive en la URL, y al salir de la pestaña se limpia.**
  - **REGLA — dos contribuyentes que NO se mezclan también en pantalla.**
  - **REGLA — ningún componente vuelve a sumar lo que da la API.**
  - **REGLA — con la API caída, NUNCA un 0,00 € (regla 38).**
  - **REGLA — ámbar, nunca rojo.**
  - **REGLA — «Para hoy»: una fila por cosa y UN botón por fila.**
  - **REGLA — lo que casi seguro ya está cobrado y no se marcó, en «Para hoy» con UN botón (25/10/2026).**
  - **REGLA — el titular de la variación no presume con el año anterior incompleto (25/10/2026).**
  - **REGLA — leer gastos GASTA Gemini: se confirma diciendo cuántos.**
  - **REGLA — el paquete se enseña en SECO antes de escribir; montarlo escribe en el Drive de
PRODUCCIÓN.**
  - **REGLA — los enlaces a Drive, solo para ADMIN**
- `docs/conocimiento/facturacion/facturas-desde-la-app.md`
  - **REGLA — una factura se calcula en UN sitio, y la retención y los suplidos no son base.**
  - **REGLA — nace BORRADOR; EMITIR le da el número y desde ahí no se borra ni se cambia: se rectifica.**
  - **REGLA — numeración: las ordinarias, en el libro de AppSheet mientras conviva; las rectificativas,
en la app.**
  - **REGLA — una rectificativa dice a cuál rectifica y por qué**
  - **REGLA — los datos de Fran (FML) viven en la BD, no en el código.**
  - **REGLA — la cadena de huellas se guarda ya; el envío a Hacienda y el QR, cuando haya certificado.**
  - **REGLA — lo que emiten los CEE directos y la gestión CAE también entra en el registro.**
  - **REGLA — una factura de un CEE directo es del CEE, se haga donde se haga, y cobrarla COBRA el CEE**
  - **REGLA — con una COPIA del libro tampoco se archiva en la contabilidad REAL, y una prueba manda a la
papelera TODO lo que emite.**
  - **REGLA — el PDF va en hojas de alto FIJO y se MIDE: `check_factura_paginas.mjs`.**
  - **REGLA — «Por cobrar» no tiene año: lo que se debe se debe desde cuando sea.**
- `docs/conocimiento/facturacion/presupuestos-con-partidas.md`
  - **REGLA — una partida se calcula en UN sitio: `logic/presupuesto.js`.**
  - **REGLA — un SUPLIDO (las tasas) va sin IVA y sin descuento**
  - **REGLA — la tabla es `cee_ofertas` y no se renombra; todo el esquema es ADITIVO.**
  - **REGLA — numeración: la serie de AppSheet sigue en la app.**
  - **REGLA — nace BORRADOR; enviarlo es otro gesto.**
  - **REGLA — las hojas se MIDEN, no se dan por buenas: `check_presupuesto_paginas.mjs`.**
  - **REGLA — sin saltos de hoja innecesarios: los altos se CALCULAN con lo medido, no «por lo alto»
(25/10/2026).**
  - **REGLA — `observaciones` es SOLO el texto libre para el cliente, y la política de entrega sale
SIEMPRE aparte.**
  - **REGLA — un presupuesto SIN certificado se acepta en la misma página y no abre expediente.**
  - **REGLA — «facturado» se decide con el MISMO criterio que `facturaService.facturasDelPresupuesto`
(regla 166), en lote.**
  - **REGLA — un presupuesto NUEVO no se autoguarda: guardar consume número.**
- `docs/conocimiento/facturacion/trimestres-y-contabilidad.md`
  - **REGLA — dos contribuyentes que NO se mezclan: la SOCIEDAD (líneas CAE e ING) y el AUTÓNOMO (FML).**
  - **REGLA — todo es ESTIMADO: los modelos los presenta la gestoría.**
  - **REGLA — la cuota de autónomos y la del colegio son gasto del autónomo y salen del BANCO, no de un
PDF**
  - **REGLA — el modelo solo LEE; el criterio fiscal lo aplica el CÓDIGO.**
  - **REGLA — una factura en otra moneda se pasa a euros al cambio del BCE del día de la factura**
  - **REGLA — a qué TRIMESTRE va un gasto: al MÁS TARDÍO entre el de su carpeta y el de su fecha.**
  - **REGLA — la ISP se devenga y se deduce UNA vez.**
  - **REGLA — el 349 de la SL: solo proveedores con NIF-IVA de OTRO Estado miembro, factura a factura**
  - **REGLA — los céntimos se redondean POR LÍNEA y como Excel.**
  - **REGLA — el PAQUETE reproduce el T3 hecho a mano; no se inventa.**
  - **REGLA — la actividad de un gasto de la SL, como en el T3 a mano: lo específico de CAE en «A - CAE»,
lo general en «C - COMUNES»; «B - ING» solo si alguien la elige**
  - **REGLA — una venta CAE que solo está en Drive (las AUTOFACTURAS de Iberdrola, Naturgy…) es venta de la
SOCIEDAD**
  - **REGLA — el COBRO de una venta CAE de Drive va en su propio fichero (`brk_cobro_fecha`, AAAA-MM-DD), y
leerla otra vez no lo borra**
  - **REGLA — la comparación con el año anterior no vale si ese año tiene ventas CAE de Drive sin leer**
  - **REGLA — un lote en «PTE. PAGO BROKERGY A CLIENTE» o FINALIZADO con su factura al S.O. sin cobrar es un
aviso ámbar**
  - **REGLA — la FML emitida desde la app se archiva en «FML - SERVICIOS AUTONOMO / VENTAS / {año} / {n.
MES}», nunca en la de ING**
  - **REGLA — con la BD caída, 503 (regla 38); con Drive caído, el trimestre sale con un aviso rojo y sin
gastos, y el paquete no se prepara (502).**

<!-- generado:fin -->
