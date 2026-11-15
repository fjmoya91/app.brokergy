<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## Las medidas que pidió la OBRA y las LIBRES de la receta se ven en la pestaña, como en CE3X (2026-10-28)

**Lo que pasó (2026EXT_1, 28/10/2026).** En la app de certificadores se eligen las medidas de mejora de
la obra (`certapp_obras.cuestionario.medidas`; si no se elige ninguna, las de `medidasSugeridas`). La
ventana de la envolvente no lo sabía. Su pestaña «Medidas de mejora» decía «ninguna: el .cex sale sin
medidas», y la aerotermia salía apagada con el motivo «Este encargo certifica el estado actual…».

Sin embargo, el `.cex` que el PC había dejado en Drive SÍ llevaba «SUSTITUCIÓN DE LA CALDERA DE GASÓLEO
POR AEROTERMIA (CALEFACCIÓN Y ACS) · 15.000 €». La había puesto como **medida libre**
(`ajustes.medidas_libres`, ver [la-receta-del-cex-y-su-sello.md](docs/conocimiento/envolvente-ce3x/la-receta-del-cex-y-su-sello.md)),
y la pestaña solo enseñaba el catálogo. Fran: «quiero que en la app envolvente aparezcan descritas
tal y como van a aparecer en CE3X… que sea como lo que va a ver el certificador».

Regenerar desde la ventana **no** perdía la medida: la ruta ya escribe `req.body.ajustes.medidas_libres`
en el inicial. Lo que fallaba era la pantalla, que se callaba lo que de verdad iba en el fichero.

**REGLA — las medidas LIBRES de la receta se enseñan en la pestaña, y cuentan.** Cada una sale como la
verá el certificador en el diálogo de CE3X:

- **nombre del conjunto**, inversión y vida útil;
- los **equipos** que entran (generador, combustible, rendimientos y superficie, una línea cada uno);
- con «Ver el texto», las características y los otros datos (editables) y la justificación del
  Anexo III.

Se marcan y se desmarcan. Desmarcada, la medida **no se borra**: pasa a `ajustes.medidas_libres_quitadas`,
que ni la ruta ni la skill leen, y se puede volver a poner. Solo salen en el INICIAL, que es donde las
escribe la ruta. El contador («1 se escribe») las suma.

**REGLA — lo que pidió la obra se CRUZA con lo que se escribe.** Arriba de la lista sale «Las que
pediste en la obra», o «Las que se proponen para esta obra» si no se eligió ninguna. Cada una lleva una
de estas marcas:

- **✓** con el nombre con que sale en el `.cex`;
- **⚠** con lo que hay que hacer, según el caso:
  - **aerotermia sin equipo**: «+ Ponerla». Compone la MISMA aerotermia genérica que deja el PC
    (`aerotermiaGenericaLibre`: bomba de calor aire-agua para calefacción y ACS, SCOP 4,00 y 3,00,
    15.000 €, 15 años, secuencia 2). Sin caldera que sustituir, o con biomasa, que tiene otra
    justificación, no se ofrece;
  - **placas** (aerotermia + FV, o FV sola) sin poder componerlas: las añade el PC al generar, porque
    se dimensionan con el consumo que calcula CE3X y con PVGIS;
  - **ventanas y aislamientos**: la ventana todavía no los compone, y los pone el PC como medida libre.

El cruce va por el catálogo (`aerotermia`, `aerotermia_fv`, `autoconsumo`) y, en las libres, por el
NOMBRE, que es lo que lee el certificador. Fuente única:
[medidasObra.js](implementation/frontend/src/features/cee-envolvente/logic/medidasObra.js). Lo que
pidió la obra lo trae el adaptador ([certappObra.js](implementation/frontend/src/features/cee-envolvente/logic/certappObra.js),
`medidas_obra: { ids, sugeridas, calefaccion }`).

### Lo que queda

- La **huella** de la receta (`huellaFicha`) no incluye las medidas libres. Si se edita una libre en la
  ventana, el `.cex` de Drive **no** sale como desfasado. Meterlas en la huella haría que todos los
  sellos con libres salieran desfasados de golpe. Se decide aparte.
- Ventanas y aislamientos como medida compuesta desde la ventana.

Tras tocarlo: `node implementation/backend/scripts/test_medidas_obra.mjs`.
