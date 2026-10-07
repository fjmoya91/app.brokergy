---
paths:
  - "implementation/frontend/src/features/expedientes/views/**"
  - "implementation/frontend/src/features/expedientes/logic/{expedientesColumnas,rechazoExpediente,rangoFecha,expedienteTaxonomia}.js*"
  - "implementation/frontend/src/features/expedientes/components/{ColumnasPicker,TablaExpedientesHead,RechazoExpediente*,EstadoRechazado}.jsx"
  - "implementation/backend/services/{driveFolders,expedienteFolderSync,expedienteService}.js"
  - "implementation/backend/utils/expedienteEstados.js"
  - "implementation/backend/scripts/expedientes_*"
---
# Expedientes — ciclo de vida, listado y columnas, rechazo, carpetas de Drive por estado (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/expedientes/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

1. **Drive**: La creación de carpetas es **no bloqueante**. **REGLA DE ORO:** Los enlaces a Drive (`drive_folder_link`) solo se muestran en el frontend si `user.rol === 'ADMIN'`.

76. **Un expediente puede estar RECHAZADO, y es una SALIDA, no un paso del ciclo.** Terminal como FINALIZADO (color rojo), pero se llega desde CUALQUIER estado, así que **no está en `ORDEN_ESTADOS`** y se guarda de dónde venía. **Se entra y se sale solo por dos RPC de UNA sentencia** (`expediente_rechazar` / `expediente_reabrir`, `scripts/expedientes_rechazo.sql`, ya en producción): estado, `rechazado_por`, `motivo_rechazo_cat`, `motivo_rechazo` (≥ 20 car.), `rechazo_adjunto_url`, `fecha_rechazo`, `estado_previo_rechazo` y el asiento `{tipo:'estado', estado, fecha, usuario, motivo}` de `documentacion.historial`, a la vez o nada; un CHECK impide un RECHAZADO sin quién/por qué/cuándo. Rutas `POST /api/expedientes/:id/rechazar` y `/reabrir` (**staffOnly**). Elegir RECHAZADO en un selector (fila, tarjeta móvil o detalle) **no guarda**: abre `RechazoExpedienteModal`, y cancelar no toca nada. Un rechazado se pinta con `EstadoRechazado` (badge con el motivo en el tooltip + «Reabrir», que devuelve `estado_previo_rechazo`) y no con un desplegable. **REGLA — nada lo reabre por la espalda**: `avanzarEstado` devuelve RECHAZADO tal cual (sin eso, como no tiene rango, el primer automatismo sellaba su destino), el PUT general da 400 al intentar ponerlo e **ignora** —sin tumbar el resto del guardado— el intento de sacarlo, y el cambio de estado de un LOTE no lo arrastra (`.or('estado.is.null,estado.neq.RECHAZADO')`). Fuera de: "Todos menos finalizado y rechazado", las cifras del resumen del listado (salvo con su chip marcado), el cuadro de mando y el parte diario (`ESTADOS_FUERA`). Su carpeta va a `12. RECHAZADOS` (si no está loteado) y vuelve sola al reabrir; su oportunidad se ve RECHAZADA; y un cliente cuyos expedientes están todos rechazados sale «Rechazado», no «En curso». El listado trae los campos del rechazo con una consulta aparte (la RPC v4 no los tiene). Fuente única del front: [logic/rechazoExpediente.js](implementation/frontend/src/features/expedientes/logic/rechazoExpediente.js), espejo de `utils/expedienteEstados.js` y de los CHECK. En el portal del cliente sale como **«Expediente cerrado»** (`mapEstadoToHito`, subestado `cerrado`): sin barra de pasos, sin el motivo interno y sin pedirle nada (`queFalta` vacío). ⚠️ Pendiente: el bloque del bono del portal sigue enseñando el importe estimado.

53. **Las COLUMNAS del listado de expedientes se ELIGEN, y son una lista declarativa**: botón **▦ Columnas · N** con vistas de fábrica (Operativa · Seguimiento CEE · Económica · Cartera). Cada columna se declara UNA vez en [logic/expedientesColumnas.jsx](implementation/frontend/src/features/expedientes/logic/expedientesColumnas.jsx) —rótulo, ancho, filtro, `valor()` y `render()`— y de ahí salen la cabecera, la fila de filtros, las celdas, el ORDEN (clic en la cabecera; el tercer clic vuelve al orden por PRIORIDAD, que es el de siempre) y el CSV, que exporta **lo que se está viendo**. Antes eran siete columnas escritas a mano en tres sitios alineados por posición, y por eso no se podía filtrar por **instalador**. **Un filtro activo NO puede esconderse**: al apagar su columna se limpia. Las columnas se **REORDENAN arrastrando su cabecera** (con eventos de PUNTERO y no con el drag&drop de HTML5, que no se puede disparar con eventos sintéticos y por tanto no se puede verificar; y con `setInterval` y no `requestAnimationFrame`, que el navegador congela con la ventana oculta): la tabla se desplaza sola al llegar al borde, soltar sobre "Acciones" la deja la última y sobre el nº de expediente —que no se mueve nunca, identifica la fila— justo detrás. El orden se guarda como los anchos, y **`roles` es una comodidad de pantalla, nunca el control de acceso** — el instalador se le capa al CERTIFICADOR también en la ruta (regla 48.d) y el margen sigue siendo de ADMIN. Instalador y Certificador **se filtran con BUSCADOR** (`FiltroEmpresa`, popover portaleado a `body`): busca sin tildes en acrónimo, razón social, técnico y su sociedad, cada opción dice cuántos expedientes tiene (sobre la cartera entera, no sobre lo filtrado) y se maneja con flechas + Enter. Instalador y Certificador pintan el **LOGO** de la empresa con [components/LogoEmpresa.jsx](implementation/frontend/src/components/LogoEmpresa.jsx), que es ahora la ÚNICA pieza que lo dibuja (eran dos copias: lotes y cuadro de mando) — sin logo, iniciales; en el certificador el chip de color de su ficha se conserva. ⚠️ Los logos son data URL a tamaño de papel: **8 MB en cada `GET /api/prescriptores`** (el mayor, 1,97 MB), y ya era así antes; la cuenta pendiente es una miniatura. La columna INSTALADOR resuelve `instalacion.instalador_id → expedientes.instalador_asociado_id → oportunidad`, la misma primera fuente que la FICHA, y **marca lo heredado** (con la primera sola, 98 de 267 saldrían vacíos teniéndolo). Los datos los trae `get_expedientes_list_v4` (lote, instalador y `seguimiento` podado a sus cuatro claves de fase), que de paso arregla que `lote_id` **nunca llegara** al listado y los 45 expedientes ya loteados se ofrecieran para lotear. Ver "El listado de expedientes: las columnas se ELIGEN".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/expedientes/carpetas-de-drive-por-estado.md` — Carpetas de Drive por estado (2026-07-24) · 2,7 KB
- `docs/conocimiento/expedientes/el-listado-de-expedientes-las-columnas-se-eligen.md` — El listado de expedientes: las columnas se ELIGEN (2026-09-15) · 11,2 KB
- `docs/conocimiento/expedientes/modulo-lifecycle-de-expedientes.md` — Módulo Lifecycle de Expedientes (2026-05-20) · 6,7 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/expedientes/el-listado-de-expedientes-las-columnas-se-eligen.md`
  - **REGLA — las columnas son una LISTA DECLARATIVA, no N bloques de JSX copiados.**
  - **REGLA — `valor()` es lo que la columna DICE y `render()` cómo lo enseña.**
  - **REGLA — quién puede ver una columna se declara en `roles`, y el backend lo
repite.**
  - **REGLA — las columnas se REORDENAN arrastrando su cabecera, y el nº de
expediente no se mueve.**
  - **REGLA — el arrastre va con EVENTOS DE PUNTERO, no con el drag&drop de HTML5.**
  - **REGLA — el gesto es TOLERANTE en los dos extremos.**
  - **REGLA — un filtro activo NO puede esconderse al ocultar su columna.**
  - **REGLA — el filtrado recorre TODAS las columnas, no solo las visibles.**
  - **REGLA — una columna de FECHA filtra por RANGO, y la fecha se lee en LOCAL.**
  - **REGLA — la CABECERA ordena, y sin ordenación elegida manda la PRIORIDAD.**
  - **REGLA — "Exportar" saca lo que SE ESTÁ VIENDO**
  - **REGLA — el dibujo es UNO**
  - **REGLA — UNA cascada, y la del listado coincide con la de la FICHA.**
  - **REGLA — lo HEREDADO se marca.**
- `docs/conocimiento/expedientes/modulo-lifecycle-de-expedientes.md`
  - **REGLA**

<!-- generado:fin -->
