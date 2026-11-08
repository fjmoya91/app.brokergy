---
paths:
  - "implementation/frontend/src/features/expedientes/views/**"
  - "implementation/frontend/src/features/expedientes/logic/{expedientesColumnas,rechazoExpediente,rangoFecha,expedienteTaxonomia}.js*"
  - "implementation/frontend/src/features/expedientes/components/{ColumnasPicker,TablaExpedientesHead,RechazoExpediente*,EstadoRechazado}.jsx"
  - "implementation/backend/services/{driveFolders,expedienteFolderSync,expedienteService}.js"
  - "implementation/backend/utils/expedienteEstados.js"
  - "implementation/backend/scripts/expedientes_*"
  - "implementation/backend/utils/viaFm.js"
  - "implementation/backend/scripts/test_via_fm.mjs"
  - "implementation/frontend/src/features/expedientes/logic/viaFm.js"
  - "implementation/frontend/src/features/expedientes/components/ViaFmPanel.jsx"
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

195. **En el LISTADO, un expediente completo que ya está en un lote se ENSEÑA como «EN LOTE», con el lote debajo; en la BD sigue en DOC. COMPLETA** (2026-11-05, Fran: «tengo 5 con documentación completa, pero al lotear no me salen» — estaban ya loteados). Un expediente sigue en DOC. COMPLETA hasta que su lote sale al verificador, así que el chip DOC. COMPLETA mezclaba lo libre con lo loteado. `estadoVisible` lo usan la columna Estado (chapa fija con el código y el estado del lote), la tarjeta móvil, los chips (el de «EN LOTE» detrás de DOC. COMPLETA, que cuenta solo lo que queda por lotear), el filtro y «Todos menos finalizado y rechazado». **No se convierte en estado de la BD**: de `estado` cuelgan las carpetas de Drive, el parte y lo que arrastra el lote. Fuente única: [logic/enLote.js](implementation/frontend/src/features/expedientes/logic/enLote.js). Ver "«EN LOTE»: el listado separa lo completo que ya está en un lote".

196. **Pasar a DOC. COMPLETA es haberlo VALIDADO TODO: primero el ✓ de cada documento firmado, después el estado** (2026-11-05, Fran, 26RES060_198 y _202: «esto debe hacerse siempre; cuando lo pasemos a DOC. COMPLETA es porque se supone que se ha validado todo»). Cada firmado se valida por `POST /api/expedientes/:id/documentos/validar` (`{ field }`), que comprueba la firma (409 `firma_rota`), lo copia a **«10. EXPEDIENTE CAE»** —la carpeta que audita el verificador— y sella `docs_validados`: Anexo I, Convenio, CIFO, facturas, certificado RITE y Anexo Fotográfico siempre; Memoria RITE y Ficha RES si están. Solo entonces `PATCH /:id/estado` (que mueve la carpeta a «05. DOC. COMPLETA»), nunca un `update` directo. Un 409 no se fuerza sin el «sí» de Fran, y un documento firmado de nuevo se valida otra vez (la subida borra la validación). En DOC. COMPLETA entra en el lote aunque tenga incidencias, así que lo que no esté en la carpeta 10 viaja sin estar. Texto para las skills: `skills/_comun/pasar-a-doc-completa.md`. Ver "Pasar a DOC. COMPLETA es haberlo VALIDADO TODO".

200. **La vía del FACTOR MULTIPLICADOR (BOE-A-2026-23367, en vigor el 08/11/2026) es OTRO número: `26RES060FM_N` / `26RES093FM_N`, serie propia, y cambiar de vía RENUMERA** (2026-11-07, Fran: «será un nuevo código de expediente. El apartado documentación de la app debe contemplar todo lo que pide la ficha»). La vía la dice el número (`esNumeroFm`; `fichaFromNumero` sigue dando RES060/RES093, así que cálculo, documentos y carpetas no cambian) y el correlativo se busca DENTRO de su serie (`correlativoEnSerie`: el `_` de un `LIKE` es comodín). Se cambia en la pestaña «Vía FM» (`POST /:id/via-fm`, staffOnly → `cambiarViaFm`), que **bloquea con el número ya fuera de casa** (lote, verificador, MITECO o después; RECHAZADO), escribe solo si nadie cambió el número entretanto, lo apunta en el historial, sella `documentacion.via_fm.activada_at` y endereza la carpeta. **En la OPORTUNIDAD la marca es `inputs.ruta_fm`, NUNCA `via_fm`**: `financialScrub` borra toda clave `via_fm` del árbol a quien no es ADMIN (es el resumen de las dos vías del motor). **`documentacion.via_fm` solo lo escribe `PUT /:id/via-fm/datos`** (RPC de merge, `sanearDatosFm`): está en la BLACKLIST de `normalizeData` y en `CLAVES_PROTEGIDAS`. Lo que pide la ficha, por caso (tipología, hibridación, preinstalación, BT, letra F/G en D/E, vulnerable -S), sale de UNA fuente: `documentosFm` / `slotsFm` en [utils/viaFm.js](implementation/backend/utils/viaFm.js), que alimenta el panel y el apartado `alcance.fm` del gestor; lo del instalador no se le reclama al cliente y lo condicionado sin dato sale opcional. La cláusula del IRPF (punto 12) va **solo en los FM**, en el Convenio («Cuarto» del EXPONEN: medido con `check_anexo_cesion_2pag.mjs`) y en la propuesta; y el Convenio FM vale para las DOS fichas, la FM principal y la general subsidiaria, sin firmar otro si la FM no se justifica (regla 200.d de documentos); un Convenio firmado antes de `activada_at` es «sin cláusula». Los textos, en [logic/viaFm.js](implementation/frontend/src/features/expedientes/logic/viaFm.js). El panel enseña arriba las dos cifras (`cifrasViaFm`, las de la pestaña Económico) y, con el expediente aún en la vigente, «Proponer esperar al FM»: un WhatsApp al cliente, a la vista y con «Enviar», para que acepte esperar al 15/01/2027 (`AvisoEsperaFmModal`; queda en `via_fm.aviso_espera` y la respuesta en `via_fm.espera_cliente`); proponerlo NO cambia la vía. La vía también se elige ANTES de aceptar, con el conmutador «Vía de tramitación» de la calculadora (`POST /api/oportunidades/:id/ruta-fm`, staffOnly; regla 155). Los documentos de firma que pide la ficha los GENERA la app: el Anexo A, en lugar del Anexo I, y otros cuatro desde el panel, que se firman en los enlaces del cliente y del instalador (regla 200.c). ⚠️ Pendiente: que Marwen acepte los códigos FM y el desplegable del MITECO (no los trae). Tras tocarlo: `node implementation/backend/scripts/test_via_fm.mjs`, `check_documentos_fm.mjs`, `check_anexo_cesion_2pag.mjs`, `test_docs_fotos.js` y `auditar_rutas_sin_guardian.js`. Ver "La vía del FACTOR MULTIPLICADOR en el expediente".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/expedientes/carpetas-de-drive-por-estado.md` — Carpetas de Drive por estado (2026-07-24) · 2,7 KB
- `docs/conocimiento/expedientes/el-listado-de-expedientes-las-columnas-se-eligen.md` — El listado de expedientes: las columnas se ELIGEN (2026-09-15) · 13,4 KB
- `docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md` — La vía del FACTOR MULTIPLICADOR en el expediente (2026-11-07) · 25,9 KB
- `docs/conocimiento/expedientes/modulo-lifecycle-de-expedientes.md` — Módulo Lifecycle de Expedientes (2026-05-20) · 6,7 KB
- `docs/conocimiento/expedientes/pasar-a-doc-completa-se-valida-todo.md` — Pasar a DOC. COMPLETA es haberlo VALIDADO TODO (2026-11-05) · 3,4 KB

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
  - **REGLA — en el listado, un completo con lote se ENSEÑA como «EN LOTE», con el lote debajo; en
la BD sigue en DOC. COMPLETA.**
- `docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md`
  - **REGLA — la vía la dice el NÚMERO.**
  - **REGLA — la serie es PROPIA, y el correlativo se busca DENTRO de ella.**
  - **REGLA — la marca de la vía en la OPORTUNIDAD es `inputs.ruta_fm`, nunca `via_fm`.**
  - **REGLA — `documentacion.via_fm` solo lo escribe `PUT /:id/via-fm/datos`.**
  - **REGLA — lo que emite el INSTALADOR no se le reclama al CLIENTE.**
  - **REGLA — lo condicionado no pasa a obligatorio por sí solo.**
  - **REGLA — el Anexo A sustituye al Anexo I solo en los documentos NUEVOS.**
  - **REGLA — los otros cuatro se GENERAN desde el panel y NO se envían.**
  - **REGLA — cada uno firma donde ya firma.**
  - **REGLA — volver a generar un documento firmado pide otra firma.**
  - **REGLA — en un `26RES060FM_N` el CIFO lleva una hoja propia, «Certificado de inercia hidráulica de la
instalación», y el 3.c no se pide como papel aparte.**
  - **REGLA — los litros los DECLARA el instalador y se teclean en Instalación; el específico se CALCULA.**
  - **REGLA — un Convenio firmado ANTES de pasar a la vía no lleva la cláusula.**
  - **REGLA — el Convenio de un FM declara una ficha PRINCIPAL (la FM) y una SUBSIDIARIA (la general), y
autoriza desde la firma a pasar de una a otra sin novarlo.**
  - **REGLA — las cifras son las de la pestaña Económico, no se recalculan.**
  - **REGLA — el convenio FM va en TRES hojas, y en CUATRO con varios cedentes; la firma busca la casilla
por el nº de páginas.**
- `docs/conocimiento/expedientes/modulo-lifecycle-de-expedientes.md`
  - **REGLA**
- `docs/conocimiento/expedientes/pasar-a-doc-completa-se-valida-todo.md`
  - **REGLA — antes de cambiar el estado a DOC. COMPLETA, se VALIDA cada documento firmado, uno por
uno, como el ✓ de la pestaña Documentación.**
  - **REGLA — después, y solo después, el cambio de estado**
  - **REGLA — un 409 de firma rota PARA.**

<!-- generado:fin -->
