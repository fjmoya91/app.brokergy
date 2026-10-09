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
| El orquestador (chats · chat · escuchar · catastro · leer · aerotermia · crear) | [scripts/alta_oportunidad.js](implementation/backend/scripts/alta_oportunidad.js) |
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

**REGLA — sin emisor declarado, RADIADORES convencionales** (decisión del usuario, 2026-10-01).

**REGLA — TODO lo que el Catastro declara como VIVIENDA cuenta** (decisión del usuario, 2026-10-01),
aunque el croquis solo dibuje radiadores en una planta: `seleccionConstrucciones` no deja quitar una
vivienda; el plan solo puede AÑADIR lo que el Catastro no da como vivienda. Y la **orientación de la
fachada principal y los patios** salen del croquis o de las fotos (`orientacion`, `patios`): es lo que
se corregía a mano. Medido en OP250: con las dos plantas (175 m²), N y 1 patio, la skill da al céntimo
lo que se guardó a mano en la calculadora (96,76 kWh/m²·año · 20.284 kWh · bono 2.028,37 €); con solo
la planta baja daba 1.594 €.

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

Primer caso real: **26RES060_OP250** (chat «ISM Alejandro administración», 01/10/2026): RC + PDF del
Catastro, presupuesto con CARRIER 30AWH010HM (catálogo id 420) y bomba de ACS LASIAN ATHERIA 100
(fuera de catálogo), placa JUNKERS CGW25 de gasóleo 25 kW y croquis con los radiadores por estancia.
⚠️ La lectura de chats por la API necesita el backend DESPLEGADO; ese primer caso se leyó con el mismo
código ejecutado por CDP sobre la sesión del VPS (solo lectura).
