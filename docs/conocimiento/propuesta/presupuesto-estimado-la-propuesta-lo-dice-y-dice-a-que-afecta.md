<!-- conocimiento · área: propuesta · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Presupuesto ESTIMADO — la propuesta lo dice, y dice a qué afecta (2026-09-03)

El flujo interno preguntaba el dinero DOS veces seguidas: la pantalla de soltar el
presupuesto/las facturas y, si no se adjuntaba nada, el `Step8` volviendo a preguntar
"¿hay un presupuesto orientativo?" para acabar estimando 15.000 €. Y de ahí salía una
propuesta que presentaba esos 15.000 € **como si fueran el presupuesto del cliente**,
con su inversión neta y su deducción calculadas encima.

### Una sola pregunta, con tres salidas

`StepDocsObra` es ahora el ÚNICO paso económico del flujo interno. Dos tarjetas
(Presupuesto · Factura) que abren un **popup**, y dentro del popup conviven las dos
formas de aportarlo: **soltar el documento** (lo lee el OCR) o **teclear el importe**.
La tercera salida es el botón "No tengo — estimar 15.000 €".

**REGLA — el popup, no dos zonas de suelta abiertas.** Con las dos a la vista hay que
decidir en cuál se suelta antes de saber qué se va a soltar, y sobre todo faltaba el
caso más común: tener el importe pero no el PDF a mano.

**REGLA — "no tengo" NO es saltarse el paso: es ELEGIR el estimado.** El botón dice la
cifra y la pantalla explica qué implica, porque de ahí sale una propuesta que el cliente
va a leer como firme.

### La marca viaja hasta la propuesta

Fuente única del concepto, de la cifra y del texto:
[logic/presupuestoEstimado.js](implementation/frontend/src/features/calculator/logic/presupuestoEstimado.js)
(`PRESUPUESTO_ESTIMADO_EUR`, `esPresupuestoEstimado`, `avisoPresupuestoEstimado`,
`lineaPresupuestoEstimado`).

`funnelToInputs` sella `inputs.presupuestoEstimado`, y **cualquiera que teclee un
presupuesto en la calculadora lo levanta** (los tres campos de `CalculatorForm`). Se
enseña en cuatro sitios, todos desde el mismo texto: la chapa de la portada, el
"(ESTIMADA)" de la fila de inversión, un recuadro naranja bajo la tabla y el **mensaje
de envío** (WhatsApp/email), que se pega al final de `buildCaption` en vez de repetirse
en sus quince ramas. La **nota al pie se retiró el 28/09/2026**: repetía palabra por
palabra el recuadro que tiene justo encima, y era parte de lo que empujaba las notas
debajo del pie negro (ver "La portada de la propuesta NUNCA esconde texto").

**REGLA — el bono CAE NO cambia y la deducción SÍ, y hay que decir las dos cosas.** El
CAE sale del ahorro de energía CERTIFICADO (kWh), así que el importe prometido se
mantiene; la deducción del IRPF es un porcentaje del coste total de la ejecución **IVA
incluido**, así que se mueve con el presupuesto, y con ella la inversión neta. Decir
solo "es estimado" deja al cliente pensando que toda la propuesta puede caerse.

**REGLA — sin deducción, ese párrafo NO se escribe** (`conIrpf`). En un titular empresa
(`includeIrpf: false`) advertir del efecto sobre algo que no existe es ruido sobre la
única cifra que sí es firme.

**REGLA — con "ocultar coste de obra" no se avisa.** Ahí el presupuesto no aparece por
ninguna parte y ya hay una nota que lo explica: dos avisos sobre lo mismo se contradicen.

El backend (`leadMessages.presupuestoNote`, que alimenta el WhatsApp y el email del
funnel público) carga ESE MISMO módulo por `import()` ESM —igual que `cifoService` con
`cifoDoc.js`—, así que al cliente que primero recibe el mensaje del funnel y luego la
propuesta se le explica lo mismo con las mismas palabras. Por eso `buildWhatsAppMessage`
y `buildProposalPdfHtml` son ahora `async`.

⚠️ De paso, las **notas al pie de la propuesta se numeran solas**: escritas a mano, la
del coste de obra y la del ahorro anual eran las dos "NOTA 3" y podían salir juntas.

### La portada de la propuesta NUNCA esconde texto (2026-09-28)

La hoja 1 es un A4 de alto FIJO con el pie negro (`.prop-cta`) anclado abajo: lo que no
cabe no empuja a otra hoja, se queda DEBAJO del pie. El ajuste de `ProposalModal` tenía
dos escalones —estirar/encoger los huecos elásticos y el modo compacto— y, si ni con los
dos cabía, **se rendía**. Medido sobre las 54 últimas propuestas enviadas (su
`html_propuesta`, que es lo que abre el cliente): 4 tenían la portada cortada, **todas
con el recuadro de presupuesto ESTIMADO**, y en 26RES060_OP208 no se veía ni una de sus
notas. Las hojas 2-4 no se cortaban en ninguna.

**REGLA — hay un TERCER escalón: `zoom` sobre el cuerpo de la hoja (`.prop-pb`).** El
mismo mecanismo que ya aplicaba el servidor al imprimir, pero ahora en la VISTA PREVIA,
porque la vista web del enlace no pasa por el servidor. Reduce el cuerpo entero en la
misma proporción —no se pierde ni una línea y conserva el ancho—, y se busca el MAYOR
zoom que cabe por **bisección** (la proporción sola se pasa de frenada: al reducir, el
texto gana caracteres por línea y se come renglones). Antes de llegar ahí, en compacto
se aprieta del todo, y el recuadro del presupuesto estimado y el de la hipótesis del
IRPF se compactan también. Resultado sobre las que se cortaban: zoom entre **0,906**
(OP208) y **0,994** (OP240). Suelo `ZOOM_MIN` = 0,72.

**REGLA — el servidor PARTE del zoom que ya trae la portada.** `encajarPortadas` empezaba
en 1 y, como la cuenta es relativa a lo que mide, SUSTITUÍA un 0,9 de la vista previa
por uno mayor y la hoja volvía a salirse. Su suelo es relativo a ese zoom (solo corrige
la diferencia de tipografía de su Chrome).

Para comprobar las ya enviadas (solo lee):

```bash
node implementation/backend/scripts/revisar_portadas_propuestas.js 60
```

⚠️ Las propuestas enviadas ANTES de esto conservan su `html_propuesta` cortado: la vista
web del cliente no se arregla hasta que se le reenvía (o se vuelve a copiar el enlace).

### Los presupuestos adjuntados a la propuesta rellenan Datos Económicos (2026-09-29)

Al soltar un PDF en un hueco del popup de Anexos de la propuesta, además de archivarse en
`0. PRESUPUESTO`, se LEE con el mismo lector que la toma de datos
(`POST /api/factura-ocr/extract`, ~10 s) y su importe va a SU campo:

| Hueco | Campo | Cómo |
|---|---|---|
| **Aerotermia** | P. Aerotermia | Sustituye (y quita la marca de estimado) |
| **Placas solares** (nuevo, siempre visible) | P. Fotovoltaica | Sustituye |
| **Ventanas · Cubierta · Suelo · Fachada** (los de la reforma activa) | P. Reforma | **SUMA** de todos |

Antes la propuesta podía adjuntar un presupuesto de 14.520 € mientras su tabla decía
15.000 € (estimado).

| Qué | Dónde |
|---|---|
| Huecos, campo de cada uno, IVA y reparto (puro) | [logic/presupuestoLeido.js](implementation/frontend/src/features/calculator/logic/presupuestoLeido.js) — `HUECOS_PRESUPUESTO`, `lecturaAPresupuesto` |
| El cuerpo del guardado (fuente única con el botón Guardar) | [logic/guardarOportunidad.js](implementation/frontend/src/features/calculator/logic/guardarOportunidad.js) |
| Lectura, cola y acuse con «Deshacer» | `ProposalModal` (`aplicarLecturaPresupuesto`, `AvisoLecturaPresupuesto`) |
| Guardado sin popup | `ResultsPanel` (`aplicarPresupuestoLeido`) |
| Nombres de fichero válidos | `POST /api/oportunidades/:id/anexos` (`SLOTS_VALIDOS`, incluye `FOTOVOLTAICA`) |
| Pruebas | `node implementation/backend/scripts/test_presupuesto_leido.mjs` |
| Leer uno real, sin escribir | `node implementation/backend/scripts/probar_presupuesto_leido.js 26RES060_OP228 [HUECO]` |

**REGLA — el IVA lo decide la SIMULACIÓN, no el documento.** Particular → total CON IVA
(como `StepDocsObra`); empresa/autónomo/terciario → según el conmutador «IVA Incluido /
Sin IVA», que es lo que rotula `ivaTag`.

**REGLA — P. Reforma es la SUMA** de los huecos de la reforma ACTIVOS (su mejora marcada)
y CON documento adjunto. Lo leído se recuerda por hueco en `inputs.presupuestos_leidos`
(solo metadatos), así que sustituir el de ventanas cambia SU sumando; quitar un
documento lo saca de la suma la próxima vez, sin reescribir nada al quitarlo. Los que ya
estaban adjuntos y nunca se leyeron se bajan de Drive y se leen en el momento; el que no
se pueda leer, o el hueco activo sin documento, queda fuera y SE DICE.

**REGLA — las líneas de OTRA partida van a SU campo**, repartidas en proporción por las
`partida` de las líneas (placas en el de aerotermia → P. Fotovoltaica; envolvente en una
reforma → P. Reforma; aerotermia en el de placas → P. Aerotermia): el coste final suma
los tres campos y dejarlas dentro las contaría dos veces. Lo común (obra civil, mano de
obra) es del documento en el que viene. **El campo del hueco se sustituye; los de las
líneas ajenas solo se rellenan si están vacíos** (P. Aerotermia cuenta como vacío si es
la ESTIMADA), y si difieren se dice. Menos de 1 € de diferencia es la misma cifra (17.530
tecleado frente a 17.530,84 en 26RES060_OP228): entonces solo se guarda la huella.

**REGLA — se GUARDA sola.** La propuesta se abre siempre con la oportunidad guardada; si
la cifra cambia dentro, sin guardar saldría la propuesta con un importe y `datos_calculo`
—lo que hereda el expediente— con otro. `ResultsPanel` espera al `result` RECALCULADO y
hace el MISMO `POST /api/oportunidades` que el botón (`payloadOportunidad`), con una
línea en el historial y conservando el prescriptor que ya tenía. Las lecturas se aplican
EN COLA (dos presupuestos de la reforma soltados seguidos se suman, no se pisan). Solo
**staff**: la ruta del lector es `staffOnly`.
