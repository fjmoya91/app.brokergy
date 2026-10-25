<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

### Cuadro de mando y cierre trimestral: dos contribuyentes, gastos leídos de Drive y el paquete para la gestoría (2026-10-24)

**Por qué.** La pestaña Facturación ya hace presupuestos y facturas; faltaba ver cómo va el negocio y
cerrar cada trimestre sin montarlo a mano. El cierre del T3 de 2026 se preparó a mano para la gestoría
(«ENTREGA GESTORÍA / 2026-T3 (jul-sep)»: carpetas 01-06, PDF renombrados y un libro Excel de ocho hojas)
siguiendo el SOP «Cierre contable trimestral» de «04. CONTABILIDAD». Esto lo convierte en servidor: el
cuadro de mando, la lectura de los justificantes de gasto, los modelos estimados y el paquete con la
MISMA estructura y los mismos nombres que el T3. La interfaz va aparte, contra estas rutas.

| Qué | Dónde |
|---|---|
| Cálculo (303 con ISP, 111, 349, 130, criterio fiscal de cada gasto), cuadro, trimestre, plan y libro del paquete | [services/contabilidadService.js](implementation/backend/services/contabilidadService.js) |
| Justificantes de gasto en Drive: listar por trimestre, leer con Gemini, guardar en `appProperties`, corregir; las ventas CAE de Drive (`leerVentas`); los extractos del autónomo (`extractosAutonomo`); copiar y subir para el paquete | [services/gastosDrive.js](implementation/backend/services/gastosDrive.js) |
| Cuota de autónomos (RETA) y colegio desde los extractos del banco (CaixaBank, Revolut) y los recibos de la TGSS | [services/cuotasAutonomo.js](implementation/backend/services/cuotasAutonomo.js) (puro, sin red) |
| Archivo de la FML emitida en «FML - SERVICIOS AUTONOMO / VENTAS» | [services/facturaContabilidad.js](implementation/backend/services/facturaContabilidad.js) `archivarFacturaAutonomo`, llamada desde `facturaService.generarPdf` |
| Rutas | [routes/facturacion.js](implementation/backend/routes/facturacion.js) → `GET /cuadro` · `GET /trimestre` · `GET /gastos` · `POST /gastos/leer` · `PUT /gastos/:fileId` · `POST /trimestre/:t/paquete` |
| Pruebas | `node implementation/backend/scripts/test_contabilidad.mjs` (sin red: los modelos con las cifras del T3, el trimestre de cada gasto, las `appProperties`, el plan y el libro del paquete) |

**REGLA — dos contribuyentes que NO se mezclan: la SOCIEDAD (líneas CAE e ING) y el AUTÓNOMO (FML).**
Cada uno tiene su 303; la SL además el 111 y el 349, y el autónomo el 130. Una FML es VENTA del
autónomo y, a la vez, GASTO de la sociedad (con su IVA deducible y su retención, que va al 111 de la
SL). Por eso las cifras de una FML salen SIEMPRE de `facturas_emitidas`: su PDF en las carpetas de
gastos de la SL (`…26FML_16 (julio).pdf`) no se lee con IA (estado `APP`), y si no está, cuenta igual
con los datos de la app. Sus NIF y nombres salen de `facturacion_emisores`: el DNI del autónomo no va
en el código ni aquí (repo público).

**REGLA — todo es ESTIMADO: los modelos los presenta la gestoría.** Cada respuesta lleva
`estimado: true`. El 130 avisa de la posible exención del art. 109.3 RIRPF (70 % o más de los
ingresos con retención).

**REGLA — la cuota de autónomos y la del colegio son gasto del autónomo y salen del BANCO, no de un
PDF** (Fran, 24/10/2026: «tenlo en cuenta. El objetivo es tener una situación real de la empresa»).
No llegan como factura: se cargan en la cuenta del autónomo. [cuotasAutonomo.js](implementation/backend/services/cuotasAutonomo.js)
lee los extractos de «04. CONTABILIDAD / EXTRACTOS Y RECIBOS / 02. AUTÓNOMO» (el CSV de CaixaBank
`Concepto;Fecha;Importe;Saldo` y el de Revolut; solo esa carpeta, sin subcarpetas) y los recibos de la
TGSS («PERIODO LIQUIDACION 01 2026-01 2026.pdf»). `TGSS.COTIZACI.` es la RETA (315 € el último día de
cada mes en 2026) y `COITI ALBACETE` el colegio (46 € en febrero y julio). Cada cuota es un gasto
(`CUOTA_AUTONOMO` / `COLEGIO`): sin IVA, 100 % deducible en el IRPF, a «otros» y con el extracto o el
recibo como justificante; entra en el 130 acumulado y en «05 AUTONOMO - GASTOS» del paquete. **Si falta
el extracto de un mes ya cargado, se ESTIMA** con el cargo más cercano del MISMO año (la cuota cambia
cada año) y sale en ámbar («Estimada»); sin ningún cargo de ese año no se estima: se avisa y no cuenta.
Un mes cuenta si ya terminó o si su cargo está en el banco. En pantalla son filas sin fichero: no se
leen, ni se corrigen, ni se revisan; el botón abre el extracto. Con los extractos de hoy: T1 991 €
(los recibos de la TGSS y el colegio de febrero estimado), T2 945 € (estimado: falta el extracto de
abril a junio), T3 991 € (todo del banco, lo mismo que el libro hecho a mano).

**REGLA — el modelo solo LEE; el criterio fiscal lo aplica el CÓDIGO.** Gemini (`gemini-2.5-flash`,
`ajustesGemini` sin pensamiento, regla 121) copia fecha, proveedor, NIF, destinatario, número, base,
% y cuota de IVA, retención, suplidos, total, moneda y qué clase de documento es; los números, como
TEXTO, y los convierte `numeroEs()`. Qué se deduce lo decide `fiscalGasto` con el SOP: combustible y
vehículo, IVA al 50 % e IRPF 0; ticket sin NIF y restauración, IVA 0 (con aviso); un proveedor de
fuera de España sin IVA, **ISP** (y al **349** solo con NIF-IVA de un Estado miembro: `IE…` sí; `EU…`
—el régimen de no establecidos—, `US`, `SG` no); IVA de otro país, no deducible; una factura a nombre
de otro NIF, IVA 0 y aviso; un equipo de 300 € o más, inversión; una cesión de ahorro, bono CAE; un
documento de 0 € o cuyo nombre dice ANULADA, no cuenta. Lo corregido a mano (`tipo`, `actividad`,
`deducible_pct`, `irpf_deducible_pct`) manda.

**REGLA — una factura en otra moneda se pasa a euros al cambio del BCE del día de la factura** (Fran,
24/10/2026: «habrá que adaptarlo; revisa cómo es el tratamiento de esas suscripciones en España»). El
art. 79.Once LIVA manda «el tipo de cambio vendedor, fijado por el Banco de España, que esté vigente en
el momento del devengo», y los cambios oficiales del euro que publica el Banco de España son los de
referencia del BCE: [services/tipoCambio.js](implementation/backend/services/tipoCambio.js) los trae de
la API de datos del BCE (el último publicado en o antes de la fecha: el sábado vale el del viernes) y
los recuerda en memoria. Con ese cambio salen la base, la cuota y la base de la ISP (20 USD del 04/07/2026
a 1,1448 → 17,47 € y 3,67 € de ISP). Lo cargado en la tarjeta (`total_eur`) **no** es la base del IVA:
si también está, lo que va de uno a otro es la comisión del cambio (`dif_cambio`, gasto financiero; en
el autónomo suma al 130) y solo se usa como importe si no hay cambio del BCE (sin red), con su aviso. El
libro del paquete lo dice en el concepto («20 USD al cambio BCE del 03/07/2026 (1 € = 1,1448 USD)»).
Un proveedor de fuera de la UE sin IVA (OpenAI, Anthropic, Supabase…) es ISP del art. 84.Uno.2º LIVA:
casillas 12-13 del 303 y deducción en 28-29; no va al 349.

**REGLA — lo leído viaja con el FICHERO: `appProperties` de Drive, claves `brk_*`.** Sin tabla nueva:
cada par clave + valor cabe en 124 bytes (se recorta el texto), con la md5 del contenido y la marca
`brk_rev` de revisado. Solo se lee con `POST /gastos/leer` (nunca al abrir la pantalla), con
presupuesto de 80 s y 3 a la vez; **un fichero con la misma md5 no se vuelve a leer** salvo `forzar`
con su id; si cambia la md5, sale `CAMBIADO`. Un error de lectura también se anota (no se reintenta
en bucle). Solo se escribe en ficheros que cuelgan de una carpeta de GASTOS (`{raíz}/{año}/{mes}`).

**REGLA — a qué TRIMESTRE va un gasto: al MÁS TARDÍO entre el de su carpeta y el de su fecha.** La
OpenAI del 24/06 archivada en «7. JULIO» llegó tarde: T3. La Pepephone del 01/07 archivada en «6. JUNIO»
no puede deducirse antes de existir: T3. Cada fichero cae en UN trimestre. Por eso se miran las tres
carpetas del trimestre y la del mes anterior, y **los sin leer de ese mes anterior se leen con el
trimestre** (sin su fecha no se sabe dónde van; en el T3 eran 12, en «6. JUNIO»).

**REGLA — la ISP se devenga y se deduce UNA vez.** 303 de la SL = IVA repercutido + cuota ISP − IVA
deducible interior − cuota ISP. El libro del T3 hecho a mano sumaba el IVA de la ISP en «IVA deducible
facturas recibidas» (la columna J de esas filas) y otra vez en «IVA deducible ISP»: daba −1.721,30 €
cuando lo bueno son −1.616,95 € (104,35 € de más a compensar). El libro de la app resta esas filas en B9.
Fran lo dejó a criterio (24/10/2026): se queda el de la app, y a la gestoría se le dice; si el 303 del
T3 ya se presentó con −1.721,30 €, rectificarlo o no lo decide ella.

**REGLA — el 349 de la SL: solo proveedores con NIF-IVA de OTRO Estado miembro, factura a factura**
(Fran, 24/10/2026: «lo que consideres y se haya estado haciendo hasta ahora; si dudas, se pregunta al
gestor»). Es lo que se hizo en el T3 a mano (Microsoft Ireland, `IE…`). No van: los `EU…` (régimen de
ventanilla única de no establecidos: OpenAI), los de fuera de la UE (`US`, `SG`) aunque sean ISP, ni un
proveedor de la UE que cobra IVA español (Hostinger, de Chipre: su IVA no se deduce y sale con aviso; se
arregla dándole nuestro NIF-IVA ahora que el alta en el ROI está pedida). Dudas que se le llevan al
gestor: Anthropic PBC (EE. UU.) factura con un número irlandés (`IE…`) solo desde su factura 0007;
presentar el 349 del T3 con el alta en el ROI (036 del 15/10/2026) en trámite; y el caso de Hostinger.

**REGLA — los céntimos se redondean POR LÍNEA y como Excel.** 5,21 € de cuota al 50 % es 2,605 → 2,61
(en coma flotante es 2,60499…: `r2` lleva un épsilon). Así sale el 303 del autónomo del T3: 1.417,50 −
18,30 = 1.399,20 €.

**REGLA — el PAQUETE reproduce el T3 hecho a mano; no se inventa.** «ENTREGA GESTORÍA / {AAAA-Tn
(mes-mes)}» con `01 SL - FACTURAS EMITIDAS` (`E-NN - {nombre de VENTAS}`), `02 SL - FACTURAS RECIBIDAS`
y `03 SL - TICKETS, TASAS Y OTROS` por actividad (`A - CAE`, `B - ING`, `C - COMUNES (ambas
actividades)`; `R-NN` / `O-NN - AAAA-MM-DD - PROVEEDOR - Nº`), `04 AUTONOMO - FACTURAS EMITIDAS`
(`AE-NN`), `05 AUTONOMO - GASTOS` (`AG-NN`), `06 EXTRACTOS BANCARIOS` («SL - BBVA cuenta {últimas 4} - jul-sep
2026.xlsx») y el libro «BROKERGY {AAAA-Tn} - Paquete para OTS.xlsx» con las mismas hojas y columnas
(RESUMEN, SL EMITIDAS, SL RECIBIDAS, SL OTROS GASTOS, AUT EMITIDAS, AUT GASTOS, 111 RETENCIONES,
PENDIENTES), con fórmulas y su resultado. Los PDF se **COPIAN, nunca se mueven**; **lo que ya está en el
paquete con el mismo nombre sin su prefijo de registro no se copia otra vez**, aunque esté con otro
número o en otra actividad; el libro **no pisa** uno que exista (sale «… (app AAAA-MM-DD).xlsx»).
`?seco=1` devuelve el plan sin escribir nada; **con la clave interna solo se puede en seco** (403):
montarlo en Drive lo hace un ADMIN con sesión.

**REGLA — la actividad de un gasto de la SL, como en el T3 a mano: lo específico de CAE en «A - CAE»,
lo general en «C - COMUNES»; «B - ING» solo si alguien la elige** (`actividadDe`). Fran no reconocía
«B - ING» (24/10/2026: «no sé a qué te refieres»): es la subcarpeta de «03» para un gasto que sea solo de
ingeniería, y en el T3 no había ninguno. Por eso: lo de la carpeta CAE que es propio de CAE
(certificadores, software, tasas) va a CAE; el teléfono y los suministros (papelería, material) a
COMUNES; todo lo de la carpeta ING y las FML, a COMUNES. Lo corregido a mano (`ajustes.actividad`) manda.

**REGLA — una venta CAE que solo está en Drive (las AUTOFACTURAS de Iberdrola, Naturgy…) es venta de la
SOCIEDAD** (Fran, 24/10/2026: «se deberían registrar como un ingreso de alguna manera, ¿no?»). La
expide el cliente en nuestro nombre (autofacturación, art. 5 del RD 1619/2012), así que no está en
`facturas_so` (que exige un lote y numera `F-{año}CAE_n`) y no se puede emitir desde la app. Se leen del
PDF de «CAE / FACTURAS VENTAS / {año} / {mes}» con el MISMO botón «Leer con IA» (`leerVentas`, otro
prompt: el cliente es quien COMPRA aunque expida él, y si es autofactura) y lo leído viaja en sus
`appProperties` (`brk_cli`, `brk_auto`). Cuenta lo que no es una factura de la app (su número no abre el
nombre del fichero), no es un justificante de pago y, leído, es FACTURA o RECTIFICATIVA con fecha y base
(`ventaDeDrive`): entra en las ventas de la SL del trimestre de su FECHA, en el 303, en el cuadro de mando
y en «SL EMITIDAS» del libro («AUTOFACTURA expedida por el cliente»). Su cobro, ver la regla siguiente.
Sin leer, el trimestre y el cuadro avisan y el paquete la copia pidiendo sus importes. Lo mismo vale para
una factura NUESTRA de antes de la app (la F-2026CAE_6 a Naturgy: `autofactura` false). Leídas el
24/10/2026 con el «sí» de Fran (3 PDF, ~1.700 tokens de entrada, 10 s), cuadran con el máster:

| Trimestre | Fichero | Nº | Fecha | Base | IVA |
|---|---|---|---|---|---|
| T1 | «F-2026CAE_6 - NATURGY IBERIA, S.A.» | F-2026CAE_6 | 29/01/2026 | 50.453,87 € | 10.595,31 € |
| T1 | «FACTP_11504000245500 (25RES060_25_27_37)» (autofactura) | 175608115000000 | 22/01/2026 | 21.115,26 € | 4.434,20 € |
| T2 | «FACTP_11504000252966 IBERDROLA» (autofactura) | 175608115000001 | 28/04/2026 | 223.437,99 € | 46.921,98 € |

Con ellas, las ventas CAE de 2026 suman 497.861,38 € de base (202.854,26 € de la app). La F-2026CAE_7 está
en la app y no se cuenta dos veces. El NIF de Iberdrola se lee con su prefijo («ESA95758389»).

**REGLA — el COBRO de una venta CAE de Drive va en su propio fichero (`brk_cobro_fecha`, AAAA-MM-DD), y
leerla otra vez no lo borra** (25/10/2026). Hasta hoy su cobro «no constaba»: estas ventas entraban en
«Facturado» pero nunca en «Te deben» ni en «Cobrado», y no había dónde marcarlo (no están en
`facturas_so`). Ahora, sin tabla nueva, como lo leído: con fecha, la venta es PAGADA y cuenta en «Cobrado»
del año DEL COBRO y en los días medios; sin ella, PENDIENTE y cuenta en «Te deben» (de cualquier año con
carpeta en «CAE / FACTURAS VENTAS»: lo que se debe se debe desde cuando sea). No tiene vencimiento
escrito, así que nunca sale vencida. La relectura por md5 (`propsLecturaVenta`) y la corrección (`PUT
/gastos/:fileId`) no mandan esa clave, y Drive funde las `appProperties`: el cobro se queda. Solo lo
escribe `cobroVentaDrive(fileId, { cobrada = true, fecha })` de
[contabilidadService.js](implementation/backend/services/contabilidadService.js) (fecha dd/mm/aaaa o
AAAA-MM-DD, obligatoria y no futura; 409 si el fichero es una factura de la app, que se cobra en su
lote), por la ruta `POST /ventas-drive/:fileId/cobro` (`adminOnly`) o desde un script. En el checklist
del trimestre, una venta de Drive sin el cobro marcado deja «Ventas CAE y su cobro» en rojo. Medido el
25/10/2026 (en seco): cuatro de 2026 sin marcar, 435.532,60 € con IVA.

**REGLA — la comparación con el año anterior no vale si ese año tiene ventas CAE de Drive sin leer**
(25/10/2026). En 2025 había cinco sin leer (dos FACTP de Iberdrola y F-2025CAE_3/4/5 a Axoil) y el
titular decía «87 veces lo de 2025». `cuadro()` avisa en ámbar también de las del año ANTERIOR («la
comparación con 2025 no vale hasta leerlas», `filtro` a sus gastos) y marca `acumulado.sl` y
`acumulado.por_linea.CAE` con `comparable: false` y `nota_comparacion` (`comparacionAnterior`); si
Drive no responde, tampoco es comparable. La variación se sigue dando: es la pantalla la que no presume.

**REGLA — un lote en «PTE. PAGO BROKERGY A CLIENTE» o FINALIZADO con su factura al S.O. sin cobrar es un
aviso ámbar** (25/10/2026, `avisosLotesSinCobro`): «LOTE-X ya está en PTE. PAGO A CLIENTE y su F-… sigue
sin cobrar». El cuadro solo mira `facturas_so.estado`, y un lote se puede mover a mano por `PATCH
/lotes/:id/estado` sin marcar el cobro: F-2026CAE_8, _9 y _10 (LOTE-2026-004, LOTE-2025-003,
LOTE-2025-001) salían como «Te deben 183.805 €». La pantalla del lote ahora pide la fecha del ingreso al
pasar a ese estado ([el-total-que-nos-ingresa-el-so-y-el-cobro.md](docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md)).

**REGLA — la FML emitida desde la app se archiva en «FML - SERVICIOS AUTONOMO / VENTAS / {año} / {n.
MES}», nunca en la de ING** (`CONTABILIDAD_FACTURAS_FML_FOLDER_ID`). Es venta del autónomo; para la
sociedad es un gasto, **y una copia va a «ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS / {año} / {n.
MES}» en el mes que FACTURA** (`archivarFmlComoGastoSl`; Fran, 24/10/2026: «es un gasto de FML autónomo
que le factura a BROKERGY»). Es donde han estado siempre (25FML_1 a 26FML_18, con el mismo nombre que
en ventas), y en el mes del servicio, no en el de la fecha: la 26FML_16 «(julio)», del 29/09, está en «7.
JULIO» (`mesQueFactura`: el mes que nombra el concepto, si no es posterior al de la factura). Ese PDF no se
lee (estado `APP`): sus cifras siguen saliendo de `facturas_emitidas`.

**REGLA — con la BD caída, 503 (regla 38); con Drive caído, el trimestre sale con un aviso rojo y sin
gastos, y el paquete no se prepara (502).** El cuadro no lee JSONB (regla 22): sin `lineas`, la base de
una venta se estima desde la cuota (lo que sobra del neto son suplidos: 26ING_66, 166,39 € de neto y
31,50 € de IVA → 150 € + 16,39 € de tasa); el trimestre sí las lee y es exacto.

#### Las rutas (todas en `/api/facturacion`)

| Ruta | Guardián | Qué devuelve |
|---|---|---|
| `GET /cuadro?anio=` | `adminOClaveInterna` | `ventas` (`meses[12]` por línea y contribuyente; `lineas`; `acumulado` frente al mismo día del año anterior, con `comparable` y `nota_comparacion` en `sl` y `por_linea.CAE`) · `cobros` de la SL (pendiente, vencido, cobrado en el año —también las ventas CAE de Drive—; `dias_medios_cobro` de lo cobrado, sin la FML; `por_linea`, con FML aparte; las 10 vencidas con su `id`, `origen` y `lote_id`; `drive`: lo de las ventas de Drive, ya incluido arriba, con `pendientes[]` una a una con su `fileId`) · `presupuestos` (embudo de `cee_ofertas`, con y sin partidas, tasa de aceptación; `por_facturar`: los ACEPTADOS de cualquier año sin factura viva, con el criterio de `facturasDelPresupuesto`) · `trimestre` en curso (303 de cada uno, 111, plazo y días; `parcial` si hay gastos sin leer) · `a_presentar` (el anterior mientras corre su plazo) · `top_clientes` (5, de la SL) · `avisos[]` `{tono: rojo|ambar|azul, texto, filtro?}` |
| `GET /trimestre?t=AAAA-Tn` | `adminOClaveInterna` | `ventas.sl/autonomo` (facturas y totales, suplidos aparte) · `gastos.sl/autonomo` (filas con `fiscal` y totales por actividad) · `m303.sl/autonomo` · `m111` · `m349` · `m130` (acumulado y por trimestre) · `checklist` del SOP · `pendientes_cobro` · `plazos` · `avisos` |
| `GET /gastos?t=` | `adminOClaveInterna` | Las filas para revisar (estado `SIN_LEER`/`LEIDO`/`REVISADO`/`CAMBIADO`/`APP`/`ERROR`, y `BANCO`/`ESTIMADA` las cuotas, sin `fileId`; `datos`, `ajustes`, `fiscal`), `vecinos_sin_leer`, `ventas_cae` (las de Drive sin registrar, cada una con su `venta` o null), `avisos_cuotas`, `resumen` (`sin_leer` cuenta también las ventas) y `totales` |
| `POST /gastos/leer {t, fileIds?, forzar?}` | `adminOnly` | `{leidos, errores, quedan, ventas{leidas, errores, quedan}, tokens, segundos}` — primero los gastos y, si quedan más de 15 s de los 85, las ventas CAE de Drive; se repite mientras `quedan > 0` |
| `PUT /gastos/:fileId {…datos, tipo?, actividad?, deducible_pct?, irpf_deducible_pct?, revisado?}` | `adminOnly` | `{gasto}` con su criterio fiscal recalculado; si es una venta CAE de Drive (campos `fecha, cliente, nif, numero, documento, base, iva_pct, cuota, total`), `{venta}` con su `venta` recalculada |
| `POST /ventas-drive/:fileId/cobro {cobrada (o pagada) = true\|false, fecha}` | `adminOnly` | `{venta}`: la fila de Drive con su `cobro_fecha` y su `venta` recalculada. ESCRIBE `brk_cobro_fecha` en el fichero; desde un script, `conta.cobroVentaDrive(fileId, { cobrada, fecha })` |
| `POST /trimestre/:t/paquete?seco=1` | `adminOClaveInterna` (sin `seco`, solo ADMIN con sesión) | `{carpeta, carpeta_existe, carpetas, ficheros[{carpeta, nombre, origen, accion: COPIAR|YA_ESTA, esta_como?}], copiar, ya_estan, libro{nombre, hojas}, faltan, checklist}`; sin `seco`, además `copiados`, `errores` y el enlace del libro |

#### Lo medido (24/10/2026, contra producción, en seco)

- `GET /trimestre?t=2026-T3`: ventas SL 4.740 € / 995,40 € (más 65,56 € de tasas suplidas), exactas por
  líneas; FML 6.750 / 1.417,50 / 1.012,50 €. 39 justificantes del T3 (CAE 30, ING 4 —las tres FML y la
  FNMT—, FML 5) y 12 sin leer en «6. JUNIO». 5-10 s.
- `POST /trimestre/2026-T3/paquete?seco=1`: de 59 piezas, **56 ya estaban** en el paquete hecho a mano
  (30 con otro número R- o en otra actividad); quedarían por copiar la de Google Cloud de 0 € (que
  ya no cuenta al leerla), el extracto de Revolut y el de tarjetas (a mano lleva el nombre de la tarjeta). 14 s.
- Lectura de tres PDF del T3 en memoria (sin guardar): ~3-4 s y ~890 tokens de entrada cada uno; la
  del certificador trae 278,63 € de tasas como suplidos (540 + 113,40 + 278,63 − 81 = 851,03 €), la de
  OpenAI viene en USD (falta el importe en euros) y el gasóleo da 24,79 + 5,21.

#### Pendiente de decidir

- Los bonos CAE pagados a clientes no se leen todavía de la app (solo como justificante en Drive).
- Las tres ventas CAE de Drive de 2026 están leídas, pero no revisadas: falta el «Revisado» en Gastos. Las
  de AXOIL (2024 y 2025) y las de Iberdrola de 2025 quedan fuera del año en curso; las cinco de 2025, sin
  leer, invalidan la comparación del titular hasta leerlas (25/10/2026).
- Los cobros reales de las ventas de Drive (cuatro de 2026 el 25/10/2026, 435.532,60 €) están por marcar
  con `cobroVentaDrive`. Las de un año sin leer, aunque se marquen, no cuentan hasta leerlas.
- `pendientes_cobro` del trimestre (y la hoja PENDIENTES del libro) aún no lleva las ventas de Drive
  pendientes; el cuadro, sí.
- Cobros corregidos el 24/10/2026 con el «sí» de Fran: 26FML_13–15 PAGADAS (03/07 y 04/07, también en la
  hoja de AppSheet) y la F-2026CAE_7 cobrada el 26/06/2026 (máster y BBVA). El vencido de la sociedad bajó
  de 62.952,98 € a 1.304,05 €.
- Falta el extracto de CaixaBank de abril a junio de 2026 en «02. AUTÓNOMO» (el T2 sale estimado) y el
  de febrero para el colegio.
- Los extractos se eligen por su fecha de subida (de 10 días antes del fin del trimestre a 140 días
  después de su inicio): hay que mirarlos.
