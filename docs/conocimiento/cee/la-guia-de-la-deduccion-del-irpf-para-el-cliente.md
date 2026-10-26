<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La GUÍA de la deducción del IRPF para el cliente (2026-10-01)

Botón **🧾 Enviar al cliente: certificados + guía de la Renta** bajo la comprobación
del IRPF del módulo CEE (solo equipo interno), en los DOS negocios. Al cliente le
llegan sus certificados FIRMADOS y una guía de UNA página (DOS en un CAE: ver «La hoja del
bono CAE», abajo), en el estilo «carta de pago»
(regla 164, desde el 26/10/2026; antes Manrope + Archivo), que le dice qué deducción aplicarse, dónde se marca en
Renta Web y todos los datos que le va a pedir, ya rellenos. La guía se guarda en Drive
y el cliente la descarga también desde su portal (`/mi-expediente`).

**Acceso directo en la cabecera del CEE directo (2026-10-13)**: el botón de abajo queda
debajo de las dos filas y de «Cargar CEE por fichero», y al cobrar no se encontraba. En
[CeeDirectoDetailView.jsx](implementation/frontend/src/features/cee-directo/views/CeeDirectoDetailView.jsx)
hay un **🧾 Guía de la Renta** junto a «Factura» que abre el MISMO `GuiaIrpfModal` (no una
copia). Sale en las mismas condiciones que el de abajo (DOBLE, o ÚNICO con `cee_anterior`;
solo equipo) y en verde «Guía Renta ✓» si `guia_irpf.enviada` existe. Ojo: la que sale
sola con la entrega lleva los ficheros de la entrega (los del CEE final) + la guía; el
envío desde el popup lleva el CEE inicial Y el final firmados + la guía.

| Qué | Dónde |
|---|---|
| Qué deducción, estimación, texto del mensaje y HTML del PDF (fuente única) | [logic/guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js) |
| Cargar los dos negocios, PDF, Drive, envío y sello | [services/guiaIrpfService.js](implementation/backend/services/guiaIrpfService.js) |
| Rutas (montadas en `expedientes` y `ceeDirectos` desde un único montador) | [routes/guiaIrpfRutas.js](implementation/backend/routes/guiaIrpfRutas.js) — `GET /:id/guia-irpf` · `POST …/estado` · `…/pdf` · `…/guardar` · `…/enviar` (**staffOnly**; `…/enviar` admite además la clave interna, `staffOClaveInterna`, para los envíos desde un script o el MCP — en `expedientes` está por eso en `PUBLIC_EXPEDIENTE_ROUTES`: si no, el `internalOnly` del módulo la cortaba antes con un 401, medido el 26/10/2026 con 25RES060_54) |
| Popup (vista previa = el PDF real) | `GuiaIrpfModal.jsx` (+ `GuiaIrpfBoton`) |
| Lector del `.xml` sin DOM para el servidor | `leerDatosIrpfDeTexto` en [xmlCeeParser.js](implementation/frontend/src/features/calculator/logic/xmlCeeParser.js) |
| Pruebas | `node implementation/backend/scripts/test_guia_irpf.mjs` (lógica + cada hoja cabe en su A4) · `probar_guia_irpf.js <nº> [--pdf]` (expediente real, sin escribir) |
| La hoja del bono CAE SUELTA, en PDF | `node implementation/backend/scripts/hoja_bono_cae.js [<nº>]` (genérica o con su cobro; solo lee, deja el PDF en `tmp/`) · `guiaIrpfService.pdfHojaBonoCae` |

**Qué deducción** (manual de BROKERGY «MANUAL DEDUCCIONES IRPF»): consumo de energía
primaria no renovable −30 % o letra A/B → **unifamiliar o edificio completo: 60 %**
(base 5.000 €/año, 15.000 € en total, el exceso en los 4 años siguientes: 12.000 € →
3.000 + 3.000 + 1.200) · **piso: 40 %** (base 7.500 €) · si no, demanda de calefacción
+ refrigeración −7 % → **20 %** · si no, no hay guía. **Vigencia en `MODALIDADES`** (RDL 7/2026:
20/40 % hasta 31/12/2026, 60 % hasta 31/12/2027): cuando se vuelva a prorrogar, se cambia ahí.

**REGLA — el TIPO de vivienda lo manda el CATASTRO, como en la oportunidad**
(`tipoAutomatico`): participación < 100 % → **piso → 40 %**, diga lo que diga el
`<TipoDeEdificio>` del certificado (el mismo criterio de `calculateFinancials` y
`PropertySheet`). Medido en **2026CEE_60**: el certificado declara «ViviendaUnifamiliar»,
el Catastro le da un **16 %** de participación, y la guía salió al 60 % — a la clienta.
En el CAE la participación viene de la simulación (`inputs.participation`, y
`inputs.tipo === 'piso'` también cuenta); en un CEE directo, que no tiene oportunidad,
se le pregunta al Catastro por su referencia (`participacionDe`, por `getByRC`, que
respeta el WAF y cachea). Solo un «edificio completo» que declare el certificado se
respeta; con el 100 % decide el certificado. Lo elegido a mano en el popup manda sobre
todo, y si el certificado y el Catastro no coinciden se AVISA. Si el Catastro no
responde, se avisa de que el tipo sale del certificado. ⚠️ «Piso» aquí significa
**división horizontal**, y ahí cabe también una vivienda **EN HILERA** que comparte finca
(2026CEE_60 lo es): al cliente se le nombra con `descripcionTipo` —certificado
unifamiliar + participación < 100 % → «Vivienda unifamiliar en hilera (división
horizontal)»—, nunca "un edificio dividido en pisos" de un adosado.

**REGLA — lo que se cambia en el popup se GUARDA SOLO** (`POST …/guia-irpf/ajustes`, con
freno, y al cerrar se vacía lo pendiente). En 2026CEE_60 se eligió «piso», se cerró sin
pulsar «Guardar», se marcó cobrado y la entrega automática —que usa los ajustes
GUARDADOS— salió al 60 %. Compara con lo último guardado, no con "¿es el primer render?".

**REGLA — reenviar una guía con OTRO porcentaje es una CORRECCIÓN, y se dice**
(`esCorreccion`, con lo sellado en `guia_irpf.modalidad` + `enviada`): el mensaje empieza
diciendo qué deducción le indicamos, cuál le corresponde y por qué, y que descarte la
anterior; el asunto lleva «CORREGIDA» y el historial «60 % → 40 %». Sin eso el cliente se
queda con dos guías que dicen cosas distintas.

**REGLA — los datos de Renta Web son LITERALES** (verificados con el manual de la AEAT
2025): situación (clave 1), referencia catastral, NIF de quien ha realizado las obras (1)
y (2), fecha y consumo/letra de los dos certificados, cantidades satisfechas. El rótulo de
cada opción (`opcionRenta`) es el de la pantalla de Renta Web: no se parafrasea.

**REGLA — en la guía manda lo que dice EL CERTIFICADO (`.xml`)**, al revés que en la
comprobación de la pantalla: es lo que el cliente teclea mirando su papel. Si lo guardado
difiere (fecha o consumo) se usa el `.xml` y se AVISA a quien envía.

**REGLA — "cantidades satisfechas" van CON IVA.** Las facturas del expediente solo
guardaban la base: se supone el 21 % y se marca en ámbar para que una persona lo compruebe
(puede ser 10 %). Desde hoy el lector de facturas guarda además `importe_con_iva`, `iva_pct`,
`emisor_nombre` y `emisor_nif` (rutas de OCR, `facturaAutoOcr` y el modal). La factura de
NUESTROS certificados (CEE directo, `facturas_emitidas` al cliente) también cuenta —la
norma incluye «la emisión de los correspondientes certificados»— pero BROKERGY no "ha
realizado las obras" y no pone su NIF ahí. El popup deja añadir a mano las facturas que
pase el cliente.

**REGLA — sin facturas de la OBRA va un EJEMPLO, nunca una estimación sobre lo que haya**
(decisión del usuario, 2026-10-01). Ninguna factura, o solo la de nuestros certificados —lo
normal en un CEE directo: la obra la contrató el cliente con otro—: estimar sobre los 161 € de
la factura de los certificados le diría que se deduce 96. En su lugar, el recuadro oscuro de
la guía es **«EJEMPLO · OBRA DE 9.000 €»** (`IMPORTE_EJEMPLO`, IVA incluido): 60 % → 3.000 +
2.400 = **5.400 €** en dos declaraciones; 40 % → 3.000 (topado a 7.500); 20 % → 1.000. El
ejemplo es el de UNA persona aunque haya varios propietarios (repartido parecería calculado), y
la guía le dice que lo suyo es el mismo % de lo que haya pagado. En cuanto hay una factura de
la obra —del expediente o añadida en el popup— sale su caso real. **No es un aviso** (en un CEE
directo saldría siempre): el popup lo dice como información. La frase del ejemplo es fuente
única (`fraseEjemplo`) para el mensaje de la guía y el de la entrega, y con ejemplo el sello no
guarda `deduccion_estimada` (guarda `ejemplo`).

**REGLA — en un CEE directo la guía VIAJA CON LA ENTREGA del certificado**
(`guiaIrpfService.guiaDeEntrega`): la del panel «Entrega al cliente» —manual y automática— y el
«Enviar al cliente» de la rejilla, si la fase entregada es la de «después» (la del encargo en
uno ÚNICO, la final en uno DOBLE) y hay certificado de antes con el que comparar. Sin esto, el
certificado y la guía eran dos mensajes con el mismo PDF. Va adjunta, el mensaje la anuncia
(`textoGuiaEnEntrega`), queda en Drive y sellada (`enviada.via = 'entrega'`) y el historial lo
dice. **Nunca para la entrega**: si la guía no se puede componer o rasterizar, el certificado
sale igual y sin el párrafo que la anuncia. Usa los ajustes GUARDADOS de la guía, así que el
panel la enseña ANTES de entregar (también mientras falta el cobro) con «Revisar la guía»: el
mismo popup en modo `soloRevisar` (sin «Enviar», que sería mandar el certificado dos veces).
Probar sin enviar nada: `node scripts/probar_guia_irpf.js 2026CEE_60` (imprime también lo que
llevaría la entrega).

**REGLA — el MENSAJE dice el AHORRO con sus cifras, no solo la guía** (Fran, 26/10/2026,
2026CEE_61: «me han preguntado qué y cuánto se ahorra; en la guía no se ve a la primera»).
`fraseAhorro` en [logic/guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js)
saca las MISMAS cifras que la frase «Tus certificados lo acreditan» del PDF —consumo de energía
primaria no renovable antes → después, el % y las letras; o la demanda, en la del 20 %— y va
DELANTE del párrafo de la guía en la entrega (`textoGuiaEnEntrega`: por fase, «Entregar todo» y
automática), en el mensaje de la guía suelta (`mensajeGuiaIrpf`) y, en tercera persona
(`ahorroTercero`, «la vivienda»), en el mensaje al PARTNER. Si acredita por LETRA y no por el
30 %, dice la letra y no promete el 30 %. Sin cifras comparadas no se escribe nada (`null`).
Ejemplo real: «📉 *Lo que ahorra tu vivienda:* con la obra, su consumo de energía primaria no
renovable baja un *65,1 %*: de 189,60 a 66,08 kWh/m²·año, de la letra D a la B. Para la
deducción se exige al menos un 30 %.»

**REGLA — se envían SOLO los PDF FIRMADOS** (`…_fdo.pdf`) **y la guía**, renombrados para el
cliente («CEE ANTES / DESPUÉS DE LA OBRA»); sin el `.xml`, el `.cex` ni el registro. Todo o
nada: si falta un PDF no sale el mensaje. En un CEE directo de UN certificado se manda solo
el nuestro (el anterior es del cliente) y el mensaje se lo recuerda. **Respeta el candado de
cobro** de los CEE directos; en el CAE antes de `DOC. COMPLETA` solo AVISA.

**REGLA — la guía se guarda y se SELLA** en `documentacion.guia_irpf` (enlace + ajustes del
popup + envío; RPC de MERGE): `1. CEE` en el CAE, la raíz del encargo en un CEE directo,
sustituyendo la anterior. Es **clave protegida** del autoguardado en los dos negocios (en el
CEE directo se protegió de paso `entrega_cliente`, que tampoco lo estaba). El portal la sirve
con la clave `guia_irpf` (`fields` admite ya rutas con punto).

⚠️ `toLocaleString('es-ES')` NO agrupa números de cuatro cifras ("7768 €"): la guía usa su
propio formateador (`miles`). Y la hoja es de alto FIJO: tras tocar la maqueta, el test mide
la holgura (hoy +16 px en el peor caso: 5 facturas, 2 empresas, 2 propietarios; el ejemplo
deja más de +180).

**Estilo «carta de pago» (26/10/2026, Fran: «aplícala también en la guía IRPF»)**: copia la
hoja de [carta_pago_bono_cae.html](implementation/backend/plantillas/carta_pago_bono_cae.html):
filete arriba, logo a la izquierda y expediente/fecha a la derecha, titular en Antonio con
«en la Renta» en lima, la cifra en una tarjeta TINTA con el filete abajo (la deducción y lo
que la acredita a la izquierda, lo estimado por año a la derecha), etiquetas de sección en
naranja con raya tinta y la banda oscura con «BROKERGY · Ingeniería energética» y el lema en
naranja. Texto en Inter. ⚠️ Antonio se declara a mano en la guía: `buildFontFaces` exige las
caras latin y latin-ext, y de Antonio solo hay `Antonio-700-latin.woff2`. ⚠️ El recuadro «tus
certificados lo acreditan» va DENTRO de la tarjeta oscura: fuera, la hoja del peor caso se
pasaba 75 px (Inter es más ancha que Manrope).

### La hoja del BONO CAE (26/10/2026)

Fran: «muchos clientes y gestores se piensan que el CAE se descuenta del coste total, como en las
subvenciones antiguas (RD 853, 477), y me piden el justificante de la resolución». En un
expediente **CAE** la guía lleva una **segunda A4, «Tu bono CAE en la Renta»** (`hojaBonoCae`), con
la misma cabecera y pie: «El bono CAE *no es una subvención*», la tarjeta tinta con **«No se
resta»** a la izquierda y, a la derecha, su bono COBRADO con lo que tributa (o «19 % · 21 %» si aún
no se ha cobrado), por qué no se resta (la ley frente a lo que es el bono), el error con números,
el justificante y cómo se declara. La nota de la hoja 1 remite a ella y el mensaje de envío
(`mensajeGuiaIrpf`) la anuncia. **En un CEE directo no va** (no hay bono): la guía sigue en una hoja.
La ficha de la consulta, con las fuentes: [consultas/bono-cae-no-se-resta-y-no-hay-resolucion.md](docs/conocimiento/consultas/bono-cae-no-se-resta-y-no-hay-resolucion.md).

**REGLA — el bono CAE NO se resta de las «Cantidades satisfechas»**: la DA 50ª solo descuenta lo
«subvencionado a través de un programa de ayudas públicas» (lo que pasaba con los RD 853/2021 y
477/2021, con su resolución de concesión). El bono es el precio que un sujeto obligado paga por
los ahorros cedidos en el convenio (RD 36/2023): ganancia patrimonial en la base del ahorro (DGT
V2137-25, 11/11/2025). Los dos van por separado y la deducción se calcula sobre todo lo pagado.

**REGLA — no hay «resolución»: el justificante es la CARTA DE PAGO + el convenio de cesión.** Los
datos salen de `documentacion.cobro`, igual que en `cartaPagoService.datosDe`: importe
`transferencia.importe ?? remesa.importe`, fecha `remesa.fecha_ejecucion || transferencia.at` y
número `carta_pago.numero` (`bonoCobrado` en el servicio → `datosBonoCae` en la lógica). Sin cobro
la hoja va SIN cifras y dice «la carta de pago que te enviamos con la transferencia del bono».

**REGLA — el impuesto del bono es APROXIMADO y se dice**: `calcularIrpfGananciaPatrimonial` (la
misma escala del interruptor «IRPF del CAE» de la calculadora, que ahora llega al 28 % por encima
de 300.000 €) sobre el bono SOLO; la hoja advierte que cambia si tiene otras ganancias del ahorro
ese año. No da casillas de Renta Web (no verificadas) ni cita consultas que no se han podido
comprobar: el año de imputación es «el del cobro», con la salvedad de consultar al asesor si
firmó un año y cobró al siguiente.

**La hoja SUELTA** (`buildHojaBonoCaeHtml`, sin «hoja 1» en el texto) es para quien pide la
resolución sin esperar a su guía: `node scripts/hoja_bono_cae.js` (genérica) o
`hoja_bono_cae.js 25RES060_66` (con su bono, 8.099,51 €, y su carta CP-2026-0012). El ejemplo del
error usa una obra de 12.000 € o, si el bono es grande, el triple del bono redondeado a miles.
Holgura medida: hoja 2 ≥ +143 px; la hoja 1 del peor caso sigue en +16 px.
