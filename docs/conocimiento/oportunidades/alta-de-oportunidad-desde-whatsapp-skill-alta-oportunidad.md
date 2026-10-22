<!-- conocimiento · área: oportunidades · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Alta de OPORTUNIDAD desde WhatsApp — skill `alta-oportunidad` (2026-10-01)

El instalador pide una simulación por WhatsApp y manda, en una ráfaga, casi siempre lo mismo: la
referencia catastral, la foto de la caldera y la de su placa, a veces si son radiadores, y de vez en
cuando un croquis o el presupuesto. Rellenar «Nueva simulación» con eso a mano era el trabajo; ahora
lo hace la skill **`alta-oportunidad`** y deja la oportunidad en **PTE ENVIAR** con su simulación, el
cliente dado de alta y los documentos en Drive. La propuesta (PDF) se sigue revisando y enviando
desde la app.

| Qué | Dónde |
|---|---|
| Leer una conversación ENTERA (texto, adjuntos, vCards, notas de voz) | [whatsappConversacion.js](implementation/backend/services/whatsappConversacion.js) |
| Rutas (equipo interno o `x-internal-key`) | `GET /api/whatsapp/conversacion/chats?q=` · `POST /api/whatsapp/conversacion` · `GET /api/whatsapp/conversacion/adjunto?msg=` |
| Lo determinista (bloque de la petición, plantas, plan → funnel, historial) | [utils/altaOportunidad.js](implementation/backend/utils/altaOportunidad.js) |
| El orquestador (chats · chat · escuchar · catastro · leer · aerotermia · crear · obra · documentar · renombrar · correo-raw · correo) | [scripts/alta_oportunidad.js](implementation/backend/scripts/alta_oportunidad.js) |
| Leer un presupuesto (fuente única con la ruta del funnel) | `extraerDocumentoObra` en [routes/facturaOcr.js](implementation/backend/routes/facturaOcr.js) |
| La skill | `skills/alta-oportunidad/` (+ `referencia/plan.md`) |
| Pruebas | `node implementation/backend/scripts/test_alta_oportunidad.js` |

**REGLA — el alta sale por las MISMAS funciones que el formulario.** `funnelToCalculatorInputs` y
`computeFullCalculatorResult` (frontend, importados por ESM con un gancho que resuelve los imports sin
extensión), `createLead` en modo interno y `subirFicherosASlot` (la primera subida crea la carpeta de
Drive). Lo único que añade la skill es lo que el formulario no sabe: la fila de la caldera por su EDAD
real (`rendimiento_id`, que manda sobre el «más de 20 años» del funnel — en gasóleo eso cae en
«anterior a 1985» aunque la caldera sea de 2005), las U con la ZONA (lo que hace la calculadora al
abrirse) y la aerotermia del catálogo con los campos de «Leer la placa». Y pasa bien la provincia: el
formulario la manda fuera de `catastro` y la ruta la pierde (`datos_calculo.provincia/ccaa` vacíos).

**REGLA — la conversación se LEE en el servidor, y solo se lee.** La sesión de WhatsApp es un
singleton del proceso del VPS: la skill (en el PC) entra por las rutas con la clave interna. Mismo
cuidado que `whatsappMedia`: `WAWebCollections` directo (nunca `fetchMessages`/`getChatById`), en la
MISMA fila de lecturas (`enSerie`, exportada) y con plazo; no crea chats; y un adjunto solo se baja de
una conversación leída por esa ruta en las últimas 3 h. Se bajan también las **notas de voz**
(`audio/ogg` en `EXT_MIME`): el instalador dice de viva voz lo que no escribe, y la skill las
transcribe con el mismo cliente de Gemini.

**REGLA — sin emisor declarado, RADIADORES convencionales** (decisión del usuario, 2026-10-01). Y
una idea del cliente no es un emisor declarado (2026-10-14): en 26RES060_OP300 la clienta decía en un
audio que quizá pondría suelo o techo radiante, sin presupuesto ni instalador; la skill puso suelo
radiante (SCOP genérico 5,00, bono 4.220 €) y se corrigió a radiadores (4,00, bono 4.034 €).

**REGLA — la edad de la caldera sale de la PLACA, nunca del año de la vivienda** (decisión del usuario,
2026-10-14). La skill ponía, sin año en la placa, la fila de la caldera según el año de construcción de
la casa; en casas antiguas eso daba calderas «de antes de 1985/1998» que no lo son (la caldera casi
nunca es la original) y un η bajo que infla el ahorro. Ahora: **con placa que dice el año**, la fila de
ese año, aunque sea antigua; **sin placa o sin año**, la fila MÁS RECIENTE de su tipo (gasóleo
`oil_post98` u `oil_cond`; gas `gas_post98_auto` o `gas_post98_cond_auto`), dicho en `decisiones`.

**REGLA — TODO lo que el Catastro declara como VIVIENDA cuenta** (decisión del usuario, 2026-10-01),
aunque el croquis solo dibuje radiadores en una planta: `seleccionConstrucciones` no deja quitar una
vivienda; el plan solo puede AÑADIR lo que el Catastro no da como vivienda. Y la **orientación de la
fachada principal y los patios** salen del croquis o de las fotos (`orientacion`, `patios`): es lo que
se corregía a mano. Medido en OP250: con las dos plantas (175 m²), N y 1 patio, la skill da al céntimo
lo que se guardó a mano en la calculadora (96,76 kWh/m²·año · 20.284 kWh · bono 2.028,37 €); con solo
la planta baja daba 1.594 €.

**Una vivienda en VARIAS referencias, con más superficie que el Catastro** (2026-10-15, ático de
C/ San Agustín 27, Iniesta, instaladora NÚÑEZ FONTANERÍA): tres RC de la planta 3, las tres
«Almacén-Estacionamiento» (80 m²), que son un ático vivido de «120 habitables» según la instaladora.
El plan admite `rcs_adicionales` (suma las construcciones privativas de las otras RC; la oportunidad
va sobre `rc`), `superficie_declarada` (manda sobre el Catastro, se avisa: la mide el CEE; elegida por
Fran frente a los 80 m²), `subtipo: "atico"` y `caldera.combustible: "glp"` (propano: en el funnel
`gas`, en la calculadora `fuelType: 'glp'` + `Propano`; el bono no cambia, el ahorro en € y el CE3X
sí). Con 120 m², ático y propano: 45,51 kWh/m²·año · 8.948 kWh · bono 894,76 €. ⚠️ Un CEE de vivienda
sobre tres RC de almacén puede tener pegas del verificador: se avisa para regularizarlo.

**REGLA — la placa de la caldera viaja con la oportunidad** (`inputs.placa_caldera`: marca, modelo, nº
de serie, potencia útil, combustible) y `expedienteService` la hereda al aceptar — solo HUECOS, y un
nº de serie dudoso no. En Junkers/Bosch «FD 583 …» es la fecha de fabricación, no el nº de serie.

**REGLA — una vivienda que ya tiene oportunidad PARA la skill y se pregunta**: puede ser un cambio de
presupuesto de una simulación ya hecha, no un alta. La skill solo da de alta.

**REGLA — el CEE que aporta el cliente entra para la COMPARATIVA, no para el cálculo** (2026-10-01).
Se carga el MÁS RECIENTE (`cee` del plan, PDF leído con el OCR de «Nueva simulación») con
`ceeParaComparativa` ([ceeSeed.js](implementation/frontend/src/features/calculator/logic/ceeSeed.js)):
`cee_previo` + su demanda y superficie, y la simulación **sigue en modo estimado**. Así
`computeCeeComparison` da dos cifras distintas —«con tu CEE» (demanda × superficie del certificado)
y «CEE nuevo BROKERGY» (la estimada)— y la propuesta las ofrece; con `seedInputsFromCees`
(`demandMode: 'manual'`) las dos coincidirían y la propuesta la escondería. Es el mismo estado en
que quedan las que se hicieron a mano (OP140, OP152, OP168). Sin `xmlDemandData`: qué CEE vale lo
elige el cliente al aceptar. `modo: "cee"` usa el certificado para el cálculo, sin comparativa.
**Una caldera MIXTA que se retira hace que la aerotermia asuma el ACS** (76 de 93 simulaciones).
Caso: **26RES060_OP252** (clienta que escribe ella misma, instalador Vicente Guerrero, CEE de las
placas de diciembre de 2023): estimado 4.392 € de bono frente a 3.294 € con su CEE.
⚠️ `CalculatorForm.applyCeePrevio` (cargar el CEE en la calculadora) guarda el **PDF en base64**
dentro de `inputs.cee_previo` —hasta 2,6 MB (OP139)—, contra la regla 21; `ceeParaComparativa` no.

**REGLA — un CEE NUESTRO no da la comparativa «con tu CEE / CEE nuevo BROKERGY»** (Fran,
22/10/2026, 26RES060_OP321). Esa comparativa es para el CEE que APORTA el cliente. Al cargar en la
simulación el CEE inicial que hicimos nosotros (skill `generar-cee-inicial`), la propuesta y el envío
le decían al cliente «con tu CEE sale a tanto», porque bastaba con que hubiera `cee_previo` y que
las dos cifras no redondearan igual. Ahora entra con `seedInputsFromCees({ propio: true })`, que lo
marca `cee_previo.origen = 'brokergy'`, y `computeCeeComparison` devuelve null con él (`ceeEsPropio`
en [ceeSeed.js](implementation/frontend/src/features/calculator/logic/ceeSeed.js)): sin comparativa en
la propuesta, en el popup de envío ni en la calculadora, cuyo recuadro dice «CEE inicial de BROKERGY
cargado» en vez de «Este cliente aportó un CEE inicial». Tras tocarlo:
`node implementation/backend/scripts/test_alta_oportunidad.js`.

**Y un RES080 con los DOS certificados en `.xml`** (2026-10-08, 26RES080_OP70: reforma integral
ya ejecutada con ayudas FEDER, CEE del estado previo registrado con la 2.3). El plan admite
`reforma` (qué se toca de la envolvente → `isReforma`), `obra_estado: "ejecutada"`, `cee_xml:
{ inicial, final }`, `presupuesto.envolvente_con_iva` e `incluir_irpf: false`. El inicial se pasa a
la 3.2 (`convertir_cex.py`) y el previsto se hace copiando el inicial (`/cex/previsto`); los dos se
califican con CE3X (`cex_a_pdf.js --solo-xml`) y sus `.xml` entran como en la calculadora con los
dos cargados: `demandMode: 'real'` + `metodoAhorroRes080: 'simplificado'` →
`calculateRes080SimplificadoFromXml` (la energía final que declara cada uno, por vector).
**REGLA — la superficie es la del CEE, no la de vivienda del Catastro**: la energía final del
`.xml` es por m² del certificado (OP70: 152,12 m² frente a 198; con la del Catastro el ahorro subía
un 30 %). **Sin `cee_previo`**: con él `ProposalModal` ofrece la comparativa «con tu CEE / CEE
nuevo», que con el ahorro medido entre dos certificados no tiene sentido (en OP70 salían 36.427 € y
6.795 €; sin él, 3.467 €, lo mismo que el alta). Ese hueco sigue en la app: cargar a mano un
inicial y un final en «Nueva simulación» también deja `cee_previo`.

**Y cuando el material llega por EMAIL** (2026-10-19, INSTALACIONES PLAZA 2014 SL, «DOCUMENTACION
PARA SUBVENCION»: el presupuesto 189, el recibo del IBI con la RC y fotos de la caldera ACV Delta).
El usuario lo pide igual («da de alta lo que ha mandado Instalaciones Plaza por email») y, desde que
hay una carpeta con el cuerpo y los adjuntos, el recorrido es el MISMO que con el chat. Solo cambia
cómo se baja:

- **Gmail es el camino principal**: `franciscojavier.moya.s2e2@gmail.com` recibe también lo de
  `franciscojavier.moya@brokergy.es` y cosas que no pasan por ese buzón. El conector de Gmail de
  claude.ai **no tiene descarga de adjuntos**; lo que funciona (probado con correos de 72 KB a
  8,5 MB) es `get_message` con `messageFormat: "RAW"`: el MIME entero en base64url que, como pasa del
  límite de salida, Claude Code guarda en `~/.claude/projects/<proyecto>/<sesión>/tool-results/
  …get_message-….txt` (un JSON con `raw`). La orden **`correo-raw <ese fichero>`** lo abre con
  `mailparser` (también un `.eml`).
- **El buzón de Hostinger, por IMAP**: **`correo "<remitente o asunto>" [--dias 14] [--uid N]`** con
  la cuenta `LOTE_SO_SMTP_*` (la de `firmadosSoCorreo.js`), abierto en **solo lectura** (EXAMINE):
  no marca nada como leído ni mueve nada. Solo ve lo que llega a brokergy.es.

**REGLA — lo que se baja de un correo es de un tercero**: carpeta NUEVA y vacía
(`scratch/alta-oportunidad/<remitente>-<fecha>/`, fuera de git; si existe con algo, `-2`), nada de
dentro se ejecuta, y el correo nunca se contesta desde aquí. Los dos caminos dejan `cuerpo.txt`,
`correo.json` y los adjuntos numerados, descartan los REPETIDOS por hash (Hotmail mandó la misma foto
dos veces) y las imágenes en línea de menos de 20 KB (logos y firmas), y abren un `.eml` adjunto.

**REGLA — el partner sale del remitente, como PISTA**: la orden busca la dirección en `email`,
`email_contacto` y `email_responsable` del prescriptor (con un dominio de empresa, el dominio; un
dominio gratuito no identifica a nadie), y sin nada, la razón social del nombre del remitente. Se
contrasta con quien firma el presupuesto (en Plaza salió PLAZA por el email de su ficha).

**Con correo no hay chat que renombrar**: el plan lleva `correo` (remitente, asunto, fecha) en vez
de `chat`, sin `wa_msg_id`, y el historial dice «📧 … por email de X «asunto»» (`origenCorreo` del
script; `textoHistorial` no se tocó). El paso del nombre del chat se salta y se dice; el título de la
sesión sí se pone. Detalle: `skills/alta-oportunidad/referencia/correo.md`.

**Y las PLACAS FOTOVOLTAICAS de la misma obra** (2026-10-19, 26RES060_OP310: el presupuesto 189 de
Plaza traía aerotermia 8.164,80 € y placas 9.155,84 € sin IVA). El alta metía el TOTAL del
documento en P. Aerotermia y `computeFullCalculatorResult` no pasaba `presupuestoFotovoltaica` a
`calculateFinancials`, así que la deducción del IRPF salía sobre la aerotermia sola: 5.927 € en vez
de 9.000 €. Se arregló a mano y ahora el alta lo hace como la calculadora:

- El presupuesto se reparte con **`lecturaAPresupuesto`** ([presupuestoLeido.js](implementation/frontend/src/features/calculator/logic/presupuestoLeido.js),
  la regla 85 de la propuesta): las líneas de partida FOTOVOLTAICA van a P. Fotovoltaica, las de
  envolvente (en una reforma) a P. Reforma, y cada hueco deja su huella en `inputs.presupuestos_leidos`.
- **REGLA — la cifra de las placas del plan MANDA sobre la del lector**
  (`presupuesto.fotovoltaica_con_iva`). El lector deja la obra civil y la mano de obra en la
  aerotermia: en el 189 separó 8.009,69 € de placas, no 9.155,84. Quien ha mirado el PDF pone la
  cifra; si las placas vienen DENTRO del mismo presupuesto, lo que se pone o se quita a P.
  Fotovoltaica sale de P. Aerotermia, y la suma sigue siendo el total del documento (nada se cuenta
  dos veces). Lo hace `fijarFotovoltaica` ([utils/altaOportunidad.js](implementation/backend/utils/altaOportunidad.js)),
  que deja también la huella `presupuestos_leidos.FOTOVOLTAICA` (con `origen: 'plan'`).
  `leer --presupuesto` imprime lo que suma cada partida para sacar la cifra.
- Si las placas traen **su propio presupuesto** (`presupuesto.fichero_fv`), se lee en su hueco, va a
  `DOC_PRESUPUESTO` y, al escribir, de anexo de la propuesta en `0. PRESUPUESTO` con el MISMO nombre
  que le pone `POST /:id/anexos` (`PRESUPUESTO DE LA INSTALACIÓN_FOTOVOLTAICA.pdf`, hueco «Placas
  solares»); si ya hay uno, no se pisa.
- **`computeFullCalculatorResult` pasa ya `presupuestoFotovoltaica`** a los dos `calculateFinancials`
  (el base y el del RES080) y al plazo de amortización, como `CalculatorView`. El funnel público no
  lo pregunta (no llega: 0), así que su cifra no cambia; la comparativa del CEE tampoco (la
  deducción es la misma en las dos columnas).
- Las placas suman a la inversión y a la base del IRPF, **no al bono CAE**. El seco lo imprime:
  «Presupuesto: 9.879,40 € + placas FV 11.078,57 € = inversión 20.957,97 €» y «IRPF 9.000 € (sobre
  20.957,97 €, con las placas)». Prueba: `test_alta_oportunidad.js` (bloque «Placas fotovoltaicas»).

Primer caso real: **26RES060_OP250** (chat «ISM Alejandro administración», 01/10/2026): RC + PDF del
Catastro, presupuesto con CARRIER 30AWH010HM (catálogo id 420) y bomba de ACS LASIAN ATHERIA 100
(fuera de catálogo), placa JUNKERS CGW25 de gasóleo 25 kW y croquis con los radiadores por estancia.
⚠️ La lectura de chats por la API necesita el backend DESPLEGADO; ese primer caso se leyó con el mismo
código ejecutado por CDP sobre la sesión del VPS (solo lectura).
