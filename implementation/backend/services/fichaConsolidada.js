// ============================================================================
// fichaConsolidada.js — la ficha del catálogo, cuando son VARIOS papeles
// ----------------------------------------------------------------------------
// El catálogo guarda UNA ficha por modelo, y durante mucho tiempo bastaba. Dejó
// de bastar con el EPREL: cuando el SCOP se justifica por ahí, el certificado
// necesita TRES documentos —la ficha del fabricante, la ficha EPREL y la
// etiqueta energética—, y el catálogo solo aportaba el primero. Así que en cada
// expediente con ese modelo alguien buscaba los otros dos y los soltaba a mano
// en el gestor de anexos. Otra vez. Y otra.
//
// Aquí se cierra ese círculo: los anexos que ya están dados por buenos en el
// gestor se UNEN en un solo PDF y ese PDF pasa a ser la ficha del modelo. El
// siguiente expediente que elija ese equipo se la copia entera.
//
// ── REGLAS ──────────────────────────────────────────────────────────────────
//
// REGLA — un pack POR HUECO, nunca uno para todo. Un expediente puede llevar la
// bomba de calefacción y un equipo de ACS, que son DOS modelos del catálogo:
// meter la ficha del segundo dentro de la del primero no estropea un expediente,
// estropea el catálogo — y de ahí baja a todos los que lleven ese modelo. Por
// eso se reciben `grupos`, uno por hueco, cada uno con SUS piezas. Una pieza
// suelta puede ir en dos grupos (un documento que cubre los dos equipos): de eso
// decide una persona en el popup, nunca el nombre del fichero.
//
// REGLA — se une EXACTAMENTE lo que va al certificado. Mismo orden del gestor,
// mismos recortes de páginas (`cifo_annex_prefs.excluded`) y el mismo
// `unirAnexos` que produce la ficha técnica suelta del paquete E{n}. Si la ficha
// del catálogo no fuera página a página el bloque de anexos, el documento suelto
// y el que va dentro del certificado dejarían de coincidir — que es justo lo que
// mira quien lo verifica. Es también lo que hace que el RECORTE viaje: quitar la
// portada comercial de una ficha de treinta páginas y guardarla así ahorra ese
// trabajo a todos los expedientes que vengan detrás, y por eso un grupo de UNA
// sola pieza vale si lleva recorte.
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
// de lo que se ha unido. Y una pieza repartida entre dos huecos solo se retira
// si los DOS packs han salido bien.
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

/** Las páginas excluidas de una pieza, saneadas. */
const recorte = (p) => (Array.isArray(p.excludedPages) ? p.excludedPages : [])
    .map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 1);

/**
 * Los ficheros que ESTE expediente puede aportar: los huecos de ficha técnica ya
 * rellenos y los anexos extra. Devuelve un mapa driveId → { nombre, esExtra }.
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
 * Comprueba un grupo ENTERO antes de tocar nada. Se validan todos los grupos por
 * delante a propósito: a mitad de la tanda el catálogo ya estaría escrito, y no
 * se puede descubrir ahí que el segundo hueco no existía.
 */
async function validarGrupo(exp, g, permitidas) {
    const { parseFtType, findSlotForExpediente } = await loadFichasTecnicas();
    const type = String(g.type || '').trim().toLowerCase();
    if (!parseFtType(type)) return fallo('bad_type', 400, { type: g.type });

    const slot = findSlotForExpediente(exp, type);
    if (!slot) return fallo('slot_no_aplica', 400, { type });
    if (!slot.modelId) return fallo('no_model', 400, { type });

    const piezas = (Array.isArray(g.piezas) ? g.piezas : [])
        .map(p => (typeof p === 'string' ? { driveId: p } : p))
        .filter(p => p && p.driveId)
        .map(p => ({ driveId: String(p.driveId), excludedPages: recorte(p) }));

    // Un mismo fichero dos veces en el MISMO pack sería el EPREL repetido dentro
    // de la ficha del catálogo, y de ahí a todos los expedientes.
    const vistos = new Set();
    for (const p of piezas) {
        if (vistos.has(p.driveId)) return fallo('pieza_repetida', 400, { type, driveId: p.driveId });
        vistos.add(p.driveId);
    }
    const ajena = piezas.find(p => !permitidas.has(p.driveId));
    if (ajena) return fallo('pieza_ajena', 400, { type, driveId: ajena.driveId });

    // Una sola pieza SIN recorte deja la ficha del catálogo igual que está: no es
    // un error, es un gesto vacío, y guardarlo solo archivaría una copia en OLD.
    if (piezas.length === 0) return fallo('pocas_piezas', 400, { type });
    if (piezas.length === 1 && piezas[0].excludedPages.length === 0) {
        return fallo('pocas_piezas', 400, { type });
    }

    return { ok: true, type, slot, piezas };
}

/** Une las piezas de un grupo y deja el resultado en el catálogo y en el slot. */
async function aplicarGrupo(exp, v, permitidas) {
    const items = [];
    const partes = [];
    for (const p of v.piezas) {
        let buffer;
        try { buffer = await getFileContent(p.driveId); }
        catch (e) { return fallo('pieza_ilegible', 400, { type: v.type, driveId: p.driveId, message: e.message }); }
        if (!buffer || !buffer.length) return fallo('pieza_ilegible', 400, { type: v.type, driveId: p.driveId });

        items.push({ buffer, excludedPages: p.excludedPages });
        const total = await contarPaginas(buffer);
        partes.push({
            nombre: permitidas.get(p.driveId).nombre,
            paginas: total === null ? null : Math.max(0, total - p.excludedPages.length),
            ...(p.excludedPages.length > 0 ? { recortadas: p.excludedPages.length } : {}),
        });
    }

    const unido = await unirAnexos(items);
    if (!unido || !unido.length) return fallo('union_vacia', 400, { type: v.type });
    const paginas = await contarPaginas(unido);

    // `sustituir` va SIEMPRE en true porque el hueco casi nunca está vacío (la
    // ficha del slot suele venir del propio modelo). Quien lo autoriza es el
    // popup, con el modelo y las piezas delante: aquí ya es una decisión tomada.
    const cat = await guardarFichaEnCatalogo(kindDeTipo(v.type), v.slot.modelId, {
        buffer: unido,
        sustituir: true,
        partes: { at: new Date().toISOString(), paginas, piezas: partes },
    });
    if (!cat.ok) return fallo('catalogo_error', 500, { type: v.type, motivo: cat.motivo, model: cat.modelo });

    // Por el MISMO camino que el botón ⟳ (`force: true`), para que no haya dos
    // formas de dejar el slot: borra la ficha anterior de la carpeta del
    // expediente, copia el conjunto del catálogo y sella `ft_*_link` / `_id`.
    const sync = await asegurarFichaTecnica(exp, v.type, { force: true });
    if (!sync.ok) {
        // El catálogo YA está actualizado y este expediente sigue con las piezas
        // sueltas: se dice, porque es el estado desde el que un ⟳ duplicaría el
        // EPREL dentro del certificado.
        return fallo('slot_error', 500, {
            type: v.type, catalogoOk: true, model: cat.modelo, link: cat.link, motivo: sync.error,
        });
    }

    return {
        ok: true,
        type: v.type,
        slotId: v.slot.id,
        model: cat.modelo,
        catalogoLink: cat.link,
        link: sync.link,
        driveId: sync.driveId,
        fileName: sync.fileName,
        paginas,
        partes,
    };
}

/**
 * Guarda como ficha del modelo el conjunto de cada hueco marcado.
 *
 * @param {object} exp  fila de `expedientes` con id, oportunidad_id,
 *                      numero_expediente, documentacion e instalacion.
 * @param {object} opts
 * @param {Array<{type:string, piezas:Array<{driveId:string, excludedPages?:number[]}>}>} opts.grupos
 *        uno por hueco; las piezas, en el orden final del documento.
 *        Se admite también `{ type, piezas }` suelto (un solo grupo).
 * @returns {Promise<object>} parte de lo hecho, o { ok:false, error, status }
 */
async function consolidarFicha(exp, opts = {}) {
    if (!exp || !exp.id) return fallo('expediente_not_found', 404);

    const grupos = Array.isArray(opts.grupos) && opts.grupos.length > 0
        ? opts.grupos
        : (opts.type ? [{ type: opts.type, piezas: opts.piezas }] : []);
    if (grupos.length === 0) return fallo('sin_grupos', 400);

    const permitidas = await piezasDelExpediente(exp);

    // 1) Validar TODO antes de escribir nada.
    const validados = [];
    const tipos = new Set();
    for (const g of grupos) {
        const v = await validarGrupo(exp, g, permitidas);
        if (!v.ok) return v;
        if (tipos.has(v.type)) return fallo('grupo_repetido', 400, { type: v.type });
        tipos.add(v.type);
        validados.push(v);
    }

    // 2) Aplicar grupo a grupo.
    const hechos = [];
    const fallidos = [];
    for (const v of validados) {
        let r;
        try { r = await aplicarGrupo(exp, v, permitidas); }
        catch (e) { r = fallo('internal', 500, { type: v.type, message: e.message }); }
        if (r.ok) hechos.push(r); else fallidos.push(r);
    }
    if (hechos.length === 0) return fallidos[0];

    // 3) Retirar de la lista de anexos las piezas ya consumidas. Una pieza
    //    repartida entre dos huecos solo sale si los DOS packs salieron bien:
    //    si no, seguiría haciendo falta suelta para el que falló.
    const tiposOk = new Set(hechos.map(h => h.type));
    const usadaEn = new Map();          // driveId → tipos de grupo en los que entra
    for (const v of validados) {
        for (const p of v.piezas) {
            if (!usadaEn.has(p.driveId)) usadaEn.set(p.driveId, []);
            usadaEn.get(p.driveId).push(v.type);
        }
    }

    const retirados = [];
    const consumidos = [];
    for (const [driveId, enTipos] of usadaEn.entries()) {
        if (!enTipos.every(t => tiposOk.has(t))) continue;
        consumidos.push(driveId);
        if (!permitidas.get(driveId).esExtra) continue;
        const { error } = await supabase.rpc('cifo_annex_remove', { p_id: exp.id, p_drive_id: driveId });
        if (error) console.warn(`[fichaConsolidada] no se pudo retirar el anexo ${driveId}: ${error.message}`);
        else retirados.push(driveId);
    }
    await limpiarPrefs(exp, consumidos, retirados);

    for (const h of hechos) {
        console.log(`[fichaConsolidada] ${exp.numero_expediente} · ${h.type} · "${h.model}" ← ${h.partes.length} piezas, ${h.paginas} págs`);
    }
    return {
        ok: true,
        grupos: hechos,
        fallidos,
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
    const fuera = new Set(driveIds.map(String));
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
