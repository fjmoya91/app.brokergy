<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

### La GEOMETRÍA se puede corregir, y eso se mide y se declara (2026-09-14)

Catastro dibuja el perímetro de lo construido **y se equivoca**: con la
cartografía debajo se ve que un tabique está medio metro a un lado, o que
directamente no está. Medido en 26RES060_186: `PBE1` está dibujada donde no es.
Hasta ahora eso no tenía arreglo — la app clasificaba lo que el motor medía, y
punto.

| Qué | Dónde |
|---|---|
| Medir lo movido y lo dibujado, y avisar | `aplicar_paredes` en [generar_cex.py](implementation/cee-engine/tools/generar_cex.py) |
| El imán y la distancia punto-polilínea | `pegarAPared` · `puntoMasCercano` en [geometriaPlano.js](implementation/frontend/src/features/cee-envolvente/logic/geometriaPlano.js) |
| El estado y las acciones | `muevePared` · `dibujaPared` · `borraPared` en [usePlanoEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/usePlanoEnvolvente.js) |
| Los gestos | `Tiradores` · `Trazo` en [PlanoPlanta.jsx](implementation/frontend/src/features/cee-envolvente/components/PlanoPlanta.jsx) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_paredes.py` |

**REGLA — la mide el MOTOR, no el navegador.** Del plano solo viajan los DOS
PUNTOS donde se ha soltado cada extremo (`envolvente.paredes`); el largo y la
superficie los calcula `aplicar_paredes`, que es donde se miden todas las demás.
Las coordenadas son las del LIENZO, y eso no es una aproximación: el lienzo es el
mundo trasladado y con la Y del revés (`plano_svg.plantas`), y una traslación con
un espejo **conserva las distancias** — un metro del lienzo es un metro del
edificio, así que no hay que deshacer nada para medir. La superficie sale con la
**misma altura de planta** con la que el motor midió las paredes vecinas, no con
una decisión nueva.

**REGLA — una pared que ha tocado una persona lo DICE, en los dos sitios.** De
ahí sale una superficie que va a un certificado: su procedencia es `USER_INPUT` /
`MANUAL` —la misma que `provenance.manual()`— y no la de Catastro, el `.cex` sale
con su aviso (**con las dos cifras**, la nueva y la de Catastro, que sin ellas no
hay forma de saber cuánto se ha corregido) y el panel la marca en ámbar con un
botón para devolverla. Una que solo se ha deslizado en paralelo mide lo mismo, y
ahí el aviso cambia de frase: repetir la cifra dos veces se lee como un fallo.

**REGLA — mover una pared es EXPLÍCITO: hay que seleccionarla primero.** Los
tiradores —uno en cada punta y uno en el medio— solo salen en la pared
seleccionada. Si cualquiera se pudiera arrastrar sin más, **mover el plano con el
puntero encima de una la movería sin querer**, y eso cambia una superficie que
acaba firmada. Comprobado: arrastrar una pared no seleccionada mueve el plano y
no toca la pared.

**REGLA — los extremos se pegan a la pared más cercana (imán de 1,6 m).** Un
extremo suelto en medio de la nada deja un plano que no cierra, y una pared que
no llega a ninguna parte no es una pared: es una raya. El radio es generoso a
propósito —un ancho de puerta— porque lo que se dibuja va DE PARED A PARED; si
hay dos cerca gana la más próxima, así que de más no se equivoca, solo alcanza
más lejos. Con 1,1 m, un tabique soltado a 1,12 m de la fachada se quedaba sin
llegar.

**REGLA — una pared dibujada nace PARTICIÓN.** Es lo que se dibuja dentro de un
edificio y además es el único tipo que **no necesita orientación** — la de una
fachada es la de su normal exterior y aquí no hay polígono del que sacarla (es lo
mismo que hace `classifier` con las particiones que mide él). Si es otra cosa, se
reclasifica con el mismo control que las demás. Se llama `PBX1`, `P1X1`…: la
misma forma que las del motor con una **X** donde iría la orientación, que además
no puede chocar con ninguna de Catastro (llevan siempre una de las ocho).

**REGLA — al pasar una pared a FACHADA se le PREGUNTA hacia dónde da.** Es la
otra mitad de la regla de arriba, y faltaba: una partición vertical y una pared
dibujada nacen **sin rumbo**, así que al reclasificarlas a fachada quedaban con
la orientación vacía — y una fachada sin orientación **no se puede escribir**
(CE3X la exige y de ella cuelga la ganancia solar de sus huecos). El motor moría
en un `ORIENTACION[None]`, o sea un `KeyError(None)`, cuyo `str()` es la cadena
`"None"`: eso era **todo** lo que llegaba a la pantalla — un escueto «None» que
no decía ni qué pared era. Medido en 26RES093_8, cuya `PBX1` dibujada se pasó a
fachada.

**REGLA — se ofrecen DOS rumbos, no ocho.** Una pared mira perpendicular a sí
misma, así que las otras seis las descarta su propio trazo y enseñarlas sería
invitar a pulsar una que la geometría dice que no. Los calcula
`rumbosDeLaPared` ([geometriaPlano.js](implementation/frontend/src/features/cee-envolvente/logic/geometriaPlano.js))
del trazo del lienzo, que es el mundo trasladado con la Y del revés: una
traslación no cambia las direcciones, solo hay que deshacer el espejo. ⚠️ `RUMBOS`
y su reparto por sectores son **los mismos** que `src/gis/orientation.py` en el
motor; un código que allí no se reconozca deja la fachada sin orientación.
**Cuál de los dos lados es el bueno NO se deduce** —una pared dibujada parte el
edificio y los dos lados quedan dentro de la huella—: lo dice quien tiene el
plano y la brújula delante, viaja como `orientacion_manual`, se guarda con el
trabajo y **sale avisado** en el `.cex`, como cualquier dato que pone una persona.

⚠️ El rumbo de una pared **dibujada** viaja CON ella (`paredes.nuevas[].orientacion`)
y no en el mapa `orientaciones`: en el motor su elemento nace con el nombre
EFECTIVO (`FBX1`), así que una entrada por el id de Catastro (`PBX1`) no casaría
con nada — es el mismo reparto que ya hacen su `tipo` y su `planta`.

**REGLA — lo que impide generar se CUENTA en la barra de apartados.** El panel lo
avisa al reclasificar, pero si se hizo ayer no lo ve nadie hasta pulsar Generar:
`resumen.sinRumbo` pone «! una fachada sin rumbo» en *Envolvente térmica*, por
delante de lo que solo está por confirmar. Y el motor, cuando aun así llega sin
rumbo, contesta **422 con el nombre de la pared y cómo se arregla**, nunca un 500.

```bash
python -m pytest implementation/cee-engine/tests/test_paredes.py
```

**REGLA — el nombre del cerramiento admite ESPACIOS, y el que escribe una
persona se escribe TAL CUAL.** La casilla filtraba todo lo que no fuera
`A-Z0-9_-` y cortaba a 12 caracteres, así que no dejaba teclear lo que el propio
motor escribe en las paredes de al lado (`FBS1 ESPACIO_LIBRE_PARCELA`,
`SUB1 SUELO EN TERRENO`): `FBX1 GARAJE ABIERTO` se quedaba en
`FBX1GARAJEABIERTO`. Ahora entran letras (con tildes y Ñ), cifras, espacio, `.`,
`_` y `-`, hasta 40 — el más largo que compone la app son 26—, la casilla CRECE
con lo escrito (fija en 78 px cabían siete caracteres) y el rótulo del plano
ajusta su papel al texto en vez de a un ancho fijo de cuatro caracteres, que era
lo que lo hacía montarse sobre el vecino.

Y al nombre tecleado el motor **no le pega detrás lo que es la pared**: «FBX1
GARAJE ABIERTO CALLE» no se lee mejor por ser más largo. Lo decide
`nombres_propios`, que manda el frontend (`esNombrePropio`), **no una
heurística**: el cambio de inicial al reclasificar (`FBE1` → `PBE1`) lo propone
la app y ahí el sufijo sigue haciendo falta, porque cuatro letras en el árbol de
CE3X no dicen nada. Una pared **DIBUJADA** tampoco lo lleva nunca: su subtipo es
literalmente «DIBUJADA», que dice cómo entró en el fichero y no qué pared es.

**REGLA — el popup de «antes de generar» no pregunta lo que YA está contestado en
otra pantalla.** `faltaPorPreguntar` miraba solo su propia clave
(`ajustes.acumulacion_litros`) y volvía a preguntar por un depósito que estaba
puesto —y marcado— en la pestaña de **Instalaciones**, que además es la que MANDA
(`equipoConAjustes` pisa lo derivado). Un popup que pregunta lo que acabas de
contestar se responde sin leer, y entonces deja de servir para las otras
preguntas. Ahora cuenta como contestado tanto el SÍ con sus litros como el NO. Lo
mismo con la **demanda de ACS**: si el propio certificado declara los litros/día
(el toggle **L/D** de la rejilla del CEE, regla 12.d) son ésos y no se pregunta —
y se escriben, que si no sería silenciar la pregunta y seguir poniendo los 140 de
por defecto.

**REGLA — dibujar es un MODO, no un gesto suelto.** Arrastrar sobre el plano ya
significa moverlo, y no puede significar dos cosas según dónde se empiece. Solo
en planta: una pared se coloca sobre la cartografía, que es lo que dice dónde
está de verdad, y eso es un plano. El trazo enseña **la medida mientras se
arrastra** —dibujar a ojo sin verla es lo mismo que teclear a ojo— y el punto de
llegada se pinta lleno cuando ha pegado.

⚠️ **Las paredes DIBUJADAS entran en el mapa ANTES de aplicarles el trabajo
guardado** ([trabajoGuardado.js](implementation/frontend/src/features/cee-envolvente/logic/trabajoGuardado.js),
`aplicarTrabajo`). Se añadían al final de la siembra, y como cada paso comprueba
`nuevo[k]`, a una pared dibujada no le llegaba ni su tipo, ni su nombre, ni su U, ni su
rumbo, ni sus pilares, ni su «revisada» — y el autoguardado siguiente lo borraba de la
BD. Medido en 26RES093_9 (25/09/2026): PBX1 pasada a fachada volvía como partición con
sus tres ventanas, y el `.cex` dejaba de poder escribirse. Tras tocarlo:
`node implementation/backend/scripts/test_trabajo_guardado.mjs`.

⚠️ **La geometría corregida va en SU PROPIO estado, no dentro de `muros`.** De
`plantas` cuelga el encuadre del plano, así que si dependiera del estado de los
huecos, **poner una ventana devolvería el plano a su zoom de partida a media
faena**. Comprobado que no pasa.

⚠️ **Una pared DIBUJADA no se mueve por `movidas`**: los puntos que se sueltan
SON su geometría y se escriben donde vive (`dibujadas`). Con las dos capas,
moverla no hacía nada — `plantas` lee su trazado de `dibujadas` y nunca miraba la
corrección.

⚠️ **Un tirador NO corta la propagación del `pointerdown`.** El arrastre lo lleva
el SVG y el tirador solo deja dicho qué se ha cogido; con `stopPropagation` el
evento no llegaba al padre y la pared no se movía — se veía el tirador, se
arrastraba, y no pasaba nada.

⚠️ **Al recargar hay que rehacer la MARCA, no solo la medida.** Si no, la pared
vuelve movida pero sin decirlo, que es justo lo que no puede pasar con una
superficie que va al certificado.
