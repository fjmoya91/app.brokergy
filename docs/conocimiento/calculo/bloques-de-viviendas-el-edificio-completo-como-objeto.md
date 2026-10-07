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

### Lo que todavía NO cubre

El encargo llegó hasta **simular y guardar la oportunidad**. Queda fuera, y hay que
hacerlo antes de tramitar un bloque de verdad: que el EXPEDIENTE herede el alcance
(`changeHeating`) y el modo de D_ACS —hoy `expedienteService` solo los copia en el
terciario, así que un bloque aceptado recalcularía el ahorro CON la calefacción, distinto
del que se le presupuestó—, y que la **Ficha RES060 y el CIFO impriman "no aplica"** en
D_CAL, S y SCOP cuando la calefacción queda fuera, como ya hace la TER100 con sus
servicios (regla 12.b) y con el mismo motivo: un valor a la vista invita al verificador a
multiplicarlo.
