<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## BLOQUES de viviendas — el edificio completo como objeto (2026-09-11)

Hasta ahora la app suponía siempre UNA vivienda: una superficie, una caldera, un
titular. Buscar la referencia de un bloque (`3121402WN4032S`, CL Fuenmayor 66-74 de
Logroño) **no daba "es un edificio": daba un error genérico**, y la calculadora no tenía
forma de simular una caldera centralizada que solo da el ACS.

**REGLA — no hace falta ficha nueva: es la RES060.** Lo dice su propio texto —
*"Sustitución de la caldera de combustión **en un edificio** de uso residencial privado
[…] para calefacción **y/o** agua caliente sanitaria"*— y sus variables hablan de la
demanda y la superficie *"del **edificio** o vivienda según certificado de eficiencia
energética"*. Lo que faltaba era app, no normativa.

| Qué | Dónde |
|---|---|
| Qué es un bloque, cómo se lee del `.xml` y el requisito del IRPF | [logic/tipoInmueble.js](implementation/frontend/src/features/calculator/logic/tipoInmueble.js) |
| El Catastro reconoce la parcela | `resumirParcela` / `extraerInmuebles` en [catastroService.js](implementation/backend/services/catastroService.js) → `/search` devuelve **`RC_PARCELA`** |
| La pantalla del edificio | [ParcelaCard.jsx](implementation/frontend/src/components/ParcelaCard.jsx) — flujo interno (`App.jsx`) y landing |
| El alcance en el ahorro | `changeHeating` en `calculateSavings` ([calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js)) |
| D_ACS del edificio | `resolveDacs` ([demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js)), el MISMO módulo que el expediente |
| Prueba | `node implementation/backend/scripts/test_bloque_viviendas.mjs` |

### El Catastro responde de DOS formas a una RC de 14, y solo se leía una

Si la finca no tiene división horizontal devuelve `bico` (UN inmueble); si la tiene,
devuelve `lrcdnp` (la LISTA) y **ningún `bico`**. `getByRC` leía `bico.bi` a pelo, así
que el bloque moría en un `TypeError` y la app decía *"no se pudo completar la
búsqueda"*. Ahora se resume como lo que es: 118 inmuebles, **85 viviendas**, 9.913 m²
construidos de vivienda, 2008, zona D2.

**REGLA — la dirección se compone del nodo ESTRUCTURADO (`dir`), no del `ldt`.** Ese
texto lleva pegado el interior ("Es:1 Pl:00 Pt:01") y el primer número que aparece no es
siempre el del portal. Y un bloque puede dar a **dos calles** (éste hace esquina: CL
Fuenmayor 66-68-70-72-74 **y** CL Irlanda 1); las dos se enseñan, o quien busca duda de
si la referencia encontrada es la suya.

**REGLA — la pantalla del bloque NO decide por el usuario.** La misma referencia sirve
para dos trabajos opuestos: simular el EDIFICIO (una caldera centralizada, un CAE para la
comunidad) o entrar a UNA vivienda. Se ofrecen los dos.

**REGLA — el edificio completo es del flujo INTERNO** (`permiteBloque`). En la landing
pública solo se ofrece elegir la vivienda: un visitante que simulara el bloque entero se
llevaría un bono que no es suyo. Antes de esto la landing se quedaba **muda** con una RC
de 14 (ninguna rama la trataba), que es peor que el error que había.

⚠️ **"Nueva simulación" ES `LandingFunnelView` en modo interno**, no la pantalla
`SEARCH` de `App.jsx`. La primera versión puso el botón solo en aquella y el único
camino por el que el staff crea una simulación se quedó sin él: la tarjeta del edificio
salía, pero no dejaba continuar. Desde el bloque **se sale DIRECTO a la calculadora**
(`onBloque`), sin pasar por el funnel —sus preguntas (caldera, emisores, habitaciones)
son de UNA vivienda— y con el CEE de la puerta previa ya sembrado
(`seedInputsFromCees`): si no, el `.xml` del edificio se quedaba en la puerta y había
que volver a subirlo. La oportunidad se guarda desde la calculadora, y el backend la
reconoce por su RC si ya existía.

### Lo que cambia en el cálculo, y lo que NO

**REGLA — el servicio fuera de alcance se CANCELA, no se resta.** `changeHeating: false`
hace exactamente lo que `changeAcs: false` ya hacía con el ACS: el servicio que queda
fuera se calcula después **con el rendimiento de la caldera antigua**, así que su ahorro
es cero y su consumo sigue contando en la energía final de partida. No hay una fórmula
paralela que pueda divergir de la de siempre, y con el valor por defecto (`true`) una
vivienda devuelve el mismo número que antes de que el parámetro existiera.

**REGLA — `changeHeating` solo se pregunta en un BLOQUE.** En una vivienda la actuación
ES cambiar la caldera, así que el cálculo fuerza `true`: un valor heredado (de una
simulación reclasificada, por ejemplo) no puede dejar la calefacción fuera a espaldas de
nadie.

**REGLA — la D_ACS de un edificio sale del CERTIFICADO, nunca del CTE.** La fórmula del
Anejo F es por dormitorios de UNA vivienda (2.731,4 kWh/año con cuatro), y en un edificio
de 85 no describe nada; si llegara ese método, se lee el certificado. El residencial de
UNA vivienda **conserva su 2.731,4 de siempre**: cambiarlo movería el ahorro de toda
propuesta nueva y no se ha pedido.

⚠️ **La demanda de ACS solo está en el `.xml`.** El PDF del CEE no la imprime (su Anexo II
solo trae la calificación parcial de calefacción y refrigeración), así que el OCR no puede
sacarla y un bloque necesita el fichero. Se dice en pantalla.

⚠️ **Esa demanda se estaba PERDIENDO por el camino.** `ceeFromXml` no la copiaba y
`ceeToXmlShape` la ponía a `null`, así que un CEE cargado por la puerta previa llegaba al
expediente con `cee_inicial.demandaACS` vacío y la ficha imprimía **D_ACS = 0,00** en modo
'xml'. Ahora viaja; para el residencial es una corrección (de 0 al valor del certificado),
para el bloque es LA cifra de la que sale todo el ahorro.

### El `<TipoDeEdificio>` del certificado

`parseCeeXml` lo lee ya, en crudo, y **quién decide qué significa es el código**
(`clasificarTipoEdificio`). Se compara por SUBCADENA normalizada —"bloque" + "completo"—
y no contra cadenas exactas: el enum se escribe de varias formas según la herramienta que
genere el XML, y de los **462 certificados reales** de la carpeta de casos ninguno es de
bloque completo (405 `ViviendaUnifamiliar`, 40 `ViviendaIndividualEnBloque`, 9
`EdificioUsoTerciario`, 8 `LocalUsoTerciario`), así que no hay forma de verificar hoy la
cadena exacta. Un tipo desconocido devuelve `null` —"no consta"—, que **no es lo mismo que
"es una vivienda"** y no apaga ni enciende nada por su cuenta.

Si el certificado contradice lo declarado, **se avisa y no se corrige solo**: un CEE de una
vivienda suelta aplicado a un bloque da una D_ACS ~100 veces menor que la real, y al revés
infla el ahorro de un piso con el del edificio entero. Las dos cosas acaban firmadas.

### El dinero: un bono, una comunidad, la deducción de cada vecino

- **El bono CAE va ÍNTEGRO a la comunidad de propietarios**: un CIF, un IBAN, un convenio
  de cesión firmado por el presidente.
- **La deducción del IRPF es la del EDIFICIO: 60 %** (tope 9.000 € de deducción, 15.000 € de
  base acumulada), y la aplica **cada propietario** sobre la derrama que le repercute la
  comunidad — por eso se reparte entre el nº de viviendas (`numOwners`, sembrado desde el
  Catastro). **REGLA — ni `tipo: 'piso'` ni una participación heredada < 100 la bajan al
  40 %** (`esBloque` en `calculateFinancials`): esos dos campos describen una vivienda
  suelta dentro de un inmueble ajeno, y aquí la obra es de la comunidad.
- **REGLA — el requisito se dice en pantalla.** La deducción exige que el certificado
  posterior acredite **≥30 % de reducción del consumo de energía primaria no renovable**
  del edificio, o letra A/B en ese indicador (lo comprueba `logic/irpfEpnr.js` sobre el
  expediente, cuando ese certificado existe). Con una actuación **solo sobre el ACS** eso
  hay que comprobarlo antes de prometerlo: una propuesta que anuncia 9.000 € por vivienda
  sin decir de qué dependen se lee como un derecho adquirido.

### El CEE del EDIFICIO, el alta por script y la vía FM (2026-11-20, 26RES060_OP438)

Encargo de Fran: «hacer el CEE de toda la comunidad para calcular con el FM y su
correspondiente multiplicador». Es la comunidad de C/ Ntra. Sra. de los Buenos Libros 1
(Murcia, RC de la parcela 4270003XH6046N), traída por SIETE HERMANOS: 14 viviendas en 7
plantas, con caldera centralizada de gasóleo y radiadores. Para hacerlo faltaban cuatro
piezas:

| Pieza | Dónde |
|---|---|
| El MOTOR mide el edificio entero desde la RC de 14: cada inmueble de `lrcdnp` pasa a ser una construcción con su código `escalera/planta/puerta` | `consulta_dnprc` → `_unidades_de_parcela` / `_resumir_parcela` en [alphanumeric.py](implementation/cee-engine/src/catastro/alphanumeric.py); prueba `tests/test_edificio_completo.py` |
| Las cabeceras de los avisos tienen un TOPE: con 203 paredes (un aviso por pared) la cabecera `X-Cee-Avisos` pasaba de los 16 KB que admite undici, y Node cortaba la respuesta del `/cex` (`UND_ERR_HEADERS_OVERFLOW`) | `_cabecera_json` en [server.py](implementation/cee-engine/server.py), que agrupa los repetidos («(xN)»), corta a 8.000 B, dice cuántos no caben y sirve también para `X-Cee-Contraste`; prueba `tests/test_cabecera_avisos.py` |
| La FICHA CE3X propone el bloque: «Bloque de Viviendas», `unidades_uso` = nº de viviendas, y ACS = 140 l/día × n × el factor de centralización del CTE HE Anejo F (14 viviendas → 0,90 → 1.764 l/día). Lo que haya puesto el certificador manda | `propuestaDeBloque` / `factorCentralizacionAcs` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) y `viviendasBloque` en `datosCe3x31` |
| El ALTA por script admite un bloque: con `"bloque": true` en el plan y la RC de 14 | `parcelaComoBloque` en [altaOportunidad.js](implementation/backend/utils/altaOportunidad.js) y `crear` en `scripts/alta_oportunidad.js`: `tipoInmueble 'bloque'`, `numViviendas`, `numOwners`, `demandMode 'manual'`, `acsMethod 'xml'` y un aviso de que la cifra es ORIENTATIVA hasta tener el CEE |
| El XML del CEE del edificio exige la RC de 20 (`Parcela` [0-9A-Z]{14} + `Inmueble` \d{4}[A-Z]{2}): con la de 14 de la parcela no validaba. El `.cex` declara la RC de 20 de CADA VIVIENDA (los locales y garajes, no) | `referencia` en `_unidades_de_parcela` ([alphanumeric.py](implementation/cee-engine/src/catastro/alphanumeric.py)) y en los attrs del espacio (`pipeline.py`); `rcsDelBloque` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js); `out[15]` como LISTA en `generar_cex.py`; prueba `tests/test_edificio_completo.py` |

**REGLA — la vía FM de un bloque es la del edificio CENTRALIZADO también fuera de la
calculadora.** `computeFullCalculatorResult` (lo usan el alta, `recalcular` y la carga del
XML) llamaba al FM con `bloque: false` fijo, porque la landing nunca tiene bloques. Un bloque
dado de alta por script salía como unifamiliar, con f_M 2 y D_ACS = 11·S. Con el CEE del
edificio, la diferencia fue de **396,7 MWh frente a 621,6 MWh**. Ahora pasa `esBloque(inputs)`
y el `changeHeating` del bloque, igual que `CalculatorView`. Lo vigila la sección 7 de
`test_bloque_viviendas.mjs`.

**La SUPERFICIE ÚTIL de un bloque no es la del Catastro.** La de cada vivienda lleva
repercutidos los elementos comunes: en OP438 eran 2.702 m² construidos, frente a 318 m² de
huella × 7 plantas = 2.228 m². Como la D_ACS de la vía FM es 16·S, inflar la S infla el bono.
Al CEE se le pone una útil realista con `ajustes.superficie_util_habitable`; en OP438, 1.900 m²
(≈ 0,85 × la huella) a falta de planos. El motor avisa de que la huella sale menor que lo
declarado, y en un edificio completo explica por qué.

Resultado del CEE A CIEGAS de OP438, calificado con CE3X 3.2 en el PC: huecos al 12 %, caldera
de 160 kW (sin placa) y zona HE4 V. Sale una demanda de calefacción de **92,66 kWh/m²**, que
con la superficie da 176.054 kWh/año (con huecos al 20 %, 90,28). Las dos vías:

- **Ficha vigente**: 178,8 MWh → 17.884 € (solo calefacción, con η 0,79 y SCOP 4).
- **Vía FM**: [176.054 × (1/0,79 − 1/4) + 30.400 × (1/0,79 − 1/3)] × 3 = **621,6 MWh → 62.156 €**,
  ELEGIBLE. La cifra supone el depósito de ACS (regla 155), que hay que añadir al presupuesto.

### Lo que todavía NO cubre

El encargo llegó hasta **simular y guardar la oportunidad**. Queda fuera, y hay que
hacerlo antes de tramitar un bloque de verdad: que el EXPEDIENTE herede el alcance
(`changeHeating`) y el modo de D_ACS —hoy `expedienteService` solo los copia en el
terciario, así que un bloque aceptado recalcularía el ahorro CON la calefacción, distinto
del que se le presupuestó—, y que la **Ficha RES060 y el CIFO impriman "no aplica"** en
D_CAL, S y SCOP cuando la calefacción queda fuera, como ya hace la TER100 con sus
servicios (regla 12.b) y con el mismo motivo: un valor a la vista invita al verificador a
multiplicarlo.
