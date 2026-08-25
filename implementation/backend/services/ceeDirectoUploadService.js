// ─── ceeDirectoUploadService.js ──────────────────────────────────────────────
// Gemelo de `ceeUploadService.js` para los CEE contratados sueltos.
//
// Por qué un gemelo y no un parámetro más en el original: aquel resuelve la
// carpeta leyendo `oportunidades.datos_calculo`, escribe en `expedientes` y
// dispara `expedienteFolderSync` (que mueve la carpeta entre las 13 carpetas de
// estado del CAE). Nada de eso existe aquí, y meterle un `if (esCeeDirecto)` a
// cada una de esas tres cosas convertiría el camino del CAE —que funciona y está
// en producción— en el sitio donde se rompen los CEE sueltos, y al revés.
//
// Lo que SÍ se comparte, importado y no copiado: la definición de los slots
// (`CEE_SLOTS`) y el reconocimiento del fichero por su sufijo (`matchSlot`). Son
// el contrato con el frontend, y ahí una divergencia sí sería un fallo.

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const ceeDirectoFolders = require('./ceeDirectoFolders');
const { CEE_SLOTS, matchSlot } = require('./ceeUploadService');

function normalizePhase(phase) {
    return (phase === 'final' || phase === 'FINAL') ? 'final' : 'inicial';
}

/**
 * Rótulo de la fase para el nombre del fichero.
 * En un encargo de UN solo certificado el fichero NO se llama "CEE INICIAL":
 * se llama "CEE" a secas, porque no hay ningún otro con el que confundirlo y
 * "inicial" haría pensar que falta un final que nunca va a llegar.
 */
function sectionLabel(ceeDirecto, phase) {
    const doble = String(ceeDirecto?.alcance || 'UNICO').toUpperCase() === 'DOBLE';
    if (!doble) return 'CEE';
    return normalizePhase(phase) === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
}

// ─── Firma HMAC del enlace público de subida ────────────────────────────────
// Stateless, como en el CAE: no se guarda en la fila, así que el autoguardado
// del módulo no puede pisarla. El prefijo del payload es DISTINTO al del CAE
// ('cee-directo-upload:' vs 'cee-upload:') a propósito: un id de expediente CAE
// y uno de cee_directo son ambos UUID, y sin esa separación una firma válida en
// un negocio serviría en el otro.
function uploadSignature(id, phase) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-cee-upload';
    return crypto.createHmac('sha256', secret)
        .update(`cee-directo-upload:${id}:${normalizePhase(phase)}`)
        .digest('hex');
}

function uploadSignatureValid(id, phase, token) {
    if (!token) return false;
    try {
        const expected = uploadSignature(id, phase);
        const a = Buffer.from(expected);
        const b = Buffer.from(String(token));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

/**
 * Carpeta de la fase dentro de la del expediente. Aquí la sección cuelga
 * DIRECTAMENTE de la raíz (`1. CEE INICIAL`), no de una carpeta `1. CEE` como
 * en el CAE: es la estructura que se lleva a mano en `1. PRODUCCION`.
 */
async function ensureSectionFolder(ceeDirecto, phase) {
    const root = ceeDirecto?.drive_folder_id;
    if (!root) return { id: null, link: null };
    const nombre = ceeDirectoFolders.subcarpetaFase(ceeDirecto.alcance, normalizePhase(phase));
    const id = await driveService.getOrCreateSubfolder(root, nombre);
    if (!id) return { id: null, link: null };
    // Pública en lectura: es el enlace que se le manda al certificador para que
    // se descargue lo que hay, y al cliente cuando el encargo está cobrado.
    try { await driveService.setFolderPublic(id, 'reader'); }
    catch (e) { console.warn('[cee-directo] setFolderPublic sección:', e.message); }
    let link = null;
    try { link = await driveService.getWebViewLink(id); } catch { /* noop */ }
    return { id, link };
}

/** Enlace de la carpeta de la fase SIN crearla ni hacerla pública (previsualización). */
async function findSectionFolderLink(ceeDirecto, phase) {
    const root = ceeDirecto?.drive_folder_id;
    if (!root) return null;
    const nombre = ceeDirectoFolders.subcarpetaFase(ceeDirecto.alcance, normalizePhase(phase));
    const id = await driveService.findSubfolderByName(root, nombre);
    if (!id) return null;
    try { return await driveService.getWebViewLink(id); }
    catch { return `https://drive.google.com/drive/folders/${id}`; }
}

/**
 * Qué hay ya en la carpeta de la fase → { slotId: { link, name, id } }.
 * Drive es la fuente de verdad de qué ficheros existen (regla 20): la vista
 * reconcilia contra esto, no contra lo que diga el JSONB.
 */
async function scanSection(ceeDirecto, phase) {
    const out = {};
    const root = ceeDirecto?.drive_folder_id;
    if (!root) return out;
    const nombre = ceeDirectoFolders.subcarpetaFase(ceeDirecto.alcance, normalizePhase(phase));
    const folderId = await driveService.findSubfolderByName(root, nombre);
    if (!folderId) return out;
    const files = await driveService.listFiles(folderId);
    for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue; // OLD
        const slot = matchSlot(f.name);
        if (slot && !out[slot]) out[slot] = { link: f.webViewLink, name: f.name, id: f.id };
    }
    return out;
}

/**
 * Solo los slots pedidos, como adjuntos.
 * La entrega al cliente NO le manda la carpeta entera: un `.cex` y un `.xml` son
 * ficheros de trabajo del certificador que él no puede abrir, y mezclarlos con
 * lo que sí tiene que guardar hace que no sepa cuál es su certificado.
 *
 * @param {string[]} slots ids de CEE_SLOTS ('pdf', 'registro', …)
 */
async function getSlotAttachments(ceeDirecto, phase, slots) {
    const attachments = [];
    const encontrados = await scanSection(ceeDirecto, phase);
    for (const slotId of slots) {
        const f = encontrados[slotId];
        if (!f?.id) continue;
        try {
            const buf = await driveService.getFileContent(f.id);
            if (buf && buf.length) {
                attachments.push({
                    slot: slotId,
                    filename: f.name,
                    content: buf,
                    contentType: 'application/pdf'
                });
            }
        } catch (e) {
            console.warn('[cee-directo] adjunto fallido', f.name, e.message);
        }
    }
    return attachments;
}

/** Los ficheros de la fase como adjuntos de nodemailer. */
async function getSectionAttachments(ceeDirecto, phase) {
    const attachments = [];
    const root = ceeDirecto?.drive_folder_id;
    if (!root) return attachments;
    const nombre = ceeDirectoFolders.subcarpetaFase(ceeDirecto.alcance, normalizePhase(phase));
    const folderId = await driveService.findSubfolderByName(root, nombre);
    if (!folderId) return attachments;
    const files = await driveService.listFiles(folderId);
    for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue;
        try {
            const buf = await driveService.getFileContent(f.id);
            if (buf && buf.length) {
                attachments.push({ filename: f.name, content: buf, contentType: f.mimeType || undefined });
            }
        } catch (e) { console.warn('[cee-directo] adjunto fallido', f.name, e.message); }
    }
    return attachments;
}

/**
 * Sube un fichero al slot de una fase, con el renombrado canónico
 * `{numero} – {SECCIÓN}{sufijo}` y versionado a OLD si ya había uno igual.
 * El guion es el LARGO (–), como en el CAE: cambiarlo dejaría huérfanos los
 * ficheros ya subidos, porque el versionado busca por nombre exacto.
 */
async function uploadFile(ceeDirecto, phase, slotId, buffer, mimeType) {
    const slotDef = CEE_SLOTS.find(s => s.id === slotId);
    if (!slotDef) throw new Error('Slot no válido');
    const { id: targetFolderId } = await ensureSectionFolder(ceeDirecto, phase);
    if (!targetFolderId) throw new Error('El expediente no tiene carpeta de Drive');

    const fileName = `${ceeDirecto.numero_expediente} – ${sectionLabel(ceeDirecto, phase)}${slotDef.suffix}`;

    const existingId = await driveService.findFileByName(targetFolderId, fileName);
    if (existingId) {
        const archived = await driveService.archiveExistingToOld(targetFolderId, existingId, fileName);
        if (archived) console.log(`[cee-directo] Versionado: '${fileName}' → OLD/'${archived}'`);
    }

    const saved = await driveService.saveFileToFolder(
        targetFolderId, fileName, mimeType || 'application/octet-stream', buffer, { throwOnError: true }
    );
    if (!saved?.id) throw new Error('Error al subir el archivo a Drive');
    try { await driveService.setFolderPublic(saved.id, 'reader'); } catch { /* noop */ }
    return { link: saved.link, id: saved.id, fileName };
}

module.exports = {
    CEE_SLOTS,
    normalizePhase,
    sectionLabel,
    uploadSignature,
    uploadSignatureValid,
    ensureSectionFolder,
    findSectionFolderLink,
    scanSection,
    getSectionAttachments,
    getSlotAttachments,
    uploadFile
};
