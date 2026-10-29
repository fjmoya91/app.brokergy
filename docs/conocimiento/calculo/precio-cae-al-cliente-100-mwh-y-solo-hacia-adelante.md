<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Precio CAE al cliente — 100 €/MWh, y solo hacia adelante (2026-09-09)

Hay **DOS cifras y no son lo mismo**; confundirlas cambia el bono de expedientes ya
firmados. Las dos viven en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js):

- **`CAE_PRECIO_CLIENTE_NUEVAS` = 100 €/MWh** — lo que se estampa en una propuesta que
  se hace HOY. Va solo donde se COMPONEN inputs nuevos: la calculadora, el funnel y la
  comparativa de CEE.
- **`CAE_PRECIO_CLIENTE_ANTERIOR` = { estandar: 95, res080: 60 }** — el respaldo de
  LECTURA de lo ya guardado sin precio propio. Es el valor con el que se calcularon en
  su día, y por eso **no puede subir a 100**: un expediente antiguo no cambia de bono
  porque hoy cambie la tarifa. Va donde se LEE un expediente (panel económico, su
  gemelo de Node, el editor de Economía).

El precio al SUJETO OBLIGADO sigue siendo propio de cada ficha (160 €/MWh en las de
sustitución/hibridación, 140 en RES080): ahí no hay política única. El **TERCIARIO**
arranca ya en el precio nuevo: TER100 y TER173 no tienen ni un expediente anterior
cuya economía haya que preservar.

### El precio se SELLA en la oportunidad — [precioCae.js](implementation/backend/utils/precioCae.js)

La calculadora guarda el precio en `inputs.caePriceClient`, pero la economía del
EXPEDIENTE lee `inputs.cae_client_rate`: dos nombres para el mismo dato, y por eso el
precio tecleado **nunca llegaba al expediente**. Medido el 09/09/2026: **66
expedientes** tienen un precio tecleado (de 88 a 150 €/MWh) que su panel ignora, y en
48 de ellos eso hace que el panel diga que le debemos al cliente **menos** de lo que
su propuesta firmada le prometía. Sin arreglarlo, un expediente nuevo a 100 €/MWh
también saldría calculado a 95.

**REGLA — el sello se escribe en las oportunidades NUEVAS y, una vez escrito, se
mantiene al día. Las ANTERIORES no se marcan nunca.** Su economía se calculó con el
respaldo, hay obra en marcha sobre esas cifras y no pueden moverse. Por eso la
condición es *"no existía"* o *"ya lo trae"*, jamás *"existe"* — y un reguardado de una
oportunidad anterior **retira** el sello aunque el navegador lo mande.

**REGLA — no hace falta ninguna marca de fecha.** La PRESENCIA de la clave ES la marca,
y además es la que el expediente ya leía. Una fecha de corte habría que explicarla cada
vez que alguien lea el código, y se rompe al migrar datos.

**REGLA — se mantiene al día, no solo al crear.** Sellar únicamente en el alta dejaría
el sello viejo al cambiar el precio, y el expediente calcularía con una tarifa que ya
nadie ve en la calculadora: peor que el fallo que arregla.

⚠️ Los 66 expedientes anteriores **siguen calculando con el respaldo**, no con su
precio tecleado. Es una decisión tomada (2026-09-09), no un descuido: corregirlos
movería el bono de 66 expedientes en marcha, 27 de ellos RES080 que pasarían de 60 a
95-150 €/MWh (con el S.O. en 140, alguno daría margen negativo). Si algún día se
quiere, es sembrarles el sello con su `caePriceClient`.

### Y el sello no llegaba a NACER (2026-10-20)

Medido el 20/10/2026: de las **141 oportunidades creadas desde el 09/09, solo 2 tenían
el sello** (una de ellas puesta a mano: 26RES060_OP301 → 26RES060_239, que daba
4.691,38 € de bono en vez de 4.938,29). El sello se escribía únicamente en el guardado
de la calculadora (`POST /api/oportunidades`), y **ninguna alta nace ahí**: la landing,
«Nueva simulación» (`/internal-simulation`), el marketplace y la skill
`alta-oportunidad` crean la fila con `createLead`
([leadService.js](implementation/backend/services/leadService.js)). Cuando después se
guardaba en la calculadora, el POST ya encontraba la fila **sin** sello y, por la propia
regla, no podía estrenarlo. Las nuevas quedaban tratadas como anteriores.

**REGLA — el sello se pone al NACER, en `createLead`**, que es el punto por el que pasa
toda alta; el POST solo lo mantiene al día. En el re-envío del funnel sobre un LEAD
previo manda la misma regla (`sellarPrecioCae(inputs, leadPrevio)`). Las oportunidades
sintéticas de los expedientes MIGRADOS (`migrateExpedienteFromXml`) no se sellan: son
anteriores por definición.

**REGLA — el RES080 también lee el sello.** La rama RES080 de la economía
(`expedienteFinancials.js`, su gemelo `expedienteFinancialsNode.js` y la copia de
`ExpedientesView.jsx`) iba directa al respaldo de 60: aunque se sellara a 100, el
listado y el portal calculaban a 60 (el panel del detalle sí leía el sello). Ahora es
`override ?? sello ?? 60`. No movió ninguna cifra: el 20/10/2026 no había ningún RES080
sellado.

Lo que **no** cambia: el Anexo I y el Convenio de Cesión imprimen `caePriceClient`
(`getClientCaeRate`, en `docGenerators.js`), no el sello, así que lo firmado ya lleva el
precio de la propuesta — el fallo era que el panel decía otra cosa que el papel.

De las 139 que nacieron sin sello (50 con expediente), **el 20/10/2026 se sellaron
18, con el «sí» de Fran**: las que tienen expediente CON CEE y SIN override, que son
las únicas en las que el sello cambia el bono (17 suben, 26RES093_9 baja de 6.184,85 a
5.533,81 €; en total +14.743 €). Se comprobó antes que los dos casos raros eran el
precio de la propuesta ACEPTADA: 26RES060_215 a 130 €/MWh (193.735 kWh → 25.186 €,
aceptada el 05/10) y 26RES093_9 a 85 (48.374 kWh → 4.112 €, aceptada el 24/09). Ninguna
tenía nada firmado. Las otras 121 (las sin CEE, las de override y las que aún no son
expediente) siguen sin sello: al llegar su CEE o al aceptarse calcularán al respaldo.
El informe, en seco, con el bono de hoy y el que daría el sello por expediente:

```bash
node implementation/backend/scripts/precio_cae_sello_pendientes.mjs            # en seco
node implementation/backend/scripts/precio_cae_sello_pendientes.mjs --escribir --solo 26RES060_191
```

Escribe con la RPC atómica `oportunidad_merge_inputs` (solo toca `inputs`). Con un
`economico_override.cae_client_rate` en el expediente el sello no mueve nada, y sin CEE
el panel hereda la propuesta guardada, que ya se hizo a su precio.

```bash
node implementation/backend/scripts/test_precio_cae_sello.mjs
```

### Dos precios con la reforma: CAE RES060 y CAE RES080 (2026-10-29)

Fran: «cuando vayamos a dar precios de solo aerotermia o aerotermia más ventanas, que
el CAE en euros haya dos, CAE RES060 y CAE RES080 […] que podamos dar distintos
precios». Con «Reforma Activada» la calculadora enseña ahora dos casillas: **CAE
RES060** (`inputs.caePriceClient`, el de siempre y el único sin reforma) y **CAE
RES080** (`inputs.caePriceClientRes080`), que solo mueve la opción reforma
(`financialsRes080`: bono, beneficio y lo que lleva la propuesta).

**REGLA — sin teclear, el precio RES080 ES el general.** `precioCaeRes080(inputs)`
([calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js))
cae a `caePriceClient`, así que toda oportunidad guardada da las mismas cifras que ayer.
Lo usan la calculadora, `computeFullCalculatorResult` (alta por la skill, funnel) y la
carga de los CEE de un RES080 (`cargarRes080EnOportunidad`, cuyo `precioCliente` es el
de la reforma y ya no pisa el del RES060).

**REGLA — se SELLA aparte, con la misma condición, y solo si difiere.** `sellarPrecioCae`
escribe `cae_client_rate_res080` cuando la oportunidad lleva el sello general y el precio
RES080 es otro; si no, lo retira. El expediente RES080 lee `override ?? sello RES080 ??
sello general ?? 60` (`precioSelladoRes080`), en `expedienteFinancials.js`, su gemelo de
Node, el listado y el panel del detalle; el Económico y el Anexo I/Convenio
(`getClientCaeRate`) toman `caePriceClientRes080` antes que `caePriceClient` en un RES080.
Un RES060/RES093 no cambia en nada. Las dos claves se quitan del payload del certificador
(`MONEY_KEYS_*`, `routes/expedientes.js`).
