// ============================================================================
// fichaConsolidada.js — la ficha del catálogo, cuando son VARIOS papeles
// ----------------------------------------------------------------------------
// El catálogo guarda UNA ficha por modelo, y durante mucho tiempo eso bastaba.
// Dejó de bastar con el EPREL: cuando el SCOP se justifica por ahí, el
// certificado necesita TRES documentos —la ficha del fabricante, la ficha EPREL
// y la etiqueta energética—, y el catálogo solo aportaba el primero. Así que en
// cada expediente con ese modelo alguien buscaba los otros dos y los soltaba a
// mano en el gestor de anexos. Otra vez. Y otra.
//
// Aquí se cierra ese círculo: los anexos que ya están dados por buenos en el
// gestor se UNEN en un solo PDF y ese PDF pasa a ser la ficha del modelo. El
// siguiente expediente que elija ese equipo se la copia entera y no hay nada
// que volver a buscar.
//
// ── REGLAS ──────────────────────────────────────────────────────────────────
//
// REGLA — se une EXACTAMENTE lo que va al certificado. Mismo orden del gestor,
// mismos recortes de páginas (`cifo_annex_prefs.excluded`) y el mismo
// `unirAnexos` que produce la ficha técnica suelta del paquete E{n}. Si la ficha
// del catálogo no fuera página a página el bloque de anexos, el documento suelto
// y el que va dentro del certificado dejarían de coincidir — que es justo lo que
// mira quien lo verifica.
//
// REGLA — una pieza que no se puede leer ABORTA. `fetchAnnexBuffers` se salta en
// silencio lo que no baja; aquí no vale: una ficha incompleta subida al catálogo
// no se queda en este expediente, se propaga a todos los que vengan detrás y
// nadie se entera hasta el requerimiento.
//
// REGLA — solo se unen ficheros DE ESTE EXPEDIENTE. El driveId lo manda el
// navegador, así que se comprueba contra los slots de ficha y contra
// `cifo_extra_annexes`: mismo criterio que el proxy de contenido de los anexos,
// que existe para no dejar la API de Drive como copiadora genérica.
//
// REGLA — consolidar deja el EXPEDIENTE consolidado también. El catálogo y el
// expediente no pueden contar cosas distintas: si aquí se quedaran las piezas
// sueltas, el día que alguien pulse ⟳ en la ficha se traería el conjunto (que ya
// lleva el EPREL dentro) y el certificado saldría con el EPREL DOS VECES. Las
// piezas salen de la lista de anexos, pero NO se borran de Drive: son la fuente
// de lo que se ha unido.
// ============================================================================

const path = require('path');
const { pathToFileURL } = require('url');
const { PDFDocument } = require('pdf-lib');
const supabase = require('./supabaseClient');
const { getFileContent } = require('./driveService');
const { unirAnexos } = require('./pdfService');
const { guardarFichaEnCatalogo } = require('./catalogoFichas');
const { asegurarFichaTecnica } = require('./fichaTecnicaSlot');

let _ftPromise = null;
function loadFichasTecnicas() {
    if (!_ftPromise) {
        _ftPromise = import(pathToFileURL(path.join(
            __dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')).href);
    }
    return _ftPromise;
}

const fallo = (error, status, extra = {}) => ({ ok: false, error, status, ...extra });

/** De qué catálogo sale el modelo de este hueco. */
const kindDeTipo = (type) => (type === 'marco' ? 'marco' : (type === 'cristal' ? 'cristal' : 'aerotermia'));

/** Páginas de un PDF; null si no se puede abrir (no bloquea: es solo para el parte). */
async function contarPaginas(buffer) {
    try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return doc.getPageCount();
    } catch (_) {
        return null;
    }
}

/**
 * Los ficheros que ESTE expediente puede aportar al conjunto: los huecos de
 * ficha técnica ya rellenos y los anexos extra. Devuelve un mapa
 * driveId → { nombre, slotId, type }.
 */
async function piezasDelExpediente(exp) {
    const { resolveAllFichaSlots, ftDocFields, ftFileName } = await loadFichasTecnicas();
    const doc = exp.documentacion || {};
    const mapa = new Map();

    let slots = [];
    try { slots = resolveAllFichaSlots(exp) || []; } catch (_) { slots = []; }
    for (const s of slots) {
        const campos = ftDocFields(s.type);
        const id = campos && doc[campos.id];
        if (!id) continue;
        mapa.set(String(id), {
            nombre: ftFileName(exp.numero_expediente, s.type) || s.label,
            slotId: s.id,
            type: s.type,
        });
    }

    for (const ex of (Array.isArray(doc.cifo_extra_annexes) ? doc.cifo_extra_annexes : [])) {
        if (!ex || !ex.driveId) continue;
        mapa.set(String(ex.driveId), {
            nombre: ex.fileName || ex.label || 'Anexo',
            slotId: `extra_${ex.driveId}`,
            esExtra: true,
        });
    }

    return mapa;
}

/**
 * Une las piezas, deja el PDF resultante como ficha del MODELO y el expediente
 * apuntando a ese mismo documento.
 *
 * @param {object} exp  fila de `expedientes` con id, oportunidad_id,
 *                      numero_expediente, documentacion e instalacion.
 * @param {object} opts
 * @param {string} opts.type      hueco destino ('cal', 'acs', 'cal2', 'marco'…);
 *                                de él sale el modelo del catálogo.
 * @param {Array<{driveId:string, excludedPages?:number[]}>} opts.piezas
 *                                en el orden final del documento.
 * @returns {Promise<object>} parte de lo hecho, o { ok:false, error, status }
 */
async function consolidarFicha(exp, opts = {}) {
    const { parseFtType, findSlotForExpediente } = await loadFichasTecnicas();
    const type = String(opts.type || '').trim().toLowerCase();
    if (!parseFtType(type)) return fallo('bad_type', 400);
    if (!exp || !exp.id) return fallo('expediente_not_found', 404);

    const slot = findSlotForExpediente(exp, type);
    if (!slot) return fallo('slot_no_aplica', 400);
    if (!slot.modelId) return fallo('no_model', 400);

    const lista = (Array.isArray(opts.piezas) ? opts.piezas : [])
        .map(p => (typeof p === 'string' ? { driveId: p } : p))
        .filter(p => p && p.driveId);
    if (lista.length < 2) return fallo('pocas_piezas', 400);

    // Un mismo fichero dos veces en la lista sería el EPREL repetido dentro de la
    // ficha del catálogo, y de ahí a todos los expedientes.
    const vistos = new Set();
    for (const p of lista) {
        if (vistos.has(p.driveId)) return fallo('pieza_repetida', 400, { driveId: p.driveId });
        vistos.add(p.driveId);
    }

    const permitidas = await piezasDelExpediente(exp);
    const ajena = lista.find(p => !permitidas.has(String(p.driveId)));
    if (ajena) return fallo('pieza_ajena', 400, { driveId: ajena.driveId });

    // ── Bajar y unir ─────────────────────────────────────────────────────────
    const items = [];
    const partes = [];
    for (const p of lista) {
        let buffer;
        try { buffer = await getFileContent(p.driveId); }
        catch (e) { return fallo('pieza_ilegible', 400, { driveId: p.driveId, message: e.message }); }
        if (!buffer || !buffer.length) return fallo('pieza_ilegible', 400, { driveId: p.driveId });

        const excludedPages = (Array.isArray(p.excludedPages) ? p.excludedPages : [])
            .map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 1);
        items.push({ buffer, excludedPages });

        const total = await contarPaginas(buffer);
        const meta = permitidas.get(String(p.driveId));
        partes.push({
            nombre: meta.nombre,
            paginas: total === null ? null : Math.max(0, total - excludedPages.length),
            ...(excludedPages.length > 0 ? { recortadas: excludedPages.length } : {}),
        });
    }

    const unido = await unirAnexos(items);
    if (!unido || !unido.length) return fallo('union_vacia', 400);
    const paginas = await contarPaginas(unido);

    // ── El catálogo ──────────────────────────────────────────────────────────
    // `sustituir` va SIEMPRE en true porque el hueco casi nunca está vacío (la
    // ficha del slot suele venir del propio modelo). Quien lo autoriza es el
    // popup, con el modelo y las piezas delante: aquí ya es una decisión tomada.
    const kind = kindDeTipo(type);
    const cat = await guardarFichaEnCatalogo(kind, slot.modelId, {
        buffer: unido,
        sustituir: true,
        partes: { at: new Date().toISOString(), paginas, piezas: partes },
    });
    if (!cat.ok) return fallo('catalogo_error', 500, { motivo: cat.motivo, model: cat.modelo });

    // ── El expediente ────────────────────────────────────────────────────────
    // Por el MISMO camino que el botón ⟳ (`force: true`), para que no haya dos
    // formas de dejar el slot: borra la ficha anterior de la carpeta del
    // expediente, copia el conjunto del catálogo y sella `ft_*_link` / `_id`.
    const sync = await asegurarFichaTecnica(exp, type, { force: true });
    if (!sync.ok) {
        // El catálogo YA está actualizado y este expediente sigue con las piezas
        // sueltas: se dice, porque es el estado desde el que un ⟳ duplicaría el
        // EPREL dentro del certificado.
        return fallo('slot_error', 500, {
            catalogoOk: true, model: cat.modelo, link: cat.link, motivo: sync.error,
        });
    }

    // ── Retirar las piezas ya consumidas ─────────────────────────────────────
    // Solo de la LISTA de anexos (RPC atómica, regla 19). El fichero se queda en
    // "3. FICHAS TÉCNICAS Y CERTIFICACIONES": es la prueba de lo que se unió.
    const retirados = [];
    for (const p of lista) {
        const meta = permitidas.get(String(p.driveId));
        if (!meta.esExtra) continue;
        const { error } = await supabase.rpc('cifo_annex_remove', { p_id: exp.id, p_drive_id: p.driveId });
        if (error) console.warn(`[fichaConsolidada] no se pudo retirar el anexo ${p.driveId}: ${error.message}`);
        else retirados.push(p.driveId);
    }
    await limpiarPrefs(exp, lista.map(p => String(p.driveId)), retirados);

    console.log(`[fichaConsolidada] ${exp.numero_expediente} · ${type} · "${cat.modelo}" ← ${partes.length} piezas, ${paginas} págs`);
    return {
        ok: true,
        model: cat.modelo,
        catalogoLink: cat.link,
        link: sync.link,
        driveId: sync.driveId,
        fileName: sync.fileName,
        paginas,
        partes,
        retirados,
        // Las preferencias YA saneadas: el gestor las adopta tal cual en vez de
        // recalcularlas por su cuenta y volver a escribirlas.
        prefs: (exp.documentacion || {}).cifo_annex_prefs || null,
    };
}

/**
 * Quita de las preferencias de anexos lo que ya no existe: el recorte de páginas
 * de cada pieza consumida (iba por driveId, y esos ficheros ya no se anexan) y
 * los extras retirados del `order`. Sin esto quedan claves apuntando a ficheros
 * que nadie va a anexar y el orden guardado deja de describir la lista.
 */
async function limpiarPrefs(exp, driveIds, retirados) {
    const prefs = (exp.documentacion || {}).cifo_annex_prefs;
    if (!prefs) return;
    const fuera = new Set(driveIds);
    const idsRetirados = new Set(retirados.map(id => `extra_${id}`));

    const excluded = {};
    for (const [driveId, pages] of Object.entries(prefs.excluded || {})) {
        if (fuera.has(String(driveId))) continue;
        excluded[driveId] = pages;
    }
    const order = (Array.isArray(prefs.order) ? prefs.order : []).filter(id => !idsRetirados.has(id));

    const siguiente = { order, excluded };
    const { error } = await supabase.rpc('cifo_annex_prefs_set', { p_id: exp.id, p_prefs: siguiente });
    if (error) { console.warn(`[fichaConsolidada] prefs: ${error.message}`); return; }
    exp.documentacion = { ...(exp.documentacion || {}), cifo_annex_prefs: siguiente };
}

module.exports = { consolidarFicha, piezasDelExpediente };
