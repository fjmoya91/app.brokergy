<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Lo que se REFORMA en la envolvente: «- CAMBIA» (2026-09-19)

El certificador marca en el plano **qué ventana se cambia, qué pared se aísla y
qué parte de la cubierta se rehace**, y al `.cex` eso llega como un SUFIJO en el
NOMBRE: «V1 - CAMBIA», «FBE1 CALLE - CAMBIA», «CU1 CUBIERTA - CAMBIA». Es lo que
ve en el árbol de CE3X y lo que le dice sobre qué elementos montar la medida de
mejora.

**REGLA — SOLO el nombre (decisión del usuario, 2026-09-19).** Ni la U, ni la
superficie, ni la medida de mejora: el `.cex` sigue describiendo el edificio de
HOY y la medida la monta el certificador en CE3X. Escribir aquí la U nueva sería
meter en el certificado inicial algo que no existe todavía.

| Qué | Dónde |
|---|---|
| El sufijo y el nombre efectivo de un hueco (puro, probable desde Node) | [logic/reforma.js](implementation/frontend/src/features/cee-envolvente/logic/reforma.js) — `SUFIJO_CAMBIA`, `nombreHueco` |
| Marcar pared / hueco, carpintería en bloque, cubierta | `marcaCambia` · `marcaHuecoCambia` · `ponCarpinteria` · `ponCubierta` en [usePlanoEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/usePlanoEnvolvente.js) |
| Lo que viaja al motor | `loSenalado().mejora` = `{ cerramientos: [ids], cubierta: { [planta]: { entera } \| { poligono } }, lienzo_a_mundo }` |
| El motor: sufijo y partición de la cubierta | `con_cambia` · `partir_cubierta` · `superficie_reformada` en [generar_cex.py](implementation/cee-engine/tools/generar_cex.py) |
| La cubierta en pantalla | `CubiertaControl` ([PanelCubierta.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelCubierta.jsx)), **dentro del plano de su planta** |
| Cambiar ventanas en bloque | `VentanasViviendaModal` («A qué ventanas»: toda la vivienda · solo las marcadas) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_mejora.py` · `node implementation/backend/scripts/test_envolvente_cambia.mjs` |

**REGLA — el sufijo es UNO y lo escriben los DOS lados igual.** La pared la
renombra el MOTOR (`rotulo()` le pega «- CAMBIA» DETRÁS de lo que es: «FBE1
FACHADA - CAMBIA», no «FBE1 - CAMBIA FACHADA», para que el árbol de CE3X se siga
leyendo por el tipo); el hueco llega YA con el sufijo en su `id` porque lo pone la
vista (`nombreHueco`). `SUFIJO_CAMBIA` está en `reforma.js` y en `generar_cex.py`
con el mismo valor: si divergen, un hueco y su pared saldrían con dos sufijos. El
hueco sigue casando con su pared renombrada porque el motor resuelve el
cerramiento por el ident (`por_id`), no por el nombre completo.

**REGLA — la CUBIERTA se parte en DOS filas, y la mide el MOTOR.** Entera →
una fila renombrada. Por polígono → «CU1 CUBIERTA» con lo que se conserva y «CU1
CUBIERTA - CAMBIA» con lo que se rehace. Los vértices viajan en coordenadas del
LIENZO tal cual se soltaron (como `paredes.movidas`) más la traslación al mundo
(`lienzo_a_mundo = { dx, y0 }`, que sale de `geo.georef` con `lienzoAMundo()`), y
el motor INTERSECA con el polígono real del tejado (shapely): lo que se sale del
tejado no cuenta, un polígono que lo cubre entero se escribe como entera, y uno
que no lo toca no parte nada — y todo eso SE DICE en los avisos. Si la ficha
declara otra superficie de cubierta que la medida, el reparto va en PROPORCIÓN.
El m² que enseña la pantalla (`areaPoligono`, shoelace) es para VERLO mientras
se dibuja; el del `.cex` es el del motor.

**REGLA — el encuentro de fachada con cubierta cuelga de la parte que se
CONSERVA.** Con dos filas del mismo `ident`, `apuntar()` las dos duplicaría el
puente térmico; solo la marcada `soporte` entra en `paredes_pt`.

**REGLA — el mando de la cubierta vive EN EL PLANO de su planta, no en la
columna de la derecha.** Se marca DIBUJÁNDOLA encima, así que el control tiene
que estar donde está el gesto: una tira bajo la barra de ese plano con las tres
respuestas a la vista (se conserva · entera · ✎ solo una parte). En una columna
aparte, debajo del panel de la pared —que ya es largo—, había que bajar hasta el
fondo para descubrir que existía; y además ese panel es «la pared
seleccionada», y una cubierta no es una pared. En 3D no se pinta: ahí no se
dibuja.

**REGLA — dibujar la cubierta es un MODO, y el gesto es PULSAR, no arrastrar.**
Cada clic es un vértice, se cierra pulsando el primero, con doble clic o con el
botón «✓ Cerrar» de la tira, y Esc cancela. Arrastrar SIGUE moviendo el plano:
hace falta para llegar a la otra esquina del tejado. Mientras se dibuja, la
tira pasa a ser la instrucción y sus dos mandos, con el nº de vértices y los m²
que lleva encerrados. Lo dibujado se guarda con el trabajo (`cubierta_reforma`,
por planta).

**REGLA — lo que se AGARRA se mide en PANTALLA, no en metros** (2026-09-19).
Lo dijo Raquel, certificadora, con tres expedientes ya hechos con la app: *«lo
único que me entorpece a veces es dibujar muros nuevos pequeños, como que el
puntero que sale en los extremos son gordos»*. El plano está en METROS (regla 1
de la cabecera de `PlanoPlanta`) y los tiradores, las asas de los huecos y el
imán estaban fijos en metros: un tirador de 0,30 m de radio son 0,60 m de
diámetro, así que sobre un tabique de 0,80 m los dos extremos se tocan y tapan
la pared entera — y **ampliar no ayudaba**, porque el tirador crecía con el
dibujo. Ahora salen del ENCUADRE (`tamanosDeDibujo` en
[geometriaPlano.js](implementation/frontend/src/features/cee-envolvente/logic/geometriaPlano.js)),
así que son constantes en pantalla y ampliar da precisión de verdad. Medido: en
el encuadre de partida salen los valores de siempre (tirador 0,30 m, asa 0,59 m,
imán en su tope de 1,6 m) y ampliando ×4 el tirador baja a 0,074 m y el imán a
0,38 m, que es lo que permite dibujar un tabique corto. **El grosor del MURO no
entra ahí**: es una medida del edificio y sigue en metros.

**REGLA — el IMÁN no puede comerse el muro que se está dibujando.** Con 1,6 m
fijos, los dos extremos de un tabique corto se pegaban al mismo sitio y el trazo
se descartaba. `pegar(x, y, salvo, desde)` no pega si el punto pegado dejaría la
pared por debajo del mínimo. Y **tres tiradores tienen que CABER**: son tres
círculos, o sea seis radios, así que el radio se recorta a `L / 6.2` en una
pared corta.

**REGLA — un trazo demasiado corto SE DICE y no saca del modo.** Antes
desaparecía sin explicación y había que volver a pulsar «Pared nueva» a ciegas,
que es parte de lo que hace que dibujar «cueste». Ahora el botón dice «✎ Muy
corta · vuelve a intentarlo» y el modo sigue activo; el rótulo del trazo se pone
en ámbar por debajo del mínimo. Ese mínimo es **uno solo**
(`LARGO_MINIMO_PARED`), compartido por el plano, el hook y el motor. Y el rótulo
de la medida va APARTADO por la perpendicular del trazo: encima tapaba justo lo
que se está dibujando.

**REGLA — el ENCUADRE se reinicia por sus NÚMEROS, nunca por la identidad del
objeto** (`claveEncuadre` en `geometriaPlano.js`). El reinicio del zoom colgaba
de `useEffect([base])`, y `base` es un `useMemo` cuyas dependencias incluyen
`muros` y `planta`: dibujar una pared, mover un hueco o marcar algo devolvía el
MISMO rectángulo en otro objeto, el efecto saltaba igual y el plano volvía de
golpe a su encuadre de partida. Visto por el certificador: *«cuando quito zoom
para hacer una pared nueva y arrastro, de repente hace zoom y se me da mal»*.
Con la huella —redondeada al centímetro— solo se reencuadra al pasar de planta
a 3D, al mirar el entorno y al traer otra geometría, que son las tres veces que
hay que hacerlo.

**REGLA — un arrastre lleva GUARDADO el encuadre con el que empezó, así que la
rueda tiene que RE-ANCLARLO.** Ese encuadre es lo que convierte píxeles en
metros; al hacer zoom a media faena se quedaba viejo y el trazo se iba a otro
sitio. `escalar` devuelve el encuadre nuevo y el manejador de la rueda lo
escribe en el gesto en curso.

**REGLA — con la BARRA ESPACIADORA se mueve el plano sin salir del modo de
dibujo.** En modo dibujo el botón izquierdo traza, así que la única forma de
llegar a otra parte del plano era alejarse con la rueda y volver. El espacio
solo se escucha mientras se dibuja —fuera de ahí arrastrar ya mueve el plano— y
no se roba dentro de un campo de texto.

**REGLA — las VENTANAS se cambian en bloque desde el mismo popup de «cómo son
las ventanas».** Toda la vivienda (el defecto que heredan) o SOLO LAS MARCADAS
de una lista por pared con casilla por pared y «todas»; y un cuarto bloque
«¿se cambian en la reforma?» (no tocar · sí → CAMBIA · no) porque la respuesta
casi siempre es «todas menos dos». En «toda la vivienda» se puede pedir quitar
las excepciones hueco a hueco; si no, se quedan como estaban. `ponCarpinteria`
recibe solo lo que se toca: una clave ausente no cambia nada, `null` vuelve a
heredar, y «no cambia» es la AUSENCIA de la marca (no un `false` guardado).

**Cada hueco lleva su lápiz ✎** (marco · vidrio · persiana) y su chapa «cambia».
Una PUERTA no elige vidrio ni marco (el motor la escribe con su 90 % de madera)
y **nunca hereda la persiana** de la vivienda: `loSenalado` manda `persiana:
false` en las puertas salvo que alguien lo diga. `carpinteriaDe(h, defecto)` en
`ventanasVivienda.js` es la cascada única (lo suyo → la vivienda → el defecto).

**REGLA — la persiana por defecto es «CON», pero SOLO en expedientes NUEVOS**
(decisión del usuario, 2026-09-19: «solo de ahora en adelante»).
`VENTANAS_POR_DEFECTO.persiana` sigue en `false`; la marca es
`ajustes.persiana_defecto = true`, que la vista siembra al abrir un expediente
SIN trabajo previo y viaja con los ajustes. Un expediente ya modelado que nunca
contestó el popup sigue saliendo sin persiana: su `.cex` no cambia por
regenerarlo. Lo CONTESTADO en el popup manda sobre la marca.

**«Dar por revisada» es ahora un botón grande al final del panel de la pared**,
con la siguiente pared por mirar pegada («… y pasar a FBN1 →»,
`siguientePorMirar`): revisar catorce paredes son catorce clics. La casilla
pequeña de la cabecera se queda como ESTADO. En el plano, una pared que se
reforma lleva una orla ámbar a trazos y «· CAMBIA» en su rótulo; un hueco, un
recuadro ámbar; la cubierta, su trama ámbar con el m² aproximado. La cabecera
cuenta «N elementos con CAMBIA».
