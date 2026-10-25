<!-- conocimiento · área: cee-generacion · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES (2026-09-29)», en el CLAUDE.md antiguo.

### Y llega al CEE: la pestaña, el encargo y la envolvente (2026-09-29)

Lo confirmado se quedaba en el WhatsApp al staff y en Instalación, que no es donde
se mira al encargar el certificado. Ahora va a los tres sitios donde se usa:

| Dónde | Qué |
|---|---|
| Pestaña **CEE** del expediente | Línea «🏠 Confirmado por el cliente» ([ConfirmadoPorCliente.jsx](implementation/frontend/src/features/expedientes/components/ConfirmadoPorCliente.jsx)) |
| **Encargo del CEE INICIAL** al certificador | Bloque con lo confirmado y CÓMO declararlo — `bloqueConfirmacionCertificador` en `confirmacionCliente.js`, que el backend manda como `bloque_certificador` en `GET /:id/aviso-cliente-cee` (CAE **y** CEE directos) y el popup mete en su plantilla |
| **Envolvente → Instalaciones** | Bloque «❄️ Aires acondicionados existentes»: los crea de un clic, uno por aparato |

**REGLA — los aires existentes se declaran según el NEGOCIO, y lo decide una
persona.** En un expediente **CAE** van como **«Equipo de sólo refrigeración»**
(máquina frigorífica, 250 % nominal), cada uno con su parte de la refrigeración
—y la superficie en la misma proporción—: es el CEE inicial de **26RES060_206**
hecho a mano (5 × 20 %, 28,4 m² cada uno). Cuánto es esa parte, más abajo
(2026-10-08). En una **deducción del IRPF** (CEE
directo, **2026CEE_60**) van como **«Equipo de calefacción y refrigeración»**
(bomba de calor, 270 % / 250 %): ahí los aires son parte de la calefacción. El
bloque propone uno u otro por el negocio (`airesDelCliente`) y se cambia en él;
el número viene de lo que dijo el cliente —o, mientras no ha contestado, de lo
apuntado en la OPORTUNIDAD (`instalacion.aires` / `inputs.aires`, 2026-10-15; el
bloque dice de dónde sale)—. Volver a pulsar **sustituye** los aires
que puso el bloque (marca `aire: true`), nunca los suma.

**En un RES060 (cambio de caldera), cada aire es una máquina frigorífica (sólo frío)**
(decisión de Fran, 2026-10-07, 26RES060_223: 3 aparatos sin foto de su placa). La
potencia no cambia el cálculo, pero la 3.x la exige para escribir el XML; si hay placa
con otra potencia de frío, manda la placa. Lo aplican las skills `generar-cee-inicial`
(`"aires": { "n", "modo": "refrigeracion" }`) y `revisar-cee`.

**REGLA — un aire SOLO FRÍO enfría su estancia, no la casa** (decisión de Fran,
2026-10-08). Repartir el 100 % entre los que hubiera hacía que un solo split
«refrigerase» una vivienda de 233 m². Ahora cada aparato cubre **~40 m²**
(`M2_POR_AIRE`), **entre el 10 % y el 25 % de la vivienda** (`pctPorAire`), y entre
todos **como mucho el 100 %**: se llega a partir de 4 en una casa de hasta 160 m²; una
más grande necesita más. Lo que no cubren lo pone CE3X con su sistema por defecto
(máquina frigorífica eléctrica). Su **potencia de frío: 0,1 kW por m² que sirve, entre
3 y 5 kW** (`potenciaAireKw`). La referencia de siempre se conserva: 5 aires en
142 m² siguen dando 5 × 20 % (cinco de 25 % pasan del 100 %). Con **frío y calor**
(CEE directo) se sigue repartiendo el 100 %: ahí los aires son la calefacción y esa
decisión no se ha tocado. Fuente única: `repartoAires` en
[fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js),
que usan el bloque de la ventana y la skill; el encargo al certificador lo dice con
palabras (`bloqueConfirmacionCertificador`).

| Aires | 100 m² | 160 m² | 233 m² | 300 m² |
|---|---|---|---|---|
| 1 | 25 % · 3 kW | 25 % · 4 kW | 17 % · 4 kW | 13 % · 4 kW |
| 2 | 50 % | 50 % | 34 % | 26 % |
| 4 | 100 % | 100 % | 68 % | 52 % |
| 6 | 100 % | 100 % | 100 % | 78 % |

**REGLA — los aires van en el CEE INICIAL.** El final los conserva al copiarlo (la
refrigeración nunca retira nada, regla 72); declararlos solo en el final dejaría
dos certificados de viviendas distintas. Si el cliente dijo que tiene aires y el
inicial no lleva ningún equipo de frío, el bloque sale abierto en ámbar y la ficha
lo avisa al generar.

**El motor aprendió el «calefacción y refrigeración» ESTIMADO** (`equipo_climatizacion`):
antes solo sabía el ensayado. Forma MEDIDA sobre los 1.597 `.cex` de «Mi unidad»
(258 equipos, 211 idénticos): cola `[['', nominal_cal, nominal_ref], [True, False,
False], []]`. Y el estacional que CE3X calcula del nominal se escribe ya
aproximado (`FACTOR_ESTACIONAL`, medido: máquina frigorífica 0,63; bomba de calor
de caudal variable 0,7567 / 0,6533) en vez del nominal: 250 → **157,5** y 270 / 250
→ **204,3 / 163,3**, las cifras exactas de los dos `.cex` de referencia. Los
interruptores no mueven el estacional (medido), así que van los más comunes.

⚠️ Con **frío y calor** los aires cubren también la calefacción: si además hay
caldera al 100 %, el total de Instalaciones sale en rojo y hay que repasar los
porcentajes. Se dice en el propio bloque; no se reparte solo, porque cómo se
reparte la calefacción entre la caldera y los aires lo decide el certificador.

```bash
node implementation/backend/scripts/test_aires_ce3x.mjs
python -m pytest implementation/cee-engine/tests/test_equipos.py
```

### CE3X cuenta los METROS, no el %: la refrigeración nunca pasa del 100 % (2026-10-25)

**El caso, 2026EXT_2** (app de certificadores): caldera de gasóleo y tres aires añadidos a
mano «al 20 %», sin superficie. La ficha (`equipoAnadido`) les daba la vivienda entera, y
el `.cex` salió con `[['', ''], ['', ''], ['128', '20']]` en cada aire, en el edificio Y
en la medida. Por el % suman el 60 %; por los m², 3 × 128 = 384 m² en una casa de 128,
el **300 %**, y CE3X: «La instalación de refrigeración cubre una demanda superior al
100%». No calificaba ni el edificio ni la medida.

**REGLA — CE3X mide la demanda cubierta por los m² que sirve cada equipo, NO por su
«Porcentaje»: la superficie servida es la útil × % / 100, y la refrigeración nunca pasa
del 100 %.** En su pantalla los dos campos van atados; los que no cuadran los escribe la
app. Medido con el motor de CE3X 3.2 sobre el `.cex` de 2026EXT_2 (128 m² útiles):

| Cada aire | Frío por m² | CE3X |
|---|---|---|
| 128 m² al 20 % | 300 % | no califica |
| 50 m² al 20 % | 117 % | no califica |
| 42 m² al 20 % | 98 % | califica |
| 25,6 m² al 20 % | 60 % | califica: EPNR 448,48 (F), emisiones 116,92 (G) |
| 25,6 m² al **100 %** | 60 % | **idéntico**: el % no cuenta |

En el corpus (2.044 `.cex`, 2.484 pares con un % por debajo del 100): 2.378 cuadran; 82
sirven MENOS m² que su parte (CE3X lo admite y pone el resto por defecto); y los 24 que
sirven MÁS son todos nuestros (2026EXT_2, 2026CEE_60 `_OLD` y 26RES080_OP72).

**Qué hace el motor** (`_frio_hasta_cien`, dentro de `construir_instalaciones`: vale
igual para el edificio, cada medida y el CEE final copiado):

1. Un equipo con un % por debajo del 100 que declara más m² que su parte **baja** a
   útil × % / 100, y se dice. Nunca sube: unos m² de menos son un dato.
2. Los equipos de frío que **se quedan** en el fichero copiado, igual (un inicial
   escrito antes de esto se corrige al hacer su medida o su final): «se QUEDA con su
   20 % del frío, pero declaraba 128 m2…».
3. Los nuevos con su parte (los aires) se la quedan; si con lo que ya hay pasan del
   100 %, se reparten lo que queda en la misma proporción, y se dice con el mensaje de
   CE3X.
4. Un equipo sin parte (la aerotermia al 100 % con frío) lleva **solo el resto**: con
   esos tres aires, un `mixto3` va al 40 % y 51,2 m².

Todo a dos decimales **hacia abajo** (seis aires al 16,67 % de 128 m² serían 128,04 m²).
La superficie útil: la de la ficha (`generales.superficie_util_habitable`), en
`/cex/instalaciones` la del fichero que se copia (`superficie_util_del_cex`), y sin
ninguna, la del equipo que da algo al 100 % (el edificio entero). El aviso de «suman
más del 100 %» ya no dice que CE3X lo admite: no lo admite.

**Y en el origen**: `equipoAnadido` (fichaCe3x.js), sin superficie tecleada y con un %
por debajo del 100, pone su parte (128 × 20 % = 25,6) en vez de la vivienda entera.

Comprobado de punta a punta en este PC, en seco: `cee_inicial.js rehacer 2026EXT_2
--calificar` con el motor nuevo escribe los aires a 25,6 m² en el edificio y en la medida,
y CE3X 3.2 califica los dos (EPNR 448,48 F · emisiones 116,92 G, y la medida con su
ahorro calculado).

```bash
node implementation/backend/scripts/test_aires_ce3x.mjs
python -m pytest implementation/cee-engine/tests/test_equipos.py   # los «2026EXT_2»
```
