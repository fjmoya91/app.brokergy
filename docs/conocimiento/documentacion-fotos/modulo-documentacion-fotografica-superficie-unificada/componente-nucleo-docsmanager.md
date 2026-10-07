<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Componente núcleo: `DocsManager`
**Fichero:** `implementation/frontend/src/features/docs/DocsManager.jsx`. Dos modos:
- `mode="token"` → **cliente/instalador por enlace público** `/subir-docs/:uuid?token=` (subir, ver, sin validar). Envoltorio: `features/public/views/SubirDocsReformaView.jsx`.
- `mode="admin"` → **logueado** vía `features/calculator/components/DocsAdminModal.jsx` (modal in-app abierto desde el botón **"SUBIR FOTOS"** en `ResultsPanel.jsx`). Si `user.rol === 'ADMIN'` → **validar/rechazar foto a foto** y **borrar** (✕ en miniatura + 🗑 en lightbox).
