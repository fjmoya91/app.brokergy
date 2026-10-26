<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El menú lateral y las partes de la obra (2026-10-26)

Fran, tras probar el índice «Ir a…»: «al menos la vista de PC no me gusta la forma de trabajar con
tanto scroll; quiero una vista más de aplicación, quizás con una ventana lateral tipo menú». Se
dibujaron tres alternativas en Claude Design (A: menú lateral con las partes de la obra; B: la obra
en pestañas arriba; C: lista de obras y obra lado a lado) más las pantallas del móvil, y eligió la A
«con el móvil de pestañas abajo y la cámara».

### En el PC (desde 1024 px): el menú lateral

[Marco.jsx](implementation/frontend/src/certificadores/ui/Marco.jsx) pinta un menú fijo a la
izquierda (264 px, `.ca-menu-lat`) y quita la barra de arriba: logo, «Nueva obra», Mis obras,
Incidencias, Mis gastos, Mi perfil, Administración (solo admin), y abajo los créditos, el email y
«Cerrar sesión». Por debajo de 1024 px no se ve y queda la barra de siempre con su hoja de menú.

Con una obra abierta, debajo de «Mis obras» salen **sus partes**. La pantalla de la obra las cuenta
con `useMenuObra(nav)` ([menuObra.js](implementation/frontend/src/certificadores/ui/menuObra.js)):
`{ numero, titulo, items: [{ id, label, to, act, hecho, num, n }] }`. Al desmontarse la obra, el
menú vuelve a quedarse sin partes.

**REGLA — las partes de la obra llegan al menú SOLO por `useMenuObra`**: el menú no sabe nada de
obras; si una pantalla nueva quiere salir en él, cuenta sus partes con ese hook. `nav` se compara
por su JSON, así que se le pasan datos planos (textos, rutas, números), nunca funciones ni JSX.

Dos clases para lo que sobra con el menú: `.ca-sin-menu` (se oculta desde 1024 px: la barra de
progreso de las fases, las fases plegadas, el saludo con créditos de «Mis obras», las pestañas de
abajo) y `.ca-solo-menu` (solo desde 1024 px).

### La obra entregada, por partes

[ObraCerrada.jsx](implementation/frontend/src/certificadores/obra/ObraCerrada.jsx) ya no es una
página larga: enseña una parte cada vez con `?parte=` (sin parámetro, el resumen).

- **Resumen**: el certificado (calificación, «Ver, validar y firmar», «Solo validar», «Revisar en la
  envolvente»), el aviso de la envolvente y las incidencias; al lado, «Lo siguiente» (pedido →
  preparado → revisarlo y firmarlo → registrarlo, con fechas) y los atajos a Documentos, Fotos y la
  Envolvente.
- **Documentos** (solo entregada), **Fotos**, **Datos de la obra** (inmueble, titular y lo que
  contestó) e **Historial** (hasta 50 eventos).
- En el PC, la cabecera de las demás partes lleva «Ver y firmar» / «Ver el certificado».
- En el móvil y la tableta, **barra de abajo**: Resumen · Documentos · Fotos · Más (una hoja con
  Datos, Historial, Envolvente y la carpeta de Drive). Su alto lo reserva `--ca-inf` (68 px, con
  `:has(.ca-partes-inf)`) para que los botones flotantes no la tapen.

El índice «Ir a…» se quitó de aquí: con una parte por pantalla ya no hace falta.

### Las fases del borrador

[Fases.jsx](implementation/frontend/src/certificadores/obra/Fases.jsx): en el PC las fases van en el
menú con su número, ✓ las hechas y, en «Las fotos», hechas/total (de `fotosDeLaFase`). En el móvil la
barra de abajo es **atrás · cámara · Siguiente**, con la cámara redonda en el centro:

- fuera de las fotos, lleva a la fase de fotos;
- dentro, abre la cámara de la **siguiente foto que falta** (la de la visita guiada si está en la
  casa; si no, la primera sin hacer de `fotosDeLaFase`) pulsando su `input` `f-<hueco>-cam`; si ese
  hueco no tiene cámara (un documento), baja hasta él.

En la visita, [FaseFotos.jsx](implementation/frontend/src/certificadores/obra/FaseFotos.jsx) pone
arriba la tarjeta oscura **«La siguiente»** con la foto que toca, su ayuda y «Hacer la foto» / «De la
galería» / «Ver dónde va». Sus botones son `<label for>` de los `input` del propio hueco: suben lo
mismo y por el mismo sitio.

**REGLA — la cámara y «La siguiente» usan los `input` del hueco (`f-<id>-cam` / `f-<id>-gal`)**: si
`SlotFoto` ([Fotos.jsx](implementation/frontend/src/certificadores/obra/Fotos.jsx)) cambia esos `id`,
la cámara de abajo y la tarjeta dejan de hacer nada sin dar error.

### Mis obras

[Panel.jsx](implementation/frontend/src/certificadores/panel/Panel.jsx): buscador (con 3 obras o
más; sin tildes ni mayúsculas, por titular, número, dirección o referencia) y «Lo siguiente» de cada
obra (en la tabla, columna propia; en las tarjetas del móvil, junto a la fecha), en naranja lo que
le toca al certificador. En el PC el saludo con los créditos y el aviso de «listos para revisar» se
quitan: los créditos están en el menú y «Lo siguiente» ya lo dice fila a fila.

Tras tocarlo: `npm run build` y, en la demo (`?demo=1`), a 1280 px: el menú con las partes de
`demo-obra-3` (Documentos 4) y las fases de `demo-obra-1` («Las fotos 1/7»); a 375 px: las pestañas
de abajo y «Más» en la obra entregada, y en las fases la cámara del centro (desde «El titular» lleva
a las fotos; en las fotos, a la siguiente que falta).
