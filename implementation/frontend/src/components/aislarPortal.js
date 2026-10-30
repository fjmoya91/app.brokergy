/**
 * Lo que se pinta en un PORTAL sale del DOM de quien lo abre, pero NO de su
 * árbol de React: los eventos sintéticos siguen subiendo por los componentes
 * padre como si el portal estuviera dentro. Un modal que se cierra con un
 * `onClick` en su fondo recibe así TODOS los clics del visor que ha abierto
 * —pasar de foto, «Editar», el propio zoom— y se cierra con cada uno: en el
 * Anexo Fotográfico cualquier clic en el visor devolvía a Documentos
 * (2026-10-29).
 *
 * Se corta en la raíz del portal: lo de dentro funciona igual y quien lo abrió
 * no se entera. Solo los eventos de PULSAR (y el teclado): soltar (`pointerup`,
 * `mouseup`) se deja pasar porque el recorte (react-image-crop) termina el
 * arrastre con un listener en `document`, y cortarlo dejaría la esquina pegada
 * al ratón.
 */
const cortar = (e) => e.stopPropagation();

export const AISLAR_PORTAL = {
    onClick: cortar,
    onDoubleClick: cortar,
    onMouseDown: cortar,
    onPointerDown: cortar,
    onTouchStart: cortar,
    onContextMenu: cortar,
    onKeyDown: cortar,
};
