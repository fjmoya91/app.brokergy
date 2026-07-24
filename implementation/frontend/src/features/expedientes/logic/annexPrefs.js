/**
 * Preferencias de los anexos del CIFO (RES060/RES093) y del Certificado RES080.
 *
 * Viven en `expedientes.documentacion.cifo_annex_prefs`:
 *
 *   {
 *     order:    ['aerotermia_cal', 'extra_1AbC…', 'aerotermia_acs'],  // ids de slot
 *     excluded: { '1AbC…': [1, 2, 9] }                                // driveId → págs (1-based)
 *   }
 *
 * · `order` va por ID DE SLOT porque el orden es una decisión sobre el hueco
 *   (la ficha de calefacción antes que la de ACS), no sobre el fichero concreto.
 * · `excluded` va por DRIVE ID porque el recorte es una decisión sobre ESE PDF:
 *   si re-sincronizas la ficha desde el modelo, el fichero nuevo entra completo
 *   en vez de heredar un recorte pensado para otro documento.
 *
 * Módulo ESM PURO (sin React ni Node): lo importan los modales del frontend y,
 * por import() dinámico, `cifoService.js` en el backend — misma lógica de orden
 * y de recorte en la app y en la generación automática del asistente/MCP.
 */

export const ANNEX_PREFS_FIELD = 'cifo_annex_prefs';

export function emptyAnnexPrefs() {
    return { order: [], excluded: {} };
}

/** Lista de páginas normalizada: enteros ≥ 1, únicos y ordenados. */
function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    const set = new Set();
    for (const p of value) {
        const n = parseInt(p, 10);
        if (Number.isFinite(n) && n >= 1) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
}

/** Descarta basura y deja siempre la forma { order:[], excluded:{} }. */
export function sanitizeAnnexPrefs(prefs) {
    const order = Array.isArray(prefs?.order)
        ? prefs.order.filter(id => typeof id === 'string' && id.length > 0)
        : [];
    const excluded = {};
    for (const [driveId, pages] of Object.entries(prefs?.excluded || {})) {
        const list = normalizePages(pages);
        if (list.length > 0) excluded[driveId] = list;
    }
    return { order, excluded };
}

/** Lee las prefs del `documentacion` del expediente (tolerante a nulos). */
export function readAnnexPrefs(documentacion) {
    return sanitizeAnnexPrefs(documentacion?.[ANNEX_PREFS_FIELD]);
}

/** Páginas excluidas (1-based) de un anexo concreto. */
export function excludedPagesFor(prefs, driveId) {
    if (!driveId) return [];
    return normalizePages(prefs?.excluded?.[driveId]);
}

/**
 * Ordena los slots según `prefs.order`. Los que no estén en la lista (anexos
 * recién subidos, slots nuevos) conservan su orden relativo y van al final.
 * Sin prefs guardadas devuelve la lista tal cual.
 */
export function orderAttachments(attachments, prefs) {
    const list = Array.isArray(attachments) ? attachments : [];
    const order = prefs?.order || [];
    if (order.length === 0) return [...list];
    const pos = new Map(order.map((id, i) => [id, i]));
    return list
        .map((a, i) => ({ a, i, p: pos.has(a.id) ? pos.get(a.id) : Number.MAX_SAFE_INTEGER }))
        .sort((x, y) => (x.p - y.p) || (x.i - y.i))
        .map(x => x.a);
}

/** El `order` que hay que guardar a partir de la lista ya ordenada en pantalla. */
export function orderFromAttachments(attachments) {
    return (Array.isArray(attachments) ? attachments : []).map(a => a.id).filter(Boolean);
}

/**
 * Anexos ordenados y con las páginas excluidas ya fuera de `previewPages`, para
 * que la PREVISUALIZACIÓN del modal enseñe exactamente lo que saldrá en el PDF
 * (el backend recorta las mismas páginas al concatenar con pdf-lib).
 */
export function prepareAnnexAttachments(attachments, prefs) {
    return orderAttachments(attachments, prefs).map(a => {
        const excluded = excludedPagesFor(prefs, a.file?.driveId);
        if (!a.file || excluded.length === 0) return a;
        const previewPages = Array.isArray(a.file.previewPages)
            ? a.file.previewPages.filter((_, i) => !excluded.includes(i + 1))
            : a.file.previewPages;
        return { ...a, file: { ...a.file, previewPages, excludedPages: excluded } };
    });
}

/**
 * Payload de anexos para el backend (`annexes` en /api/pdf/*): driveId + páginas
 * a omitir, en el orden final del documento.
 */
export function buildAnnexPayload(attachments, prefs, { tieneAcs = true } = {}) {
    return orderAttachments(attachments, prefs)
        .filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || tieneAcs))
        .map(a => {
            const excludedPages = excludedPagesFor(prefs, a.file.driveId);
            return excludedPages.length > 0
                ? { driveId: a.file.driveId, excludedPages }
                : { driveId: a.file.driveId };
        });
}

/**
 * Parsea una selección de páginas escrita a mano: "1-3, 7, 10-12".
 * Devuelve { pages, error }: `pages` son números 1-based dentro de [1, total].
 */
export function parsePageSelection(text, total) {
    const raw = String(text || '').trim();
    if (!raw) return { pages: [], error: null };
    const set = new Set();
    for (const chunk of raw.split(/[,;\s]+/).filter(Boolean)) {
        const m = chunk.match(/^(\d+)(?:\s*[-–a]\s*(\d+))?$/i);
        if (!m) return { pages: [], error: `No entiendo "${chunk}". Usa por ejemplo: 1-3, 7, 10-12` };
        const from = parseInt(m[1], 10);
        const to = m[2] ? parseInt(m[2], 10) : from;
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        if (lo < 1 || (total && hi > total)) {
            return { pages: [], error: `El documento tiene ${total} páginas: "${chunk}" se sale del rango.` };
        }
        for (let p = lo; p <= hi; p++) set.add(p);
    }
    return { pages: [...set].sort((a, b) => a - b), error: null };
}

/** [1,2,3,7,9,10] → "1-3, 7, 9-10" (para enseñar el recorte de un vistazo). */
export function formatPageRanges(pages) {
    const list = normalizePages(pages);
    if (list.length === 0) return '';
    const parts = [];
    let start = list[0];
    let prev = list[0];
    for (let i = 1; i <= list.length; i++) {
        const p = list[i];
        if (p !== prev + 1) {
            parts.push(start === prev ? `${start}` : `${start}-${prev}`);
            start = p;
        }
        prev = p;
    }
    return parts.join(', ');
}
