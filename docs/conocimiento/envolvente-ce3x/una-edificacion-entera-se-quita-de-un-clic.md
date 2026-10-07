<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Una EDIFICACIÓN entera se quita de un clic (2026-09-16 · POR PLANTA 2026-09-21)

En el plano se pulsa un cuerpo del edificio —el garaje adosado, el porche, el
trastero del fondo— y se le dice **que no cuenta**. Se sombrea al pasar por
encima, y al pulsarlo se puede quitar o volver a meter.

POR QUÉ HACÍA FALTA: la envolvente de un certificado es la de la **VIVIENDA**.
Catastro dibuja el edificio en PARTES y dice de qué es cada una, pero el plano se
arma por **NIVEL** —la planta baja tiene vivienda, luego se dibuja entera—, así
que las paredes del aparcamiento entraban igual y había que apartarlas una a una
acertando con cuáles eran las suyas. Medido en 9412508VJ8691S: 71 m² de garaje y
**98 m² de cerramiento vertical** que no son de la vivienda.

| Qué | Dónde |
|---|---|
| Qué cuerpos hay, con qué construcción casa cada uno y **en qué plantas sobra** | [gis/cuerpos.py](implementation/cee-engine/src/gis/cuerpos.py) — `inventario`, `niveles_fuera` |
| Quitar uno y volver a medir | `excluir_cuerpos()` en [pipeline.py](implementation/cee-engine/src/pipeline.py) |
| La huella de cada planta y el forjado de encima | [gis/floors.py](implementation/cee-engine/src/gis/floors.py) — `Planta.no_habitable_partes`, `huella_construida`, `elementos_horizontales` |
| Proyectarlos al lienzo del plano | `_cuerpos()` en [viz/plano_svg.py](implementation/cee-engine/src/viz/plano_svg.py) |
| API | `POST /envolvente` con `cuerpos_excluidos`; `cuerpos[].niveles_fuera` en la respuesta |
| Lo mismo, dicho para la pantalla (puro) | [logic/cuerposEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/cuerposEnvolvente.js) |
| El gesto | `Cuerpos` en [PlanoPlanta.jsx](implementation/frontend/src/features/cee-envolvente/components/PlanoPlanta.jsx) + `CuerpoModal`/`AvisoCuerpos` en `EnvolventeView` |
| Dónde se guarda | `cee.envolvente.cuerpos_fuera`, con el resto del trabajo |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_garaje_por_planta.py implementation/cee-engine/tests/test_cuerpos.py` · `node implementation/backend/scripts/test_cuerpo_por_planta.mjs` |

**REGLA — se quita POR PLANTA, nunca el cuerpo entero (2026-09-21).** Un garaje
adosado con VIVIENDA ENCIMA es UN BuildingPart de DOS plantas: Catastro dibuja el
prisma completo y declara APARCAMIENTO solo en la baja. Quitándolo de las dos, la
planta primera pierde su superficie y sus fachadas reales — medido en
2370310VJ4027S (26RES060_195): **19 m² y dos fachadas a la calle**, y en su lugar
aparecían cuatro fachadas fantasma donde la vivienda continúa. En qué plantas
sobra lo dice `cuerpos.niveles_fuera`: las de su construcción NO habitable; si no
casa con ninguna —o casa con una que sí es vivienda, y se quita igual, contra
Catastro— sale de todas, que es lo que se está pidiendo al pulsar el botón.

**REGLA — «no cuenta» es VOLVER A MEDIR, no tachar paredes.** La pared que
separaba el garaje de la casa NO existe en el modelo: Catastro une los dos
cuerpos y esa línea queda dentro. Quitando la parte y midiendo otra vez, esa
pared aparece como lo que es. Tachando sus paredes, la casa se queda abierta por
ahí. La segunda salida (**«solo apartar sus paredes»**, instantánea y sin medir)
se ofrece igual en el popup, diciendo esto mismo — y **aparta solo las de las
plantas donde el cuerpo no cuenta**, o se lleva por delante las fachadas de la
vivienda de arriba.

**REGLA — lo que se quita SIGUE CONSTRUIDO, así que NO se toca `buildings` ni se
borra la parte del modelo.** De ahí salen las dos cosas que lo distinguen de un
solar, y las dos son lo que el certificador tenía que poner a mano:
- la pared de la casa contra él es una **PARTICIÓN VERTICAL con espacio no
  habitable** (`Vecindad.no_habitables` por nivel), no una fachada al aire: por
  ahí se pierde calor y no es adiabática;
- el forjado de encima es una **partición con espacio no habitable inferior**, no
  un voladizo (`Planta.huella_construida`).

**REGLA — el forjado entre dos plantas de VIVIENDA no se escribe en el `.cex`.**
A los dos lados hay la misma temperatura y CE3X no lo quiere. Lo marca el motor
(`relevante_ce3x`) comparando el uso de las dos plantas, y `generar_cex` lo
respeta: antes salía como «Partición Interior / Garaje-espacio enterrado» en
**toda vivienda de dos plantas**, tuviera garaje o no. Y el **sentido** de una
partición horizontal y su **tipo de espacio** los dice ahora el SUBTIPO del
propio elemento (`SENTIDO_PARTICION`), no un booleano deducido de los niveles:
van emparejados en CE3X —«Garaje/espacio enterrado» solo existe hacia abajo— y
escribirlos al revés es un cerramiento que CE3X lee mal.

⚠️ **`DIBUJABLES` en `plano_svg.py` decía `PARTICION_VERTICAL` y el motor emite
`PARTICION_INTERIOR_VERTICAL`** (`schema.TIPO_PARTICION_VERTICAL`). Con el nombre
corto, la pared contra el garaje se contaba en el resumen y **no se pintaba**: no
se podía ni seleccionar ni ponerle huecos. Lo mismo en el frontend, donde todas
las comparaciones son con el corto — se traduce en **`tipoDe`**, que es la puerta
única por la que pasa el tipo de cada muro de la pantalla.

**REGLA — casar un cuerpo con su construcción es una CONJETURA, y se dice.**
Catastro **no publica el polígono de cada unidad constructiva** (sus `spaces`
llevan literalmente `"geometria": "NO DISPONIBLE"`), así que lo único que las une
es la SUPERFICIE. Se empareja greedy y 1:1, solo dentro de los niveles del cuerpo
y con un parecido ≥ 92 %; lo que no casa sale como **«Catastro no dice qué hay
aquí»**, que no es lo mismo que «no es vivienda». Medido en esa parcela: el
aparcamiento casa al 99,9 % y la vivienda al 96,6 % (la huella incluye el grosor
de los muros y la superficie construida no siempre).

**REGLA — lo que Catastro no cuenta como vivienda se AVISA, no se quita solo.**
Sale una franja con el botón al lado («Quitar APARCAMIENTO · 71 m²»): hay garajes
que forman parte de la vivienda y porches cerrados que son un estar, y quien lo
sabe es quien ha estado delante del edificio. En el plano, ese cuerpo va marcado
a trazos en ámbar sin tener que pulsar nada.

**REGLA — el cuerpo que está FUERA se sigue viendo.** Se dibuja atenuado, con su
rótulo «NO CUENTA», y pulsándolo se devuelve. Un cuerpo que desaparece del plano
no se puede volver a meter, y esa es la mitad de la función.

**REGLA — «NO CUENTA» y el aviso en ámbar son DE ESA PLANTA** (`fueraAqui` /
`sospechosoAqui` en `cuerposDeLaPlanta`). El mismo cuerpo puede sobrar abajo y ser
la vivienda arriba: pintarlo igual en las dos es lo que llevó a apartar a mano una
fachada de verdad de la planta primera. Y los textos lo DICEN («Quitarlo de la
planta baja», «en la planta 1 sigue contando»): decir solo «se quita» hace pensar
que se va entero.

**REGLA — al volver a MEDIR se resiembra el trabajo ACTUAL, no el de cuando se
abrió la ventana.** El plano se siembra desde lo que se leyó al abrir; sin esto,
quitar un cuerpo (o cambiar las construcciones, que ya tenía el mismo fallo
latente) borraba los huecos puestos desde entonces. Lo que sí se pierde es lo que
ya no existe: los huecos de una pared que se va con su cuerpo se van con ella, y
eso es lo correcto.

**REGLA — el trabajo sigue a la PARED, no a su NOMBRE** (2026-09-21). El nombre
de un cerramiento lo numera el motor por el ORDEN en que recorre el contorno de
la planta, así que al medir con un cuerpo menos los números **se reciclan**.
Medido en 2370310VJ4027S al quitar el aparcamiento:

| nombre | antes | después |
|---|---|---|
| `FBS1` | 6,90 m | **1,03 m** (otra pared) |
| `FBS2` | 3,40 m | 6,90 m (la que era `FBS1`) |
| `FBS3` | 7,30 m | 3,40 m (la que era `FBS2`) |

Y como TODO el trabajo va por ese nombre —las ventanas, las medidas
confirmadas, la U de cada pared, lo reclasificado, los pilares, la entrada—, al
quitar un cuerpo se mudaba a paredes que no eran, **en silencio**: la ventana
aparecía en otra fachada y nadie lo relacionaba con haber pulsado el botón. Al
resembrar se casa cada pared vieja con la nueva que ocupa su sitio
([identidadParedes.js](implementation/frontend/src/features/cee-envolvente/logic/identidadParedes.js)).

- Se compara **el trazado de CATASTRO** (`svg_catastro`), nunca el que el
  certificador haya movido a mano: con el movido, una pared desplazada no
  casaría con la suya y su trabajo se daría por perdido.
- Una pared **RECORTADA conserva su nombre y su trabajo** (la fachada este pasa
  de 10,34 a 7,26 m al sacar el garaje: es la misma fachada). Lo que distingue
  eso de un nombre reciclado es una pregunta: **¿la pared que ahora lleva ese
  nombre YA ESTABA antes con otro?** Si sí, el nombre se ha reciclado y el
  trabajo no puede quedarse ahí.
- Con **dos candidatas** iguales no se traduce: antes de ponerle el trabajo a la
  pared que no es, mejor perderlo.
- Las paredes **DIBUJADAS** llevan su propio id y no entran en el reparto.

⚠️ NO se arregla cambiando cómo numera el motor: hay 13 expedientes con
envolvente guardada (uno con 32 paredes revisadas y 23 con huecos) y renumerar
les descolocaría el trabajo a todos de golpe.

Tras tocarlo: `node implementation/backend/scripts/test_identidad_paredes.mjs`.

⚠️ La capa de cuerpos se pinta **DEBAJO de los muros** y solo recoge lo que pasa
por DENTRO del cuerpo: en un SVG manda el último pintado, y las paredes tienen
que seguir siendo lo que se pulsa. En 3D no se pinta —allí el volumen ya son las
caras— y con el modo DIBUJAR activo tampoco, o se comería el arrastre.

### El botón de CARPETA LOCAL, también aquí

En la cabecera de la ventana, junto al tema: es de donde se arrastra el `.cex` a
CE3X y donde se sueltan las fotos, y salir al expediente a buscarla pierde el
sitio del plano. Funciona en los **dos negocios** —cada uno tiene su propia ruta
(`/api/expedientes/:id/local-path` o `/api/cee-directos/:id/local-path`)— y solo
se pinta para el STAFF: las dos rutas son `staffOnly` y al certificador no le
toca (él trabaja contra la carpeta que se le comparte).

El gesto del protocolo `brokergylocal:` estaba copiado en seis pantallas; ahora
hay una pieza, [utils/carpetaLocal.js](implementation/frontend/src/utils/carpetaLocal.js),
y las copias antiguas se quedan hasta que haya que tocarlas.
