---
paths:
  - "implementation/frontend/src/features/docs/**"
  - "implementation/backend/services/{reformaUploadService,docsAlcance,uploadNotifier,clasificarFotosService,whatsappMedia,portalService,anexoFotografico*}.js"
  - "implementation/frontend/src/features/calculator/components/DocsAdminModal.jsx"
  - "implementation/frontend/src/features/expedientes/components/AnexoFotografico*.jsx"
  - "implementation/backend/routes/portal.js"
---
# Documentación y fotos — DocsManager, alcance, subida en tanda, buzón, ventanas, fotos del WhatsApp, Anexo Fotográfico (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/documentacion-fotos/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

18. **Miniaturas de Drive — usar el PROXY**: el navegador NO puede hotlinkear de forma fiable las URLs de Drive (`lh3.googleusercontent.com` / `drive.google.com/thumbnail`) desde la app — fallan en `<img>` aunque den 200 por curl. SIEMPRE servir miniaturas vía `GET /api/public/reforma-thumb/:uuid/:driveId?token=&sz=` (mismo origen). NO volver a poner URLs de Drive directas en `src`.

19. **reforma_uploads — escritura ATÓMICA**: NUNCA hacer read-modify-write de todo `datos_calculo` para tocar `reforma_uploads` (dos subidas concurrentes se pisan = pérdida de datos). Usar SIEMPRE las RPC `reforma_append` / `reforma_replace_slot` (jsonb_set por slot, bloqueo de fila).

20. **Documentación — Drive es la fuente de verdad**: la vista (`buildDocsView`) RECONCILIA listando la carpeta Drive y fusiona el estado de `reforma_uploads`. No asumir que la BD y Drive están sincronizados; si Drive tiene un fichero, debe aparecer. El estado (validada/rechazada) vive POR FOTO en la entrada de `reforma_uploads`, no por slot.

68. **Las fotos suben en TANDA, se pegan con Ctrl+V y se reparten desde un buzón**: cada foto era su propio POST, y ese POST le pedía a Drive tres cosas **antes de mover un byte** (buscar la subcarpeta · listar el slot para el índice `_N` · en slot único, listar otra vez para borrar la anterior), en serie — porque dos subidas a la vez calculaban el mismo índice y se pisaban el nombre. Ahora `subirFicherosASlot` ([reformaUploadService.js](implementation/backend/services/reformaUploadService.js)) lista **una vez**, reserva los índices de toda la tanda y sube **en paralelo** (tope 4); la subcarpeta se resuelve una vez por proceso (`ensureSubfolderId` — ⚠️ su respaldo es devolver el PADRE cuando falla, y ese caso NO se cachea o todas las fotos caerían en la raíz). Es **fuente única**: `/:slot` (un fichero, que siguen usando los navegadores sin refrescar y el gestor del Anexo Fotográfico) y `/:slot/batch` delegan las dos, o la misma foto se nombraría distinto según por dónde entre. **Una tanda a medias se responde 200 con el parcial** (`items` + `fallidas`): lo que ya está en Drive no puede presentarse como si no hubiera pasado nada. La **miniatura se pinta antes de que responda el servidor** y el botón dice la fase real ("Preparando 3 de 10…" y luego un porcentaje monótono, que es el de UNA petición y no vuelve a cero en cada foto). **Ctrl+V** pega en la tarjeta que señala el ratón, anunciándolo en ella (`hidden md:`: en un móvil no hay portapapeles). Soltar **fuera** de una casilla abre el **BUZÓN** ([BuzonFotos.jsx](implementation/frontend/src/features/docs/BuzonFotos.jsx)): un modelo propone el apartado de cada foto y dice qué ha visto, y la persona confirma — el prompt lleva dentro el checklist REAL de ese expediente y **una clave que no esté en él se descarta**, la foto queda "sin clasificar" y no se sube; el cajón "Otros" no se propone nunca. A clasificar va una copia **muy reducida** (768 px: se reconoce el aparato, no se lee su serie) y **con `pensar: true`**, al revés que los lectores que transcriben; en tandas de 12, porque con más el modelo confunde el orden de las imágenes con el de las respuestas. Cuando reconoce algo para lo que ESTE expediente no tiene apartado (una ventana en un RES060) devuelve su **`concepto`** —de `ADDABLE_CONCEPTS`— y el buzón ofrece **añadir el apartado** y colocarlas ahí, en vez de dejar un hueco mudo. ⚠️ Los `objectURL` de las miniaturas se crean **dentro del efecto**: creados en el inicializador de `useState`, el cleanup de StrictMode los revocaba y al remontar el estado se RESTAURA en vez de recalcularse — las trece miniaturas salían rotas y no había nada que revisar. Acierto medido sobre las fotos de ejemplo del tutorial: **7/7**, 0,005 € la tanda (`node implementation/backend/scripts/probar_clasificar_fotos.js`). Y **📩 Pedírsela** en cada casilla vacía manda el enlace filtrado `?need=` con el mensaje en lenguaje de cliente, **refrescando antes la lista de lo que falta** — si no, se le reclama lo que acaba de subir. Dos huecos de alcance cerrados: **`FOTO_HIBRIDACION`** (lo que define un RES093/TER173 son las dos máquinas conectadas, y eso no lo enseña ninguna otra foto; entra también en el mapa explícito del Anexo Fotográfico) y el **depósito de ACS que va DENTRO de la unidad interior**, que se retira solo si el expediente lo afirma y solo si está vacío (`acsEquipoPropio`, por la MÁQUINA y no por el flag — regla 12.c). Y cada apartado declara su **DESTINO** (`destinoDeSlot`): `CEE` —lo que el certificador necesita para modelar la vivienda: fachada desde la calle, patios, vídeo, planos, CEE anterior— o `EXPEDIENTE` —lo que justifica la actuación—. ⚠️ En un RES080 la ENVOLVENTE es del EXPEDIENTE, no del certificado. De ahí salen los dos bloques del panel, los dos botones de petición rápida y el titular que le explica al cliente PARA QUÉ se le pide (solo si todo lo pedido es del mismo destino: mezclado sería mentir a medias). **Lo `optionalAlways` no se reclama** —el CEE anterior se OFRECE— y **lo del DESPUÉS no se preselecciona mientras la obra no esté terminada**. El parte diario lo vigila con **`CEE_SIN_MATERIAL`** (16 expedientes en producción al estrenarlo, el más viejo de 160 días): el detector mira `reforma_uploads` —Drive de 150 expedientes sería una llamada por cada uno— y el MENSAJE lo compone `faltantesPorDestino`, que sí reconcilia con Drive y puede acabar diciendo que no falta nada. Y el botón **«Fotos» del expediente abre este gestor**, no el del Anexo Fotográfico (decisión del usuario, 2026-09-21: aquí se viene a subir y a pedir; a ordenar y comentar se entra desde el propio Anexo). ⚠️ **Medio minuto de espera no puede ser una pantalla quieta**: mientras clasifica sale [ClasificandoFotos](implementation/frontend/src/features/docs/ClasificandoFotos.jsx) —SVG y `@keyframes`, nunca un GIF—, con el número DE VERDAD en la fase que se puede contar (reducir las fotos ocurre en el navegador) y por TIEMPO lo del servidor, parándose en el último rótulo en vez de dar la vuelta. ⚠️ En SVG el `scale` pivota sobre el ORIGEN DEL VIEWBOX: sin `transform-box: fill-box` la foto salía disparada en diagonal en vez de encoger donde estaba. ⚠️ Y el **desplegable de cada fila se leía blanco sobre blanco** —el popup de un `<select>` lo pinta el navegador con el esquema del SISTEMA y ahí hereda el `text-white` de la app—: se arregla declarando **`color-scheme`** (`dark` en `:root`, `light` en `.theme-light`), que de paso pinta en oscuro las barras de scroll y los iconos de fecha de toda la app, más dos reglas explícitas de `option`. No era del buzón: le pasaba a cualquier `<select>`. Tras tocarlo: `node implementation/backend/scripts/test_docs_fotos.js`. Ver "El gestor de FOTOGRAFÍAS".

68.b **Las fotos que el cliente manda al WHATSAPP se TRAEN al repartidor con un botón** (💬 Traer fotos del WhatsApp, gestor de documentación, solo staff y solo CAE): se eligen chats y periodo, se lista lo llegado y lo marcado se baja y entra en `BuzonFotos`, que propone y espera confirmación. Se lee WhatsApp Web DIRECTAMENTE —nunca `fetchMessages`/`downloadMedia` de la librería, rotos por el `serialize()`—, en fila y con plazo; **solo se baja lo de un chat leído para ESE expediente** (el chat va dentro del id del mensaje) y no se crean chats. Lo del cliente viene marcado; el chat del instalador, sin marcar y con aviso. Lo colocado se apunta en `whatsapp_media_importada` (pista, no candado) y sale "ya colocada" o "en otra obra". Fuente única: [whatsappMedia.js](implementation/backend/services/whatsappMedia.js). Tras tocarlo: `node implementation/backend/scripts/test_whatsapp_media.js`. ⚠️ Lo que corre dentro de la sesión (`LEER_CHAT`, `BAJAR`) solo se puede probar en el VPS. Ver "Traer las fotos del WHATSAPP al repartidor".

68.c **Las fotos de las VENTANAS van ventana por ventana** (RES080 y cualquier expediente con ventanas): una tarjeta por ventana con su antes y su después, y en el después la ventana VIEJA al lado («Así estaba»). La ventana va EN CADA FOTO (`ventana: 'V3'`, `ventana_nombre`) dentro de `reforma_uploads`, sin lista aparte; el id no se reutiliza. El apartado del después solo está hecho con TODAS las ventanas, y subir una no avanza el paso guiado. Las fotos sin ventana se enseñan para colocarlas. El Anexo Fotográfico las ordena y rotula por ventana. Fuente única: [logic/ventanasObra.js](implementation/frontend/src/features/docs/logic/ventanasObra.js). Tras tocarlo: `node implementation/backend/scripts/test_ventanas_obra.mjs` y `test_ventanas_subida.js`. Ver "Las VENTANAS, ventana por ventana".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/documentacion-fotos/el-anexo-fotografico-de-un-res080-ve-la-envolvente.md` — El Anexo Fotográfico de un RES080 ve la ENVOLVENTE (2026-09-07) · 1,9 KB
- `docs/conocimiento/documentacion-fotos/el-bloque-del-parte-sin-las-fotos-no-hay-certificado.md` — El bloque del parte: sin las fotos, no hay certificado · 1,7 KB
- `docs/conocimiento/documentacion-fotos/el-boton-fotos-del-expediente-abre-el-gestor-de-documentacion.md` — El botón «Fotos» del expediente abre el gestor de DOCUMENTACIÓN · 0,9 KB
- `docs/conocimiento/documentacion-fotos/el-buzon-medido.md` — El buzón, medido (2026-09-21) · 2,9 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/00-el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir.md` — El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21) · 1,4 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/ctrl-v-pega-en-el-apartado-que-senala-el-raton.md` — Ctrl+V pega en el apartado que señala el ratón · 0,9 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/dos-huecos-del-alcance.md` — Dos huecos del alcance · 2,0 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/el-buzon-se-sueltan-todas-y-se-reparten.md` — El BUZÓN: se sueltan todas y se reparten · 2,1 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/la-subida-va-en-tanda-no-foto-a-foto.md` — La subida va en TANDA, no foto a foto · 2,5 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/las-ventanas-ventana-por-ventana.md` — Las VENTANAS, ventana por ventana (2026-09-30) · 4,8 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/pedir-la-foto-que-falta-desde-la-foto-que-falta.md` — Pedir la foto que falta, desde la foto que falta · 1,2 KB
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/traer-las-fotos-del-whatsapp-al-repartidor.md` — Traer las fotos del WHATSAPP al repartidor (2026-09-30) · 4,9 KB
- `docs/conocimiento/documentacion-fotos/medio-minuto-de-espera-no-puede-ser-una-pantalla-quieta.md` — Medio minuto de espera no puede ser una pantalla quieta (2026-09-22) · 2,3 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/00-modulo-documentacion-fotografica-superficie-unificada.md` — Módulo Documentación Fotográfica — Superficie unificada (2026-05-29) · 0,6 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/alcance-documental-a-cada-expediente-se-le-pide-lo-suyo.md` — Alcance documental — a cada expediente se le pide LO SUYO (2026-08-11) · 6,6 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/almacenamiento-incremental-sin-esquema-nuevo.md` — Almacenamiento (incremental, sin esquema nuevo) · 0,8 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/aviso-al-staff-cuando-suben-documentacion.md` — Aviso al staff cuando suben documentación (2026-07-30) · 1,6 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/checklist-por-fases-computado-no-persistido.md` — Checklist por fases (computado, NO persistido) · 0,7 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/componente-nucleo-docsmanager.md` — Componente núcleo: `DocsManager` · 0,9 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/el-enlace-del-cliente-se-usa-con-el-movil.md` — El enlace del cliente se usa CON EL MÓVIL (2026-08-11) · 9,1 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/endpoints.md` — Endpoints · 1,0 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/migracion-sql-ya-en-produccion.md` — Migración SQL (ya en producción) · 0,4 KB
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/notificacion-de-rechazo.md` — Notificación de rechazo · 0,6 KB
- `docs/conocimiento/documentacion-fotos/para-el-certificado-o-para-el-expediente-no-es-lo-mismo.md` — Para el CERTIFICADO o para el EXPEDIENTE: no es lo mismo (2026-09-21) · 2,7 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/documentacion-fotos/el-anexo-fotografico-de-un-res080-ve-la-envolvente.md`
  - **REGLA — el alcance se resuelve en `syncEnvolventeAndReload`**
- `docs/conocimiento/documentacion-fotos/el-bloque-del-parte-sin-las-fotos-no-hay-certificado.md`
  - **REGLA — el detector mira `reforma_uploads`; el MENSAJE se compone mirando
DRIVE.**
  - **REGLA — solo se reclama lo IMPRESCINDIBLE**
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/el-buzon-se-sueltan-todas-y-se-reparten.md`
  - **REGLA — el modelo mira, el código valida y la persona confirma.**
  - **REGLA — a clasificar se manda una copia MUY reducida**
  - **REGLA — aquí SÍ se piensa**
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/la-subida-va-en-tanda-no-foto-a-foto.md`
  - **REGLA — se lista Drive UNA vez por tanda, se reservan los índices y se sube en
paralelo.**
  - **REGLA — la subcarpeta se resuelve una vez POR PROCESO**
  - **REGLA — las dos rutas comparten la MISMA función.**
  - **REGLA — una tanda a medias se responde 200 con el parcial.**
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/las-ventanas-ventana-por-ventana.md`
  - **REGLA — la ventana va EN LA FOTO, no en una lista aparte.**
  - **REGLA — en el DESPUÉS, la ventana VIEJA al lado**
  - **REGLA — nada se esconde.**
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/pedir-la-foto-que-falta-desde-la-foto-que-falta.md`
  - **REGLA — la lista de lo que falta se REFRESCA al abrir el popup.**
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/traer-las-fotos-del-whatsapp-al-repartidor.md`
  - **REGLA — se habla con WhatsApp Web DIRECTAMENTE**
  - **REGLA — de una en una y con plazo**
  - **REGLA — solo se baja lo que salió de un chat leído para ESE expediente.**
  - **REGLA — lo recomendado es lo del CLIENTE**
  - **REGLA — lo colocado se APUNTA, y es una pista, no un candado.**
  - **REGLA — MOBILE FIRST, y cómodo en el PC.**
- `docs/conocimiento/documentacion-fotos/medio-minuto-de-espera-no-puede-ser-una-pantalla-quieta.md`
  - **REGLA — la primera fase lleva el número DE VERDAD.**
  - **REGLA — el dibujo es SVG y `@keyframes`, nunca un GIF**
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/alcance-documental-a-cada-expediente-se-le-pide-lo-suyo.md`
  - **REGLA — manda el EXPEDIENTE; la oportunidad es el punto de partida.**
  - **REGLA — el apartado que no procede DESAPARECE, no se queda "opcional".**
  - **REGLA — los RADIADORES ya no se fotografían.**
  - **REGLA — el GENERADOR de calor actual se documenta SIEMPRE, arda o no.**
  - **REGLA — el ACS inicial se pide según QUÉ APARATO calienta hoy el agua.**
  - **REGLA — el ACS INICIAL no es lo mismo que "se cambia el ACS".**
  - **REGLA — lo que define la ACTUACIÓN va PRIMERO; el contexto, detrás.**
  - **REGLA — un apartado de OTRO emisor se retira (`SLOT_EMISOR` / `emisorDesencaja`).**
  - **REGLA — el checklist se pide SIEMPRE por `checklistForOportunidad(opp)`**
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/el-enlace-del-cliente-se-usa-con-el-movil.md`
  - **REGLA — lo PRESCINDIBLE no se le pide a un expediente EN CURSO.**
  - **REGLA — al cliente se le habla en LENGUAJE DE CASA, y las etiquetas técnicas NO se tocan.**
- `docs/conocimiento/documentacion-fotos/para-el-certificado-o-para-el-expediente-no-es-lo-mismo.md`
  - **REGLA — el destino es un ATRIBUTO del slot**
  - **REGLA — lo `optionalAlways` NO se reclama.**
  - **REGLA — mientras la obra no esté terminada, lo del DESPUÉS no se preselecciona.**

<!-- generado:fin -->
