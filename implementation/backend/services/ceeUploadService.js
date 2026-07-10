// ceeUploadService.js
// Lógica compartida para el enlace público de subida del CEE registrado por el
// certificador (popup "similar al de fotos" con los slots del CEE) y para el
// enlace de descarga (carpeta 1. CEE / CEE INICIAL|FINAL, pública) que se envía
// en el "visto bueno" (approve-cee).
//
// El token es una FIRMA HMAC stateless (como approveCeeSignature en
// routes/expedientes.js): no se guarda en `seguimiento` — así es inmune al
// pisado del autoguardado del módulo. Ver [[project_trazabilidad_cee_certificador]].

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const emailService = require('./emailService');
const { applyStatus } = require('./seguimientoTracking');

// Slots del CEE — ESPEJO de DOCUMENT_SLOTS del frontend (CeeDocumentsGrid.jsx).
// El renombrado usa el mismo patrón `{numExp} – {SECCIÓN}{suffix}` que la app.
const CEE_SLOTS = [
    { id: 'xml',      label: '.XML',        suffix: '.xml',     accept: '.xml' },
    { id: 'pdf',      label: 'PDF FIRMADO', suffix: '_fdo.pdf', accept: '.pdf' },
    { id: 'cex',      label: '.CEX',        suffix: '.cex',     accept: '.cex' },
    { id: 'registro', label: 'REGISTRO',    suffix: '_reg.pdf', accept: '.pdf' },
    { id: 'etiqueta', label: 'ETIQUETA',    suffix: '_etq.pdf', accept: '.pdf' },
];

function normalizePhase(phase) {
    return (phase === 'final' || phase === 'FINAL') ? 'final' : 'inicial';
}
function sectionLabel(phase) {
    return normalizePhase(phase) === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
}
function sectionKey(phase) {
    return normalizePhase(phase) === 'final' ? 'final' : 'inicial';
}

// ─── Firma HMAC stateless para el enlace público de subida del CEE ────────────
function ceeUploadSignature(expId, phase) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-cee-upload';
    return crypto.createHmac('sha256', secret).update(`cee-upload:${expId}:${normalizePhase(phase)}`).digest('hex');
}
function ceeUploadSignatureValid(expId, phase, token) {
    if (!token) return false;
    try {
        const expected = ceeUploadSignature(expId, phase);
        const a = Buffer.from(expected);
        const b = Buffer.from(String(token));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

// Resuelve el driveFolderId del expediente (vive SIEMPRE dentro de
// datos_calculo de la oportunidad; ni expedientes ni oportunidades tienen columna).
async function resolveDriveFolderId(exp) {
    if (!exp) return null;
    const { data: op } = await supabase
        .from('oportunidades')
        .select('datos_calculo')
        .eq('id', exp.oportunidad_id)
        .maybeSingle();
    let dc = op?.datos_calculo || {};
    if (typeof dc === 'string') { try { dc = JSON.parse(dc); } catch { dc = {}; } }
    let id = dc.drive_folder_id || dc.inputs?.drive_folder_id || exp.drive_folder_id || null;
    if (!id && dc.drive_folder_link) {
        const m = String(dc.drive_folder_link).match(/folders\/([A-Za-z0-9_-]+)/);
        if (m) id = m[1];
    }
    return id;
}

// Asegura/crea la carpeta `1. CEE / CEE INICIAL|FINAL`, la hace PÚBLICA (lectura,
// anyone-with-link) y devuelve { id, link }. El link es el que se envía al
// certificador para que descargue los archivos y los presente.
async function ensureCeeSectionFolder(driveFolderId, phase) {
    const ceeRootId = await driveService.getOrCreateSubfolder(driveFolderId, '1. CEE');
    const sectionId = await driveService.getOrCreateSubfolder(ceeRootId, sectionLabel(phase));
    try { await driveService.setFolderPublic(sectionId, 'reader'); }
    catch (e) { console.warn('[cee] setFolderPublic sección:', e.message); }
    let link = null;
    try { link = await driveService.getWebViewLink(sectionId); } catch { /* noop */ }
    return { id: sectionId, link };
}

// Devuelve el link de la carpeta de la sección SIN crearla ni hacerla pública
// (para la previsualización del mensaje; el visto bueno real ya la hace pública).
async function findCeeSectionFolderLink(driveFolderId, phase) {
    if (!driveFolderId) return null;
    const ceeRoot = await driveService.findSubfolderByName(driveFolderId, '1. CEE');
    if (!ceeRoot) return null;
    const sectionId = await driveService.findSubfolderByName(ceeRoot, sectionLabel(phase));
    if (!sectionId) return null;
    try { return await driveService.getWebViewLink(sectionId); }
    catch { return `https://drive.google.com/drive/folders/${sectionId}`; }
}

const matchSlot = (filename) => {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.xml')) return 'xml';
    if (lower.endsWith('.cex')) return 'cex';
    if (lower.endsWith('_reg.pdf')) return 'registro';
    if (lower.endsWith('_etq.pdf')) return 'etiqueta';
    if (lower.endsWith('_fdo.pdf')) return 'pdf';
    return null;
};

// Escanea la carpeta de la sección y devuelve { slotId: { link, name } } de lo
// que ya hay subido (para pintar el estado en el popup público).
async function scanCeeSection(driveFolderId, phase) {
    const out = {};
    if (!driveFolderId) return out;
    const ceeRoot = await driveService.findSubfolderByName(driveFolderId, '1. CEE');
    if (!ceeRoot) return out;
    const sectionFolder = await driveService.findSubfolderByName(ceeRoot, sectionLabel(phase));
    if (!sectionFolder) return out;
    const files = await driveService.listFiles(sectionFolder);
    for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
        const slot = matchSlot(f.name);
        if (slot && !out[slot]) out[slot] = { link: f.webViewLink, name: f.name };
    }
    return out;
}

// Devuelve los archivos de la sección como adjuntos de nodemailer
// [{ filename, content, contentType }] — para el "enviar directamente por email".
async function getCeeSectionAttachments(driveFolderId, phase) {
    const attachments = [];
    if (!driveFolderId) return attachments;
    const ceeRoot = await driveService.findSubfolderByName(driveFolderId, '1. CEE');
    if (!ceeRoot) return attachments;
    const sectionFolder = await driveService.findSubfolderByName(ceeRoot, sectionLabel(phase));
    if (!sectionFolder) return attachments;
    const files = await driveService.listFiles(sectionFolder);
    for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
        try {
            const buf = await driveService.getFileContent(f.id);
            if (buf && buf.length) {
                attachments.push({ filename: f.name, content: buf, contentType: f.mimeType || undefined });
            }
        } catch (e) { console.warn('[cee] adjunto fallido', f.name, e.message); }
    }
    return attachments;
}

// Sube 1 fichero a la carpeta de la sección con el renombrado canónico
// (`{numExp} – {SECCIÓN}{suffix}`) y versionado a "OLD" si ya existía uno con
// ese nombre — misma lógica que POST /:id/documents/upload de la app.
// Devuelve { link, id, fileName }.
async function uploadCeeFile(driveFolderId, phase, numExp, slotId, buffer, mimeType) {
    const slotDef = CEE_SLOTS.find(s => s.id === slotId);
    if (!slotDef) throw new Error('Slot no válido');
    const { id: targetFolderId } = await ensureCeeSectionFolder(driveFolderId, phase);
    const fileName = `${numExp} – ${sectionLabel(phase)}${slotDef.suffix}`;

    // Versionado: si ya existe uno con el mismo nombre, moverlo a "OLD"
    // como `{base}_OLD`, `{base}_OLD1`, `{base}_OLD2`…
    const existingId = await driveService.findFileByName(targetFolderId, fileName);
    if (existingId) {
        const archived = await driveService.archiveExistingToOld(targetFolderId, existingId, fileName);
        if (archived) console.log(`[cee] Versionado: '${fileName}' → OLD/'${archived}'`);
    }

    const saved = await driveService.saveFileToFolder(
        targetFolderId, fileName, mimeType || 'application/octet-stream', buffer, { throwOnError: true }
    );
    if (!saved?.id) throw new Error('Error al subir el archivo a Drive');
    // Público (anyone-with-link reader) para que el preview funcione sin login.
    try { await driveService.setFolderPublic(saved.id, 'reader'); } catch { /* noop */ }
    return { link: saved.link, id: saved.id, fileName };
}

// Transición REGISTRADO idéntica a la de la app (subir el REGISTRO desde el panel).
// Sella el seguimiento, la fecha de registro, avanza el estado global y dispara la
// MISMA notificación al admin (email con enlace one-tap "Notificar al Cliente").
// Idempotente: si ya estaba REGISTRADO no repite.
async function markCeeRegistradoFromUpload(exp, phase) {
    const ph = normalizePhase(phase);
    const segKey = ph === 'final' ? 'cee_final' : 'cee_inicial';
    const phaseLabelUpper = ph === 'final' ? 'CEE FINAL' : 'CEE INICIAL';

    // Re-fetch fresco para no pisar con copia obsoleta.
    const { data: fresh } = await supabase.from('expedientes').select('*').eq('id', exp.id).single();
    if (!fresh) return { ok: false };
    const seguimiento = fresh.seguimiento || {};
    if (seguimiento[segKey] === 'REGISTRADO') return { ok: true, already: true };

    applyStatus(seguimiento, segKey, 'REGISTRADO');

    const docObj = fresh.documentacion || {};
    const today = new Date().toISOString().split('T')[0];
    if (ph === 'final') docObj.fecha_registro_cee_final = today;
    else docObj.fecha_registro_cee_inicial = today;

    let newEstado = fresh.estado;
    if (ph === 'inicial' && fresh.estado === 'PTE. CEE INICIAL') newEstado = 'PTE. FIN OBRA';

    // Token one-tap (7 días) para que el admin notifique al cliente desde el email.
    const notifyToken = crypto.randomBytes(32).toString('hex');
    const tokenKey = ph === 'final' ? 'notify_client_token_final' : 'notify_client_token_inicial';
    seguimiento[tokenKey] = notifyToken;
    seguimiento[tokenKey + '_exp'] = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const historial = docObj.historial || [];
    if (newEstado !== fresh.estado) {
        historial.push({ id: Date.now().toString() + '_status', estado: newEstado, fecha: new Date().toISOString(), usuario: 'CERTIFICADOR' });
    }
    historial.push({
        id: Date.now().toString() + '_reg_upl',
        tipo: 'informativo',
        texto: `El certificador ha subido el justificante de registro del ${phaseLabelUpper} desde el enlace público. ${phaseLabelUpper} REGISTRADO.`,
        fecha: new Date().toISOString(),
        usuario: 'CERTIFICADOR'
    });
    docObj.historial = historial;

    // La etiqueta URGENTE existe para que certificador y admin prioricen el
    // registro del CEE. Una vez registrado, deja de tener sentido.
    const updatePayload = {
        seguimiento, estado: newEstado, documentacion: docObj, updated_at: new Date().toISOString()
    };
    if (fresh.prioridad === 'URGENTE') updatePayload.prioridad = 'NORMAL';

    await supabase.from('expedientes').update(updatePayload).eq('id', exp.id);

    // Email al admin con enlace one-tap (fire-and-forget), igual que la app.
    setImmediate(async () => {
        try {
            const [{ data: cli }, { data: op }] = await Promise.all([
                supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia, codigo_postal, direccion').eq('id_cliente', fresh.cliente_id).maybeSingle(),
                supabase.from('oportunidades').select('id_oportunidad').eq('id', fresh.oportunidad_id).maybeSingle()
            ]);
            const numExp = fresh.numero_expediente || op?.id_oportunidad || fresh.id;
            const clienteFull = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '';
            const ubicacion = cli ? `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})` : '';
            const expedienteLink = `https://app.brokergy.es/?exp=${fresh.id}`;
            const notifyLink = `https://app.brokergy.es/api/expedientes/${fresh.id}/notify-client?token=${notifyToken}&phase=${ph}`;
            await emailService.sendCeeRegistradoStaffEmail(
                'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, '', phaseLabelUpper, expedienteLink, notifyLink
            );
        } catch (e) { console.error('[cee markRegistrado admin email]', e.message); }
    });

    return { ok: true, newEstado };
}

module.exports = {
    CEE_SLOTS,
    normalizePhase,
    sectionLabel,
    sectionKey,
    ceeUploadSignature,
    ceeUploadSignatureValid,
    resolveDriveFolderId,
    ensureCeeSectionFolder,
    findCeeSectionFolderLink,
    scanCeeSection,
    getCeeSectionAttachments,
    uploadCeeFile,
    markCeeRegistradoFromUpload,
};
