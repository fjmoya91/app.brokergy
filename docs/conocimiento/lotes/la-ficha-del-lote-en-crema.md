<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## La ficha del lote, en crema: qué toca, dónde está y cómo se ve (2026-11-12)

Fran, 12/11/2026, al pedir el equipo de verificación en la ficha: «aprovecha para rediseñar la
imagen de acuerdo a como ya estamos migrando la web, por ejemplo toma como referencia lo que has
creado para el visor del Sujeto Obligado. Es decir, el nuevo kit de marca, identidad visual, que
sea incluso más fácil de usar. Todo.»

La ficha del lote ([LoteDetailModal.jsx](implementation/frontend/src/features/lotes/components/LoteDetailModal.jsx))
y sus tres pestañas pasan al estilo «carta de pago» (regla 164), como Facturación y la Vista S.O.
Monta el `CSS` `.fx-` de [facturacion/estilo.jsx](implementation/frontend/src/features/facturacion/estilo.jsx)
y lo suyo con el prefijo `.lt-` ([loteFichaEstilo.js](implementation/frontend/src/features/lotes/components/loteFichaEstilo.js)).
La LISTA de lotes, el cuadro de mando y «Presentar MITECO» siguen oscuros. **La lógica no se ha
tocado**: las mismas rutas, los mismos estados y los mismos popups. Lo que cambia es cómo se ve y
cómo se llega a lo que toca.

### Lo que lo hace más fácil de usar

- **«Lo siguiente»** abre el Resumen. Es una tarjeta con UNA frase de lo que toca ahora y un
  botón que lleva a ESE paso: abre la pestaña Documentación con la fase desplegada y a la vista.
  La frase sale de `loSiguiente()`, que lee `analizarProceso(lote)`
  ([logic/loteProceso.js](implementation/frontend/src/features/lotes/logic/loteProceso.js)).
  No es un criterio nuevo: es el mismo `faseActual` que ya pintaba el proceso.
  - Si lo que toca lo hacemos nosotros, el botón es naranja («Hacerlo ahora»).
  - Si toca esperar a otro (S.O., verificador, Administración), el tono es de espera y el
    botón es secundario («Ver el paso N»).
- **El paso en la cabecera**:
  - Junto al estado aparece el chip «Paso X de 7».
  - Debajo hay una barra de siete pasos que se pueden pulsar: cada uno abre su fase.
  - En el móvil, la barra pierde las etiquetas y deja solo los números.
  - El estado se puede seguir cambiando a mano con el desplegable «Cambiarlo a mano», como antes.
- **Una acción naranja por fase**: en cada fase el botón principal es el paso que toca. Por
  ejemplo, «Preparar N. REQUERIMIENTO» cuando hay inexactitudes sin informe de verificación,
  en vez de «Subir PDF» de un informe que aún no existe. Los demás botones son secundarios. Los
  huecos que faltan llevan «Falta» en ámbar solo si son lo siguiente; los demás, en gris.
- **Las pestañas** van pegadas arriba. Al cambiar de pestaña, la nueva se ve desde su principio.
- **Los expedientes**:
  - Cada expediente lleva su número de actuación (`E{n}`) en tinta con lima.
  - Debajo van el cliente y la dirección, y las tres cifras: ahorro, lo que se paga al cliente
    y el margen (este último solo para ADMIN).
  - Añadir expedientes vive en su propia tarjeta, «Caben X más», con las propuestas («Añadir n»)
    arriba.
- **Sujeto Obligado y verificador, en UNA tarjeta con una fila cada uno** (logo · nombre · una
  línea de resumen · acciones), con el mismo esqueleto para que queden alineadas. Lo secundario se
  despliega con **«+»**: el equipo de verificación (regla 213), con el email y el teléfono como
  enlaces, y en BORRADOR el desplegable para cambiar la empresa. Plegado, el verificador ya dice
  «Jefe: … · Revisor: …» y lleva el correo y el teléfono del jefe a un toque (en el móvil, solo
  el «+»). Antes eran dos tarjetas en paralelo y la del S.O. quedaba medio vacía (Fran, 12/11/2026:
  «que no haya tantos huecos libres… que las tablas, cuadros, etc. estén alineados»).
- **Datos del trámite, en columnas que casan**: la ayuda de cada campo en UNA línea (lo largo, en
  el `title`) y la comparación con la tarifa del verificador como chip junto a la etiqueta
  («−44 % de su tarifa»), así las dos columnas quedan a la misma altura.
- **Las filas de documentos con los botones en columnas FIJAS** (`.lt-doc-btns`: Ver · sustituir ·
  quitar, con hueco si falta alguno). En todas las filas de una fase el chip y los botones caen en
  el mismo sitio, y la fila de «Otro informe de inexactitudes» lleva el mismo esqueleto. Lo que
  cuelga de un hueco empieza donde su título.
- **Sin emojis ni flechas de texto en los botones**: ⬆ ⬇ ⌕ salen distintos en cada equipo. El
  icono lo pone el botón. Las etiquetas de [logic/becae.js](implementation/frontend/src/features/lotes/logic/becae.js)
  conservan su símbolo, y `BecaeEnVivo` lo quita al pintar.

### Lo que no se rompe

- El modal va portaleado a `body` (regla 29.b) y su capa **no lleva `backdrop-filter`**: anclaría
  los `position: fixed` de los popups hijos.
- Los hooks nuevos (`proceso`, `faseAbrir`) están por encima del `return` (regla 62).
- Las pestañas se ocultan con `hidden`, no se desmontan, así que lo que se teclea en una no se
  pierde al cambiar a otra.
- Los enlaces a Drive siguen siendo solo para ADMIN (regla 1). Las cifras de margen, cobro y
  precio por MWh, también solo para ADMIN (`canSeeMargin`).
- Las piezas que siguen en Tailwind oscuro (el panel de cobro a los clientes, `LogoEmpresa`) se
  envuelven en `.lt-piel`. Es una piel que traduce sus clases oscuras a la paleta crema. **Una
  pieza nueva se escribe en `.fx-`/`.lt-`, no se le pone la piel.**
- Lotes antiguos de más de 5 expedientes: el contador dice «10 expedientes», no «10 de 5».

### Banco de pruebas (sin iniciar sesión, solo lectura)

`/lote-demo.html?lote=LOTE-2026-019` (config `lote-demo-5193` de `.claude/launch.json`). Los
guardianes de `/api/lotes` (`staffOnly`, `adminOnly`) no aceptan la clave interna, así que el banco
del fx-demo no sirve aquí. Por eso hay un backend propio,
[scripts/banco_lote_lectura.js](implementation/backend/scripts/banco_lote_lectura.js):

- Lleva solo las rutas de lotes y prescriptores, con un usuario de mentira (ADMIN, o el rol que
  diga `BANCO_ROL`).
- **Corta toda escritura y el `GET /marwen`**, que sella el estado de beCAE en el lote. Local =
  producción.
- Escucha solo en `127.0.0.1`.
- La página corta lo mismo por su lado.

Fuera del build: no está en `build.input`.

Medido el 12/11/2026 sobre LOTE-2026-019:

- Sin desbordes a 375 px en las tres pestañas.
- Una sola posición horizontal para los botones de todas las filas de documentos, en escritorio
  y en el móvil.
- Escritorio y móvil revisados con capturas.
- `check-hooks` y `npm run build` limpios.
