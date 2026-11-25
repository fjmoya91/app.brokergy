<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Aviso al staff cuando suben documentación (2026-07-30)

> **Desde el 25/11/2026 el resumen de la documentación recibida NO sale** (ni WhatsApp ni email). Fran:
> «me está petando el WhatsApp; que se le pida al cliente, se revise y, si está todo, se haga el
> certificado; a mí solo el hito». La tanda se sigue agrupando igual (la ventana hace que doce fotos sean
> UNA revisión del agente) y al cerrarse se sigue llamando a `aceptacionAgente.retomarTrasSubida` y a
> `esperasWhatsapp.cerrarPorSubida` (`trasLaTanda`); solo se calla el aviso. Lo mismo para la copia del
> contestador de lo que ya ha GUARDADO de verdad (lo que queda por guardar, en modo copia, sí se le
> manda: si no, nunca se guardaría) y para el encargo de «colocar» lo suyo (`silencioso`). Las rondas
> del agente de la aceptación, también en silencio (regla 158). Interruptor ÚNICO:
> `AVISO_DOC_RECIBIDA_ENABLED=true` lo devuelve todo como estaba (`uploadNotifier.avisarDocRecibida`).
> **El fin de obra NO se calla**: es un hito. Prueba: `node implementation/backend/scripts/test_aviso_doc_recibida.js`.
Las dos superficies públicas de subida avisan al staff por **WhatsApp (`WHATSAPP_ADMIN_CHAT`) + email
(`ADMIN_EMAIL`, buzón secundario)**. La lógica vive en
[uploadNotifier.js](implementation/backend/services/uploadNotifier.js) — no duplicar el aviso en las rutas.

- **Agrupación obligatoria**: `/subir-docs` manda UNA petición POR FOTO. `registrarSubida()` acumula en
  memoria por oportunidad y manda **un solo resumen** tras una ventana de silencio de 30 min
  (`UPLOAD_NOTIFY_WINDOW_MS`). Cada subida nueva reinicia el contador. No poner un `sendText` suelto en la ruta.
- **Nunca avisa de lo que sube el propio staff**: se filtra por `isStaff(req)` (un TRABAJADOR se marca
  como `subido_por: 'instalador'` y avisaría en falso).
- **Fin de obra**: `POST /api/public/reforma-docs/:uuid/fin-obra?token=` (declarado **antes** de
  `/:uuid/:slot` o Express lo tomaría por un slot). Avisa al instante, persiste
  `expedientes.documentacion.fecha_fin_obra_comunicada` vía `set_expediente_doc_field` e ignora
  repeticiones dentro de 24 h. El botón está al final de la fase DESPUÉS de `DocsManager` (solo `mode="token"`).
- El buffer vive en memoria: un reinicio del contenedor dentro de la ventana se come ese aviso (los
  ficheros ya están en Drive). Por eso el fin de obra, que sí es un hito, además se persiste.
