<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

## Caldera de BIOMASA: la deducción del IRPF exige placas solares; el CAE no (2026-10-10)

Decisión del usuario (Fran), al preparar las propuestas de Federico Romero (26RES060_OP274 y
26RES060_OP288, las dos de pellets con alimentación automática).

Cuando la caldera que se sustituye es de **combustible sólido que no es carbón** —pellets, leña,
hueso de aceituna—, pasar a aerotermia **no reduce el consumo de energía primaria no
renovable**: la biomasa ya es renovable (su factor de paso es casi cero) y la electricidad de la
bomba no lo es. Esa reducción es el requisito de las deducciones del IRPF por eficiencia
energética, así que **sin placas solares fotovoltaicas no hay deducción**. El Bono CAE **sí** se
obtiene: sale del ahorro de energía FINAL certificado, no de la primaria no renovable.

**REGLA — el aviso dice las DOS cosas.** Que la deducción del IRPF necesita placas (ya puestas o
en la misma obra) y que el Bono CAE no se ve afectado. Decir solo «no hay deducción» deja a quien
lo lee pensando que se cae toda la ayuda.

**REGLA — el CARBÓN no entra.** Es fósil: con él la aerotermia sí reduce la primaria no renovable.

**REGLA — biomasa se decide por la simulación, no solo por el desplegable.** Al elegir una fila
`solid_*` en la calculadora, el combustible se pone en «carbón» por defecto. Por eso cuenta como
biomasa `fuelType` pellets/leña, y también una caldera sólida que el funnel
(`boilerHeatingType: 'BIOMASA'`) o la placa leída (`placa_caldera.combustible: 'biomasa'`) dicen
de biomasa aunque el desplegable diga carbón.

**REGLA — placas que cuentan:** las que la vivienda YA tiene (`fotovoltaica.estado === 'si'`) o
las que entran en ESTA obra (presupuesto de fotovoltaica, o placas marcadas en la reforma). «Las
pondré en el futuro» no cuenta. Con placas no se avisa.

**REGLA — sin deducción en juego no se avisa** (titular empresa, `irpfCap` 0): advertir del
requisito de algo que no se ofrece es ruido.

La cifra de la deducción **se sigue enseñando**: queda condicionada a tener las placas, y el aviso
lo dice debajo de la tabla.

### Dónde sale

Fuente única: [logic/irpfBiomasa.js](implementation/frontend/src/features/calculator/logic/irpfBiomasa.js)
(`esCalderaBiomasa`, `tienePlacasSolares`, `avisarIrpfBiomasa`, `avisoIrpfBiomasa`,
`lineaIrpfBiomasa`).

- **Calculadora** (`ResultsPanel`): recuadro naranja encima de las tablas de viabilidad, para quien
  prepara la propuesta.
- **Propuesta** (`ProposalModal`): recuadro bajo la tabla, junto al del presupuesto estimado, y un
  párrafo al final del mensaje de envío (`buildCaption`, una vez para todas sus ramas, como el
  presupuesto estimado). El texto es impersonal: vale para el cliente, el partner y el instalador.

Medido en las dos de Federico: la portada cabe con los dos recuadros (presupuesto estimado +
biomasa) y la comparativa de CEE, sin pisar el pie.

Los mensajes del funnel público (`leadMessages`) **no** lo llevan todavía: allí la biomasa ya
tiene su aviso propio al elegir el combustible (`Step2_Combustible`).

Tras tocarlo: `node implementation/backend/scripts/test_irpf_biomasa.mjs`.
