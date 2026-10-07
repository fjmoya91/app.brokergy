<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Almacenamiento (incremental, sin esquema nuevo)
- **Ficheros**: Drive, carpeta `12. DOCUMENTOS PARA CEE`, nombre `FOTO_{SLOT}[_N].{ext}`.
- **Estado POR FOTO**: en cada entrada de `datos_calculo.reforma_uploads[slot][i]` → `{ name, link, driveId, at, estado, motivo, subido_por }`. `estado` ∈ `subida|validada|rechazada`. El estado del SLOT es un resumen derivado.
- `datos_calculo.upload_token` (32 hex) se siembra al guardar la oportunidad (`POST /api/oportunidades`).
