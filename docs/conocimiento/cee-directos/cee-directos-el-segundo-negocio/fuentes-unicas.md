<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Fuentes únicas

| Qué | Dónde |
|---|---|
| Estados y de quién es la pelota | [utils/ceeDirectoEstados.js](implementation/backend/utils/ceeDirectoEstados.js) |
| Carga, guardado, historial, numeración | [services/ceeDirectoService.js](implementation/backend/services/ceeDirectoService.js) |
| Carpetas de Drive | [services/ceeDirectoFolders.js](implementation/backend/services/ceeDirectoFolders.js) |
| Subida del CEE por el técnico | [services/ceeDirectoUploadService.js](implementation/backend/services/ceeDirectoUploadService.js) |
| Rutas | [routes/ceeDirectos.js](implementation/backend/routes/ceeDirectos.js) + `/cee-directo-upload` en `routes/public.js` |
| Esquema | `scripts/cee_directos_schema.sql` |
