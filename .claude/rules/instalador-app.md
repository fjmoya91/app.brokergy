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
---
# App del instalador — la app nueva del rol INSTALADOR (beta): obras en 5 pasos, Inicio, Obras y Clientes (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/instalador-app/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

230. **La app del INSTALADOR la decide UN interruptor y lee UNA tabla de pasos; nunca enseña dinero interno** (2026-11-21, Fran: rediseño para el instalador, beta RCA). Quién entra: `enBetaInstalador(user)` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) — rol INSTALADOR y su `prescriptor_id` en `APP_INSTALADOR_BETA` (sin la variable, nadie; el DISTRIBUIDOR nunca) —; `/api/usuarios/me` lo devuelve como `app_instalador` y `App.jsx` monta `HostInstalador` EN LUGAR del `DashboardLayout`, así que todos los demás ven lo de siempre. Una obra es oportunidad + expediente con **5 pasos** (Simulada · Propuesta · Aceptada · Trámite · Cobro) y **quién tiene la pelota** (`tu`/`nos`/`cli`/`fin`), calculados SOLO en `pasoDeObra` (la tabla, escrita en el documento, es coherente con `estadoOportunidad.js` y el test lo comprueba con todos los estados); las tareas (firmar el CIFO, subir el RITE, hacer la factura) solo si su empresa es la INSTALADORA, con su destino decidido en el backend (desde la fase 2, una acción dentro de la obra y sin token: regla 231). La API `/api/instalador-app` va con `enforceAuth` + la beta, solo lo suyo (el `or` de `soloLoSuyo`), **404** a lo ajeno, **503** con la BD caída, escalares en lista blanca y **nunca** margen, comisión, `via_fm`, notas internas, comisionista ni enlaces de Drive (reglas 1, 102 y 218). Las pantallas, estilo «carta de pago» SIN modo oscuro, CSS `.ia-`, piezas comunes en `features/instalador/ui/` para las fases 2 y 3. Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_rutas_sin_sesion.js`, `test_rutas_partner.js`, `npm run build` y el banco `instalador-demo-5187` (sin API). Ver "La app del INSTALADOR, fase 1".

231. **En la app del instalador, cada acción de la obra se DESPACHA a la ruta de siempre; la app solo pone el guardián, la credencial y el saneado** (2026-11-21, Fran: «que lo haga todo dentro, sin enlaces»). Presupuesto, factura (plantilla o subida), CIFO, RITE, declaración FM y fotos van por `/api/instalador-app/obras/:id/…` y `/docs/:id/…` ([routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js), `despachar`), que llaman DENTRO del servidor a `routes/public.js`, `facturaInstalador.js` y los anexos de `oportunidades.js`: re-firma, rechazo, bloqueo, OCR y RPC de merge (19, 22) son el mismo código que el enlace; **no se escribe un segundo camino**. Guardián: `enforceAuth` + beta + `obraSuya` (**404** a lo ajeno o RECHAZADO) y, para firmar, RITE, FM y factura, `soloInstaladora` (**403 `NO_ES_INSTALADORA`**). El `upload_token` lo pone el SERVIDOR y **nunca viaja al navegador** (lo que mande el navegador como `token`/`llave` se descarta; sin token, 409); toda respuesta pasa por `sanear` (fuera claves `*link`/`*url`/`token` y enlaces de Drive, regla 1) y los ficheros van por proxy. Las miniaturas, con la **llave** de [utils/llaveObra.js](implementation/backend/utils/llaveObra.js) (HMAC sobre el nº de la obra, 12 h, solo ficheros de ESA obra): `/thumb` y `/fichero` son las únicas rutas abiertas, a propósito. **Borrar solo si el fichero está en ese apartado de esa obra** (la pública borra cualquier `driveId`). El instalador no valida ni rechaza. Los envíos con `SendActionOverlay`, salvo el gestor de fotos, que conserva su subida en tanda (68); tras cada acción la obra se refresca. Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_app_instalador_no_regresion.js`, `test_rutas_sin_sesion.js`, `auditar_rutas_sin_guardian.js`, `npm run build` y el banco (`?obra=…&accion=…`, `?fallo=1`). Ver "La app del INSTALADOR, fase 2".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/instalador-app/app-del-instalador-fase-1.md` — La app del INSTALADOR, fase 1: cáscara, Inicio, Obras y Clientes en solo lectura (2026-11-21) · 10,5 KB
- `docs/conocimiento/instalador-app/app-del-instalador-fase-2.md` — La app del INSTALADOR, fase 2: la obra se HACE dentro de la app, con sesión y sin enlaces (2026-11-21) · 8,8 KB

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

<!-- generado:fin -->
