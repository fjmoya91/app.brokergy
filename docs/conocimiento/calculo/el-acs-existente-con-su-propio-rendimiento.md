# El ACS existente con su PROPIO rendimiento: el termo eléctrico va a 1,00 (2026-11-10)

Caso: **26RES060_168** (LOTE-2026-014, CAE-1991, verificador Marwen, inexactitud del 10/11/2026). El
CEE inicial declaraba la calefacción con una caldera de gasóleo (η_i 0,79) y el **ACS con un termo
eléctrico** (efecto Joule, «ELECTRICIDAD PENINSULAR», rendimiento 100 %). La app calculaba ese ACS con
la η de la caldera, como si la caldera lo produjera: el CIFO decía **30.771 kWh/año** y lo bueno es
**30.190** (calefacción 28.659,60 + ACS 1.530,89).

**REGLA — el término de ACS se calcula con el rendimiento del equipo que PRODUCE el ACS antes de la
obra, y ese equipo se DECLARA en Instalación.**

    AE_TOTAL = F_P · [ D_CAL·S·(1/η_i − 1/SCOP_bdc) + D_ACS·(1/η_ACS − 1/SCOP_dhw) ] · C_b

- η_ACS = η_i mientras `instalacion.misma_caldera_acs` no sea `false` (lo de siempre, y lo de todos
  los expedientes antiguos sin el flag).
- Con `misma_caldera_acs: false`, η_ACS es la fila de `BOILER_EFFICIENCIES` de
  `caldera_antigua_acs.rendimiento_id` (termo eléctrico: `electric` = **1,00**). Sin fila, o con la
  fila «sin calefacción» (no es un equipo de ACS), vuelve a η_i: no se inventa.
- Con el ACS fuera del alcance el término se cancela y η_ACS no mueve nada.

Fuente única: `etaAcsExistente` / `acsExistenteEsTermoElectrico` en
[calculation.js](../../../implementation/frontend/src/features/calculator/logic/calculation.js), y el
parámetro `acsEff` de `calculateSavings`. Lo pasan las CINCO vías del ahorro: `computeExpedienteFinancials`
(panel, listado, Anexo I y solicitud del lote, requerimiento), `expedienteFinancialsNode` (portal),
`cifoService.computeSavingsKwh` (CIFO del servidor y del MCP), `ExpedienteDetailView` (modales del CIFO y
de las fichas) y `ExpedientesView`. `calculateTerciario` no se toca: ningún TER tiene hoy el ACS aparte.

**REGLA — el CEE inicial lo PROPONE, una persona lo declara.** De ese dato cuelga el ahorro firmado, así
que nada lo escribe solo. [acsExistenteCee.js](../../../implementation/frontend/src/features/expedientes/logic/acsExistenteCee.js)
lee los generadores de ACS del `.xml` crudo (o, sin él, `combustibleACS` + `rendimientoACS`) y, si es un
termo y el ACS entra en la actuación, Instalación enseña un aviso ámbar con el botón **«Declarar termo
eléctrico»**. Con DOS sistemas de ACS (termo y caldera) solo se avisa: cuál pesa lo dice el certificado.

**El CIFO lo cuenta.** ACS existente «Termo eléctrico (efecto Joule)», Electricidad, rendimiento 1,00
(marca y modelo «—» si no se teclean); la columna de la tabla de variables pasa a «η_i · η_ACS» con
«0,79 · 1,00», la fila del «Donde» igual, y en la justificación de η_i un párrafo dice de dónde sale η_ACS
y en qué término se aplica. Solo cuando η_ACS ≠ η_i (`etaAcsPropio`): los demás CIFO no cambian ni un
carácter. La hoja del Anexo I va justa (D_ACS por dormitorios + 5 en cascada: 10 px de holgura), por eso
el párrafo va dentro del apartado de η_i y no como apartado propio (se pasaba 18 px).

La **ficha RES060 oficial** solo tiene la casilla `ri i` (η_i): imprime 0,79 y el AE_TOTAL de
`results.savingsKwh` (30.190). La explicación del η_ACS va en el CIFO, que es el que la acompaña.

**También por la vía FM (11/11/2026, auditoría externa del FM).** La RES060_FM escribe una sola η en los
dos términos, pero su ficha tampoco tiene casilla para el ACS aparte, igual que la vigente, y Marwen
exigió la η_ACS en la vigente: lo mismo vale para la FM. `calculateRes060FM` acepta `acsEff`/`acsEffId`
(los de `etaAcsExistente`, que le pasa `entradasFmExpediente` en
[fmExpediente.js](../../../implementation/frontend/src/features/expedientes/logic/fmExpediente.js)) y el
término del ACS va con `1/η_ACS` **solo si es MÁS ALTA que η_i** (`etaAcsPropio`): la propia fórmula dice
que, si se sustituyen varias calderas, se toma la de rendimiento más alto (nota 9 de las variables). Un
ACS peor que la caldera no sube la cifra. El aviso «info» de la calculadora lo explica, y el CIFO FM
imprime «η_i · η_ACS» en la tabla, en el «Donde» y en la fórmula (`1/η_ACS` en el término del ACS), como
el vigente. La calculadora no lo pasa: la simulación no tiene un equipo de ACS aparte. Medido en la
prueba: 45.874 → 44.459 kWh con un termo eléctrico.

**Medido el 10/11/2026** (snapshot de los 382 expedientes por las tres vías, antes y después): solo
cambian **26RES060_168** (30.771 → 30.190) y **26RES060_182** (gasóleo + termo eléctrico ya declarado,
27.878 → 27.125). Los 367 con la misma caldera o sin declarar, igual. El LOTE-2026-014 pasa de 221.265 a
**220.684**. El 182 tenía ya enviados el CIFO (07/11) y el Anexo I (04/11) con la cifra vieja: tras el
despliegue hay que volver a mandarlos.

Tras tocarlo: `node implementation/backend/scripts/test_eta_acs_existente.mjs`, `test_impresos_oficiales.mjs`,
`test_res060fc.mjs` (la parte FM) y `check_cifo_paginas.mjs` (lleva dos casos con termo eléctrico por la
vigente y dos por la FM).
