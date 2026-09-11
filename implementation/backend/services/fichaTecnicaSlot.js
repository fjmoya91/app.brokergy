// ============================================================================
// fichaTecnicaSlot.js — RELLENAR el hueco de ficha técnica de un expediente
//                       desde el CATÁLOGO del modelo que declara.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE COMO SERVICIO. Esta decisión vivía dentro de la ruta
// `POST /:id/fichas-tecnicas/auto-copy`, y a esa ruta la llamaba UNA sola cosa:
// el modal del certificado, al abrirlo. Consecuencia medida el 10/09/2026 sobre
// LOTE-2025-005: dos expedientes (25RES080_26 y 26RES080_34) tenían el marco, el
// vidrio y la aerotermia ELEGIDOS del catálogo, con su ficha EN el catálogo, y
// aun así el paquete E{n} decía "FALTA 4-1 Fichas técnicas de los equipos" —
// porque el paquete lee el SLOT (`ft_*_link`) y nadie había abierto ese modal
// desde que el catálogo de ventanas existe.
//
// O sea: no faltaba ningún documento. Faltaba que alguien pasara por la pantalla
// que lo copia. Sacándolo aquí, la MISMA copia la puede pedir cualquiera que
// necesite la ficha —la ruta, el paquete del lote, un script—, y todos escriben
// el mismo fichero, con el mismo nombre, en el mismo slot.
//
// REGLA — la ficha del catálogo NO sustituye a la que haya en el expediente.
// Si el slot ya apunta a un fichero, se devuelve ése: puede ser una ficha subida
// a mano que corrige a la del catálogo, y pisarla en silencio cambiaría lo que
// se le presenta al verificador. Solo `force` la reemplaza, y eso lo pide una
// persona desde el botón de "volver a sincronizar".
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');
const axios = require('axios');
const supabase = require('./supabaseClient');
const {
    findSubfolderByName, createSubfolder, findFileByName,
    copyFile, deleteFile, getFileMetadata, saveFileToFolder,
} = require('./driveService');

let _ftPromise = null;
function loadFichasTecnicas() {
    if (!_ftPromise) {
        _ftPromise = import(pathToFileURL(path.join(
            __dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')).href);
    }
    return _ftPromise;
}

const CARPETA_FT = '3. FICHAS TÉCNICAS Y CERTIFICACIONES';

// De qué catálogo sale la ficha de cada tipo de hueco. Los tres se leen igual:
// una fila con su `ficha_tecnica` (URL de Drive o del fabricante).
// `ficha_tecnica_partes` describe el CONJUNTO cuando la ficha del modelo son
// varios documentos unidos (ficha + EPREL + etiqueta). Viaja de vuelta a quien
// pide la copia para poder DECIR qué trae dentro: si no, el siguiente expediente
// ve "5 págs" y no sabe si el EPREL va ahí — que es lo que lleva a subirlo otra
// vez y a que el certificado acabe con el EPREL duplicado.
const CATALOGO = {
    marco:   { tabla: 'ventanas_marcos',    sel: 'id, marca, serie, apertura, ficha_tecnica, ficha_tecnica_partes',                   etiqueta: (e) => [e.marca, e.serie, e.apertura].filter(Boolean).join(' ') },
    cristal: { tabla: 'ventanas_cristales', sel: 'id, fabricante, gama, composicion, ficha_tecnica, ficha_tecnica_partes',            etiqueta: (e) => [e.fabricante, e.gama, e.composicion].filter(Boolean).join(' ') },
    aero:    { tabla: 'aerotermia',         sel: 'id, marca, modelo_comercial, modelo_conjunto, ficha_tecnica, ficha_tecnica_partes', etiqueta: (e) => e.modelo_comercial || e.modelo_conjunto || `id=${e.id}` },
};
const catalogoDe = (type) => CATALOGO[type === 'marco' ? 'marco' : (type === 'cristal' ? 'cristal' : 'aero')];

const fallo = (error, status, extra = {}) => ({ ok: false, error, status, ...extra });

/**
 * Deja el hueco `type` del expediente apuntando a la ficha técnica de su modelo.
 *
 * @param {object} exp   fila de `expedientes` con id, oportunidad_id,
 *                       numero_expediente, documentacion e instalacion.
 * @param {string} type  'cal' | 'acs' | 'cal2' … | 'marco' | 'cristal'
 * @param {object} opts  { force?, driveFolderId? }
 * @returns {Promise<{ok:true, link, driveId, copied, source, fileName, model}
 *                  | {ok:false, error, status, model?, url?}>}
 *
 * NUNCA lanza porque la ficha no esté: quien llama decide si eso bloquea. Un
 * modelo sin ficha en el catálogo es un dato que falta, no una avería.
 */
async function asegurarFichaTecnica(exp, type, opts = {}) {
    const { force = false } = opts;
    const { parseFtType, ftFileName, ftDocFields, findSlotForExpediente } = await loadFichasTecnicas();
    if (!parseFtType(type)) return fallo('bad_type', 400);
    if (!exp || !exp.id) return fallo('expediente_not_found', 404);

    // Manda el ALCANCE del expediente: si este hueco no le corresponde (el ACS lo
    // cubre el mismo equipo, es un termo eléctrico, o el RES080 no toca ventanas),
    // no hay ficha que copiar — y no se inventa una copia del modelo de al lado.
    const slot = findSlotForExpediente(exp, type);
    if (!slot) return fallo('slot_no_aplica', 400);
    if (!slot.modelId) return fallo('no_model', 400);

    const cat = catalogoDe(type);
    const { data: equipo } = await supabase.from(cat.tabla).select(cat.sel).eq('id', slot.modelId).single();
    if (!equipo) return fallo('model_not_found', 400, { modeloId: slot.modelId });
    const model = cat.etiqueta(equipo);
    if (!equipo.ficha_tecnica) return fallo('no_ficha_in_db', 400, { model });

    let driveFolderId = opts.driveFolderId;
    if (!driveFolderId) {
        const { data: op } = await supabase.from('oportunidades')
            .select('datos_calculo').eq('id', exp.oportunidad_id).single();
        driveFolderId = op && op.datos_calculo
            ? (op.datos_calculo.drive_folder_id || (op.datos_calculo.inputs || {}).drive_folder_id)
            : null;
    }
    if (!driveFolderId) return fallo('no_drive_folder', 400, { model });

    let ftFolderId = await findSubfolderByName(driveFolderId, CARPETA_FT);
    if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, CARPETA_FT);

    const fileName = ftFileName(exp.numero_expediente, type);
    const fields = ftDocFields(type);

    // Ya está en su carpeta con su nombre canónico: se ADOPTA. Que el slot esté
    // vacío no significa que el fichero no exista — es el mismo caso, al revés,
    // que produjo el fallo de LOTE-2025-005.
    const existingId = await findFileByName(ftFolderId, fileName);
    if (existingId && !force) {
        const meta = await getFileMetadata(existingId);
        const link = (meta && meta.webViewLink) || `https://drive.google.com/file/d/${existingId}/view`;
        await sellarSlot(exp, fields, link, existingId);
        return { ok: true, driveId: existingId, link, fileName, copied: false, source: 'existing', model };
    }
    if (existingId && force) await deleteFile(existingId);

    // La ficha del modelo puede vivir en Drive (copia Drive→Drive) o en una URL
    // EXTERNA del fabricante/EPREL (descarga HTTP + subida a Drive).
    const fichaUrl = String(equipo.ficha_tecnica);
    const driveMatch = fichaUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fichaUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const sourceFileId = driveMatch && driveMatch[1];

    let result;
    if (sourceFileId) {
        result = await copyFile(sourceFileId, ftFolderId, fileName);
    } else if (/^https?:\/\//i.test(fichaUrl)) {
        let dl;
        try {
            dl = await axios.get(fichaUrl, {
                responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5,
                validateStatus: s => s >= 200 && s < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)',
                    'Accept': 'application/pdf,*/*',
                },
            });
        } catch (dlErr) {
            console.error(`[FT slot] descarga externa fallo (${fichaUrl}): ${dlErr.message}`);
            return fallo('external_fetch_failed', 400, { model, url: fichaUrl });
        }
        const buf = Buffer.from(dl.data);
        const ct = String(dl.headers['content-type'] || '').toLowerCase();
        const isPdf = buf.slice(0, 5).toString('latin1') === '%PDF-' || ct.includes('application/pdf');
        if (!isPdf) {
            console.warn(`[FT slot] URL externa no es un PDF (${fichaUrl}, content-type="${ct}")`);
            return fallo('external_not_pdf', 400, { model, url: fichaUrl });
        }
        result = await saveFileToFolder(ftFolderId, fileName, 'application/pdf', buf);
        if (result) console.log(`[FT slot] ficha externa descargada y subida (${buf.length} bytes) <- ${fichaUrl}`);
    } else {
        return fallo('bad_ficha_url', 400, { model, url: fichaUrl });
    }
    if (!result) return fallo('copy_failed', 500, { model });

    await sellarSlot(exp, fields, result.link, result.id);
    console.log(`[FT slot] ${fileName} <- modelo "${model}" (driveId=${result.id})`);
    // `partes` solo se afirma cuando el fichero ACABA de salir del catálogo. Sobre
    // uno adoptado de la carpeta (`source: 'existing'`) no se puede decir qué trae
    // dentro: puede ser una subida a mano con el nombre canónico.
    return {
        ok: true, driveId: result.id, link: result.link, fileName,
        copied: true, source: 'model', model,
        partes: equipo.ficha_tecnica_partes || null,
    };
}

/**
 * Escribe el enlace y el id en `documentacion`, y actualiza el objeto EN MEMORIA
 * que traía quien llama — el paquete lo lee justo después, y con una copia
 * desfasada seguiría creyendo que el hueco está vacío.
 */
async function sellarSlot(exp, fields, link, driveId) {
    const doc = exp.documentacion || {};
    if (doc[fields.link] === link && doc[fields.id] === driveId) return;
    const docObj = { ...doc, [fields.link]: link, [fields.id]: driveId };
    await supabase.from('expedientes')
        .update({ documentacion: docObj, updated_at: new Date().toISOString() })
        .eq('id', exp.id);
    exp.documentacion = docObj;
}

/**
 * Lo mismo para TODOS los huecos que le corresponden al expediente, rellenando
 * solo los que estén VACÍOS. Devuelve el parte de lo que ha hecho para poder
 * DECIRLO: una ficha que aparece sola en el paquete sin explicación es
 * exactamente lo que no se puede auditar tres meses después.
 *
 * @returns {Promise<Array<{type, label, ...resultado}>>} una entrada por hueco
 *          RELLENADO o FALLIDO; los que ya estaban no salen.
 */
async function asegurarFichasTecnicas(exp, opts = {}) {
    const { resolveAllFichaSlots, ftDocFields } = await loadFichasTecnicas();
    const parte = [];
    let slots = [];
    try { slots = resolveAllFichaSlots(exp) || []; } catch (_) { return parte; }
    for (const sl of slots) {
        const campos = ftDocFields(sl.type);
        const doc = exp.documentacion || {};
        if (doc[campos.id] || doc[campos.link]) continue;   // ya lo tiene
        let r;
        try { r = await asegurarFichaTecnica(exp, sl.type, opts); }
        catch (e) { r = fallo('internal', 500, { message: e.message }); }
        parte.push({ type: sl.type, label: sl.label, ...r });
    }
    return parte;
}

module.exports = { asegurarFichaTecnica, asegurarFichasTecnicas, CARPETA_FT };
