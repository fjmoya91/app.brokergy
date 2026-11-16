// Las MARCAS de las rutas del investigador del contestador (regla 207). El prompt lo arma el
// backend (contenedor `backend`: /app, sin `scripts/` —lo excluye el .dockerignore—) y Claude
// corre en el `asistente` (/repo), que las cambia por las suyas (`contestador_claude.ponerRutas`).
// Aquí, en utils/, porque está en los DOS contenedores (16/11/2026: el backend no encontraba
// `scripts/contestador_claude` y cada escalado fallaba).
module.exports = {
    MARCA_ORDEN: '{{ORDEN_CONSULTAS}}',
    MARCA_DOCS: '{{DOCS_CONOCIMIENTO}}',
};
