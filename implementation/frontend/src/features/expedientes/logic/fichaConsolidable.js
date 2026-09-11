// ============================================================================
// fichaConsolidable.js — QUÉ se puede unir como ficha del modelo, y de QUIÉN es
//                        cada papel suelto.
// ----------------------------------------------------------------------------
// La ficha de un modelo llega a menudo incompleta: cuando el SCOP se justifica
// por EPREL, el certificado necesita además la ficha EPREL y la etiqueta
// energética, y esas se sueltan a mano en el gestor de anexos. Expediente tras
// expediente.
//
// REGLA — un expediente puede tener DOS equipos, y cada uno lleva SU ficha. La
// bomba de calefacción y el equipo de ACS son dos modelos del catálogo, así que
// nunca se guardan en el mismo conjunto: se arma **un pack por hueco**. Meter la
// ficha de ACS dentro de la de calefacción no estropea un expediente, estropea
// el catálogo — y de ahí baja a todos los que lleven ese modelo.
//
// REGLA — de quién es cada PDF suelto lo dice una PERSONA. El EPREL y la
// etiqueta pueden ser del equipo de calefacción, del de ACS, o valer para los
// dos (un equipo que hace ambas cosas). La app no puede deducirlo del nombre del
// fichero, así que con más de un hueco se pregunta pieza a pieza y nada viene
// preasignado. Con un solo hueco no hay ambigüedad y todo va marcado.
//
// Módulo ESM PURO (sin React ni Node): lo comparten el gestor de anexos del CIFO
// y el del certificado RES080, que son dos copias de la misma pantalla. Escrita
// dentro de cada una, esta decisión acabaría siendo dos.
// ============================================================================

import { excludedPagesFor } from './annexPrefs.js';

/** Marcador del selector de una pieza que aún no se ha repartido. */
export const SIN_ASIGNAR = '';

/**
 * Los huecos a los que se les puede guardar un conjunto: los que tienen un
 * MODELO del catálogo detrás y una ficha ya cargada. Sin modelo no hay a quién
 * guardárselo (el equipo se tecleó a mano) y ofrecerlo sería un botón que no
 * puede hacer nada.
 *
 * @param {Array} attachments  los anexos tal y como se pintan (ordenados)
 * @param {Array} slots        `resolveFichaSlots` / `resolveAllFichaSlots`
 */
export function destinosConsolidacion(attachments, prefs, slots) {
    const porId = new Map((attachments || []).map(a => [a.id, a]));
    return (slots || [])
        .filter(s => s.modelId)
        .map(s => {
            const a = porId.get(s.id);
            const driveId = a?.file?.driveId || null;
            const total = a?.file?.previewPages?.length ?? null;
            const excluidas = excludedPagesFor(prefs, driveId);
            return {
                id: s.id,
                type: s.type,
                label: s.label,
                modelId: s.modelId,
                modeloLabel: s.modeloLabel || '',
                driveId,
                nombre: a?.file?.name || s.label,
                paginas: total === null ? null : Math.max(0, total - excluidas.length),
                totalPaginas: total,
                excluidas,
                tieneFichero: !!driveId,
            };
        })
        .filter(d => d.tieneFichero);
}

/** Anexos extra (los PDFs sueltos) que ya están subidos y pueden entrar. */
export function piezasSueltas(attachments, prefs) {
    return (attachments || [])
        .filter(a => a.isExtra && a.file?.driveId)
        .map(a => {
            const total = a.file.previewPages?.length ?? null;
            const excluidas = excludedPagesFor(prefs, a.file.driveId);
            return {
                id: a.id,
                driveId: a.file.driveId,
                label: a.label,
                nombre: a.file.name || a.label,
                paginas: total === null ? null : Math.max(0, total - excluidas.length),
                excluidas,
            };
        });
}

/**
 * ¿Tiene sentido ofrecer el botón? Dos motivos, y basta uno:
 *
 *   · hay PDFs sueltos que unir a la ficha, o
 *   · la ficha de algún hueco lleva un RECORTE de páginas. Esto último importa:
 *     la ficha del fabricante suele traer treinta páginas de las que valen dos,
 *     y guardar en el catálogo la versión recortada ahorra ese trabajo a todos
 *     los expedientes que vengan detrás.
 */
export function puedeConsolidar(attachments, prefs, slots) {
    const destinos = destinosConsolidacion(attachments, prefs, slots);
    if (destinos.length === 0) return false;
    return piezasSueltas(attachments, prefs).length > 0
        || destinos.some(d => d.excluidas.length > 0);
}

/**
 * El reparto que se propone al abrir el popup.
 *
 * Con UN solo hueco: marcado, y todas las piezas sueltas asignadas a él — no hay
 * otra cosa que puedan ser. Con VARIOS: se marca el primero (es donde va la
 * bomba principal) pero las piezas quedan SIN ASIGNAR, porque de cuál son es
 * justo lo que la app no sabe.
 */
export function repartoInicial(destinos, sueltas) {
    const unico = destinos.length === 1;
    return {
        marcados: new Set(unico ? destinos.map(d => d.id) : destinos.slice(0, 1).map(d => d.id)),
        asignacion: Object.fromEntries(
            (sueltas || []).map(p => [p.driveId, unico ? [destinos[0].id] : []])
        ),
    };
}

/**
 * Los packs que se van a guardar, uno por hueco marcado, con sus piezas en el
 * ORDEN DEL GESTOR — que es el orden con el que ya van dentro del certificado.
 * Una pieza puede ir en dos packs (un documento que cubre los dos equipos).
 *
 * @returns {Array<{destino, piezas:[{driveId,excludedPages,nombre,paginas}], paginas:number|null}>}
 */
export function construirGrupos(attachments, prefs, destinos, { marcados, asignacion }) {
    const orden = new Map((attachments || []).map((a, i) => [a.file?.driveId, i]));
    const sueltas = piezasSueltas(attachments, prefs);
    return destinos
        .filter(d => marcados.has(d.id))
        .map(d => {
            const piezas = [
                { driveId: d.driveId, nombre: d.nombre, paginas: d.paginas, excludedPages: d.excluidas, esFicha: true },
                ...sueltas
                    .filter(p => (asignacion[p.driveId] || []).includes(d.id))
                    .map(p => ({ driveId: p.driveId, nombre: p.nombre, paginas: p.paginas, excludedPages: p.excluidas })),
            ].sort((x, y) => (orden.get(x.driveId) ?? 0) - (orden.get(y.driveId) ?? 0));
            const paginas = piezas.some(p => p.paginas === null)
                ? null
                : piezas.reduce((n, p) => n + p.paginas, 0);
            return { destino: d, piezas, paginas };
        });
}

/**
 * Qué impide guardar, dicho como lo diría una persona. `null` si se puede.
 *
 * Un pack de UNA sola pieza SIN recorte no cambia nada de lo que ya hay en el
 * catálogo: no es un error, es un gesto vacío, y el botón lo dice en vez de
 * dejar guardar por guardar.
 */
export function motivoBloqueo(grupos) {
    if (grupos.length === 0) return 'Marca al menos un equipo.';
    const vacio = grupos.find(g => g.piezas.length < 2 && g.piezas.every(p => p.excludedPages.length === 0));
    if (vacio) {
        return `En ${etiquetaCorta(vacio.destino)} no hay nada que unir ni ninguna página quitada: `
             + 'su ficha quedaría igual que la que ya tiene el catálogo.';
    }
    return null;
}

/** "calefacción" / "ACS" — para hablar del hueco sin soltar su etiqueta entera. */
export function etiquetaCorta(destino) {
    const t = String(destino?.type || '');
    if (t.startsWith('acs')) return 'ACS';
    if (t === 'marco') return 'el marco';
    if (t === 'cristal') return 'el vidrio';
    return 'calefacción';
}

/** El payload que espera la ruta: un grupo por hueco, con sus piezas y recortes. */
export function payloadGrupos(grupos) {
    return grupos.map(g => ({
        type: g.destino.type,
        piezas: g.piezas.map(p => ({ driveId: p.driveId, excludedPages: p.excludedPages })),
    }));
}

/**
 * Lo que trae dentro la ficha del catálogo, para decirlo en una línea:
 * "Conjunto de 3 documentos · 5 págs". Sin `partes` no se afirma nada — es una
 * ficha suelta o una que se guardó antes de que esto existiera.
 */
export function resumenPartes(partes) {
    const piezas = Array.isArray(partes?.piezas) ? partes.piezas : [];
    const pags = Number.isFinite(partes?.paginas) ? ` · ${partes.paginas} págs` : '';
    if (piezas.length >= 2) return `Conjunto de ${piezas.length} documentos${pags}`;
    // Una sola pieza en el catálogo solo se anota cuando se guardó RECORTADA: es
    // lo que explica que la ficha del modelo tenga menos páginas que la original.
    if (piezas.length === 1 && piezas[0]?.recortadas) return `Ficha recortada${pags}`;
    return null;
}
