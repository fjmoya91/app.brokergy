<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Endpoints
```
GET  /api/public/reforma-docs/:uuid?token=            → vista (checklist+estado+miniaturas) RECONCILIADA con Drive
POST /api/public/reforma-docs/:uuid/:slot?token=      → sube 1 foto (requireAuth opcional marca subido_por)
DEL  /api/public/reforma-docs/:uuid/:slot?token=&driveId=  → borra de Drive + estado
GET  /api/public/reforma-thumb/:uuid/:driveId?token=&sz=  → PROXY de miniatura (mismo origen)
GET  /api/oportunidades/:id/docs                      → vista admin (enforceAuth); devuelve uuid + upload_token
POST /api/oportunidades/:id/docs/:slot/validar        → adminOnly
POST /api/oportunidades/:id/docs/:slot/rechazar       → adminOnly; notifica WhatsApp/email a subido_por
```
