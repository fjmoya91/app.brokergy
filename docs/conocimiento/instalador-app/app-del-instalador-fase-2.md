<!-- conocimiento · área: instalador-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app del INSTALADOR, fase 2: la obra se HACE dentro de la app, con sesión y sin enlaces (2026-11-21)

**Por qué.** En la fase 1 la ficha de la obra era de solo lectura y cada tarea mandaba al instalador
FUERA, a un enlace con token (`/instalador/:id`, `/factura-obra/:id?token=`, `/subir-docs/…`). Fran
(21/11/2026): que lo haga todo en su obra, con su sesión, sin enlaces: ver y subir el presupuesto, hacer
o subir la factura, firmar el certificado de la instalación (CIFO), subir el RITE y las fotos y papeles.

| Qué | Dónde |
|---|---|
| Las rutas con sesión (`/api/instalador-app/obras/:id/…` y `/docs/:id/…`) | [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), bloque «FASE 2» |
| La llave de las miniaturas | [utils/llaveObra.js](implementation/backend/utils/llaveObra.js) |
| Las pantallas de cada acción (presupuesto, factura, certificado y RITE, fotos) | [views/AccionesObra.jsx](implementation/frontend/src/features/instalador/views/AccionesObra.jsx) |
| La obra con sus acciones, y el historial (atrás) | [views/ObraView.jsx](implementation/frontend/src/features/instalador/views/ObraView.jsx) y [AppInstalador.jsx](implementation/frontend/src/features/instalador/AppInstalador.jsx) (`apiReal`, `abrirAccion`) |
| Las tarjetas de siempre, con rutas y envío inyectables | `FirmarCifoCard`, `SubirRiteCard`, `FirmarFmDeclaracionCard` (`rutas`, `alSubir`) y `FacturaObraView` (`api`, `embebida`, `alEnviar`) |
| El gestor de documentación con la API de la app | `DocsManager` + `API_DOCS_INSTALADOR` de [docsApi.js](implementation/frontend/src/features/docs/docsApi.js) |
| Banco sin API | `/instalador-demo.html` ([instaladorDemo.jsx](implementation/frontend/src/demo/instaladorDemo.jsx)), `instalador-demo-5187` |
| Pruebas | `test_app_instalador.js` (212) y `test_app_instalador_no_regresion.js` (26), más `test_rutas_sin_sesion.js` y `auditar_rutas_sin_guardian.js` |

### No se reescribe nada: se DESPACHA a la ruta de siempre

**REGLA — cada acción de la app se despacha, dentro del servidor, a la MISMA ruta que usa hoy el enlace
por token; la app no tiene un segundo camino para firmar, subir o facturar.** `despachar(req, res, router,
ruta)` cambia `req.url` y llama al router de siempre: `routes/public.js` (CIFO, RITE, declaración FM,
`reforma-docs`), `routes/facturaInstalador.js` (la factura en su plantilla) y `routes/oportunidades.js`
(los anexos del «0. PRESUPUESTO»). Así la ruta pública y la nueva no pueden decidir distinto: re-firma,
rechazo, bloqueo del CIFO, OCR de la factura, RPC de merge de `reforma_uploads` y `documentacion` (reglas
19 y 22) son el mismo código. Lo único que añade esta capa:

- **El guardián**: `enforceAuth` + la beta + `obraSuya` (el `or` de `soloLoSuyo`; lo ajeno o lo RECHAZADO,
  **404**) y, para firmar, el RITE, la declaración FM y la factura, `soloInstaladora`: **403
  `NO_ES_INSTALADORA`** si su empresa trae la obra pero no la instala.
- **La credencial**: el `upload_token` de la oportunidad lo pone el SERVIDOR y no viaja al navegador.
  Cualquier `token` o `llave` que mande el navegador en la query se descarta. Sin token en la obra,
  **409** («escríbenos y lo activamos»), nunca un enlace.
- **La salida, saneada** (`sanear`): fuera toda clave que acabe en `link`/`url` o contenga `token`, y
  cualquier cadena con un enlace de Drive (regla 1). Los ficheros se sirven por proxy.

### La llave de las miniaturas

Un `<img>` no lleva la cabecera de sesión. El enlace público lo resuelve con el token en la URL; aquí
el token no sale, así que `GET /docs/:id` añade una **llave**: HMAC sobre el nº de la obra que caduca a
las **12 h** (`utils/llaveObra.js`). `GET /thumb/:id/:driveId` y `GET /fichero/:id/:driveId` son las dos
únicas rutas abiertas de la app, y solo con llave válida **y** si el fichero es de ESA obra (está en su
`reforma_uploads` o, porque Drive manda —regla 20—, cuelga de su carpeta a ≤ 4 niveles). No sube, no
borra y no abre nada más. El `DocsManager` en modo token usa el nº de la obra como `uuidRef`, así que la
llave casa sin tocar el gestor.

### Lo que hace cada acción

- **Presupuesto**: el vigente del «0. PRESUPUESTO» (`PRESUPUESTO DE LA INSTALACIÓN*.pdf`; el `_old` no
  cuenta) pintado con pdf.js dentro de la app, y su estado: **subido · estimado · falta**. Subir uno
  nuevo va por el mismo POST de la calculadora como presupuesto de la **AEROTERMIA** (el anterior pasa a
  `_old`); del navegador solo se aceptan nombre, tipo (PDF o foto) y contenido (≤ 20 MB).
- **Factura**: la lista de las que hay, con su estado («Revisada» / «Subida · la estamos revisando») y
  un visor (proxy por su referencia opaca, `refFactura`). Con plantilla de su empresa y obra no RES080,
  `FacturaObraView` **embebida** (la misma pantalla de `/factura-obra`, sin rediseñar); sin plantilla o
  en un RES080, subirla al apartado «Facturas» por el `reforma-docs/…/DOC_FACTURAS/batch` de siempre
  (crea la fila en `documentacion.facturas` y la lee el OCR). Con una ya subida, «Hacer / Subir otra que
  la sustituya».
- **Certificado y RITE**: lo que pinta `/instalador/:id` sale de SU ruta; las tarjetas de siempre
  reciben `rutas` (`{pdf, subir}` de la app) y `alSubir` (el overlay). Firma con Autofirma, firmado a
  mano subido, RITE, declaración FM; re-firma, rechazo y bloqueo igual que en el enlace.
- **Fotos y papeles**: el `DocsManager` de siempre en `.theme-light`, con un aviso arriba de lo que
  falta o hay que repetir (`onResumen`). El instalador **no valida ni rechaza**: lo decide `isStaff`
  dentro de la ruta pública y por aquí nunca entra el staff.

**REGLA — borrar una foto solo se deja si ese fichero está apuntado en ESE apartado de ESTA obra.** La
de la app mira antes `reforma_uploads[slot]` de la obra y, si no está, **404**. Desde el 21/11/2026 la
ruta pública `DELETE /reforma-docs/:uuid/:slot` también lo comprueba (y admite además lo que está en
Drive y no en la BD, en la subcarpeta de la obra con el nombre del apartado): ver
[rutas-publicas-solo-lo-de-esa-obra.md](docs/conocimiento/transversal-backend/rutas-publicas-solo-lo-de-esa-obra.md).

**Los envíos usan `SendActionOverlay`** (regla 29.b) por `useEnvio().alSubir(textos)`: presupuesto,
factura (generada o subida), CIFO, RITE y declaración FM. **El gestor de fotos conserva su propia subida
en tanda** (regla 68: miniatura antes de responder, fases reales, parcial con 200); taparla con un
overlay escondería ese progreso.

Tras cada acción la obra se **refresca** (`onCambio`: se vacía la caché y se vuelve a pedir la lista y el
detalle), así que la tarea hecha sale de «Te toca a ti» sin recargar. El **atrás** del móvil cierra
primero la acción y luego la ficha (`pila`: 1 = ficha, 2 = acción).

### Las tareas ya no son enlaces

`destinoDe` devuelve `{ tipo: 'accion', accion: 'cifo' | 'rite' | 'factura', modo }` y la app abre esa
acción dentro de la obra (Inicio, Obras y la propia obra). El token ya no viaja en ninguna respuesta.

### Arreglos de la fase 1 que entran aquí

- **(a) Las cuentas del cliente**: el titular es el **bono** («es el bono que cobra {nombre} por esta
  obra»); «La obra le queda en» sigue de cierre.
- **(b) El peso 700 de los botones**: `.ia-app button{font:inherit}` (0,1,1) ganaba a `.ia-btn` (0,1,0) y
  los botones salían finos. El reseteo va con `:where(.ia-app) button`.
- **`GET /api/clientes` con la BD caída da 503** (regla 38), no 500.

### Lo medido (21/11/2026, banco a 390×844, 1280×800 y 360 px)

Todas las pantallas de la app (Inicio, Obras, obra, presupuesto, factura en plantilla y subida,
certificado, re-firma, bloqueado, RITE, fotos, cobrada, error del envío): **sin scroll horizontal, sin
errores de consola, objetivos ≥ 44 px, ningún texto cortado**. De medir salieron cuatro arreglos, todos
solo dentro de la app: en la factura embebida, el selector de modo (42 px) y el enlace de texto (25 px)
pasan a 44 (`.fo-embebida`); en el gestor, los botones del paso guiado (42 px) y «Ver todos» (17 px), por
`.ia-docs`; y el buscador estira el `input` a la caja de 52 px. Las capturas se hacen con la ventana del
navegador visible o con una captura de descarte antes: con el panel oculto, la primera sale a medio
animar.

**Ninguna escritura real** en las pruebas: los tests simulan Supabase, Drive, WhatsApp y email (y los
routers de siempre, en ECO); el worktree no tiene `.env`; el banco bloquea `/api` en axios y en `fetch` y
contesta las fotos con un adaptador dentro del navegador.

### Lo que queda (no es de esta fase)

Las cinco debilidades de las rutas PÚBLICAS vistas al despachar a ellas (borrar y servir cualquier
`driveId`, `cifo-upload`/`rite-upload` reescribiendo `documentacion`, `cifo-upload` y `/instalador/:id`
sin token, `setFolderPublic` en `rite-upload`) quedaron cerradas o decididas el mismo 21/11/2026:
[rutas-publicas-solo-lo-de-esa-obra.md](docs/conocimiento/transversal-backend/rutas-publicas-solo-lo-de-esa-obra.md)
(regla 232).

Y de producto: unificar `cuentasCliente` con el resumen del partner; partidas y catálogo (más adelante: la fase 3 fue «Tu página web»).
