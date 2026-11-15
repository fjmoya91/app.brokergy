<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## HITOS DE LA ACTUACIÓN — la factura que NO abre la obra (2026-09-30)

> ⚠️ **12/11/2026: el verificador RECHAZÓ esta marca** (Marwen, CAE-2078 / LOTE-2026-019, inexactitud
> nº2). En 26RES060_114 se declaró el inicio el 27/07, pero había una factura de acopio de material del
> 24/05. En 26RES060_180 se declaró el 29/10, con un anticipo del 70 % del 14/09. La respuesta del
> verificador: *«la fecha de inicio declarada difiere de la fecha de la factura en la que se alcanza
> un primer compromiso en firme para la realización»*. Es la definición del RD 36/2023, y se subsanó
> quitando la marca.
>
> **Desde entonces `motivo_no_inicio` NO se usa.** El inicio es la PRIMERA factura, también la de
> material o la de un anticipo, y tampoco se fija un `fecha_inicio_cifo_manual` para retrasarlo. Lo
> que este documento quería proteger se resuelve por el otro lado: el CEE inicial tiene que estar
> firmado y visitado ANTES de esa primera factura (regla 199, que ya cuenta material y anticipos).
>
> ⚠️ **15/11/2026, Fran, «para que quede claro»**: *«Que el CEE inicial sea posterior a facturas no
> es grave. Fecha de inicio siempre primera factura sea anticipo o lo que sea. Fecha de fin última
> factura o fecha de pruebas, lo último de estas dos.»* Dos cambios sobre lo anterior:
> - **Las pruebas RITE ya no abren la actuación**, aunque sean anteriores a la primera factura (hasta
>   hoy `calcCifo` tomaba el mínimo de pruebas y facturas). Solo hacen de inicio provisional mientras
>   no hay ninguna factura. Medido ese día: 44 expedientes vivos tenían las pruebas antes de la primera
>   factura (21 sin verificar) y su inicio calculado pasa de las pruebas a la factura. A los 35 con el CIFO ya firmado y sin fecha a mano se les fijó ese día `fecha_inicio_cifo_manual` = la fecha firmada (Fran: «congela»): no se re-firman y no saltan como descuadre.
> - **Un CEE inicial posterior a las facturas no es grave en la auditoría**: como mucho LEVE, y se
>   explica en el escrito aclaratorio si hace falta. Nunca se retrasa el inicio para taparlo.
>
> **Retirada del código el 13/11/2026** (Fran: «sí, quítala»):
> - `calcCifo` cuenta todas las facturas que computan para el inicio. `motivoNoInicio` sigue leyendo
>   la marca guardada, pero solo para reconocerla.
> - El popup «Hitos» ya no tiene el selector. Una factura con marca antigua lleva un aviso en ámbar,
>   y al guardar se quita la marca.
> - `hitosActuacion` deja `motivo` a null (la marca va aparte, en `marcaAntigua`). Así el CIFO ya no
>   imprime «entrega de material» y la aclaración sugerida no dice que una factura «no supone el
>   inicio».
> - El aviso de fechas (`cifoFechas.js`) ya no pide marcar la factura: dice que abre la actuación y
>   que lo que se corrige es la fecha de firma del CEE inicial, si aún no está registrado.
> - El inicio que usan la vía FM (`routes/expedientes.js`) y la espera FM (`esperaFmService.js`)
>   tampoco filtra.
>
> El 13/11/2026, **11 expedientes** llevaban la marca en alguna factura. Las marcas siguen escritas en
> la BD: no cambian nada y se quitan al guardar el popup. Con el cambio, el inicio que calcula la app
> se adelanta en ocho de ellos (172, 182, 211, 242, 251, 80_41, 93_16 y, cuando tenga CIFO, el 268).
> En **182, 242 y 93_16 el CIFO ya está FIRMADO** con el inicio de antes, y hay que regenerarlo y
> volver a pedir la firma antes de mandarlos a un lote. El bloque «Hitos de la actuación» y la
> aclaración siguen valiendo.

Requerimiento repetido: el CIFO toma como inicio de actuación la PRIMERA factura, y
cuando esa factura es la **entrega del material** (o un **anticipo**) emitida antes
de existir el CEE inicial, el verificador ve una obra que empieza sin certificado de
partida — aunque se hiciera en su orden. Medido en **26RES093_11**: la bomba de calor
se facturó el 29/05/2026 (26/000417), el CEE inicial se visitó y firmó el 01/09, la
instalación se facturó el 11/09 (26/000618) y las pruebas RITE son del 15/09. El CIFO
arrancaba el 29/05 y salía GRAVE.

| Qué | Dónde |
|---|---|
| La marca de la factura y el cálculo de inicio/fin | [calcCifo.js](implementation/frontend/src/features/expedientes/logic/calcCifo.js) — `MOTIVOS_NO_INICIO`, `motivoNoInicio` |
| Los hitos, la aclaración propuesta y qué se puede citar | [hitosActuacion.js](implementation/frontend/src/features/expedientes/logic/hitosActuacion.js) |
| El bloque impreso (FUENTE ÚNICA de CIFO, RES080 y el modal del RES080) | `hitosBoxHtml` en [hitosActuacion.js](implementation/frontend/src/features/expedientes/logic/hitosActuacion.js) |
| El popup | [HitosActuacionModal.jsx](implementation/frontend/src/features/expedientes/components/HitosActuacionModal.jsx), botón **Hitos** junto a las fechas del CIFO + «Aclarar las fechas» en el aviso |
| Redacción con IA | `POST /api/expedientes/:id/hitos/aclaracion-ia` (**staffOnly**) → [aclaracionFechasService.js](implementation/backend/services/aclaracionFechasService.js) |
| Pruebas | `node implementation/backend/scripts/test_hitos_actuacion.mjs` · `check_cifo_paginas.mjs` · `check_res080_paginas.mjs` |

**REGLA — una factura puede NO abrir la actuación, y lo marca una persona.**
`documentacion.facturas[].motivo_no_inicio` = `'MATERIAL'` | `'ANTICIPO'` la saca del
INICIO de `calcCifo` —no del fin, ni de las facturas asociadas, ni de la inversión:
sigue siendo una factura del expediente—. Nunca se deduce. Se lee sin distinguir
mayúsculas (`normalizeData`). Si al quitarlas no queda nada que abra, se usan todas:
un CIFO sin fecha de inicio es peor. Como TODAS las superficies llaman a `calcCifo`
(CIFO, fichas RES, anexo del MITECO, solicitud de verificación), el inicio nuevo sale
igual en todas. Con la marca, 26RES093_11 arranca el 11/09 y el GRAVE se apaga solo.

**REGLA — el CIFO y el Certificado RES080 llevan un bloque «Hitos de la actuación»,
ordenado como el PROCESO** (no por fecha): ① CEE inicial (visita técnica · firma) →
② facturas (primera · última, con su nº y «entrega de material» en ámbar si lo es; con
una sola, «Emitida»; con más de dos, el paso dice cuántas) → ③ actuación (inicio ·
pruebas RITE · fin) → ④ CEE final (visita · firma). **Una COLUMNA por paso**, con la
cabecera numerada en oscuro y la ACTUACIÓN en verde (es el paso cuyas fechas declara
el certificado); dentro, rótulo a la izquierda y fecha a la derecha, así que las
fechas de cada paso quedan en columna y la secuencia se lee de izquierda a derecha
(rediseño del 2026-10-01: la versión de una fila por paso con tres casillas dejaba
huecos que se leían como datos que faltan, y el nº de factura colgaba suelto).
Ordenar por fecha haría saltar al principio justo la factura de material anterior al
CEE.
**No se imprime el REGISTRO del CEE**: la regla de la casa es que el certificado
existe desde su FIRMA (regla de `cifoFechas`), y el registro es un trámite ajeno. En
el RES080 el inicio y el fin del bloque son los de su hoja 1
(`fields.fecha_inicio/fin`, editables en la vista previa), pasados a dd/mm/aaaa.

**REGLA — lo que NO consta NO se imprime, y se AVISA antes de generar** (decisión
del usuario, 2026-10-01, que sustituye a la de imprimir «—»): sin fechas de un CEE,
su paso no sale (y los demás se numeran seguidos); una fecha suelta que falte (una
firma, las pruebas del RITE) no sale. `avisosHitos(expediente)` lo dice en la puerta de
«Generar» del CIFO/RES080 (`handleGenerateClick`, docType `cifo`), en ámbar junto a los
de `avisosCeeDocumento`; con «Generar de todos modos» sale sin ese paso. El popup de
hitos lo dice también.

**REGLA — la aclaración solo AFIRMA lo que dicen los datos.** `aclaracionSugerida`
compone el texto con las fechas del expediente y solo sitúa el inicio «con
posterioridad a la firma del CEE inicial» si de verdad lo es; a una factura
anterior al inicio SIN marcar (inicio fijado a mano) no le atribuye naturaleza
ninguna. Tope `ACLARACION_MAX` (420 caracteres): por encima, el popup NO deja guardar (no la recorta: se cortaría a media frase en un documento firmado). Se guarda en
`documentacion.hitos_actuacion` = `{ aclaracion, origen, por, at }`, que va en la
**BLACKLIST de `normalizeData`**: es texto que se imprime tal cual, y en MAYÚSCULAS
saldría en el certificado como un grito.

**REGLA — la IA REDACTA, el expediente pone los DATOS, y el código lo COMPRUEBA.**
El prompt lleva solo los hechos (y lo que cuente el usuario del caso), y el texto
que cite una fecha o un nº de factura que no consta se DESCARTA
(`fechasAjenas`, `facturasCitadas`) y se devuelve la propuesta del código diciéndolo.
No guarda: vuelve al popup. Medido: ~1 s y ~100 tokens de salida.
⚠️ **En modo JSON y sin razonar, gemini-2.5-flash entra en BUCLE al escribir «º»**
(se queda emitiendo saltos de línea tras «La factura n»): por eso se le pide
«número» y la propuesta se le pasa sin el ordinal (`sinOrdinal`). Si aun así se
corta, se reintenta una vez con más temperatura.
⚠️ `facturasCitadas` exige el `º` y que lo citado lleve un DÍGITO: con una «o»
normal, «no supone» se leía como la factura «supone».

**REGLA — los hitos ABREN la hoja de la INSTALACIÓN, antes de los equipos**
(decisión del usuario, 2026-09-30), en el CIFO y en el RES080. Con un solo equipo
caben siempre (peor caso medido con la aclaración máxima, factura de material con nº
largo y los dos CEE: CIFO +16px con termo fuera y dos empresas de nombre largo;
RES080 +27px con termo fuera — las columnas por paso ganaron 4 px al diseño anterior,
porque las dos filas de CEE caben en una). Con equipos en CASCADA la hoja se
llena de nº de serie y los hitos van en una hoja propia justo ANTES de la de la
instalación (`hitosAparte`). Lo decide un dato del expediente, no una medición; los
dos caminos están en los dos medidores. Hoy son 4 expedientes de 291 con cascada. Los
recuadros de firma no se mueven: los dos se anclan a la hoja 1 de contenido (PDF
página 2), que va antes.

**REGLA — el aviso dice DÓNDE se arregla.** `cifoFechas` añade `accion: 'hitos'` al
aviso de «la actuación empieza antes del CEE inicial» (LEVE desde el 09/11/2026: Fran, 26RES060_150,
«no es grave que haya partidas antes del cee inicial»; antes era GRAVE) y al LEVE nuevo
`FACTURA_ANTERIOR_INICIO` (facturas anteriores al inicio sin aclaración); el panel
de incidencias pinta «Aclarar las fechas», que abre el popup. Marcar las fechas de
un CIFO ya generado no cambia el PDF: el popup lo dice antes de guardar (y si está
firmado, que hay que volver a pedir la firma).

⚠️ El Certificado RES080 tiene DOS copias de sus páginas (`res080Doc.js`, que usa el
backend, y `CertificadoRes080Modal.jsx`): las dos llaman a `hitosBoxHtml`, así que el
bloque no puede divergir; lo que se añada alrededor sí hay que tocarlo en las dos.
