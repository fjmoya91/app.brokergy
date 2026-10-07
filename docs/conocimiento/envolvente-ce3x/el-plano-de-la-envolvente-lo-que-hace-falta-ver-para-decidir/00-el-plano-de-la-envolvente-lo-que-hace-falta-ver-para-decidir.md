<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; cada subsección está en su propio fichero de esta carpeta.

## El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)

La vista pedía un juicio que no daba cómo hacer. Tres cosas, y las tres salieron
de usarla:

**REGLA — los colores del plano van por TOKEN de tema, nunca cableados.** Las
paredes «sin tocar» eran `rgba(255,255,255,0.28)`: en tema claro quedan a
**1,03:1** de contraste, o sea invisibles, y el plano parecía tener tres paredes
en vez de catorce. No lo salvaba ninguna regla de `.theme-light` porque son
atributos `stroke` de un SVG, no clases de Tailwind. Ahora `var(--success)`,
`var(--warning)`, `var(--text-secondary)`. ⚠️ Lo que SÍ está remapeado en
`index.css` es `text-white/XX`, `bg-white/[0.0X]` y compañía: en el JSX se usan
esas, como el resto de la app, y no se inventan tokens nuevos.

**REGLA — se ven los COLINDANTES, porque son la respuesta a la pregunta.** Una
medianera lo es por lo que hay AL OTRO LADO; sin el edificio de al lado dibujado,
el certificador solo puede fiarse de cómo lo clasificó Catastro. El motor ya
tenía los vecinos (`modelo.neighbours`) y ahora los proyecta al mismo lienzo
(`_contexto` en `viz/plano_svg.py`) — la geometría se resuelve donde están
shapely y pyproj, y el navegador solo pinta puntos. Se dibujan las masas
construidas Y las **lindes de las parcelas** de alrededor
(`modelo.neighbour_parcels`): ya se descargaban —de ellas salen las referencias
de los vecinos— y se tiraban, y sin ellas un solar o un patio del vecino se ven
igual que la calle. En 26RES060_186: 3 edificios y **5 parcelas**.

**REGLA — DOS encuadres, no uno.** Trabajar sobre las paredes pide la casa
grande; juzgar el entorno pide ver la manzana, y no caben juntos: medido en
26RES060_186, con margen suficiente para que entrara el contexto la casa bajaba
al **50 %** del ancho y **aun así solo entraba la mitad de los vecinos**. El
motor devuelve `entorno` (un rectángulo sobre las MISMAS coordenadas), así que
el botón «Ver el entorno» solo cambia el `viewBox`: ni un metro se recalcula.
Al alejar, los rótulos se ocultan salvo el de la pared seleccionada y el de la
entrada — amontonados sobre la casa no dicen nada.

**REGLA — el tipo de pared se puede CORREGIR, y queda escrito que se corrigió.**
Lo que Catastro dice de una pared es una deducción geométrica y se equivoca: un
cobertizo sin dar de alta convierte una medianera en fachada. El panel pregunta
**«da contra»** —al exterior · al vecino · a un local—, que es lo que se está
mirando en el plano, y no «fachada/medianera/partición vertical», que es como se
llama en la norma. Viaja como `envolvente.reclasificar` y el motor **avisa de
cada cambio** con lo que decía Catastro al lado: ese dato lo ha cambiado una
persona y tiene que constar. `PARTICION_VERTICAL` se escribe por la rama de la
medianera, que ya sabía emitir una partición con su U: un solo camino para las
tres opciones.

**REGLA — una pared se puede APARTAR, y eso no es un cuarto «da contra».**
Catastro dibuja el perímetro de lo CONSTRUIDO, y ahí dentro hay cosas que no son
la vivienda: el garaje, un trastero, un porche cerrado. Sus muros salen medidos y
clasificados como cualquier otro —los de fuera, además, como FACHADA, porque
geométricamente dan a la calle— pero no son la envolvente del espacio habitable:
escribirlos infla la superficie de pérdidas y con ella la demanda del
certificado. Medido en 26RES060_186: `FBN1` da a la calle y es del garaje.
«Da contra» dice QUÉ HAY al otro lado; apartar dice si la pared CUENTA, y son dos
preguntas distintas.

Lo apartado **no se vuelca al `.cex`**: viaja en `envolvente.excluir_ids`, que el
motor ya sabía saltarse (`generar_cex.py`), y **sus huecos tampoco se mandan** —
un hueco que apunta a un cerramiento que no se escribe aborta la generación
entera («no es ninguno de los cerramientos escritos»). Se guardan por si vuelve.

En el plano se dibuja **a trazos y sin trama**: sigue ahí —hay que poder
encontrarla y devolverla, y por eso conserva su rótulo y se puede pulsar— pero un
muro macizo diría que forma parte de la envolvente. No se acota, no cuenta en
«paredes por mirar» y no se puede señalar como entrada: por una pared que no
cuenta no se entra a la vivienda. Y el titular lo dice («1 apartada de la
envolvente»), porque cuatro trazos finos no pueden ser la única señal de algo que
alguien sacó del certificado hace un mes.

⚠️ Una pared apartada **se sigue pudiendo seleccionar**. `elegir()` salía por
`if (m.fuera) return`, así que apartarla la dejaba fuera de alcance y no había
forma de recuperarla.
