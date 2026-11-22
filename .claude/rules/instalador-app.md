---
paths:
  - "implementation/frontend/src/features/instalador/**"
  - "implementation/frontend/src/demo/instaladorDemo.jsx"
  - "implementation/frontend/instalador-demo.html"
  - "implementation/backend/routes/instaladorApp.js"
  - "implementation/backend/utils/appInstalador.js"
  - "implementation/backend/scripts/test_app_instalador.js"
  - "implementation/backend/scripts/test_app_instalador_no_regresion.js"
  - "implementation/backend/utils/llaveObra.js"
  - "implementation/backend/services/catalogoTarifas.js"
  - "implementation/backend/routes/aerotermiaTarifas.js"
  - "implementation/backend/scripts/test_catalogo_instalador.js"
  - "implementation/backend/scripts/test_equipo_inicial_catalogo.mjs"
  - "implementation/frontend/src/features/landing/data/equipoInicial.js"
  - "implementation/frontend/public/instalador/**"
  - "implementation/backend/scripts/test_navegacion_instalador.mjs"
  - "implementation/backend/services/presupuestoInstaladorService.js"
  - "implementation/backend/services/presupuestoGrupoWhatsapp.js"
  - "implementation/backend/services/presupuestoPedidoCerebro.js"
  - "implementation/backend/services/viviendaCandidata.js"
  - "implementation/backend/scripts/presupuesto_instalador_cli.js"
  - "implementation/backend/scripts/probar_presupuesto_wa.js"
  - "implementation/backend/scripts/test_presupuesto_instalador.js"
  - "implementation/backend/scripts/test_presupuesto_grupo_whatsapp.js"
  - "implementation/backend/scripts/instalador_presupuestos_schema.sql"
---
# App del instalador — la app nueva del rol INSTALADOR (beta): obras en 5 pasos, Inicio, Obras y Clientes (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/instalador-app/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

230. **La app del INSTALADOR la decide UN interruptor y lee UNA tabla de pasos; nunca enseña dinero interno** (2026-11-21, Fran: rediseño para el instalador, beta RCA). Quién entra: `enBetaInstalador(user)` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) — rol INSTALADOR y su `prescriptor_id` en `APP_INSTALADOR_BETA` (sin la variable, nadie; el DISTRIBUIDOR nunca) —; `/api/usuarios/me` lo devuelve como `app_instalador` y `App.jsx` monta `HostInstalador` EN LUGAR del `DashboardLayout`, así que todos los demás ven lo de siempre. Una obra es oportunidad + expediente con **5 pasos** (Simulada · Propuesta · Aceptada · Trámite · Cobro) y **quién tiene la pelota** (`tu`/`nos`/`cli`/`fin`), calculados SOLO en `pasoDeObra` (la tabla, escrita en el documento, es coherente con `estadoOportunidad.js` y el test lo comprueba con todos los estados); las tareas (firmar el CIFO, subir el RITE, hacer la factura) solo si su empresa es la INSTALADORA, con su destino decidido en el backend (desde la fase 2, una acción dentro de la obra y sin token: regla 231). La API `/api/instalador-app` va con `enforceAuth` + la beta, solo lo suyo (el `or` de `soloLoSuyo`), **404** a lo ajeno, **503** con la BD caída, escalares en lista blanca y **nunca** margen, comisión, `via_fm`, notas internas, comisionista ni enlaces de Drive (reglas 1, 102 y 218). Las pantallas, estilo «carta de pago» SIN modo oscuro, CSS `.ia-`, piezas comunes en `features/instalador/ui/` para las fases 2 y 3. Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_rutas_sin_sesion.js`, `test_rutas_partner.js`, `npm run build` y el banco `instalador-demo-5187` (sin API). Ver "La app del INSTALADOR, fase 1".

231. **En la app del instalador, cada acción de la obra se DESPACHA a la ruta de siempre; la app solo pone el guardián, la credencial y el saneado** (2026-11-21, Fran: «que lo haga todo dentro, sin enlaces»). Presupuesto, factura (plantilla o subida), CIFO, RITE, declaración FM y fotos van por `/api/instalador-app/obras/:id/…` y `/docs/:id/…` ([routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), `despachar`), que llaman DENTRO del servidor a `routes/public.js`, `facturaInstalador.js` y los anexos de `oportunidades.js`: re-firma, rechazo, bloqueo, OCR y RPC de merge (19, 22) son el mismo código que el enlace; **no se escribe un segundo camino**. Guardián: `enforceAuth` + beta + `obraSuya` (**404** a lo ajeno o RECHAZADO) y, para firmar, RITE, FM y factura, `soloInstaladora` (**403 `NO_ES_INSTALADORA`**). El `upload_token` lo pone el SERVIDOR y **nunca viaja al navegador** (lo que mande el navegador como `token`/`llave` se descarta; sin token, 409); toda respuesta pasa por `sanear` (fuera claves `*link`/`*url`/`token` y enlaces de Drive, regla 1) y los ficheros van por proxy. Las miniaturas, con la **llave** de [utils/llaveObra.js](implementation/backend/utils/llaveObra.js) (HMAC sobre el nº de la obra, 12 h, solo ficheros de ESA obra): `/thumb` y `/fichero` son las únicas rutas abiertas, a propósito. **Borrar solo si el fichero está en ese apartado de esa obra** (desde el 21/11/2026 la pública también lo comprueba, regla 232; la app es más estricta: solo lo apuntado en la BD). El instalador no valida ni rechaza. Los envíos con `SendActionOverlay`, salvo el gestor de fotos, que conserva su subida en tanda (68); tras cada acción la obra se refresca. Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_app_instalador_no_regresion.js`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?obra=…&accion=…`, `?fallo=1`). Ver "La app del INSTALADOR, fase 2".

233. **«Tu página web»: el instalador PROPONE fotos y textos para su ficha de brokergy.es y nada sale en público hasta que un ADMIN lo aprueba; en lo público, cero datos del cliente** (2026-11-21, Fran: fase 3, beta RCA). Cada foto de `instalador_fotos_escaparate` lleva `estado` **PENDIENTE · PUBLICADA · NO_VALE**; la propuesta nace PENDIENTE con `consentimiento_cliente = false` y el permiso que marca el instalador aparte (`permiso_cliente`, **400 `PERMISO_CLIENTE`** sin él), y TODA ruta pública (`/red/:slug/pagina`, `/instaladores/:slug/fotos`, `/foto/:id`) y la estrella del gestor filtran por `PUBLICADA`. Los textos propuestos van a `instalador_textos_escaparate` (uno vivo por instalador) y los vigentes siguen en `prescriptores`; se rechazan teléfono, correo, web y precio con un mensaje que dice qué quitar (`textoProhibido` / `validarTextos` en [services/escaparateService.js](implementation/backend/services/escaparateService.js)). El instalador, con `enforceAuth` + la beta y SIEMPRE su `prescriptor_id`: fotos solo de las obras que **instala** (**403 `NO_ES_INSTALADORA`**; ajena, 404), solo las que existen en su `reforma_uploads`, todo o nada e idempotente; las sueltas, tipo por los BYTES, ≤ 10 MB, a `DRIVE_FOLDER_ESCAPARATE` (sin él no se sube nada) y solo el `driveId` en la BD (regla 21); miniaturas por proxy con llave `esc-<empresa>` (la única ruta abierta nueva). La cola ([routes/escaparateRevision.js](implementation/backend/routes/escaparateRevision.js)) la ve el equipo (`staffOnly`), **aprueba y rechaza solo ADMIN** (motivo obligatorio), y aprobar una foto de obra es `publicarFotoDeObra`, el MISMO camino que «Publicar en el escaparate». La API pública es una LISTA BLANCA con `assertAnonymous`: solo el pueblo, nunca `drive_id`, obra, cliente, importes, margen ni nº de serie; slug y quién sale con el criterio de `red.mjs`. Avisos detrás de `ESCAPARATE_AVISOS_ENABLED` (apagado; en esta fase no se envía nada). **El SQL ([escaparate_revision_schema.sql](implementation/backend/scripts/escaparate_revision_schema.sql)) va ANTES del deploy** y quita a `anon`/`authenticated` los privilegios que tenían en las tablas `instalador_*` (regla 150). Tras tocarlo: `node implementation/backend/scripts/test_escaparate_instalador.js`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?seccion=pagina&pagina=…`, `?cola=1`). Ver "La app del INSTALADOR, fase 3".

234. **El CATÁLOGO del instalador: BROKERGY carga la tarifa del distribuidor por Excel en DOS pasos y sin crear modelos; el instalador ve SOLO sus marcas, la tarifa vigente y SU precio** (2026-11-21, Fran: fase 4, beta RCA; escrita en la fase 5, la fase 4 la citaba sin haberla puesto aquí). Carga `adminOnly` en [routes/aerotermiaTarifas.js](implementation/backend/routes/aerotermiaTarifas.js) (montada ANTES que `/api/aerotermia`): `POST /leer` en seco devuelve el plan y su `firma`; `POST /confirmar` relee el MISMO fichero y solo escribe si el plan coincide (**409 `PLAN_CAMBIADO`**); se casa por marca + referencia normalizada (`norm` en [services/catalogoTarifas.js](implementation/backend/services/catalogoTarifas.js)), lo AMBIGUO se elige entre SUS candidatos y lo que no casa NO se carga; una fila IGUAL no se reinserta; el Excel no se guarda (nombre y sha256). Vigente = la de `vigente_desde` más reciente ya empezada. El instalador (`/api/instalador-app/catalogo…`, `enforceAuth` + beta): `marcas_autorizadas` como `routes/aerotermia.js`, **sin marcas, ningún equipo**; DTO en lista blanca (`equipoParaInstalador`), la ficha por proxy, su precio siempre con SU `prescriptor_id`; sin tarifa, «Sin tarifa todavía», nunca 0. «Calcular una obra con este equipo» abre la Nueva simulación de siempre con el modelo y su precio + 21 % IVA editable, y el SCOP de `scopsParaClima` ([equipoInicial.js](implementation/frontend/src/features/landing/data/equipoInicial.js)). El SQL ([aerotermia_tarifas_schema.sql](implementation/backend/scripts/aerotermia_tarifas_schema.sql)) va ANTES del deploy. Tras tocarlo: `node implementation/backend/scripts/test_catalogo_instalador.js`, `test_equipo_inicial_catalogo.mjs`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?seccion=catalogo`, `?equipo=101`, `?tarifa=1`). Ver "La app del INSTALADOR, fase 4".

236. **La app del instalador RECUERDA dónde estás en la dirección, avisa sin red, se instala y lleva SU marca, sin cambiar nada para los demás** (2026-11-21, Fran: fase 5, beta RCA). En la dirección viajan SOLO `seccion`, `obra`, `accion`, `cliente`, `equipo` y —desde el 22/11/2026— `presupuesto` (un uuid o `nuevo`, regla 238), cada uno con su forma ([ui/direccion.js](implementation/frontend/src/features/instalador/ui/direccion.js)): nunca un nombre, una dirección, un DNI ni un token; lo que no casa se ignora. Cada ficha es una entrada del historial (`iaFicha`, la `pila` de la regla 231); recargar la reabre sin empujar más y un enlace directo empuja la ficha sobre su sección («atrás» vuelve a la lista, no fuera); `App.jsx` guarda la dirección de CARGA (`direccionDeCarga`) antes de que su efecto de la URL la toque, para que valga tras iniciar sesión, y ese efecto no cambia para quien no es `app_instalador`. Sin red o con la BD caída se DICE y se deja reintentar (franja «Sin conexión», `AvisoError` con «Volver a intentarlo», recarga sola al volver la red): nunca en blanco ni a cero (38). El manifest de `public/instalador/`, el color de la barra y el `apple-touch-icon` los pone **solo** [ui/cabeceraApp.js](implementation/frontend/src/features/instalador/ui/cabeceraApp.js) al montar la app y los quita al desmontarla (`index.html` no se toca); **sin service worker**; la invitación a instalarla, solo en el móvil y descartable. Nombre e icono de la app instalada: BROKERGY para todos (uno por instalador pediría servir su manifest sin sesión). Dentro: su logo + su nombre «con BROKERGY» y su `landing_color_primary` SOLO en lo que marca «dónde estoy», y solo si pasa **4,5:1 sobre blanco, crema y `#f1efeb`** ([ui/marca.js](implementation/frontend/src/features/instalador/ui/marca.js)); si no, el de BROKERGY; la acción principal sigue naranja. Hojas con teclado (`useHojaTeclado`: foco dentro, Tab atrapado, Escape, foco devuelto) y «Ir al contenido». Publicarla y meter al siguiente: [publicar-la-app-del-instalador.md](docs/conocimiento/instalador-app/publicar-la-app-del-instalador.md). Tras tocarlo: `node implementation/backend/scripts/test_navegacion_instalador.mjs`, `test_app_instalador.js`, `npm run build` y el banco a 360/390/1280 px (`?marca=1`, `?marca=claro`, `?instalar=iphone`, `?sinred=1`, `?obra=NOEXISTE`). Ver "La app del INSTALADOR, fase 5".

237. **TODA obra se abre en SU ficha, tenga o no expediente, con «Todo lo de esta obra» en UNA lista; la propuesta se VE y se PASA desde dentro, pero enviarla sigue siendo nuestro** (2026-11-21, Fran entrando como RCA: «cuando pulso sobre una de mis obras me lleva a la vista de la oportunidad… para ver todo, la factura, etc.»; 6 de sus 11 obras no tenían expediente). `abrirObra` no mira `con_expediente`; la calculadora solo se abre desde «Corrige el cálculo» (`se_puede_corregir`: sin expediente y paso ≤ 2). La lista la arma el SERVIDOR (`caminoDeObra` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js)): propuesta · presupuesto · CEE inicial · factura · certificado de la instalación · RITE · fotos · CEE final · bono, cada fila con su tono (`ok` · `tu` · `nos` · `luego` = aún no toca · `info` = las fotos, que no cuentan) y su `accion` (sin ella no se pulsa); quien NO instala no ve el certificado ni el RITE. **Sin enviar (LEAD, PTE ENVIAR) la pelota es NUESTRA**: el instalador no puede enviar la propuesta (botones de ADMIN, `send-proposal`/`send-media` son `staffOClaveInterna`, regla 102), y la tarea «Envía la propuesta» de la fase 1 le llevaba a una calculadora sin botón de enviar. **ENVIADA le toca a él solo si le llegó SOLO a él** (`entregaPropuesta`, la misma del listado interno, regla 136): «Pásale la propuesta a tu cliente», con un `wa.me` desde SU WhatsApp y el enlace `/firma/<uuid>` de siempre (la app no envía nada); «Ya se la he pasado» apunta un envío `{ channel: 'instalador', modo: 'CLIENTE' }` en la versión vigente —⚠️ `propuesta_version_merge` SUSTITUYE `envios`: va la lista que había más el nuevo— y la obra pasa a «Espera al cliente». De `propuesta_versiones` (lleva teléfonos y correos) solo sale una lista blanca (`propuestaDe`); el PDF, por proxy, es el `drive_id` de la versión ACEPTADA si está sellada o de la vigente, y la ruta no acepta ids del navegador. Sin expediente el equipo es el del cálculo, dicho «previsto». Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_navegacion_instalador.mjs`, `test_entrega_propuesta.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?obra=26RES060_OP904`, `…OP902`, `&accion=propuesta`). Ver "La ficha de la OBRA es la misma con expediente y sin él".

238. **El PRESUPUESTO del instalador lo hace la app en SU plantilla (la de su factura, con otro fondo), el emisor es ÉL, y por WhatsApp el modelo solo EXTRAE** (2026-11-22, Fran: «que al igual que la simulación y la factura, pueda hacer un presupuesto… incluso por WhatsApp», beta RCA). El texto predefinido y las cuentas viven en UN módulo puro, [logic/presupuesto.js](implementation/frontend/src/features/instalador/logic/presupuesto.js), que usan la app, el servidor (`import()`) y el agente del grupo: la 1.ª línea con la redacción del consejo de factura SIN nº de serie ni corchetes, los extras de los presupuestos de RCA y el remate; un precio para toda la obra por defecto; `con_iva` saca la base y el total es el dicho. El PDF: `componerPdf(…, { tipo: 'presupuesto' })` con el fondo `plantilla.json → presupuesto.fondo` (su mismo Word con FACTURA → PRESUPUESTO exportado en blanco; mismas posiciones) y, sin plantilla, la hoja GENÉRICA: nunca falla por no tenerla; la rama de la factura no cambia. Tabla `instalador_presupuestos` (el PDF no se guarda, regla 21; **el SQL va ANTES del deploy**): el `prescriptor_id` lo pone SIEMPRE el servidor, **404** a lo ajeno, el cliente tiene que ser SUYO (`resolverCliente`: DNI → teléfono → nombre; varios, `CLIENTE_AMBIGUO`; ninguno, se da de alta), un nº por instalador (409 `NUMERO_REPETIDO` con `sugerido`). Rutas `/api/instalador-app/presupuestos…` con `enforceAuth` + beta y `sanear`; la vista previa no guarda ni gasta número. **«Envíamelo por WhatsApp» va al teléfono de SU ficha, nunca a uno del navegador**, con el mensaje para el cliente de pie: lo reenvía él (la app no escribe a su cliente, regla 237). **«Calcular el bono CAE» abre la «Nueva simulación» de siempre ya rellena y la vivienda se CONFIRMA en su paso de la fachada y los vecinos**; al crearse se liga (`vincular`: PDF a `DOC_PRESUPUESTO` + nota en el historial) y **ligar a una oportunidad que ya existía NO cambia `inputs.presupuesto`**. El agente del grupo ([presupuestoGrupoWhatsapp.js](implementation/backend/services/presupuestoGrupoWhatsapp.js)): solo los grupos de `PRESUPUESTO_WA_GRUPOS` y, dentro, los teléfonos de la ficha de ese instalador y `PRESUPUESTO_WA_PROBADORES`; solo escribe al `chatId` configurado; el texto del instalador es DATO (modelo sin herramientas, JSON validado en código; suscripción por `/extraer` del vigía o API); **sin cliente, se pide antes de nada**; la simulación exige confirmar la vivienda con la FOTO del Catastro (Google → Catastro EN SERIE, reglas 15-17), no duplica una casa que ya tiene oportunidad y se ENCARGA al asistente con un texto compuesto por el CÓDIGO (la propuesta no sale sin el «sí» de Fran). **Nace APAGADO y, encendido, en modo COPIA** (no escribe al grupo ni guarda); franja de la casa, tope diario, cada mensaje una vez; apagado en el `.env` local. Tras tocarlo: `node implementation/backend/scripts/test_presupuesto_instalador.js`, `test_presupuesto_grupo_whatsapp.js`, `test_factura_instalador.js`, `test_app_instalador.js`, `test_navegacion_instalador.mjs`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?seccion=presupuestos`, `?presupuesto=nuevo`). Ver "El PRESUPUESTO del instalador".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/instalador-app/app-del-instalador-fase-1.md` — La app del INSTALADOR, fase 1: cáscara, Inicio, Obras y Clientes en solo lectura (2026-11-21) · 11,8 KB
- `docs/conocimiento/instalador-app/app-del-instalador-fase-2.md` — La app del INSTALADOR, fase 2: la obra se HACE dentro de la app, con sesión y sin enlaces (2026-11-21) · 9,1 KB
- `docs/conocimiento/instalador-app/app-del-instalador-fase-3.md` — La app del INSTALADOR, fase 3: «Tu página web», el escaparate que propone el instalador y revisa BROKERGY (2026-11-21) · 15,3 KB
- `docs/conocimiento/instalador-app/app-del-instalador-fase-4.md` — La app del INSTALADOR, fase 4: el CATÁLOGO de aerotermia con TARIFAS (2026-11-21) · 8,3 KB
- `docs/conocimiento/instalador-app/app-del-instalador-fase-5.md` — La app del INSTALADOR, fase 5: pulida, recordando dónde estás, instalable y con su marca (2026-11-21) · 11,7 KB
- `docs/conocimiento/instalador-app/el-presupuesto-del-instalador.md` — El PRESUPUESTO del instalador: en su plantilla, desde la app o pidiéndolo por WhatsApp (2026-11-22) · 15,2 KB
- `docs/conocimiento/instalador-app/la-ficha-de-la-obra-para-toda-obra.md` — La ficha de la OBRA es la misma con expediente y sin él, y la propuesta se ve y se pasa desde dentro (2026-11-21) · 9,2 KB
- `docs/conocimiento/instalador-app/publicar-la-app-del-instalador.md` — Publicar la app del INSTALADOR (y meter al siguiente en la beta) (2026-11-21) · 12,8 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/instalador-app/app-del-instalador-fase-1.md`
  - **REGLA — quién ve la app nueva lo decide UN sitio: `enBetaInstalador(user)` en `utils/appInstalador.js`.**
  - **REGLA — la app del instalador nunca recibe margen, comisión, `via_fm`, notas internas, comisionista ni
enlaces de Drive (reglas 1, 102 y 218, y la de `via_fm` de cálculo), y ningún JSONB entero (regla 22).**
- `docs/conocimiento/instalador-app/app-del-instalador-fase-2.md`
  - **REGLA — cada acción de la app se despacha, dentro del servidor, a la MISMA ruta que usa hoy el enlace
por token; la app no tiene un segundo camino para firmar, subir o facturar.**
  - **REGLA — borrar una foto solo se deja si ese fichero está apuntado en ESE apartado de ESTA obra.**
- `docs/conocimiento/instalador-app/app-del-instalador-fase-3.md`
  - **REGLA — lo que propone el instalador nace EN REVISIÓN y no sale en ningún sitio público hasta que un
ADMIN lo aprueba; aprobar una foto de obra es el MISMO camino que el botón «Publicar en el escaparate».**
  - **REGLA — esta respuesta se revalida SIEMPRE (`no-cache`), no se guarda cinco minutos**
- `docs/conocimiento/instalador-app/app-del-instalador-fase-4.md`
  - **REGLA — la carga va SIEMPRE en dos pasos, y el Excel NUNCA crea un modelo.**
  - **REGLA — el instalador ve SOLO sus marcas, la tarifa vigente y SU precio; nunca el distribuidor, el margen,
la comisión, otro instalador ni un enlace de Drive.**
- `docs/conocimiento/instalador-app/app-del-instalador-fase-5.md`
  - **REGLA — en la dirección viajan SOLO `seccion`, `obra`, `accion`, `cliente`, `equipo` y `presupuesto`
(este último desde el 22/11/2026: un uuid o `nuevo`; ver «El PRESUPUESTO del instalador»), cada uno con su
forma; nunca un nombre, una dirección, un DNI ni un token.**
  - **REGLA — sin red o con la BD caída, la app lo DICE y deja reintentar; nunca una pantalla en blanco ni
una cifra a cero**
  - **REGLA — el manifest, el color de la barra y el icono de la app del instalador se ponen SOLO al montar
su app ([ui/cabeceraApp.js](implementation/frontend/src/features/instalador/ui/cabeceraApp.js)) y se
quitan al desmontarla; `index.html` sigue con el de todos.**
  - **REGLA — su color solo se usa si pasa AA (4,5:1) sobre los TRES fondos donde va (blanco, crema y el gris
de la casilla activa); si no, se oscurece un poco y, si ni así, se queda el de BROKERGY**
- `docs/conocimiento/instalador-app/el-presupuesto-del-instalador.md`
  - **REGLA — el texto predefinido y las cuentas del presupuesto viven en UN módulo puro,
[logic/presupuesto.js](implementation/frontend/src/features/instalador/logic/presupuesto.js), que usan
la app, el servidor (`import()`) y el agente de WhatsApp: lo que se ve al teclear, lo que se guarda y lo
que sale en el PDF no pueden diferir.**
  - **REGLA — un instalador SIN plantilla (o sin la sección `presupuesto`) también puede presupuestar: sale
la hoja GENÉRICA**
  - **REGLA — el `prescriptor_id` lo pone SIEMPRE el servidor (la sesión, o el grupo configurado), un
instalador solo ve y toca SUS presupuestos (404 a lo ajeno) y el cliente tiene que ser SUYO**
  - **REGLA — «Envíamelo por WhatsApp» manda el PDF al teléfono DEL PROPIO instalador (el de su ficha), nunca
a un número que venga del navegador, con el mensaje para el cliente de pie: él lo reenvía tal cual.**
  - **REGLA — «Calcular el bono CAE» abre la «Nueva simulación» de SIEMPRE, ya rellena con el cliente, la
dirección, el equipo y el importe del presupuesto, y la vivienda se CONFIRMA en su paso de siempre
(`ConfirmationCard`: la foto de la fachada y los vecinos ±números).**
  - **REGLA — el modelo solo EXTRAE; la conversación la lleva el CÓDIGO.**
  - **REGLA — solo se atiende a los grupos de `PRESUPUESTO_WA_GRUPOS` y, dentro, a los teléfonos de la ficha
de ese instalador y a los de `PRESUPUESTO_WA_PROBADORES`; solo se escribe al `chatId` del grupo
configurado, jamás a un número sacado de un mensaje.**
  - **REGLA — nace APAGADO (`PRESUPUESTO_WA_ENABLED`) y, encendido, en modo COPIA
(`PRESUPUESTO_WA_MODO=copia`): no escribe en el grupo ni guarda nada; calcula sin guardar y le copia a
Fran lo que habría contestado.**
  - **REGLA — el AUDIO se baja con `whatsappMedia._BAJAR`, nunca con `msg.downloadMedia()`**
- `docs/conocimiento/instalador-app/la-ficha-de-la-obra-para-toda-obra.md`
  - **REGLA — TODA obra se abre en su ficha; la calculadora solo queda detrás de «Corrige el cálculo».**
  - **REGLA — «Todo lo de esta obra» es UNA lista, de la propuesta al cobro, y la arma el SERVIDOR.**
  - **REGLA — sin enviar, la propuesta la llevamos NOSOTROS; el instalador no tiene la tarea de enviarla.**
  - **REGLA — ENVIADA le toca al instalador solo si la propuesta le llegó SOLO a él.**
  - **REGLA — el instalador pasa la propuesta con SU WhatsApp; la app no envía nada.**
  - **REGLA — de la propuesta sale a la app una lista BLANCA; el PDF, por proxy y sin id del navegador.**
  - **REGLA — el detalle se desenvuelve en UN sitio, `obraDeRespuesta` de
`AppInstalador.jsx`, y el demo devuelve la MISMA forma que el servidor y pasa por ella.**
  - **REGLA — dos ejes que se combinan: ETAPA (Oportunidades = pasos 1-2, sin aceptar · En
obra = pasos 3-4 o con expediente · Cobradas = paso 5) y QUIÉN la tiene (Te toca · Espera al cliente · Lo
llevamos nosotros, que se pulsa otra vez para quitarlo), más Pueblo y Tipo (solo si hay más de uno) y
Ordenar (por defecto, lo que te toca primero y dentro lo último movido).**
- `docs/conocimiento/instalador-app/publicar-la-app-del-instalador.md`
  - **REGLA — los dos SQL van ANTES del deploy, y la beta se enciende DESPUÉS de comprobar que los demás
usuarios ven lo de siempre.**
  - **REGLA — un instalador entra en la beta con UNA línea: su `id_empresa` en `APP_INSTALADOR_BETA`; nada
más cambia, y sale quitándolo.**

<!-- generado:fin -->
