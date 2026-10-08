<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

## La ventana sin SOLAPES: barra, rótulos, tiras y panel (2026-10-08)

**Caso: 26RES060_188** (dos plantas, garaje, porche y almacén fuera como zonas del croquis). Con las dos
plantas lado a lado, cada tarjeta de plano medía **468 px** aunque la pantalla fuera de 1920: la barra
de cada plano (9 botones, sin `flex-wrap`) se salía de su tarjeta —«Satélite» 62 px y «Google» 136 px a
1920; también «Catastro» a 1280— y pisaba la barra de la tarjeta de al lado y, con una pared elegida, el
botón «Al exterior» del panel. Los rótulos del plano se pisaban (5 pares medidos: «GARAJE · NO CUENTA»
tapado por «PVBSO1», «5,60 m²» sobre «FBN1», dos cotas «3,50/3,51 m» una encima de otra…), los botones
de las tiras partían su texto en dos líneas, y el aviso de cuerpos ocupaba 125 px para decir lo que ya
estaba hecho. Medido con un capturador sin pantalla que entra con la cuenta robot y **aborta toda
escritura** (`backend/scratch/envolvente_ui/captura.js --auditar`: botones que se pisan, botones fuera
de su tarjeta, `<text>` del SVG que se cortan).

**REGLA — la barra de cada plano se ACORTA por escalones midiendo lo que ocupa, nunca se sale.**
`Controles` en [PlanoPlanta.jsx](implementation/frontend/src/features/cee-envolvente/components/PlanoPlanta.jsx)
mide su tarjeta (ResizeObserver; Tailwind 3 no tiene container queries) y baja de escalón ANTES de
pintar (`useLayoutEffect`): encuadre a iconos (⤢ ⊕) → Pizarra y Pared nueva a icono → Google a «↗» →
fondos a ▦ ◩; si ni el último cabe, salta de fila alineada a la derecha. El zoom y el encuadre van en un
grupo y los dos FONDOS (Catastro / Satélite, excluyentes) en otro. Un botón de solo icono lleva `title`
y `aria-label`. **Un MODO encendido no se acorta** («✎ Suelta de pared a pared», «Pizarra · cerrar»):
bajan los demás, porque si la barra saltara de fila el plano se movería 36 px justo al ir a dibujar.
«Pared nueva» pasa a ser la herramienta línea de un CAD (●—●): el ✎ junto al ✏️ de la pizarra eran dos
lápices iguales.

**REGLA — el alto del lienzo sale de la PROPORCIÓN del encuadre del motor** (`aspect-ratio`, mínimo
360 px, máximo `min(68vh, 900px)`; el 3D, cuadrado). Con el alto fijo de antes, una tarjeta estrecha
dejaba 150-250 px vacíos bajo un edificio apaisado. No sigue al zoom ni a «Ver el entorno»: la tarjeta
no cambia de alto con cada gesto.

**REGLA — los rótulos del plano se colocan en UNA pasada, con prioridades.** [logic/rotulosPlano.js](implementation/frontend/src/features/cee-envolvente/logic/rotulosPlano.js)
(puro, en metros: no depende del ancho de pantalla ni de «Las dos»): primero lo forzado (pared elegida,
entrada y su cota), luego las etiquetas de ZONA, de cuerpo «NO CUENTA» y del croquis (se ven siempre),
luego las cotas y al final los nombres, de la pared más larga a la más corta; la etiqueta del ratón va
la última y no mueve a nadie. Cada rótulo se queda con el sitio candidato más barato que no choque. La
etiqueta de una zona va al **punto interior más alejado del borde**, no al centro de su caja (en una L
el centro cae encima de un muro), y si no cabe sale compacta («PORCHE / 5,60 m²»). **Un nombre fuera de
su muro solo vale si su muro sigue siendo el más cercano**: si no, se esconde, antes que parecer el
nombre de otra pared. De dos cotas casi iguales y pegadas queda una. La pasada se memoriza (1,5-3 ms en
planos reales). Anchos medidos con Inter: 0,665 em por mayúscula a peso 800, 0,557 em por cifra a 600.
⚠️ El auditor mide la caja SIN girar de un texto girado: una cota girada junto a otra puede salir
«pisada» sin tocarse (la prueba usa la caja girada exacta).

**REGLA — las TIRAS (Vivienda, Cubierta, Pizarra) miden su ancho y nunca parten un texto.** Piezas
comunes en [TiraPlano.jsx](implementation/frontend/src/features/cee-envolvente/components/TiraPlano.jsx)
(controles de 28 px, como la barra) y la medida en `logic/anchoTira.js`: primero todo en una fila con
los nombres enteros; si no cabe, nombres cortos («✂ Quitar zona», «⌂ Adosado», el móvil solo con su
icono) sin tocar el `title`; si tampoco, a una segunda fila. **Los m² de una zona no se recortan**
(es lo que se compara con Catastro): antes se pasa a dos filas. Los **lucernarios van en la fila de la
cubierta** (son los huecos de ESA cubierta; una fila para «ninguno · + Lucernario» eran 44 px de plano
sin ver). Con la **PIZARRA abierta, Vivienda y Cubierta se apartan** como en cualquier otro modo de
dibujo (salvo con el croquis abierto en el móvil, que se cierra desde Vivienda); en «Las dos» el plano
empezaba 338 px por debajo de la barra.

**REGLA — con dos plantas lado a lado, los planos empiezan a la MISMA altura.** Cada tarjeta reparte lo
suyo en tres filas —barra · tiras · plano— y las comparte con la de al lado (`alinear` →
`grid-rows-subgrid`). Sin eso la barra saltaba de fila según lo largo del título («PLANTA BAJA» no
cabía donde «PLANTA 1» sí) y la baja llevaba más tiras, y comparar las dos plantas es para lo que está
«Las dos». La leyenda, con dos tarjetas, va **una vez** debajo de las dos (`leyenda={false}` +
`LeyendaPlano`); la ayuda del modo de dibujo se queda en su tarjeta.

**REGLA — el ancho lo decide la PESTAÑA, y el panel de la pared ACOMPAÑA al plano.** La del plano
llega a 1880 px (las tarjetas de «Las dos» pasan de 468 a 698 px a 1920); las de formulario se quedan en
1400. De 1024 px hacia arriba el panel va a la derecha (300 · 340 · 360 px) y, entre 1024 y 1280, con
dos plantas, van una debajo de otra. El panel es `sticky` bajo la cabecera, cuyo alto **se mide** y se
publica en `--alto-cabecera` (nada de número mágico), con scroll propio y de vuelta arriba al cambiar de
pared; sin pared elegida enseña las **paredes sin mirar por planta** (un clic lleva a cada una) y los
atajos, en vez de una columna vacía. ⚠️ **`overflow-x-hidden` rompe el `sticky`**: obliga a `auto` en el
otro eje y esa caja con scroll (que nunca se desplaza) pasa a ser la referencia; el envoltorio de
`App.jsx` va con `overflow-x-clip` en la ruta de la envolvente (en las demás no se ha medido). En la
barra de apartados, «Generar .cex» y deshacer van **pegados a la derecha**: a 1024 las pestañas no caben
y pasan por debajo.

**REGLA — el aviso de cuerpos es una LÍNEA, con los mismos botones.** Regla 48.j intacta: se avisa con
su botón y nunca se quita solo. Pasa de 125 a 42 px; el porqué y la deducción por eliminación se
despliegan con «por qué». Si una zona APLICADA del croquis ya cubre **al menos el 80 %** de la huella
del cuerpo en esa planta (`coberturaPorZonas`, por geometría, nunca por el nombre; un porche no cuenta
como garaje), la línea sale atenuada con un ✓ «ya está fuera como zona del croquis». La banda del Agente
IA pasa a ser una **píldora** en la fila de estado (`PildoraAgenteIa`, que despliega `DetalleAgenteIa`
con cómo lo ha hecho, sus avisos, el `.cex`, la carpeta y el croquis): «por confirmar» se dice una sola
vez.

Resultado medido en 26RES060_188 (1920, 1440, 1280 y 1024 px, «Las dos» y una planta, 2D y 3D, claro y
oscuro): **0 botones fuera de su tarjeta y 0 pisados** (salvo los falsos del auditor: la cabecera
pegada sobre lo desplazado y las pestañas que pasan bajo «Generar .cex» a 1024) y **0 rótulos que se
cortan** con la caja girada; en 26RES080_85, 26RES060_205, _198 y _186, igual. Ningún nombre de pared
que antes se viera ha desaparecido; aparecen algunos que antes se escondían (FBO1 en el 188).

Tras tocar los rótulos: `node implementation/backend/scripts/test_rotulos_plano.mjs`. Tras tocar las
tiras o la pizarra: `node implementation/backend/scripts/test_pizarra.mjs`.
