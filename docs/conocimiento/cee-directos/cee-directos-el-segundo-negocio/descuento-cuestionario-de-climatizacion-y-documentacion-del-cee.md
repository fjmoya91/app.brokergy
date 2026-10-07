<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Descuento, cuestionario de climatización y documentación del CEE (2026-09-23)

- **Descuento %** (`cee_ofertas.dto_pct`): solo sobre los HONORARIOS —la tasa es un
  suplido y no se descuenta—; sale en la columna % Dto del PDF y en el total.
- **Cuestionario de climatización** en la aceptación ([cuestionarioCee.js](implementation/frontend/src/features/cee-directo/logic/cuestionarioCee.js)):
  calefacción y ACS con las MISMAS opciones que el funnel de captación, termo
  eléctrico además de la caldera, aires acondicionados (y cuántos) y placas
  —con la opción "estos certificados son para la deducción del IRPF por poner
  placas"—. Se guarda en `cee_directos.documentacion.cuestionario`, lo ven el
  equipo y el técnico en la ficha (`CuestionarioCliente`) y va en el aviso al equipo.
- **La MISMA gestión de documentación que el CAE** para el CEE (fachada, patios,
  vídeo, planos, CEE anterior): `DocsManager` con la prop `api`
  (`features/docs/docsApi.js` → `API_DOCS_CEE_DIRECTO`, `unaFase`, sin escaparate)
  y `reformaUploadService.subirFicherosASlot` con un `destino` propio. Servicio:
  [ceeDirectoDocsService.js](implementation/backend/services/ceeDirectoDocsService.js);
  estado en `documentacion.reforma_uploads` por las RPC
  `cee_directo_docs_append` / `_replace_slot`; ficheros en «4. DOCUMENTACIÓN PARA
  CEE»; token = `portal_token`. Rutas públicas `/api/public/cee-directo-docs/:id`
  (+ `/:slot/batch`, DELETE) y `/cee-directo-thumb`; página `/subir-cee-docs/:id?token=&need=`;
  equipo `/api/cee-directos/:id/docs` (validar · rechazar con aviso · waive · clasificar · enviar-enlace).
  Solo la FACHADA es obligatoria; patios, vídeo y planos se piden como recomendables.
- **Se suben al aceptar**, en la misma pantalla (la aceptación ESPERA a que exista
  la carpeta: `crearExpediente({ esperarCarpeta })`). La confirmación al cliente
  (`confirmarAlCliente`) sale al pulsar «He terminado» / «Lo subo más tarde» —o a
  los 30 min, respaldo en memoria— y **si falta algo lleva el enlace** filtrado a
  lo que falta. Una sola vez (`documentacion.confirmacion_cliente`).
