<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «REVISAR el CEE que entrega el certificador (2026-09-21)», en el CLAUDE.md antiguo.

### Medio minuto de espera no puede ser una pantalla quieta (2026-09-22)

Con veintiuna fotos el buzón tarda medio minuto en proponer nada —se reducen una
a una en el navegador y el modelo las mira en tandas de doce— y en ese rato la
pantalla era la lista de casillas vacías con un rótulo pequeño arriba. Eso se lee
como que se ha colgado, y lo siguiente es cerrar y volver a soltarlas, que
empieza la espera otra vez.

[ClasificandoFotos.jsx](implementation/frontend/src/features/docs/ClasificandoFotos.jsx)
es esa espera dibujada: las fotos salen de la pila, se paran bajo una lente y
caen en su apartado, que entonces se marca. Es lo que está pasando.

**REGLA — la primera fase lleva el número DE VERDAD.** Reducir las fotos ocurre
AQUÍ y se puede contar, así que se cuenta (`Preparando las fotos… 7 de 21`). Lo
que pasa en el servidor va por TIEMPO, con los rótulos de lo que de verdad hace,
y el último **se queda** en vez de dar la vuelta: mismo criterio que
`MidiendoElEdificio` — una cuenta que vuelve a empezar miente dos veces. El reloj
de esas fases arranca **cuando las fotos ya han salido**; contándolo desde que se
abre el popup, con veinte fotos el primer rótulo se habría pasado antes de que la
petición saliera siquiera.

**REGLA — el dibujo es SVG y `@keyframes`, nunca un GIF** (como los otros dos
popups de espera de la casa): no pesa en la carga, se adapta al tema, no se
pixela y sale de los tokens. Y dice cuántas TANDAS son, que es lo que explica por
qué con veintiuna tarda el doble que con diez.

⚠️ **En SVG el `scale` pivota sobre el ORIGEN DEL VIEWBOX, no sobre el
elemento.** Sin `transform-box: fill-box`, la foto no encogía al llegar a su
carpeta: salía disparada en diagonal. Es el mismo cuidado que pide cualquier
`transform` dentro de un `<svg>`.
⚠️ Va **portaleado a `body`** (regla 29.b): el buzón lleva `backdrop-blur`, y un
`position: fixed` dentro de un ancestro con `backdrop-filter` se ancla a ÉL — se
recortaría a la caja del modal en vez de cubrir la pantalla.
