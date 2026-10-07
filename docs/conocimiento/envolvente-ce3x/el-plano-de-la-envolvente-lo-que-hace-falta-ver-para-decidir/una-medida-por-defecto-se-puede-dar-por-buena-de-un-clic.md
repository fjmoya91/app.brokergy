<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

### Una medida por defecto se puede dar por BUENA de un clic

El titular contaba «9 con medida por confirmar» y la única forma de quitar una de
esa cuenta era **teclear encima el mismo número que ya ponía**. Cuando la medida
por defecto es la buena —que en una ventana de 1,30 es lo corriente—, decir que sí
tiene que costar un clic: `✓ OK` **junto a la medida**, que es lo que se está
mirando cuando se decide, y «Dar por buenas las medidas de esta pared» para todas
las suyas de una vez (`confirmaHueco` / `confirmaPared`). Queda escrito quién lo
dio por bueno (`por_que`), igual que cuando se teclea.

**REGLA — lo que impide generar se dice DONDE se hace.** Un hueco solo cabe en
un cerramiento al exterior, así que reclasificar una pared que ya tiene ventanas
deja el `.cex` sin poder escribirse — y eso se descubría al pulsar Generar, con
las ventanas ya puestas una a una. El panel lo avisa al momento, con la salida
(«Volver a exterior») en el propio aviso. Igual si se reclasifica la pared por
la que se ha dicho que se entra.

**REGLA — la envolvente se abre en VENTANA PROPIA (`/envolvente/:id`), no en un
modal.** Sobre el plano se pasa un rato largo —las ventanas se ponen una a una—
y a mitad hace falta mirar otra cosa del expediente: la instalación, el teléfono
del cliente, el CEE anterior. Con un modal hay que cerrar y perder el sitio. Es
una ruta INTERNA (exige sesión, como el expediente), el botón CE3X hace
`window.open` con `noopener` —sin él, la pestaña nueva comparte proceso y un
tirón allí frena el expediente— y el título de la pestaña lleva el número, que
con tres abiertas «BROKERGY» no distingue ninguna. El `EnvolventeModal` se
BORRÓ: dos superficies para lo mismo acaban divergiendo.

**REGLA — lo señalado se guarda en el EXPEDIENTE, no solo en el navegador.**
Vivía en `localStorage`: sobrevive a recargar, pero no a cambiar de ordenador,
ni a limpiar el navegador, ni a que lo siga otra persona. Va a
`expedientes.cee.envolvente` por la RPC `set_expediente_cee_field`
(`scripts/cee_envolvente_trabajo.sql`), que **REEMPLAZA esa clave y no toca el
resto de `cee`**: un MERGE dejaría puesto un hueco que se acaba de quitar, y
escribir la columna entera desde Node pisaría `cee_inicial` o el seguimiento.
Son ~1,8 KB de metadatos medidos — ni geometría ni ficheros (regla 21).
Autoguardado con freno de 1,2 s (cada ventana es un cambio de estado) y **con
acuse en pantalla**: un autoguardado mudo no se distingue de no guardar. Si se
cierra la pestaña con algo sin guardar, `beforeunload` avisa. El `localStorage`
se conserva como respaldo de lo que aún no llegó a guardarse.

**REGLA — al reclasificar, el NOMBRE cambia de inicial, y se puede editar.**
`FBE1` pasa a `PBE1` al convertirse en partición: es lo que se ve en CE3X y dice
de un vistazo qué es cada cerramiento. Se PROPONE (si el certificador ya le puso
nombre a mano, no se le pisa) y viaja como `envolvente.renombrar`. ⚠️ El motor
casa cada hueco con su pared por el **id del nombre escrito**, así que la vista
manda los huecos apuntando ya al nombre nuevo (`nombreDe(m)`); y dentro del
motor el renombrado toca solo el NOMBRE — `ident` sigue siendo la clave con la
que se comprueba todo lo demás, o `ident in como_particion` dejaría de casar.

**REGLA — el TÉCNICO sale del certificador asignado, no se teclea.** Los once
campos de «Datos del técnico certificador» de CE3X están en `prescriptores`
—titulación, colegio y número incluidos—, así que `tecnicoCe3x()` los compone y
van en el `.cex`. La titulación se redacta como la escriben ellos
(«GRADUADO EN INGENIERÍA DE LA EDIFICACIÓN. COLEGIADO COAATM Nº 108180»,
copiado de los certificados de Luis Alberto y Raquel): si aquí saliera de otra
forma, un mismo técnico tendría dos redacciones según quién le preparase el
`.cex`. En un AUTÓNOMO la razón social y el NIF son los suyos, como los tienen
los tres. Lo que no consta NO se manda —el motor deja entonces lo de la
plantilla en vez de escribir un hueco encima— y se avisa: sin titulación, CE3X
la pide y hay que ponerla en Prescriptores.

**REGLA — cada PARED puede llevar su propia U.** La tabla de la época vale para
el edificio, pero una pared puede estar aislada y las demás no —una fachada
rehecha, un patio cerrado después— y escribirlas todas iguales declara un
edificio que no existe. El panel de la pared enseña la suya («la de su época»),
se cambia ahí y viaja como `envolvente.u_por_cerramiento`. En el motor, `conU()`
envuelve el bloque térmico de ESE cerramiento y avisa con la de la tabla al
lado. Verificado: con `{FBE1: 0.45}`, el `.cex` sale con FBE1 a 0,45 y las otras
diez fachadas a 1,69.

**REGLA — TODOS los datos derivados del CEE son editables.** Catastro se
equivoca —una ampliación sin declarar, una planta que consta como almacén y es
vivienda— y el certificador tiene el edificio delante: los once campos de «Lo
que se va a escribir en el .cex» se corrigen a mano (`CAMPOS_FICHA`), lo puesto
sale marcado y su procedencia pasa a decir «puesto a mano por el certificador».
Los ajustes se guardan con el trabajo, así que no se pierden al salir.

⚠️ Cambiar la ALTURA DE PLANTA aquí no vuelve a medir: las superficies de
fachada las midió el motor con la que se le pasó al traer la envolvente. Para
que cuadren hay que traerla otra vez con esa altura.

**REGLA — las TRANSMITANCIAS se pueden retocar en el momento, y el retoque
CONSTA.** La tabla da el peor caso defendible de la época, pero el certificador
tiene el edificio delante y puede haber visto una cámara sin aislar, o tener el
proyecto. El campo es editable en «Lo que se va a escribir en el .cex», el valor
puesto a mano sale marcado, y cada cambio va a los avisos con la cifra de la
guía al lado (`_retocadas`): un valor que no sale de la guía tiene que constar.
La MEDIANERA no se edita — es adiabática por definición, y si al otro lado hay
un local lo que se cambia es el TIPO de la pared.

**Duplicar un hueco** (⧉) copia sus medidas con nombre nuevo: una fachada con
tres ventanas iguales es lo normal, y volver a teclear 1,40 × 1,10 en cada una
es donde se cuela el error. La copia sale ya confirmada — sus medidas no son un
valor por defecto.

**MOVER un hueco a otra pared** (⇄, 2026-09-21). Las ventanas se ponen mirando
el plano, y con las dos plantas a la vista y seis fachadas encadenadas es fácil
meterla en la de al lado. La única salida era quitarla y volver a teclear sus
medidas en la buena — y lo que se teclea dos veces se teclea mal una. Fuente
única: [huecosEnParedes.js](implementation/frontend/src/features/cee-envolvente/logic/huecosEnParedes.js).

- **El hueco llega ENTERO**: su identidad (`uid`), su nombre, sus medidas y si
  estaban confirmadas, su carpintería, si se cambia en la reforma y lo que dijo
  su foto. Lo único que NO viaja es `pos`, dónde caía a lo largo del muro: ese
  sitio es del muro viejo y en el nuevo lo pondría en un punto cualquiera. Se
  recoloca solo en el reparto, igual que hace `duplicaHueco`.
- **Solo se ofrecen FACHADAS** (`admiteHuecos`). Una medianera es adiabática y
  una partición da a un local: ninguna lleva huecos, y un hueco apuntando a un
  cerramiento que no es exterior **deja el `.cex` sin poder escribirse**.
  Tampoco las apartadas de la envolvente ni la pared en la que ya está.
- **Van las de TODAS las plantas**, agrupadas por planta y diciendo de cuál es
  cada una: con las dos a la vista en el plano, equivocarse de planta es uno de
  los errores que esto viene a arreglar.
- **Queda dicho de dónde viene** (`por_que`: «movida desde FBS1, con sus
  medidas») y el panel salta a la pared DESTINO: sin eso te quedas mirando la
  pared vieja sin la ventana, sin saber si ha ido a alguna parte.
- El nombre viaja con el hueco —es el que se lee en CE3X y el que nombran sus
  puentes térmicos— salvo que en el edificio ya lo tenga otro, y entonces se le
  da uno libre.
- ⚠️ Su MARCA sobre la foto de la pared vieja se queda ahí: no se pinta —el
  visor cruza las marcas con los huecos de ESA pared— y no se borra, así que
  devolverlo la recupera. Es la misma regla que la de un hueco borrado.

⚠️ El criterio de qué es cada pared (`tipoDe`, `esFuera`, `esMedianera`,
`esParticion`, `admiteHuecos`) vive ahora en
[tiposPared.js](implementation/frontend/src/features/cee-envolvente/logic/tiposPared.js),
que NO importa React y por eso se puede comprobar desde Node;
`usePlanoEnvolvente` lo reexporta, así que quien ya lo importaba de allí sigue
igual. Y los imports de esos módulos llevan **la extensión `.js`**: Vite no la
exige pero Node sí, y sin ella el test no arranca.

Tras tocarlo: `node implementation/backend/scripts/test_mudar_hueco.mjs`.
