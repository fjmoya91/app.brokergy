# La REPRESENTACIÓN del titular en el Anexo I: poder notarial u otro documento (2026-10-22)

**El problema.** El apartado 3 del Anexo I («Identificación del representante… Ostentando
poderes suficientes según: ☐ Poder Notarial de fecha … y número de protocolo … ☐ Otro
documento…») salía SIEMPRE con «Otro documento» marcado y rellenado con
«{nº} - ANEXO CESIÓN AHORRO», también para un particular que firma en su nombre. Eso
declara una representación que no existe, y el convenio de cesión no acredita poderes de
nadie. Y cuando SÍ hay representación —una empresa, o Eusebia (26RES093_4), tetrapléjica,
por la que firma su marido con un poder— no había dónde decir con qué título ni dónde
guardar la copia que el propio impreso dice adjuntar. Lo pidió Fran el 22/10/2026.

**REGLA — un particular sin representante deja el apartado 3 EN BLANCO y SIN CASILLAS.**
Ni nombre, ni NIF, ni «Poder Notarial», ni «Otro documento». Firma él («Fdo.» = titular).

**REGLA — hay representación en dos casos, y solo en dos.** Una EMPRESA siempre (su
representante legal, `representante_*`), y un PARTICULAR marcado «Está representado»
(`clientes.representado`). En los dos, el representante va en el apartado 3, es el «Fdo.»
del Anexo I y comparece y firma el Convenio de Cesión («representada/o en este acto por
D. … en virtud de poder notarial de fecha … y número de protocolo …»).

**REGLA — el título se elige: PODER NOTARIAL (fecha + nº de protocolo) u OTRO documento
(título + fecha de formalización).** Se marca la casilla que toca y se rellenan sus campos
del impreso (`Poder Notarial de fecha` + `Poder Notarial de fecha-0` + `Número de
protocolo`, u `Otro` + `Otro documento`). Las fechas, en dd/mm/aaaa.

**REGLA — la COPIA del poder es del CLIENTE y va en el expediente que se presenta.** El
mismo poder vale para todas sus obras, así que se sube desde la ficha del cliente
(`POST /api/clientes/:id/representacion`, staffOnly) y su enlace va en
`clientes.representacion_doc_link`. El fichero se guarda en la carpeta de Drive del
expediente abierto más reciente («acreditacion de la representacion.pdf», el anterior a
OLD), por la misma decisión que el justificante bancario. En el PAQUETE de la actuación
(regla 40) es la pieza **`4-8` · ACREDITACION REPRESENTACION**: obligatoria cuando hay
representación —sin ella el Anexo I promete «Se adjunta copia» de un papel que no va— y
«no procede» cuando el titular firma en su nombre.

**REGLA — lo incompleto se DICE.** `representacionDe().falta` enumera lo que falta
(nombre, DNI, título, fecha, protocolo, copia) y lo enseñan la ficha del cliente y el
popup del Anexo I. Las 8 empresas que había el 22/10/2026 no tenían ni el título ni la
copia: su próximo paquete lo pedirá.

| Qué | Dónde |
|---|---|
| Quién representa y con qué título (fuente única) | [logic/representacion.js](implementation/frontend/src/features/expedientes/logic/representacion.js) |
| Las casillas del impreso | [logic/anexoIFormulario.js](implementation/frontend/src/features/expedientes/logic/anexoIFormulario.js) · `deriveAnexoI` y el Convenio en [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js) |
| La ficha del cliente | [RepresentacionCliente.jsx](implementation/frontend/src/features/clientes/components/RepresentacionCliente.jsx) (alta y edición) |
| La copia en Drive | [representacionCliente.js](implementation/backend/services/representacionCliente.js) |
| El paquete (`4-8`) | `INDICE` de [envioGestorService.js](implementation/backend/services/envioGestorService.js) |
| Columnas | `scripts/clientes_representacion.sql` |

⚠️ El Convenio con un particular representado crece una línea: medido con
`check_anexo_cesion_2pag.mjs`, el peor caso (nombre y dirección más largos) deja 9 px de
holgura en la página 1.

Tras tocarlo: `node implementation/backend/scripts/test_impresos_oficiales.mjs` y
`check_anexo_cesion_2pag.mjs`.
