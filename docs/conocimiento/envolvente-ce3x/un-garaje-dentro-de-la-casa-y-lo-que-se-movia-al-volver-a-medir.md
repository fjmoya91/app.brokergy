<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Un GARAJE dentro de la casa, y lo que se movía al volver a medir (2026-09-28)

EL CASO — **26RES080_85** (CL Sol 20, Campo de Criptana, RC 8919709VJ8681N). El
certificador estuvo más de una hora con la envolvente y acabó haciendo el `.cex` a
mano: «el garaje lo incluía dentro de la vivienda, también los almacenes del
fondo… cada vez que metía muros nuevos me seguía sumando la superficie de
suelo… las paredes iban a la mierda, las ventanas desaparecían… esa misma
planta se copia en planta primera».

**Lo que da Catastro** es suficiente, y está medido: tres BuildingParts —la casa
de DOS plantas (117,02 m²) y dos almacenes de UNA al fondo (47,04 y 27,66 m²)— y
en `lcons` VIVIENDA 119 (PB) · VIVIENDA 117 (P1) · ALMACEN 106 (PB). Lo que hizo
el certificador a mano es exactamente eso: la planta primera = la casa entera
(sus cuatro fachadas coinciden al centímetro con la parte de Catastro), y la baja
= la casa menos un GARAJE que hay dentro, con una partición de 5,20 m. Con los
dos arreglos de abajo la app lo reproduce: fachada a la calle **10,48 m / 29,34
m²** (la suya, idéntica), partición con el garaje **5,16 m** (la suya, 5,20) y
con el almacén 5,07, planta primera intacta, y además el forjado de la primera
sobre el garaje (17,69 m²) como suelo sobre espacio no habitable, que él no
llegó a modelar.

### Las cuatro causas, y su arreglo

| Síntoma | Causa | Arreglo |
|---|---|---|
| «incluía los almacenes» | La casación cuerpo↔construcción es 1:1 por superficie y el ALMACEN (106) son DOS partes: ninguna se parecía, no salían propuestos | **Por eliminación** (`cuerpos._casar_por_eliminacion`) + botón **«Quitar los N»** |
| «incluía el garaje» / «me seguía sumando suelo» | El garaje está DENTRO de la parte de dos plantas. Una pared dibujada no quita superficie y «Delimitar» es un prisma | **Zonas por planta**: `✂ Quitar una zona` (`pipeline.leer_zonas`) |
| «las paredes iban a la mierda» | El motor encuadra el lienzo en lo que dibuja: al quitar un cuerpo **cambia el origen de todas las coordenadas** (la misma fachada pasó de [17,83, 23,29] a [6,94, 15,84]) y lo guardado en el lienzo se quedaba en otro sitio | `lienzo_ref` en el trabajo + `trasladarTrabajo` / `trasladarMuros` |
| «las ventanas desaparecían» / «se pillan los muros de planta baja y de primera» | La identidad de paredes comparaba trazados en lienzos distintos, **sin mirar la planta** (la fachada de la baja y la de la primera tienen el mismo trazado: el trabajo saltaba de una a otra) y no reconocía una pared recortada Y renombrada | Misma planta + solape colineal; los huecos sin pared se **enseñan** |

**REGLA — por eliminación solo se afirma lo que sale de las cifras.** El cuerpo sin
casar tiene que estar en UN solo nivel; en ese nivel, lo habitable declarado ya lo
cubren los cuerpos casados con vivienda (misma tolerancia, 8 %); tiene que haber una
construcción no habitable sin casar; y lo que queda no puede pasar de ella. Varios
cuerpos pueden ser la MISMA construcción. Sale marcado `por_eliminacion` con sus
cifras (`vivienda_cubierta`, `vivienda_declarada`), la pantalla lo explica y **se
propone, no se aplica solo** (regla 48.j).

**REGLA — una ZONA se resta SOLO de su planta, y por el camino de los cuerpos.** Va
por `plantas_desde_partes(fuera_por_nivel=…)` marcada `dibujada`, así que sale lo
mismo que al quitar un cuerpo: la pared de la casa contra ella es PARTICIÓN con
espacio no habitable, su fachada deja de ser de la vivienda y el forjado de encima es
suelo sobre espacio no habitable. Se guarda en el **MUNDO** (EPSG:25830), como el
contorno del adosado, en `trabajo.zonas_fuera: [{nivel, planta, uso, poligono,
area_m2}]`; el backend la sanea (`zonasSaneadas`) y el motor devuelve lo que de verdad
resta (`zonas_fuera[].area_m2`). Una zona que no sirve (no toca, planta que no existe,
cubre la planta entera) **no tumba la medición**: se dice y se salta. El uso (Garaje ·
Almacén · Otro) solo pone nombre: en CE3X las tres se escriben igual.

**REGLA — lo que se resta de un polígono DIBUJADO pasa por una apertura** (`_abrir`,
2 cm con juntas a inglete). Un clic nunca cae exacto: el garaje arrancaba 3 mm fuera de
la fachada y dejaba una aguja de 2,9 m que salía como DOS paredes fantasma. Solo se
aplica con zonas: la huella de Catastro y los cuerpos enteros comparten coordenadas
exactas y tocarlos movería medidas verificadas. Y los vértices de una zona se pegan a
las ESQUINAS y después a las paredes (`pegarVertice`).

**REGLA — el trabajo dice EN QUÉ LIENZO se dibujó** (`lienzo_ref` = `lienzoAMundo(georef)`).
Al sembrarlo sobre otra geometría se trasladan las paredes dibujadas y movidas y el
polígono de la cubierta, y los muros de la siembra anterior se llevan al lienzo nuevo
antes de casarlos. Lo que ya va en el mundo (contorno, zonas) no se toca. ⚠️ Un trabajo
de antes no trae `lienzo_ref` y se da por dibujado en el lienzo que se abre (lo de
siempre): el de 26RES080_85 tiene sus dos paredes dibujadas en el lienzo SIN el almacén
quitado, y al reabrirlo siguen saliendo 7,3 m desplazadas. No se corrige solo.

**REGLA — la identidad de paredes es POR PLANTA, y reconoce la recortada y renombrada**
(`solape` ≥ 50 % de la MÁS LARGA, colineales, misma planta). De la más larga y no de la
más corta: el trocito de 1,03 m que queda de una fachada que se fue con el garaje
(26RES060_195) es otra pared. Dos paredes viejas que acaban en una **suman** sus huecos.

**REGLA — un hueco cuya pared ya no existe no desaparece en silencio.** Va a
`trabajo.huecos_sin_pared` (sobrevive a cerrar la ventana) y la franja «N huecos se han
quedado sin pared» deja ponerlos en otra fachada o descartarlos, que es decirlo.

**Una pared dibujada lo dice en su panel**: separa, pero no quita superficie — para eso
está `✂ Quitar una zona`. Y «Delimitar la vivienda» pasa a llamarse **«Delimitar
adosado»** y a decir que vale para TODAS las plantas, dentro del mismo mando
`ViviendaPlantaControl` ([PanelZonas.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelZonas.jsx)),
que va bajo la barra de cada plano.

| Qué | Dónde |
|---|---|
| Almacenes por eliminación | `_casar_por_eliminacion` en [gis/cuerpos.py](implementation/cee-engine/src/gis/cuerpos.py) |
| Zonas: validar y restar | `leer_zonas` + `excluir_cuerpos(zonas=)` en [pipeline.py](implementation/cee-engine/src/pipeline.py), `_abrir` en [gis/floors.py](implementation/cee-engine/src/gis/floors.py) |
| Traslado del lienzo | `deltaLienzo` · `trasladarTrabajo` · `trasladarMuros` en [trabajoGuardado.js](implementation/frontend/src/features/cee-envolvente/logic/trabajoGuardado.js) |
| Identidad por planta y solape | [identidadParedes.js](implementation/frontend/src/features/cee-envolvente/logic/identidadParedes.js) |
| Usos de una zona | [logic/zonasFuera.js](implementation/frontend/src/features/cee-envolvente/logic/zonasFuera.js) |

```bash
python -m pytest implementation/cee-engine/tests/test_zonas_por_planta.py
node implementation/backend/scripts/test_lienzo_movil.mjs
node implementation/backend/scripts/test_identidad_paredes.mjs
```
