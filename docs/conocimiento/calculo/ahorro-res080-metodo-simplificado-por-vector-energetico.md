<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Ahorro RES080 — método SIMPLIFICADO, por vector energético (2026-08-10)

Segunda forma de calcular el ahorro de energía final, junto a la histórica. Se elige y se guarda;
**por defecto sigue siendo el detallado**, así que nada de lo ya existente cambia.

| Método | Se parte en | Función |
|---|---|---|
| **DETALLADO** (el de siempre) | 3 USOS: ACS · calefacción · refrigeración, cada uno con su combustible | `calculateRes080` / `calculateRes080FromEmissions` |
| **SIMPLIFICADO** (nuevo) | 2 VECTORES: consumo eléctrico · otros combustibles | `calculateRes080Simplificado` |

Misma física en los dos (`consumo = emisiones / factor_paso`; ahorro = ΣEi − ΣEf): solo cambia en
cuántas categorías se divide.

### El `.xml` del CEE trae la energía final YA CALCULADA — no hay que derivarla

El simplificado tiene **dos fuentes**, y `results.fuenteDatos` dice cuál se usó:

| `fuenteDatos` | De dónde | Cuándo |
|---|---|---|
| `energia_final_declarada` | **`<EnergiaFinalVectores>`** del `.xml`: kWh/m²·año por vector energético y, dentro de cada uno, por uso | Siempre que haya `.xml` de los dos CEE |
| `emisiones` | `<EmisionesCO2><ConsumoElectrico>/<ConsumoOtros>` ÷ factor de paso | Sin `.xml` (OCR de PDF/fotos) o a mano |

**La primera es la buena y es la que manda**: la ficha pide *energía final* y el certificado la
declara tal cual, así que no se estima ni se divide nada — se suman los vectores. Medido contra un
CEE real: `ElectricidadPeninsular.Global 36,91 × 0,331 = 12,22` y `GasoleoC.Global 26,91 × 0,311 =
8,37`, que son exactamente las dos filas de emisiones que imprime el PDF. Ese contraste se calcula
(`results.contraste`) y **se enseña en el certificado**: dos números independientes del mismo
documento que concuerdan es la mejor prueba de que la lectura es correcta.

**REGLA — leyendo la energía final NO hay restricción de un solo combustible.** Esa limitación es
de la vía por emisiones: allí «otros combustibles» es UNA cifra de CO₂ que hay que dividir por UN
factor de paso, y con dos combustibles la suma es indeshacible. Con `<EnergiaFinalVectores>` cada
vector viene por separado **y en kWh**, así que sumar gasóleo + gas natural es legítimo. Por eso el
aviso de mezcla y el selector de combustible se ocultan cuando `fuenteDatos === 'energia_final_declarada'`.

**REGLA — con PLACAS, el ahorro bueno es el POR VECTOR** (2026-10-05, decisión del usuario,
26RES080_OP71). El total de cada vector (`Tot` en el 3.0, `Global` en el 2.0: los DOS formatos
traen `<EnergiaFinalVectores>`) va NETO de lo que las placas generan y se autoconsume; los usos
(calefacción, ACS, refrigeración) van en BRUTO. Medido: OP71 previsto, 43,82 − 10,22 = 33,60 kWh/m²
× 155 = 5.208 kWh = `<EnergiaGeneradaAutoconsumida>`; 26RES080_61 (2.0), 27,82 − 1,41 = 26,41 × 159
= 4.200. Por eso «por uso» sale 5,21 MWh más bajo en OP71: suma los usos y no resta el autoconsumo.
Un total **0** es «las placas lo cubren todo», no un dato ausente: el lector volvía a la suma bruta
(`global || suma`) y se perdía el autoconsumo (2 CEE del corpus, `CEE INICIAL_23` y `10004-5073`,
6,6-6,7 kWh/m²); ya no — se regeneró la huella de `test_xml_cee_v30.mjs`. Con placas en algún CEE
solo hay dos RES080 hoy: 26RES080_61 (final) y 26RES080_66 (inicial). **Y por eso, con placas en
cualquiera de los dos CEE, el cálculo va POR VECTOR aunque esté elegido «por uso»** (regla 134):
`calculateRes080` lo detecta con `autoconsumoDeXml` y `calculateRes080FromEmissions`, sin XML, con
las celdas por vector (`autoconsumoDeEmisiones`, que exige que la parte no eléctrica cuadre para no
fiarse de celdas de otro CEE). El resultado lleva `metodoForzado: 'autoconsumo'` y la pantalla lo dice.

**REGLA — un RES080 siempre actúa sobre la envolvente, y el rendimiento de la caldera del inicial
es el del CEE, no el de la tabla** (2026-10-24, Fran, 26RES060_OP335). El RES080 es una reforma:
fachadas, cubierta, ventanas… más las instalaciones. «RES080 solo con aerotermia» no existe, ni
siquiera como fila de comparación. En el RES060 la caldera que se sustituye va con el rendimiento de
la tabla de la ficha (biomasa automática 0,60), y eso no se toca. En el RES080, en cambio, el ahorro
es la diferencia de energía final entre los CEE, y en el inicial se puede declarar un rendimiento
estacional más bajo: el que calcula CE3X. Caso medido en OP335, biomasa de 25 kW con fachadas N y S
aisladas por el exterior:
- El .cex del agente llevaba un 61 % aproximado; guardado en CE3X, la caldera queda al **50 %**.
- La biomasa del inicial pasa de 272,82 a 332,17 kWh/m².
- RES060: 56.819 kWh · RES080: 71.420 kWh. Del aislamiento, solo unos 290 kWh.
- La diferencia entre fichas sale del rendimiento del inicial, no de la envolvente.

**Un vector con todo a cero no se consume**: el XML los lista los ocho siempre, así que el parser
guarda solo los que tienen consumo — y esa lista **es** el inventario de combustibles reales del
edificio. También es donde se ve el reparto que el resumen por servicio escondía: en el CEE medido,
la calefacción sale cubierta a la vez por electricidad (33,26) y gasóleo (5,58).

⚠️ Las etiquetas de `<EnergiaFinalVectores>` **no** coinciden con las de `<VectorEnergetico>`:
allí es `BiomasaPellet` (sin la -e) frente a `BiomasaPellete`. Sin las dos entradas en
`mapVectorEnergetico` el vector caía fuera de `FACTORES_PASO` y `getFactorPaso` devolvía **1**.
`Biocarburante` se deja sin mapear a propósito: no tiene factor en la tabla y no se le inventa uno
— su energía final sí se lee (no necesita factor) y el contraste de emisiones se marca no disponible.

**Por qué existe**: hay CEEs en los que un mismo servicio tiene DOS generadores de combustibles
distintos (visto: bomba de calor eléctrica 420 % + caldera de gasóleo 77,9 % para calefacción y
ACS) y el certificado **no dice qué porcentaje del consumo va por cada uno**. Por uso no se puede
repartir; por vector el certificado ya trae la separación hecha.

**REGLA — solo con UN combustible no eléctrico en todo el edificio.** Con dos (gasóleo + gas), la
fila «otros combustibles» los suma con factores de paso distintos y esa suma no se puede deshacer.
`combustiblesNoElectricos()` lo detecta y la UI **avisa, no bloquea**: el dato lo confirma una
persona. Canoniza contra `FACTORES_PASO` para que las MAYÚSCULAS de `normalizeData` no cuenten dos
veces el mismo combustible.

**REGLA — el combustible se busca en TODOS los generadores, no en el primero de cada servicio.**
`combustibleCalefaccion` se queda con el primer `<VectorEnergetico>` que encuentra, y el caso que
justifica este método es justamente el de un servicio con dos generadores: medido sobre un CEE
real, devolvía "Electricidad peninsular" y se perdía el gasóleo. `parseCeeXml` barre todos los
vectores de `<InstalacionesTermicas>` y deja `combustibleOtros` = el único no eléctrico, o **null
si hay varios** — null es la señal de que el método no aplica. Si el XML no lo resuelve pero sí
declara emisiones por otros combustibles, la fila «Otros combustibles» de la tabla queda editable
para elegirlo a mano (es el único campo editable en modo XML) y se avisa: sin combustible no hay
factor de paso y ese consumo contaría como cero.

**REGLA — en simplificado NO se estima la columna FINAL.** El estimador «¿Aún no tienes el CEE
FINAL?» parte de la demanda POR USO, y su resultado habría que repartirlo otra vez entre los dos
vectores: justo el reparto que aquí no se conoce. Se oculta y se explica por qué; el FINAL se lee
del CEE posterior o se teclea.

**REGLA — el certificado RES080 tiene que EXPLICAR el método.** El verificador espera tres filas y
ve dos: sin la nota no puede reproducir el cálculo. Y el texto **cambia según la fuente** — no se
le puede decir que un número está declarado si está derivado del CO₂. Con
`energia_final_declarada` el certificado añade además una **página con el desglose completo vector
× uso** de los dos CEE: es la que permite rehacer el total sumando y la que enseña el reparto que
el resumen por servicio escondía.

Las dos páginas son **fuente única**: `buildJustificacionAhorroPages()` en
[res080Doc.js](implementation/frontend/src/features/expedientes/logic/res080Doc.js), que llaman
tanto el PDF que se archiva como `CertificadoRes080Modal.jsx` (la vista previa, que mantiene su
propia copia del RESTO del documento). Mismo patrón que `buildCe3xPages`. Antes estaba duplicado y
había que tocar los dos sitios a la vez; ya no.

**Dónde se guarda** (sin migración — JSONB que ya existía). Los dos métodos conviven en el MISMO
`emisiones_manual` con prefijos distintos: cambiar de método y volver no borra lo ya tecleado.
- Oportunidad (`datos_calculo.inputs`, plano): `metodoAhorroRes080`,
  `manualEmisionesElectricoInicial/Final`, `manualEmisionesOtrosInicial/Final`,
  `combustibleOtrosInicial/Final`.
- Expediente (`cee`, anidado): `metodo_ahorro`,
  `emisiones_manual.electrico_ini/_fin` + `otros_ini/_fin`, `comb_otros_inicial/final`.

**Las CUATRO ramas del mismo cálculo** (hay que tocarlas a la vez): `CalculatorView.handleCalculate`
· `ExpedienteDetailView.calcResults` · `CeeModule.res080Data` · `cifoService.computeRes080Results`
(server-side, lo usa la skill `generar-anexo-cifo`). Cada una tiene DOS entradas al simplificado:
`calculateRes080SimplificadoFromXml` (con los dos `.xml`) y `calculateRes080Simplificado` (valores
sueltos, modo manual). El resultado marca `metodoAhorro` ('detallado'|'simplificado'): **ese campo
es el que ramea a los consumidores**, no el JSONB.

**OCR** (solo cuando no hay `.xml`): `ceeOcrService.js` lee los dos totales
(`emisiones.consumo_electrico_m2` / `consumo_otros_m2`) y `combustible_otros_detectado`. Un CEE
leído por OCR alimenta el cálculo igual que un `.xml` porque `ceeToXmlShape()` los mapea a
`emisionesConsumoElectrico` / `emisionesConsumoOtros` / `combustibleOtros`: los consumidores leen
`cee_inicial`/`cee_final` sin saber de dónde vinieron. `ceeToColumn()` los propaga además a las
dos superficies de «Cargar CEE». Lo que el OCR **no** puede dar es `energiaFinalVectores`: el PDF
no imprime esa tabla, solo está en el `.xml` — por eso un CEE por OCR cae siempre en la vía de
emisiones.

`EfficiencyTable` acepta `categories` (por defecto las 3 de siempre, sin cambios). Los rótulos van
EXPLÍCITOS por fila porque los dos métodos no comparten redacción: uno habla de usos y el otro de
vectores. `CATEGORIES_SIMPLIFICADO` es la fuente única de las dos filas nuevas.

### Con los dos `.xml`, el ahorro ES la energía final que declaran (2026-10-27)

**Caso: 26RES080_OP86 (JOSEFINA GUERRERO MARCHANTE).** La calculadora daba **41,18 MWh** y los dos
`.xml` dicen **55,73**. El ahorro salía de la tabla de emisiones: la fila «otros combustibles» del
inicial juntaba CARBÓN y el GAS NATURAL del sistema ficticio, y se dividía por UN solo factor de
paso. Con el `.xml` no hace falta dividir nada: `<EnergiaFinalVectores>` ya trae los kWh/m² de cada
vector.

**REGLA — con los dos `.xml` (los dos con `<EnergiaFinalVectores>`, CE3X 2.3 o 3.x), el ahorro
RES080 es Σ energía final del inicial − Σ la del final, y nada más** (Fran: «a partir de ahora, si
el XML es el 3.0, que coja la energía final del XML; igual pasará en el expediente»). Ni factores de
emisión, ni combustible que elegir, ni «por uso / por vector»: `calculateRes080` lo decide solo y
devuelve `metodoForzado: 'energia_final'` (vía `calculateRes080SimplificadoFromXml`). El módulo CEE
del expediente lo dice con el chip «Energía final del .xml» y el popup de la calculadora con una
nota en verde, sin desplegable de método. Con un PDF o una foto (OCR, sin esa tabla) sigue la tabla
de emisiones.

**En la calculadora, «Cálculo real» es UNA pestaña con un popup** (`CeeRealModal.jsx`, diseño
«carta de pago» de Facturación, pedido por Fran el 27/10/2026): antes había dos, «Cálculo real
(CEE)» por `.xml` y «CEE aportado» por emisiones. El popup tiene dos huecos, **CEE inicial** y **CEE
final · previsto o real** (`.xml`, `.cex`, PDF o fotos, por `extractCeeFromFiles`), y del inicial se
dice **de quién es**: el del cliente o el nuestro (`inputs.cee_inicial_origen`). Lo que se hace con
ello lo decide `seedCalculoRealReforma` en [ceeSeed.js](implementation/frontend/src/features/calculator/logic/ceeSeed.js):
- los dos con energía final → `demandMode: 'real'` + simplificado, y `CalculatorView` pasa los dos
  `.xml` a `calculateRes080`;
- alguno sin ella (OCR) → tabla de emisiones;
- sin final → el FINAL se estima con la aerotermia, y el inicial, si es del cliente, da la
  comparativa «con tu CEE» de siempre.

Con CEE FINAL **no hay comparativa** (`cee_previo` a null, como `cargarRes080EnOportunidad`): el
final medido ya es la cifra. La superficie pasa a ser la del CEE inicial. `ceesCargadosReforma`
reconstruye los dos CEE de lo guardado para reabrir el popup.

**El popup enseña el ahorro ANTES de pulsar «Calcular»** (Fran, 27/10/2026: «que me salga el ahorro
final y todos los datos»). Cada hueco dice superficie, demanda de calefacción y de ACS, energía final
(Σ vectores), energía primaria no renovable con su letra, fecha y zona. Con los dos cargados sale el
bloque «Ahorro de energía final»: la cifra en MWh/año (`ahorroM2 × superficieInicialAplicada`) y una
tabla vector a vector —inicial, final y ahorro en kWh/m²·año, con el total y el total del año en kWh—;
lo que SUBE (la electricidad de la aerotermia) va en ámbar y con signo menos. Se calcula con la MISMA
`calculateRes080SimplificadoFromXml` que usará la calculadora, sobre `ceeToXmlShape` de cada CEE, así
que la cifra del popup es la que queda (OP86: 55,73 MWh; gas 133,36 + carbón 123,19 − electricidad
18,40 = 238,15 kWh/m² × 234 m²). El vector que pone CE3X por su sistema ficticio se rotula «sistema
por defecto de CE3X» (regla 111). Con un CEE por OCR la tabla es la de emisiones (eléctrico / otros).

**El expediente** ya calculaba así con los dos `.xml` (CeeModule, `cifoService`,
`ExpedienteDetailView` dan la misma cifra); con origen MANUAL manda lo tecleado y no se ha tocado:
medido el 27/10/2026, ningún expediente en manual tiene los dos certificados.
