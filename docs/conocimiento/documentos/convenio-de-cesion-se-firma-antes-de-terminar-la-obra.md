<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Convenio de Cesión — se firma ANTES de terminar la obra (2026-08-12)

El convenio tiene ahora **dos redacciones del mismo documento** (mismo fichero, mismo nombre,
mismo slot `anexo_cesion_*`, misma caja de firma): actuación **PREVISTA** y actuación
**EJECUTADA**. Lo decide `previo` en `buildAnexoCesionHtml(expediente, results, { previo })`;
sin ese parámetro manda `esCesionPrevia(expediente)`, en
[docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js).

**REGLA — mientras no haya facturas, el convenio va en FUTURO.** El texto de obra ejecutada
afirma que la actuación *se ha llevado a cabo* y que el ahorro *se ha estimado* sobre algo hecho.
Firmado antes de la obra, el cliente declara como pasado lo que no ha ocurrido. El previo dice lo
mismo en futuro (modelo oficial del convenio CAE, Orden TED/815/2023 art. 11, OPCIÓN 2) y añade
las dos salvaguardas que ese momento exige: el ahorro es **estimado** y, si el verificado sale
distinto, la cesión se mantiene íntegra; y el importe **se ajusta al ahorro verificado sin variar
el precio unitario**.

**REGLA — SIEMPRE se habla de ahorro ESTIMADO, también con la obra terminada.** Lo fija la ficha,
no un contador: la cláusula tercera decía "ahorro anual efectivo" y comprometía un número que el
verificador todavía puede mover.

**REGLA — sin IBAN el convenio NO deja un hueco.** Con cuenta se imprime como hasta ahora; sin
ella el texto dice que el ingreso irá a la que el Cedente aporte. **La titularidad se acredita con
justificante en los dos casos.** Por eso la falta de IBAN deja de bloquear el envío
(`anexoBlockers` en `EnviarAnexosModal`) y de contar como dato faltante (`validateExpediente`)
cuando el convenio es previo: es justo el supuesto para el que existe.

**REGLA — con "Descuento Certificados" activo, el convenio NO dice NADA del coste de gestión.**
Ni la deducción ni su negación: el párrafo entero desaparece. Antes se reescribía como reclamo
("la gestión es completamente gratuita, BROKERGY corre con estos costes") — esto es un contrato
que lee el verificador, y ahí no pinta una oferta comercial que además le mete al Cedente en la
cabeza un coste que en su caso no existe. Sin deducción, lo que se debe es el importe íntegro de
la cláusula cuarta, que ya es el comportamiento por defecto de cualquier contrato. De paso se
quita una afirmación que salía en falso: un expediente sin CEE llega sin `caeMaintenanceCost` y
prometía gratuidad sin haberla comprobado.

**El popup manda sobre la detección.** Generar abre `CesionObraGate` (DocumentacionModule), que
propone la respuesta según haya facturas registradas y guarda la elegida en
`documentacion.anexo_cesion_obra_finalizada`. Se persiste porque **el envío vuelve a generar el
PDF**: sin guardarla, se revisa un texto en pantalla y se manda el otro. Al modal se le pasa
además `previo` explícito — la decisión acaba de guardarse y el `expediente` de la vista va un
refetch por detrás. `onRequestSend` viaja con `overrides.cesion` (mismo mecanismo que el Anexo I)
para que se envíe exactamente el HTML revisado.

**REGLA — el contenido cabe en DOS páginas y eso se COMPRUEBA.** `.conv-page` es una caja fija con
`overflow:hidden`: lo que no cabe no descoloca nada, **desaparece** — y como los hijos de
`.conv-body` son flex-items que se encogen, el `scrollHeight` del contenedor ni siquiera lo
delata. El documento V3 iba con 2px de holgura, así que el texto nuevo obligó a apretar el
interlineado (1,65 → 1,5) y los márgenes de título/subtítulos. Tras cualquier retoque del texto:

```bash
node implementation/backend/scripts/check_anexo_cesion_2pag.mjs
```

**El `padding-bottom` de `.conv-body` y todo `.conv-sign*` NO se tocan**: el recuadro de firma del
Cesionario es una caja FIJA en coordenadas de PDF (`SIGN_BOXES.anexo_cesion_cesionario`) y está
anclada al borde inferior de la página 2. Verificado: la caja cae en el mismo píxel que antes.
