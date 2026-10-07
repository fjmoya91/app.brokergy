<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La GUÍA de la deducción del IRPF para el cliente (2026-10-01)

Botón **🧾 Enviar al cliente: certificados + guía de la Renta** bajo la comprobación
del IRPF del módulo CEE (solo equipo interno), en los DOS negocios. Al cliente le
llegan sus certificados FIRMADOS y una guía de UNA página, con la marca de los
documentos de cliente (la de la oferta de CEE: filete degradado, Manrope + Archivo,
banda oscura con el lema), que le dice qué deducción aplicarse, dónde se marca en
Renta Web y todos los datos que le va a pedir, ya rellenos. La guía se guarda en Drive
y el cliente la descarga también desde su portal (`/mi-expediente`).

| Qué | Dónde |
|---|---|
| Qué deducción, estimación, texto del mensaje y HTML del PDF (fuente única) | [logic/guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js) |
| Cargar los dos negocios, PDF, Drive, envío y sello | [services/guiaIrpfService.js](implementation/backend/services/guiaIrpfService.js) |
| Rutas (montadas en `expedientes` y `ceeDirectos` desde un único montador) | [routes/guiaIrpfRutas.js](implementation/backend/routes/guiaIrpfRutas.js) — `GET /:id/guia-irpf` · `POST …/estado` · `…/pdf` · `…/guardar` · `…/enviar` (**staffOnly**) |
| Popup (vista previa = el PDF real) | `GuiaIrpfModal.jsx` (+ `GuiaIrpfBoton`) |
| Lector del `.xml` sin DOM para el servidor | `leerDatosIrpfDeTexto` en [xmlCeeParser.js](implementation/frontend/src/features/calculator/logic/xmlCeeParser.js) |
| Pruebas | `node implementation/backend/scripts/test_guia_irpf.mjs` (lógica + cabe en UNA hoja) · `probar_guia_irpf.js <nº> [--pdf]` (expediente real, sin escribir) |

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
la holgura (hoy +26 px en el peor caso: 5 facturas, 2 empresas, 2 propietarios; el ejemplo
deja más de +130).
