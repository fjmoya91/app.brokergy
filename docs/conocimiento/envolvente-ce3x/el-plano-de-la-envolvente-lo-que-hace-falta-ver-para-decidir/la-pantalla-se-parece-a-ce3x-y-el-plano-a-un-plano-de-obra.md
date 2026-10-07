<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

### La pantalla se parece a CE3X, y el plano a un plano de obra (2026-09-13)

Quien usa esto lleva veinte años tecleando certificados en CE3X y mirando planos
de obra. La pantalla no se rediseña por gusto: se rediseña para que no haya que
aprenderse otra forma de ordenar lo mismo.

**Barra de apartados de CE3X** ([PestanasCe3x.jsx](implementation/frontend/src/features/cee-envolvente/components/PestanasCe3x.jsx)),
pegada a la cabecera de la ventana: *Datos administrativos · Datos generales ·
Envolvente térmica · Instalaciones · Medidas de mejora · Análisis económico*, y
**Generar .cex** a la derecha, que es el final del recorrido.

**REGLA — la segunda línea de cada pestaña dice la VERDAD del expediente.** Sale
de `construirPestanas()` en `EnvolventeView` leyendo la ficha y el plano
(`✓ completo` · `N por confirmar` · `! falta la potencia` · `lo pone CE3X`); una
barra en la que todo pone siempre lo mismo se deja de leer a la segunda vez. Y
sale de un cálculo, no de un rótulo escrito: si la barra calculara por su cuenta,
acabaría diciendo algo distinto de la pantalla de debajo.

**REGLA — QUÉ falta en Instalaciones viaja en ESTRUCTURA**, no dentro de la
frase de un aviso: `fichaCe3x` devuelve `falta: 'falta la potencia'` y la ficha lo
publica como `instalaciones_falta`. Leerlo de un texto en castellano se rompe la
primera vez que alguien mejore la redacción (mismo criterio que `res.faltan[].rol`
en los firmados del S.O.).

**REGLA — cada apartado es una VENTANA que sustituye a la anterior, no un bloque
al que se baja.** En CE3X cada pestaña ES una pantalla: se entra, se rellena y se
sale. Con un scroll largo nunca se sabe si lo que falta está más abajo, y eso es
justo lo que hay que poder contestar de un vistazo. Se arranca siempre en
**Envolvente térmica**, que es a lo que se entra. Las ventanas viven en
[PanelesFicha.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelesFicha.jsx)
y reproducen los recuadros de CE3X con sus mismos rótulos y su mismo orden
(«Localización e identificación del edificio», «Datos del cliente», «Datos del
técnico certificador»; «Datos generales» y «Definición del edificio»).

**REGLA — la ventana de la ENVOLVENTE no se desmonta: se esconde.** Sobre el
plano se pasa un rato largo —las ventanas se ponen una a una— y volver de mirar
un dato no puede costar el encuadre, el zoom y la pared que se estaba mirando.
Las demás son formularios y se montan a demanda.

**REGLA — los ADMINISTRATIVOS se ENSEÑAN, no se teclean.** Los compone el backend
desde el expediente y desde Catastro; escribirlos aquí sería tener el titular en
dos sitios y que ganara el que se guardara el último. Estaban en la respuesta de
la ficha y no los veía nadie — y un certificado a nombre de otro titular no se
arregla reabriendo el `.cex`. Lo que falta sale en ámbar y se dice dónde se
corrige. Los **GENERALES** sí se editan, y lo que se toca queda marcado.

**REGLA — mientras se ESCRIBE el `.cex`, el mismo popup; y al acabar, el ENLACE
(2026-09-14).** Generar tarda —componer la ficha, bajar del Catastro la foto y el
croquis, escribir quince pickles sobre la plantilla y subirlo a Drive— y eso era
un botón que ponía «Generando…» sobre una pantalla quieta. Es el problema que ya
resolvió `MidiendoElEdificio` y se resuelve igual, en
[EscribiendoElCex.jsx](implementation/frontend/src/features/cee-envolvente/components/EscribiendoElCex.jsx):
SVG y `@keyframes`, ni un GIF ni una dependencia. El dibujo es **el edificio
convirtiéndose en fichero** —la planta se traza, sus muros vuelan a la hoja y
caen convertidos en renglones—, y **dos renglones van en el color de marca**
porque son la envolvente y las instalaciones: lo único que la app escribe sobre
la plantilla; los otros trece pickles se copian tal cual. Los rótulos son las
fases REALES de la ruta y en su orden, y el INICIAL y el FINAL tienen las suyas
(el final no pasa por Catastro: se copia el inicial).

**REGLA — al terminar sale el ENLACE DE LA CARPETA, no el del fichero.** Es la
que se le comparte al certificador al encargarle el CEE (`1. CEE / CEE INICIAL`),
donde va a buscarlo y donde sube después el suyo; el enlace del fichero suelto no
le sirve para eso. Ese enlace es el final del recorrido y no puede quedarse en
una línea verde al pie de la pantalla, que es donde estaba. `guardarEnDrive`
devuelve `carpeta_link` (`ensureCeeSectionFolder` ya la deja pública de lectura)
y el popup lo ofrece con «Abrir la carpeta», «Copiar el enlace» y, aparte, el
fichero. **El `_REVISAR` se explica AHÍ**: es la única pantalla que sale sola, así
que es el único sitio donde se lee seguro que esto lo ha escrito la app y todavía
no es el CEE.

⚠️ El popup y el **recuadro verde de la ventana son dos estados distintos**: el
recuadro se queda —es el rastro de lo que se generó— y el popup se cierra.
Compartiendo estado, cerrarlo borraría el rastro.

⚠️ **El papel del dibujo NO puede rellenarse con `--bkg-deep`**: en tema claro es
BLANCO, igual que la tarjeta del popup, y la hoja desaparecía — solo se veían los
renglones flotando. Va con un tinte del color del texto, que contrasta en los
dos.

⚠️ **Un «copiar» que falla se DICE.** Sin https o con el portapapeles capado,
`navigator.clipboard` lanza; un botón que no hace nada no se distingue de uno
roto y lo siguiente es volver a pulsarlo.

**REGLA — mientras se MIDE, un popup con el edificio dibujándose**
([MidiendoElEdificio.jsx](implementation/frontend/src/features/cee-envolvente/components/MidiendoElEdificio.jsx)).
Traer la envolvente tarda entre veinte segundos y un minuto, y eso era un botón
que ponía «Midiendo el edificio…» sobre una pantalla vacía: una espera larga
delante de una pantalla quieta se lee como que se ha colgado, y lo siguiente es
recargar, que vuelve a empezar la espera. Es SVG y `@keyframes` —ni un GIF ni una
dependencia—: la parcela, los vecinos, la planta trazándose, los muros
engordando con su trama, los huecos y las cotas.

**REGLA — la cabecera dice DE QUÉ OBRA es.** El expediente, el titular y la
dirección, que sale de `buildInstalacionAddress` —la de INSTALACIÓN, no la del
cliente—. Con dos o tres ventanas abiertas, «26RES060_186 · ISAAC PLIEGO» no
dice cuál es la casa que se tiene delante.

**REGLA — la foto de fachada y el croquis se MIRAN, pero se piden A MANO**
(`POST /:id/imagenes`). Van dentro del `.cex` y en CE3X se ven en Datos
generales, así que aquí también — pero con botón: son dos consultas a Catastro y
esta pantalla se abre muchas veces. La ruta es aparte de `/ficha` justamente por
eso (la ficha se repide con cada tecla) y usa el MISMO helper cacheado que la
generación, así que mirarlas no cuesta una petición más al generar.

**REGLA — el texto de una MEDIDA DE MEJORA se ve tal y como se va a volcar, y se
puede reescribir.** Son los tres campos del diálogo «Conjunto de medidas de
mejora» de CE3X (nombre · características · otros datos) y son TEXTO: lo que
compone la app es un borrador razonable, no un dato medido. Lo reescrito viaja
en `ajustes.medidas_texto` —o sea, se guarda con el trabajo— y manda sobre lo
compuesto; solo sobre el CONJUNTO, nunca sobre el equipo que lleva dentro, cuyo
nombre es el que casa con el catálogo y con lo que se le dice al certificador que
teclee. ⚠️ Los tres campos llevan `no-uppercase`: la regla global de `index.css`
pone en MAYÚSCULAS todo `input` y `textarea`, y la pantalla enseñaba una cosa
mientras el fichero llevaba otra.

**REGLA — el EQUIPO se puede teclear, no solo leer de la placa**
(`equipoConAjustes` en `fichaCe3x.js`, `ajustes.instalacion`). Leer la placa con
IA es lo más rápido cuando hay foto, pero hay datos que no están en ninguna
placa: el depósito de ACS, si la caldera está aislada, qué parte de la demanda
cubre. Lo tecleado MANDA sobre lo derivado y sale dicho en los avisos —es un dato
que va a un certificado—, y con ello se puede **rescatar un equipo que no se
escribía**: sin potencia la instalación existente se queda fuera del `.cex`, y si
alguien la teclea deja de faltar. Tras tocarlo:
`node implementation/backend/scripts/test_instalacion_ce3x.mjs`.

**REGLA — una vivienda puede tener VARIOS equipos, y se añaden con «+».** El
caso que lo manda: la caldera da la calefacción y la MITAD del agua, y un termo
eléctrico da la otra mitad. En CE3X son dos equipos, cada uno con el porcentaje
de demanda que cubre; aquí también. El primero es el del expediente (con su
«leer la placa») y los demás se añaden a mano, en `ajustes.equipos_extra`.

**REGLA — las tarjetas van PLEGADAS y el resumen dice lo que se pregunta.** Tres
formularios abiertos a la vez son una pantalla por la que hay que bajar para
saber qué hay: plegado se lee «Equipo mixto de calefacción y ACS · CALDERA ROCA
P-30-4 de carbón · 15,3 kW», que es qué es, cómo se llama y con qué anda. La que
se acaba de añadir se abre sola — si no, pulsar «+» deja una línea que pone «sin
datos» y parece que no ha pasado nada.

**REGLA — el reparto se ve SIN abrir las tarjetas.** «Demanda cubierta en total:
Calefacción 100 % · ACS 100 %», en verde, ámbar o rojo. Pasarse del 100 % declara
más demanda cubierta de la que hay y el certificado sale con un consumo que no
cuadra con su propia envolvente; quedarse corto es legítimo pero casi siempre es
que falta un equipo. **El motor lo repite** (`_reparto` en `generar_cex.py`),
porque ésa es la comprobación que manda: la hace sobre lo que de verdad se
escribe. Y **avisa, no aborta**: un `.cex` que no se escribe por un porcentaje es
peor que uno que lo dice.

⚠️ **La forma de cada slot está MEDIDA, y las dos nuevas salen de un `.cex`
concreto.** `equipo_acs` y `equipo_refrigeracion` se escribieron leyendo «CEE
DISTINTOS USOS CALEFACCIÓN Y ACS Y AACC.cex», guardado desde CE3X con los tres
equipos a la vez (caldera mixta + termo de ACS al 50 % + aire acondicionado). Su
cola **NO es la de la caldera**: un equipo de ACS o de frío no tiene aislamiento,
ni carga media, ni potencia — tiene un rendimiento nominal y ya, y sus
interruptores son otros (`_INTERRUPTORES_ACS`, `_INTERRUPTORES_FRIO`). El de frío
son 9 campos y lleva un cuarto elemento en la cola, la antigüedad del equipo. Los
otros dos tipos del diálogo —«calefacción y refrigeración» y «mixto de los
tres»— siguen sin escritor: no hay fichero donde medirlos. Vigilado por
`python -m pytest implementation/cee-engine/tests/test_equipos.py`.

⚠️ **El rendimiento medio estacional lo RECALCULA CE3X.** En estos dos equipos se
escribe el nominal y se dice en los avisos, igual que ya se hacía con la caldera:
en el fichero medido, el del aire acondicionado ponía 157,5 y su nominal era 250.

⚠️ **Las cadenas de los desplegables son las del FICHERO, no los rótulos.** No
son la misma: «Biomasa densificada (pelets)» se guarda como `BiomasaDens`. Por
eso `GENERADORES_CE3X` y `COMBUSTIBLES_CE3X` llevan etiqueta y valor por
separado, y marcan cuáles se han visto en un `.cex` real. Lo no comprobado se
OFRECE igual —sin «Caldera Condensación» no se puede declarar media España— pero
en su propio grupo del desplegable y sacando un aviso de la ficha.

⚠️ **Lo que se enseña son las FASES del motor, no un porcentaje.** Los rótulos
son los suyos y en su orden (`descargar` → `construir_modelo` → `analizar`), pero
van por TIEMPO y no sincronizados, y por eso **se paran en la última** en vez de
dar la vuelta: ahí es donde de verdad se está esperando a Catastro. Una barra que
llega al 90 % y se queda ahí miente; una que vuelve a empezar, dos veces. El
dibujo sí da vueltas, y eso está bien: es lo que dice que sigue vivo.

**El plano pasa a ser un PLANO** ([PlanoPlanta.jsx](implementation/frontend/src/features/cee-envolvente/components/PlanoPlanta.jsx),
con la geometría de dibujo —pura— en [geometriaPlano.js](implementation/frontend/src/features/cee-envolvente/logic/geometriaPlano.js)):
muros con su grosor real (0,34 m perimetral · 0,24 m en patios y particiones,
decidido por el SUBTIPO de Catastro, que es el hecho geométrico y no lo que el
certificador reclasifique), trama a 45°, huecos que ABREN el muro, cotas fuera,
retícula de un metro, leyenda, globo al pasar por encima, zoom y paneo, y un
conmutador **2D / 3D** con la axonometría despiezada del edificio.

**REGLA — el COLOR dice QUÉ ES la pared y el trazo en qué ESTADO está.** Antes el
color decía el estado (verde/ámbar/gris) y el tipo no se veía — que es justo lo
que hay que juzgar mirando el plano. Ahora fachada ámbar, medianera azul,
partición rosa, sin mirar gris; y lo que tiene la medida por confirmar lleva una
línea de puntos ámbar por el eje.

**REGLA — el muro va HUECO por dentro.** Son cuatro capas sobre la misma
polilínea: halo de selección, borde del color del tipo, **papel** y trama. Sin la
capa de papel el muro sale macizo —la trama se pinta del mismo color del borde y
por sus huecos se ve ese mismo color—, no hay orla de 0,05 m que lo lea como
doble línea, y la línea de puntos de «por confirmar» desaparece sobre una
fachada, que también es ámbar.

**REGLA — dónde cae un hueco a lo largo del muro es COSMÉTICO, pero SE ARRASTRA
(2026-09-14).** CE3X no coloca los huecos —quiere su superficie, su orientación y
a qué cerramiento pertenecen—, así que `hueco.pos` NO viaja al `.cex` y no puede
confundirse con un dato del certificado. Pero el plano se mira para PENSAR, y una
fachada con la puerta en el centro y la ventana a un lado se reconoce de un
vistazo; la misma con los huecos repartidos a partes iguales, no. Se arrastra en
planta **y en 3D**, se guarda con el trabajo, y el que no se haya tocado se
reparte como siempre — si no, colocar uno a mano movería a todos los demás.

El arrastre se mide **proyectando lo que avanza el ratón sobre el eje del muro**
(`ejeProyectado`): funciona igual en 2D y en 3D porque la proyección es lineal —
una fracción del muro es la misma fracción de su sombra en pantalla— y así no
hace falta invertir la axonometría. El tope es el medio ancho del propio hueco:
no puede salirse de su pared. Sobre un muro QUEBRADO se toma la cuerda, así que
queda aproximado; sigue siendo monótono, que es lo único que hace falta para
arrastrar. La copia de `duplicaHueco` **no hereda el sitio**: caería justo encima
del original y parecería que el botón no ha hecho nada.

**REGLA — bajo el ratón puede haber una PARED o un HUECO, y no se pregunta lo
mismo.** De la pared: qué es, cuánto mide y si le queda algo. Del hueco: cuál es
(su nombre es el que va al `.cex` y enlaza sus puentes térmicos), cuánto mide, de
qué pared es — y que se puede arrastrar, porque un gesto que no se anuncia no lo
prueba nadie. El asa es más alta que el muro (0,6 m) y va **por encima de la zona
de pulsación de la pared**: debajo, el arrastre se lo queda el plano.

**REGLA — la PUERTA va en MARRÓN.** Iba en el naranja de la fachada, o sea del
MISMO color que el muro sobre el que se dibuja: en planta se distinguía por el
barrido de la hoja, pero en 3D es un paño naranja sobre una pared naranja y no se
ve. Medido sobre el papel del plano: **5,3:1 en tema oscuro y 3,7:1 en claro**
(no es texto, el listón son 3:1). La ventana se queda en el azul, que es el del
vidrio, y los dos entran en la leyenda — que es donde vive el significado de los
colores.

⚠️ **La lejanía de un hueco en 3D es la DE SU TRAMO DE MURO, no la suya.** Un
hueco es ese muro abierto, así que tiene que pintarse justo después de él pase lo
que pase. Con su propia lejanía, en una pared que se aleja de la pantalla los
huecos de la punta lejana caían por debajo de su propio muro y **desaparecían**
—medido sobre una fachada sur en isométrica: dos de sus tres huecos tapados, y
con ellos su asa—.

En el 3D las plantas van **separadas**: pegadas una encima de otra, la baja queda
tapada por la primera justo donde están sus paredes. La **última** se rotula por
arriba y las demás por abajo, que es donde cada una tiene hueco libre. El forjado
solo se dibuja en la baja: la huella que trae Catastro es la del edificio a ras de
suelo, y repetirla bajo la primera declararía una planta que no es.

**REGLA — el 3D SE GIRA, y con los gestos de un programa de arquitectura
(2026-09-14).** La axonometría fija solo enseña dos de las cuatro esquinas: las
dos de atrás no se ven, y son paredes que hay que clasificar igual que las
demás. Los gestos no se inventan —quien mira esto los tiene ya en los dedos—:
**AutoCAD, Revit y Blender coinciden** en el botón CENTRAL para mover y en
**Mayús + central** para girar, y eso se respeta tal cual. En lo que no coinciden
es en el botón izquierdo, y aquí **gira**: en 3D lo que se viene a hacer es mirar
el edificio por el otro lado, no moverlo de sitio (en 2D sigue moviendo, como
siempre). Más los botones **⟲ ⟳** de 45°, que son las cuatro esquinas y la única
forma de girarlo con el dedo sin perder la pared que se estaba mirando.

Se gira **agarrando el edificio**: lo que está bajo el ratón sigue al ratón —
arrastrando a la derecha, la esquina de delante se va a la derecha (y por eso el
acimut BAJA); arrastrando hacia abajo, esa esquina cae y aparece la cubierta.

**REGLA — la proyección se PARAMETRIZA, no se sustituye.** `proyector({az, alt,
pivote})` en [geometriaPlano.js](implementation/frontend/src/features/cee-envolvente/logic/geometriaPlano.js)
es un plato giratorio, y la isométrica de siempre es EXACTAMENTE su caso **az 45°
· alt 35,264°**: `iso()` sale de ahí y la vista de partida no se ha movido ni
medio milímetro (comprobado punto a punto contra la fórmula anterior). El
**PIVOTE** es lo que hace que girar no sea un salto: sin él el edificio da
vueltas alrededor del origen del lienzo —que puede caer a treinta metros— y se
sale de la pantalla al primer arrastre.

**REGLA — el encuadre del 3D es una ESFERA, no la caja de lo proyectado.** Esa
caja cambia con cada grado de giro, así que el encuadre se recalcularía en cada
fotograma y **tiraría por tierra el zoom del usuario a mitad de arrastre**. Con
el radio del edificio sobra sitio mire por donde se mire, y como la proyección
gira sobre el pivote, el edificio se queda centrado solo. «Encuadrar» en 3D
devuelve el encuadre **y el giro**: tras dar tres vueltas, lo que se busca al
pulsarlo es la isométrica de siempre, no el mismo revoltijo pero centrado.

⚠️ **La profundidad del algoritmo del pintor NO es `x + y`.** Eso solo vale para
la isométrica de partida; al girar, las paredes de atrás se pintan encima de las
de delante. Es la profundidad de la CÁMARA, que es lo mismo que la pantalla usa
para bajar el punto: se saca proyectándolo con la altura a cero.

**REGLA — con el 3D girable hace falta BRÚJULA.** En planta el norte es arriba y
no hay nada que decir; en cuanto el edificio se puede girar, deja de saberse — y
la orientación no es un adorno: de ella cuelga a qué da cada fachada, que es lo
que se está clasificando. **No es un icono girado**: es el MISMO círculo
horizontal del suelo pasado por la MISMA proyección que el edificio, así que se
achata igual que él al bajar la cámara y la aguja apunta exactamente a donde
apunta el norte del dibujo — un dibujo aparte se desincronizaría el día que se
toque la proyección. Se pulsa para **poner el norte arriba** (az 0), que es lo
que hace la brújula de cualquier programa de arquitectura.

**REGLA — QUÉ SE VE se pregunta UNA vez y en UNA barra: qué plantas, y en planta
o en 3D.** Son la misma pregunta, así que van juntas encima del dibujo
(`BarraVista`). El conmutador 2D/3D estaba DENTRO de cada tarjeta y ahí sobraba
dos veces: se repetía en cada planta —como si se pudiera tener una en planta y
otra en axonometría, cuando el modo es de la pantalla— y en 3D quedaba dentro del
único dibujo que ya era el edificio entero.

Lo de las plantas son dos trabajos distintos sobre el mismo dibujo: COMPARARLAS
—¿esta pared sigue hacia arriba?— pide tenerlas una al lado de la otra, y PONER
LAS VENTANAS de una pide el plano lo más grande posible (se hace hueco a hueco, y
a media pantalla no se distinguen dos ventanas de 1,30 m separadas por un pilar).
Es **UN control** y no un modo más un selector: «Las dos» es una opción más de la
misma fila. Con **tres o más se arranca en una sola**, porque ahí la vista
dividida deja de serlo —la rejilla es de dos columnas, así que la tercera cae
debajo y a media escala—; con dos se conserva lo de siempre. El valor por defecto
se **DERIVA**, no se siembra con un efecto: así no hay un fotograma con la vista
que no es, y al traer otra geometría vuelve a valer sin que nadie se acuerde de
resetearlo. Lo que no se ve **sigue medido y se guarda igual**, y se dice.

**REGLA — elegir planta vale IGUAL EN 3D, y quién se dibuja lo decide quien
llama.** Con dos forjados uno encima de otro el de abajo se lee mal, así que hay
que poder quedarse con uno sin salir de la axonometría: `PlanoPlanta` recibe
`capas` y sin ellas dibuja el edificio entero, como hasta ahora. El BULTO del que
salen el pivote del giro y el encuadre es el de **lo que se dibuja**, no el del
edificio: con el del edificio entero, una planta sola saldría descentrada y en un
encuadre que le queda grande. Y con una sola capa el 3D **se rotula como su
planta**, no como «EDIFICIO · 1 PLANTA».

⚠️ **La rejilla se parte por las TARJETAS que hay, no por las plantas.** En 3D es
UN dibujo se enseñe una planta o las dos; contando plantas, la clase
`md:grid-cols-2` seguía puesta con una sola tarjeta y **el 3D se quedaba
encajonado en media pantalla con la otra media vacía**.

⚠️ **El `outline` del navegador sobre un SVG escalado se dibuja en unidades de
USUARIO.** Aquí la unidad es el METRO, así que la regla global de la app
(`outline: auto 5px`) salía como una mancha naranja de CINCO METROS encima del
plano en cuanto se pulsaba una pared. Se apaga y el foco del teclado se marca con
el mismo halo que la selección, que sí está en metros a propósito.

⚠️ **`setPointerCapture` al pulsar SE COME el `click`.** Con la captura puesta, el
navegador dispara el `click` sobre el elemento que captura —el SVG— y no sobre la
pared: pulsar una pared dejaba de seleccionarla. El puntero se captura solo
cuando el arrastre pasa de 4 px, y así se conserva el paneo aunque el ratón se
salga del plano.

⚠️ **La rueda se engancha A MANO** (`addEventListener('wheel', …, {passive:false})`):
React registra `onWheel` como PASIVO y con él `preventDefault()` no hace nada — al
hacer zoom sobre el plano se scrollea la página entera.

⚠️ **`normalizeData` reventaba la pantalla, y tardó en verse.** El trabajo se
escribe con una RPC que NO normaliza, pero el detalle del expediente reenvía `cee`
ENTERA al autoguardar y ahí sí pasa por `normalizeData`: los huecos quedaban con
`tipo: 'VENTANA'` y `estado: 'MEDIDO'` en MAYÚSCULAS. Con eso,
`POR_DEFECTO['VENTANA']` es `undefined` y **duplicar un hueco tumbaba la ventana
entera** («undefined is not iterable»), además de perderse los colores de medido /
por confirmar. Medido en 26RES060_186. `envolvente` está ahora en la BLACKLIST, y
`rescatarHueco` devuelve a minúsculas lo que ya se guardó así — lo que hay en la
BD tiene que poder abrirse. Es el mismo gotcha que `fotovoltaica` y `tipo_emisor`.
