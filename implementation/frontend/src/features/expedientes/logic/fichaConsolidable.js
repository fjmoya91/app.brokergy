// ============================================================================
// fichaConsolidable.js — QUÉ se puede unir como ficha del modelo, y qué se
//                        propone marcar.
// ----------------------------------------------------------------------------
// La ficha de un modelo llega a menudo incompleta: cuando el SCOP se justifica
// por EPREL, el certificado necesita además la ficha EPREL y la etiqueta
// energética, y esas se sueltan a mano en el gestor de anexos. Expediente tras
// expediente.
//
// Este módulo decide lo único que no es mecánica: a qué modelo se le puede
// guardar el conjunto y qué piezas se proponen. El resto —unir, subir al
// catálogo, sellar el slot— lo hace el backend (`services/fichaConsolidada.js`).
//
// Módulo ESM PURO (sin React ni Node): lo comparten el gestor de anexos del CIFO
// y el del certificado RES080, que son dos copias de la misma pantalla. Escrita
// dentro de cada una, esta decisión acabaría siendo dos.
// ============================================================================

import { excludedPagesFor } from './annexPrefs.js';

/**
 * Los huecos a los que se les puede guardar un conjunto: los que tienen un
 * MODELO del catálogo detrás. Sin modelo no hay a quién guardárselo (el equipo
 * se tecleó a mano), y ofrecerlo sería un botón que no puede hacer nada.
 *
 * @param {Array} attachments  los anexos tal y como se pintan (ordenados)
 * @param {Array} slots        `resolveFichaSlots` / `resolveAllFichaSlots`
 */
export function destinosConsolidacion(attachments, slots) {
    const porId = new Map((attachments || []).map(a => [a.id, a]));
    return (slots || [])
        .filter(s => s.modelId)
        .map(s => ({
            id: s.id,
            type: s.type,
            label: s.label,
            modelId: s.modelId,
            modeloLabel: s.modeloLabel || '',
            tieneFichero: !!porId.get(s.id)?.file?.driveId,
        }));
}

/** Anexos extra (los PDFs sueltos) que ya están subidos y pueden entrar. */
export function extrasConFichero(attachments) {
    return (attachments || []).filter(a => a.isExtra && a.file?.driveId);
}

/**
 * ¿Tiene sentido ofrecer el botón? Hace falta un modelo al que guardárselo y al
 * menos un PDF suelto que unir: sin eso, consolidar no cambiaría nada.
 */
export function puedeConsolidar(attachments, slots) {
    return destinosConsolidacion(attachments, slots).some(d => d.tieneFichero)
        && extrasConFichero(attachments).length > 0;
}

/**
 * Las piezas del conjunto, EN EL ORDEN DEL GESTOR, con lo que hay que enseñar de
 * cada una y si viene marcada.
 *
 * REGLA — con VARIOS modelos en el expediente, los extras NO vienen marcados.
 * Qué equipo justifica cada PDF suelto no lo puede adivinar la app: marcarlos
 * por ti es meter la ficha EPREL de un equipo dentro de la ficha del otro, y
 * desde el catálogo eso se propaga a todos los expedientes que lleven ese
 * modelo. Con un solo modelo no hay ambigüedad y van marcados.
 *
 * El hueco DESTINO va siempre marcado y no se puede quitar: es la ficha que se
 * está sustituyendo.
 */
export function piezasParaConsolidar(attachments, prefs, { destinoId, destinos }) {
    const variosModelos = (destinos || []).length > 1;
    return (attachments || [])
        .filter(a => a.file?.driveId && (a.isExtra || a.id === destinoId))
        .map(a => {
            const total = a.file.previewPages?.length || null;
            const excluidas = excludedPagesFor(prefs, a.file.driveId);
            const esDestino = a.id === destinoId;
            return {
                id: a.id,
                driveId: a.file.driveId,
                nombre: a.file.name || a.label,
                label: a.label,
                esDestino,
                fija: esDestino,
                paginas: total === null ? null : Math.max(0, total - excluidas.length),
                excluidas,
                porDefecto: esDestino || !variosModelos,
            };
        });
}

/** Suma de páginas de lo marcado; null si alguna pieza aún no se ha rasterizado. */
export function paginasDelConjunto(piezas, marcadas) {
    const sel = piezas.filter(p => marcadas.has(p.driveId));
    if (sel.some(p => p.paginas === null)) return null;
    return sel.reduce((n, p) => n + p.paginas, 0);
}

/**
 * Lo que trae dentro la ficha del catálogo, para decirlo en una línea:
 * "Conjunto de 3 documentos · 5 págs". Sin `partes` no se afirma nada — es una
 * ficha suelta o una que se guardó antes de que esto existiera.
 */
export function resumenPartes(partes) {
    const piezas = Array.isArray(partes?.piezas) ? partes.piezas : [];
    if (piezas.length < 2) return null;
    const pags = Number.isFinite(partes?.paginas) ? ` · ${partes.paginas} págs` : '';
    return `Conjunto de ${piezas.length} documentos${pags}`;
}
