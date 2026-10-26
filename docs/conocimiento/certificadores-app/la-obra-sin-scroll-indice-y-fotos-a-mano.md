<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La obra sin tanto scroll: el índice «Ir a…» y las fotos siempre a mano (2026-10-26)

Fran, probando la app como certificador: «en la página de la obra hay que hacer demasiado scroll; me
gustaría una serie de botones que te lleven directamente a cada parte». Y pensando en la visita: «en
cualquier momento debes poder acceder a la parte de fotos, porque quieres hacer la foto de la fachada
o ahora la de la caldera… tanto móvil como PC. Obviamente la visita in situ es con el móvil».

### El índice pegado debajo de la barra

[IndiceSecciones.jsx](implementation/frontend/src/certificadores/obra/IndiceSecciones.jsx): una fila
de chips que se queda pegada debajo de la barra de la app, marca dónde estás y, al pulsar, baja hasta
allí (suave, salvo con «reducir movimiento»). En el móvil la fila se desliza y la marcada se centra.

- Mide el alto de `.ca-bar` con un `ResizeObserver` (cambia con el notch y al girar) y baja hasta la
  sección dejando la barra y el índice encima.
- Abajo del todo marca la última sección que se ve: si no, la última no se marcaría nunca.
- Con menos de dos entradas no se pinta.

**REGLA — el índice va como hijo DIRECTO de la columna (`.ca-col` / `.ca-col-fases`)**: dentro de una
`.ca-card` no se pega, porque la tarjeta lleva `overflow:hidden`.

### Dónde está

> **Cambiado el mismo 26/10/2026** con el menú lateral ([menu-lateral-y-partes-de-la-obra.md](docs/conocimiento/certificadores-app/menu-lateral-y-partes-de-la-obra.md)):
> la obra entregada ya va por partes (`?parte=`) y no lleva índice; la cámara del móvil es la redonda
> del centro de la barra de abajo y, dentro de las fotos, abre la cámara de la siguiente que falta.

- **Las fases** ([Fases.jsx](implementation/frontend/src/certificadores/obra/Fases.jsx)), las fotos a
  un toque desde cualquier fase:
  - Móvil: la **cámara** de la barra de abajo.
  - PC: un botón **«Fotos»** en la cabecera, junto a «Guardado» (y la fase en el menú lateral). En el
    móvil esa cabecera solo lo enseña en «Generar», donde la barra de abajo no está.
  - Dentro de la fase de fotos, el índice «Ir a una foto» con cada hueco (Fachada principal, Caldera,
    Placa de la caldera…) y ✓ en las ya hechas: en la visita se salta a la que toca sin bajar.

**REGLA — el índice de fotos sale de `fotosDeLaFase` ([fasesFicha.js](implementation/frontend/src/certificadores/obra/fasesFicha.js))**,
que repite la visibilidad de `FaseFotos`: los huecos de la vivienda y los de equipos según el
cuestionario (`verAcs` / `verAire` / `verPlacas`). Si `FaseFotos` cambia qué huecos enseña, se cambia
también ahí, o el índice lleva a un hueco que no está (y el chip no hace nada).

Tras tocarlo: `npm run build` y, en la demo (`?demo=1`), a 375 px: en las fases, la cámara de abajo
lleva a las fotos y «Caldera» del índice baja justo debajo de la barra y se marca, sin desbordar en
horizontal.
