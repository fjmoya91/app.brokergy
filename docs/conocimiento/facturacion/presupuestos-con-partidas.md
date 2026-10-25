<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

### Presupuestos con PARTIDAS: la pestaña Facturación sustituye a AppSheet (2026-10-24)

**Por qué.** Fran, 24/10/2026: «me gustaría quitarme de la aplicación de presupuestos y facturas de
AppSheet y hacerlo todo desde esta ya», con un caso real delante: a un cliente hay que presupuestarle
la **legalización de unas placas** además de los **certificados**, y la oferta de CEE solo sabía
mandar un certificado y su tasa. Pidió que fuese «muy fácil de uso», «como Holded», que contemplase
todas las alternativas y que el MCP pudiera hacer y mandar un presupuesto hablando. Decisiones suyas
(las cuatro recomendadas): **pestaña propia** «Facturación» (Presupuestos · Artículos) y CEE directos
abre el mismo editor; **la app manda en la numeración**; **variantes con precio** en el catálogo; y
esta **fase 1** = artículos + presupuestos con N partidas + aceptación. Las facturas propias
(VERI*FACTU), la serie FML y el corte con AppSheet son la fase 2 (ver «La fase 2» al final).

| Qué | Dónde |
|---|---|
| Líneas, arrastre, variantes, totales, saneado, buscador (fuente ÚNICA: editor, backend, MCP, página pública) | [logic/presupuesto.js](implementation/frontend/src/features/facturacion/logic/presupuesto.js) |
| PDF, mensaje y concepto (con o sin partidas) | [logic/ofertaCee.js](implementation/frontend/src/features/cee-directo/logic/ofertaCee.js) |
| Catálogo, alta, edición, duplicar, rechazar, vista previa del envío | [services/presupuestoService.js](implementation/backend/services/presupuestoService.js) |
| Envío, PDF, enlace público, aceptación (la de siempre, ampliada) | [services/ceeOfertaService.js](implementation/backend/services/ceeOfertaService.js) |
| Rutas | [routes/facturacion.js](implementation/backend/routes/facturacion.js) → `/api/facturacion/articulos` · `/presupuestos` · `/:id` · `/pdf` · `/mensaje` · `/enviar` · `/duplicar` · `/rechazar` · `/anular` |
| Pantallas | `FacturacionView` · `PresupuestosLista` · [PresupuestoModal.jsx](implementation/frontend/src/features/facturacion/components/PresupuestoModal.jsx) (el editor) · `ArticulosCatalogo` · `AceptarOfertaCeeView` (pública) |
| Esquema | [scripts/facturacion_schema.sql](implementation/backend/scripts/facturacion_schema.sql) (tabla `articulos`, columnas nuevas de `cee_ofertas`, numeración) |
| Catálogo inicial | `node implementation/backend/scripts/sembrar_articulos.js` (en seco; `--escribir`) |
| Prueba | `node implementation/backend/scripts/test_presupuesto_partidas.mjs` (y `test_oferta_cee.mjs`, la oferta antigua) |
| Medidor de hojas del PDF | `node implementation/backend/scripts/check_presupuesto_paginas.mjs` (puppeteer, sin red) |

**REGLA — una partida se calcula en UN sitio: `logic/presupuesto.js`.** El editor (total en vivo), el
servidor (lo que se guarda, el PDF, el mensaje), el MCP y la página donde acepta el cliente usan la
misma cuenta: base = uds × precio × (1 − dto), **IVA redondeado POR LÍNEA** (como AppSheet y como
`facturaCee.calcularLinea`). Si cada uno calculara a su manera, el cliente podría aceptar en pantalla
una cifra distinta de la del PDF. El servidor no se fía de las cifras del navegador: guarda las líneas
saneadas (`sanearLineas`) y recalcula `neto`, `iva`, `total` y `concepto`.

**REGLA — un SUPLIDO (las tasas) va sin IVA y sin descuento**, aunque la línea diga otra cosa: es
dinero que se paga a la Administración en nombre del cliente (art. 78.Tres.3º LIVA). El PDF le pone
el «*» y la nota de suplidos; el nombre del artículo NO lleva el asterisco.

**REGLA — la tabla es `cee_ofertas` y no se renombra; todo el esquema es ADITIVO.** El backend de
producción la sigue usando con ese nombre mientras no se despliegue la versión nueva. Un presupuesto
con partidas lleva `lineas` (JSONB) y las columnas `neto`, `iva`, `total` y `concepto` para el listado
(que nunca lee el JSONB: regla 22); una oferta antigua (sin `lineas`) se sigue leyendo con `alcance`,
`precio`, `tasa` y `num_tasas`. `alcance` sale de las líneas: el artículo con `genera` CEE_DOBLE o
CEE_UNICO; sin él es NULL, y eso es lo que decide si al aceptar nace un expediente.

**REGLA — numeración: la serie de AppSheet sigue en la app.** Un presupuesto con partidas sale
`P-{YY}ING_{n}` (secuencia `presupuestos_ing_seq`, que arranca en 40: el último de AppSheet fue
P-26ING_39), y lo compone un trigger en el INSERT. Sin `lineas` (el backend antiguo) sigue saliendo
`{AAAA}PCEE_{n}`, así que el código de producción no se rompe al aplicar el esquema antes del deploy.
⚠️ Mientras se use AppSheet a la vez, los dos sacarían números de la misma serie: hay que dejar de
hacer presupuestos en AppSheet (el corte, ver «La fase 2»).

**REGLA — nace BORRADOR; enviarlo es otro gesto.** Guardar no manda nada (el MCP enseña el borrador
antes; el editor tiene «Guardar borrador»). Enviar lo pasa a ENVIADA con un update condicionado a
`estado = BORRADOR` (un envío doble no pisa una aceptación). Si no sale por ningún canal se queda en
borrador —ya no se borra, como la oferta antigua— y se reintenta sobre ESE. Un BORRADOR no tiene
enlace público: `cargarPorToken` no lo devuelve. Estados: BORRADOR → ENVIADA → ACEPTADA | RECHAZADA |
ANULADA; se edita en BORRADOR y ENVIADA (después, se duplica).

**El editor, pensado para tardar segundos.** Una caja «Añadir partida»: se escribe («cee»,
«legalización», «nave»), Enter mete el artículo con su precio y lo que ARRASTRA (el CEE trae su tasa,
colgada de él: quitar el CEE la quita). Cada VARIANTE sale como una opción propia («Legalización FV —
Nave industrial · 450 €»), así que se elige de un golpe. Lo que no está en el catálogo entra como
**partida libre** con el foco en su precio. Cada línea: concepto, variante, **detalle** (sale en gris
debajo en el PDF), uds, precio, dto %, IVA (21/10/4/0 o Suplido), subir/bajar y quitar.

**Partida NUEVA desde el buscador (25/10/2026, Fran: «que también pueda añadir una partida nueva con
sus correspondientes precios, conceptos… para que aparezca en la tabla. E incluso en la búsqueda que
también pueda buscar por concepto»).** El desplegable lleva SIEMPRE, al final (o el primero con la caja
vacía), «Partida nueva: «lo escrito»». Abre un formulario dentro del editor (`PartidaNueva` en
`PresupuestoModal.jsx`, también en la factura): concepto, precio sin IVA, IVA (Suplido = familia
TASAS) y, para el ADMIN, familia y «Guardarla en el catálogo» (marcado): entonces se crea el artículo
(`POST /api/articulos`, `adminOnly`) y entra en la tabla de Artículos y en las búsquedas siguientes; sin
marcar, o si ya hay uno con el mismo nombre normalizado (se dice), va solo a ESE documento. Si el
catálogo no deja guardar, el error sale en el formulario y no se pierde lo escrito. El buscador
(`buscarArticulos`) busca por concepto, variante y familia, palabras en cualquier orden y sin tildes, y
sube lo que EMPIEZA por lo escrito.

**Vista previa a la vista y PDF descargable (25/10/2026).** El pie del editor lleva el botón «Vista
previa» (con partidas; en el móvil, solo el ojo) en vez de esconderlo en «···», y el visor
(`VistaPreviaA4`, prop `onDescargar`) tiene «Descargar PDF»: el PDF que rasteriza el SERVIDOR, el mismo
que recibe el cliente, también de un borrador sin guardar (`POST
/api/facturacion/presupuestos/vista-previa/pdf`, `staffOClaveInterna`; `presupuestoService.pdfBorrador`
sanea las líneas, toma solo los datos de cliente que imprime el PDF y, con id, el número y el enlace de
aceptación de lo guardado; no escribe nada). El total se ve
mientras se escribe y se dice si al aceptarlo abre expediente. Cliente con el mismo `ClientePicker`
(app + agenda de WhatsApp + alta rápida), inmueble opcional con Catastro, partner, observaciones para
el cliente y el mensaje editable. El mensaje editado a mano antes de tener número lleva marcadores — «(nº de
presupuesto)» y «(enlace para aceptar)» — que el servidor cambia por los de verdad al enviar.

**El PDF es el de AppSheet con N partidas.** Mismo diseño que la oferta (réplica de
`presupuestoAppsheetHtml.js`), paginado por bloques con altos estimados como `facturaCee`: filas,
nota de suplidos, condiciones + totales, observaciones, política de entrega y aceptación; las hojas siguientes llevan
cabecera y pie reducidos, todas de **alto fijo 297 mm** (regla 25.b).

**REGLA — las hojas se MIDEN, no se dan por buenas: `check_presupuesto_paginas.mjs`.** Cada `.sheet`
es `overflow:hidden`, así que lo que no cabe no salta de hoja: se RECORTA en silencio. El medidor
renderiza con Manrope/Archivo de `frontend/public/fonts` presupuestos de 1 a 60 partidas (cortas,
largas con detalle, con suplidos, con observaciones largas y AL TOPE de lo que guarda el servidor) y
falla si alguna hoja desborda. La primera pasada (24/10/2026) encontró que con 46 caracteres por
línea en el concepto y 56 en el detalle una partida larga desbordaba **hasta 113 px**: la columna deja
~240 px de texto, que son 33-36 caracteres (38-41 en el detalle). Se estimó con 32 y 36 hasta el 25/10/2026 (ver la regla siguiente). Una partida y
las observaciones son bloques que NO se parten, así que tienen tope para caber enteros en una hoja:
300/600 caracteres (concepto/detalle, `sanearLineas`) y **2.000 las observaciones**
(`MAX_OBSERVACIONES`, en el editor y en el servidor). Con partidas cortas, 6 caben en la primera
hoja, 28 en dos; con largas y detalle, 1 y unas 4 por hoja.

**REGLA — sin saltos de hoja innecesarios: los altos se CALCULAN con lo medido, no «por lo alto»
(25/10/2026).** Fran: «la aceptación… no le han ido muchos artículos y sin embargo me ha metido un
salto de página. La idea es que sea más compacto». Con cuatro partidas (CEE + su tasa + legalización
+ su tasa) la aceptación se iba SOLA a una segunda hoja con ~100 px libres en la primera: cada partida
se estimaba en 77 px y medía 58, la cabecera se estimaba 25 px de más y, en cambio, la aceptación
(121 px) se daba por 104. Ahora `lineasTexto()` de `ofertaCee.js` corta el texto por palabras con los
**anchos reales de Manrope 600** (tabla medida con canvas a 1000 px; la suma de las letras queda por
ENCIMA de lo que pinta Chrome por el kerning, así que no lleva margen: «Legalización de instalación de
aerotermia» suma 237,6 px y se pinta en 236,2 dentro de una caja de 238), y cada bloque lleva su alto
medido: partida = líneas × 17,4 + 23 (+ 3 + líneas × 16 del detalle, caja de 238 px); nota de
suplidos 43, pago y totales 152, observaciones 39 + líneas × 19 (caja de 663 px), política 45,
aceptación 122, pie 80. La cabecera del cliente se calcula con su nombre y sus líneas de dirección
(caja de 391 px: 100 px como mínimo, 54 + 19,2 por línea de nombre + 19,8 por línea de datos); la
cabecera de la tabla (43 px) solo cuenta en la hoja que la lleva, y una partida con más detrás reserva
los 26 px del «Continúa en la página siguiente». El medidor dice además si algún salto se podía haber
evitado (lo primero de la hoja siguiente cabía en el hueco) y exige que las cuatro partidas de Fran
salgan en UNA hoja (con un cliente normal; y con observaciones cortas sin ficha de cliente). Con la
ficha completa Y observaciones no caben por ~20 px: ahí el salto es de verdad.

El rediseño «carta de pago» (regla 164) NO se ha aplicado aquí a propósito: el PDF sigue siendo la
réplica del de AppSheet, que es lo que conocen los clientes.

**Observaciones PARA EL CLIENTE (25/10/2026).** Fran: «En los presupuestos, quiero añadir un punto de
observaciones que será para tener en cuenta el cliente. Un texto libre». Hasta entonces la columna
`observaciones` llevaba por defecto la política de entrega («Por política de empresa, los informes y
documentación técnica ofertados no se entregarán hasta…»), escondida en «Más opciones», y nadie la
tocaba: las 11 filas de `cee_ofertas` tenían exactamente ese texto.

**REGLA — `observaciones` es SOLO el texto libre para el cliente, y la política de entrega sale
SIEMPRE aparte.** En el editor es una sección a la vista, debajo del total, vacía y opcional (2.000
caracteres). En el PDF sale como bloque «Observaciones» (barra verde, texto oscuro) y en la página de
aceptación como «A tener en cuenta» dentro de la tarjeta del presupuesto (`vistaPublica` devuelve
`observaciones`). Sin texto no sale ningún bloque. La política es la constante `CONDICIONES_PRESUPUESTO`
de `ofertaCee.js` y se imprime en TODOS los PDF en letra pequeña, entre las observaciones y la
aceptación (bloque estimado de 50 px; el medidor lo da por bueno: ninguna hoja desborda en los 300
casos). **Sin cambio de esquema**: `observacionesCliente()` lee como vacía una fila que guarda la
política —las antiguas—, o saldría dos veces; y el servidor (`presupuestoService.crear/actualizar`,
`ceeOfertaService.crear`) tampoco la guarda si llega (al duplicar uno antiguo, o desde el MCP), y
guarda `null` en vez de una cadena vacía. Tras tocarlo: `test_presupuesto_partidas.mjs` (caso «las
observaciones son el texto libre…») y `check_presupuesto_paginas.mjs`.

**REGLA — un presupuesto SIN certificado se acepta en la misma página y no abre expediente.**
`/aceptar-cee/:token` con `abre_cee: false`: sin cuestionario de climatización ni fotos para el
técnico, el inmueble es opcional (si no se pone, se pide el domicilio, que es el de la factura) y las
condiciones son otras (`CONDICIONES_PRESUPUESTO`, versión `ppto-2026-10-24`: sin visita del
certificador ni registro del CEE, con los trámites en su nombre). Al aceptar: claim atómico como
siempre, se completan los datos del cliente, se avisa al equipo y se le confirma al cliente
(`avisarSinCee`). Con certificado, todo igual que antes: nace el `{AAAA}CEE_{n}` y su
`documentacion.oferta` guarda las `lineas`.

**La factura de ese CEE hereda las partidas.** `facturaCee.lineasPorDefecto` propone las líneas del
presupuesto (no las dos de siempre); el ID ARTÍCULO de la hoja de AppSheet sale del `appsheet_id` del
artículo, o en su defecto del importe de la tasa / del alcance. Una partida cuyo artículo no existe en
la hoja (la legalización FV) va con el ID vacío.

**«Visto».** `visto_at` se sella UNA vez: la primera vez que se pide la vista pública del enlace
(`GET /api/public/oferta-cee/:token` → `ceeOfertaService.marcarVisto`) **mientras el presupuesto está
ENVIADO**; si ya tiene fecha, o está en borrador, aceptado o anulado, no se toca. El listado lo enseña
como «visto hace N d» o «no lo ha abierto», que es lo que dice a quién llamar. Medido el 24/10/2026:
**ningún presupuesto lo tiene todavía** (los 10 aceptados se aceptaron antes de que existiera la
columna, y no hay ninguno ENVIADO). Ojo: lo sella cualquiera que abra el enlace, también alguien del
equipo que lo pruebe; la vista previa de WhatsApp no, porque no llama a esa ruta.

#### El catálogo de artículos

Tabla `articulos` (RLS deny-all + GRANT a `service_role`, regla 150): `nombre` (lo que lee el
cliente), `familia`, `precio` sin IVA, `iva_pct`, `suplido`, **`variantes`** `[{id, nombre, precio}]`,
**`arrastra`** `[{articulo_id, uds}]`, **`genera`** (CEE_UNICO / CEE_DOBLE / nada), `activo`, `orden`,
`usos` y `appsheet_id` (el id de la hoja ARTÍCULOS, que las facturas aún necesitan). Lo ve y lo usa
el equipo; **los precios solo los cambia ADMIN** (`POST/PUT /articulos` con `adminOnly`). Un artículo
no puede arrastrarse a sí mismo. `usos` sube con cada presupuesto y ordena el buscador.

La carga inicial (`sembrar_articulos.js`) son los 24 artículos de AppSheet con el nombre limpio y su
uso real como `usos`, y uno nuevo: **«Legalización de instalación solar fotovoltaica»** con las
variantes Vivienda unifamiliar / Nave industrial — **precios por confirmar por Fran** (AppSheet no lo
tenía; van a 0 hasta que los ponga desde Artículos). El CEE (150 €) y el inicial + final (220 €)
arrastran 1 y 2 tasas de Castilla-La Mancha; la legalización de aerotermia, su tasa térmica de CLM.
Para otra comunidad se cambia la tasa en la línea.

#### El listado y el editor en «carta de pago» (24/10/2026)

Lo pidió Fran con la pestaña en crema (regla 164) y una auditoría de uso: demasiados clics para lo de
todos los días. Ficheros: [PresupuestosLista.jsx](implementation/frontend/src/features/facturacion/components/PresupuestosLista.jsx),
[PresupuestoModal.jsx](implementation/frontend/src/features/facturacion/components/PresupuestoModal.jsx)
(y las piezas que comparte con las facturas: `PanelFx`, `Dialogo`, `MenuAcciones`, `useAvisoFx`,
`BuscadorArticulos`, `FilaLinea`, `MasOpciones`), [ArticulosCatalogo.jsx](implementation/frontend/src/features/facturacion/components/ArticulosCatalogo.jsx),
el CSS en [estiloListas.js](implementation/frontend/src/features/facturacion/estiloListas.js) y el
selector de cliente [ClientePicker.jsx](implementation/frontend/src/features/cee-directo/components/ClientePicker.jsx).

**Los chips.** «En curso» (borrador + enviado + aceptado SIN facturar; es el de entrada) · «Esperando
respuesta» (enviados, el que lleva más sin contestar primero) · «Por facturar» (aceptados sin factura, el
aceptado hace más primero) · «Cerrados» · «Todos». El chip va en la URL (`f`); al buscar, la búsqueda
cruza el chip de entrada (buscar un presupuesto ya facturado lo encuentra). `/` lleva al buscador. «+
Nuevo» y la N son del armazón: el listado abre el editor cuando la URL trae `nuevo=presupuesto` o
`abrir={id}` y quita el parámetro.

**Cada fila dice lo que toca, a la vista**, y lo demás va en «···»: borrador → «Enviar»; enviado hace
más de 5 días → «Reenviar»; aceptado sin factura → «Facturar» (o «Emitir factura» si ya hay un borrador
de factura), solo ADMIN. Debajo del estado: «sin enviar» / «enviado hace N d» / «visto hace N d» o «no
lo ha abierto» / «aceptado hace N d», el nº del CEE directo (enlace) y **«facturado · 26ING_84»** con
el enlace a la factura (✓ si está cobrada). En el móvil, tarjetas; en el PC, tabla.

**REGLA — «facturado» se decide con el MISMO criterio que `facturaService.facturasDelPresupuesto`
(regla 166), en lote.** `presupuestoService.listar` lo calcula para toda la página
(`facturasDeLaPagina`, sin una consulta por fila): lo que nació del presupuesto, lo emitido por su CEE
directo y los números que solo constan en `documentacion.facturas_emitidas` de la ficha de ese CEE
(se buscan por número para saber su estado de verdad). Una RECTIFICADA no cuenta, ni una rectificativa
(hereda el `presupuesto_id` de la original). Con una factura viva, la fila no ofrece «Facturar» (en «···»
queda «Otra factura de este presupuesto», que pasa por la confirmación del 409). Medido el 24/10/2026:
6 facturados (2026PCEE_1/3/4/6/7/8 → 26ING_86/80/78/82/83/84) y 4 por facturar (2, 5, 10 y 11).

**El editor es un panel lateral de 720 px** (hoja a pantalla completa en el móvil) y **no se cierra al
pulsar fuera**: se perdería lo tecleado; se cierra con la X o con Escape, y Escape no lo cierra si hay un
diálogo o un menú encima. El **cliente va primero**, con el foco puesto. El canal de envío se recuerda en
este navegador (`localStorage` `fx-canal-preferido`, con `try/catch`: es una comodidad). «Más opciones»
(inmueble y quién lo trae) va plegado con un resumen de una línea; las observaciones para el
cliente, no: van a la vista (ver arriba). Los errores salen
**junto a su bloque**, no en una lista arriba, y el botón principal dice qué falta («Elige el cliente») y
lleva a ello. **UNA acción principal**: «Enviar por WhatsApp · 298,98 €» mientras se puede enviar; en un
ACEPTADO, «Facturar» / «Emitir su factura» / «Abrir la factura nº» (lo decide el listado, que sabe si
ya tiene factura; desde CEE directos no se pasa y queda «Duplicar»); si no, «Duplicar». El resto, en
«···». Una partida es una fila compacta (concepto, «1 × 220,00 € · IVA 21 %», importe) que se abre al
tocarla. La nota «al aceptarlo nace el expediente / no abre expediente» solo sale antes de aceptar.

**REGLA — un presupuesto NUEVO no se autoguarda: guardar consume número.** Guardar deja un BORRADOR
(«Guardar borrador», en «···»); Enviar lo guarda y lo manda, y todo envío pasa por `SendActionOverlay`
con el texto a la vista (regla 29.b).

**El selector de cliente es rápido.** Antes cada pulsación (tras 300 ms) volvía a pedir `GET
/api/clientes` ENTERO: segundos por letra. Ahora la lista se pide UNA vez (caché del módulo por usuario,
2 minutos, compartida entre selectores abiertos) y se filtra en memoria: palabras en cualquier orden y
sin tildes, o el móvil por sus dígitos con o sin 34. Medido en el banco con una lista falsa: cinco
búsquedas, **una** petición. Al crear un cliente desde el selector la caché se tira; uno creado en otra
pestaña aparece a los 2 minutos como mucho. `tema="fx"` lo pinta en crema; CEE directos sigue con el
oscuro y la misma lógica.

**Artículos** se pinta en crema con una tarjeta por familia; un artículo con precio 0 sale con «Sin
precio: saldría a 0 €» y un aviso arriba con «Ponerle precio» (hoy, la legalización FV). Emisores e
Importar de AppSheet ya no están aquí: van en ⚙ Ajustes del armazón.

#### Presupuestos por el MCP

Seis herramientas en `mcp-brokergy/server.js`: `buscar_articulos`, `buscar_cliente_presupuesto`
(teléfono, DNI y email enmascarados), `crear_presupuesto` (en BORRADOR; resuelve cada línea contra el
catálogo y, si es ambigua o falta la variante, NO crea nada y devuelve las opciones; si el cliente
nuevo se parece a uno que ya existe, para y los enseña), `enviar_presupuesto` (en modo borrador por
defecto; se niega a mandar un texto que no se haya enseñado antes en la sesión, y cada envío exige un
borrador nuevo), `listar_presupuestos` y `cambiar_estado_presupuesto` (anular, rechazar, duplicar).
Por la clave interna (`staffOClaveInterna`), y lo que hace queda firmado como «AGENTE IA». Lo que
manda el MCP lleva `expandir_arrastre: true`: el servidor construye las líneas desde el catálogo (con
sus tasas, salvo `sin_arrastre` en la línea). Tras desplegar, hay que reconectar el conector en
Cowork para que vea las herramientas nuevas.

#### La fase 2: hecha el mismo 24/10/2026

Las facturas propias (series ING y FML, rectificativas, cadena de VERI*FACTU, «Facturar» un presupuesto
aceptado, el MCP y la importación del histórico) están en «Facturas desde la app», en esta misma
carpeta. Queda el **corte con AppSheet**: dejar de emitir allí en una fecha (antes del 1/1/2027, porque
no cumple VERI*FACTU), y entonces pasar la numeración ordinaria a la tabla. La factura electrónica
B2B obliga a BROKERGY desde el 6/10/2028.
