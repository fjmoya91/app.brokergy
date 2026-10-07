<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; cada subsección está en su propio fichero de esta carpeta.

## El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)

Tres trabajos distintos sobre la misma superficie (`DocsManager`): el CLIENTE sube
guiado desde el móvil, el ADMIN coloca de golpe lo que le llega por WhatsApp, y a
quien falte una foto hay que poder pedírsela. Lo que se tocó y por qué:

| Qué | Dónde |
|---|---|
| La subida (nombre en Drive, índice y entrada en BD) — FUENTE ÚNICA | `subirFicherosASlot` en [reformaUploadService.js](implementation/backend/services/reformaUploadService.js) |
| Rutas | `POST /api/public/reforma-docs/:uuid/:slot` (uno) · `…/:slot/batch` (tanda) |
| Clasificar lo que se suelta de golpe | [clasificarFotosService.js](implementation/backend/services/clasificarFotosService.js) + `POST /api/oportunidades/:id/docs/clasificar` (**staffOnly**) |
| El repartidor | [BuzonFotos.jsx](implementation/frontend/src/features/docs/BuzonFotos.jsx) |
| Pedir una foto concreta | `pedirSlot` en [DocsAdminModal.jsx](implementation/frontend/src/features/calculator/components/DocsAdminModal.jsx) → enlace `?need=` |
| Prueba (Drive y Supabase simulados) | `node implementation/backend/scripts/test_docs_fotos.js` |
