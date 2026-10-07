---
paths:
  - "implementation/backend/**"
---
# Backend — lo que vale para CUALQUIER ruta o servicio (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/transversal-backend/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

Guardianes de las rutas, Supabase (JSONB, listados, escrituras atómicas) y BD caída.

## Reglas críticas (texto íntegro)

6. **Seguridad de rutas**: Todas las rutas del backend usan `requireAuth` o `enforceAuth`.

21. **NUNCA guardar ficheros en base64 dentro de un JSONB**: ni fotos, ni PDFs, ni fichas técnicas. Van a Drive; en BD solo el enlace o el `driveId`. Motivo: Postgres descomprime la columna JSONB **entera** en cuanto una consulta la toca, aunque solo pida un subcampo. 48 MB de fotos en `documentacion` tumbaron la BD dos veces el 21/07/2026 (OOM en la instancia Micro de 1 GB). Un trigger (`scripts/guard_documentacion_size.sql`) rechaza ya cualquier `documentacion` > 2 MB.

22. **Listados: nunca traer columnas JSONB completas**. En un `select` sobre MUCHAS filas, pedir campos concretos (`cee->cee_inicial`) o usar la RPC. Referencias: `get_expedientes_list_v3` (listado de expedientes, con los contadores de incidencias ya agregados) y `utils/ceeEcoFields.js` (`CEE_ECO_SELECT` + `rebuildCee`, usado por lotes). En particular `cee.xml_inicial`/`xml_final` (el XML crudo del CEE, ~12 MB en total) **solo** se leen en el detalle de un expediente. Un `ilike '%…%'` que además pida un JSONB recorre y descomprime la tabla entera — ver el patrón en dos pasos de `findExpediente()` en el MCP.

38. **Con la BD caída, la app CALLA; nunca contesta una cifra tranquila**: un error de lectura no puede salir por 200. [middleware/auth.js](implementation/backend/middleware/auth.js) seguía adelante con el perfil a null —sin rol, sin empresa— y lo **cacheaba 5 minutos**, así que el partner salía como "USUARIO / LOGO PARTNER", con el menú recortado y, como `GET /oportunidades` acaba filtrando por `creador_id = null`, la cartera a CERO; y esa misma ruta convertía además cualquier fallo de Supabase en `200 []`. Un distribuidor con 19 oportunidades vio "0 oportunidades · 0,00 €" con toda la apariencia de dato bueno —que se lee como trabajo borrado— y recargar no lo arreglaba, porque el fantasma vivía en la caché. Medido el 08/09/2026: Postgres se cayó y arrancó en recuperación (`database system was not properly shut down`) y Cloudflare sirvió **521 Web server is down** delante de Supabase durante ~1 min. Ahora las dos rutas responden **503** (`PROFILE_UNAVAILABLE` / `OPORTUNIDADES_UNAVAILABLE`) y no se cachea nada; el frontend enseña `ProfileUnavailable` (reintentar, y "tus datos siguen ahí") en vez de un dashboard con identidad falsa, la lista conserva lo que ya tuviera, y **el resumen financiero no se pinta si no hay datos** — 0,00 € es justo la cifra que asusta. A quien YA tiene perfil bueno en caché no se le echa por un parpadeo. Vigilado por `node implementation/backend/scripts/test_caida_bd_no_miente.js`.

102. **Ninguna ruta responde a un ANÓNIMO salvo que sea pública por diseño, y `requireAuth` NO es un guardián** (2026-10-02). `requireAuth` solo IDENTIFICA: sin token pone `req.user = null` y deja pasar, así que una ruta que filtra con `if (req.user && …)` se lo sirve TODO a quien no tiene sesión. Medido el 02/10/2026 desde fuera, sin sesión: `GET /api/oportunidades` devolvía las 382 oportunidades con su `datos_calculo`; `GET /:id`, `POST /` (crear o sobrescribir), `/asignar`, `/vincular-cliente` y los anexos de la propuesta (incluido BORRARLOS de Drive) no pedían nada; y `/api/pdf/send-*` y `/api/whatsapp/send-text|send-media` dejaban a cualquiera mandar emails desde nuestro buzón y WhatsApp desde nuestro número. Toda ruta lleva un guardián que corta sin sesión: `enforceAuth` · `staffOnly` · `adminOnly` · `internalOnly`, o —si además la llama el servidor con `x-internal-key` (envío programado, MCP, scripts)— `sesionOClaveInterna` / `staffOClaveInterna` de [middleware/auth.js](implementation/backend/middleware/auth.js), que comparan la clave en tiempo constante. **Lo que sale de la casa a un tercero (email, WhatsApp) va con `staffOClaveInterna`.** Una ruta pública (enlace con token, landing, marketplace) valida SU token dentro, y en `expedientes.js` solo entra en `PUBLIC_EXPEDIENTE_ROUTES` si de verdad la abre alguien sin sesión. Tras añadir o tocar rutas: `node implementation/backend/scripts/auditar_rutas_sin_guardian.js` (falla si aparece una sin guardián que no esté en su lista de abiertas a propósito, con el motivo). **Y un partner CON sesión solo toca LO SUYO** (2026-10-02): lo que creó él o lo de su empresa, el MISMO criterio que el listado; el equipo interno (ADMIN/TRABAJADOR) ve y toca todo. `suyaSiPartner` ([routes/oportunidades.js](implementation/backend/routes/oportunidades.js)) guarda todo lo que lleva `:id` y responde 404, no 403 (no se confirma que el número exista); `GET /:id` filtra también la búsqueda por referencia catastral; y el guardado de la calculadora ya no SOBRESCRIBE la oportunidad de otro partner encontrada por la RC: la misma vivienda se da de alta aparte. **Un partner no cambia el partner**: `/asignar` es del equipo interno y en el guardado el partner, el creador y su nombre los pone el SERVIDOR (lo del navegador se ignora); el cliente, solo si es suyo, y el instalador, solo si es él o de su red (`distribuidor_instalador`). Tampoco cambia su propio tipo de empresa (como la comisión, solo ADMIN). Los anexos de la propuesta solo se sirven o se borran si el fichero está en el «0. PRESUPUESTO» de ESA oportunidad: antes valía el id de CUALQUIER fichero del Drive de Brokergy. El certificador no ve la oportunidad, que es comercial (su botón de nota rápida se oculta). Pruebas: `node implementation/backend/scripts/test_rutas_sin_sesion.js` y `test_rutas_partner.js`.

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

_(ninguno todavía)_

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

_(ninguna)_

<!-- generado:fin -->
