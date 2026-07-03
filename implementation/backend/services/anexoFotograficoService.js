/**
 * anexoFotograficoService.js
 *
 * Generación AUTOMÁTICA (server-side) del Anexo Fotográfico, para que un agente
 * (skill de Cowork / herramienta MCP) o la propia app puedan dejar el documento
 * listo para firma sin abrir el modal.
 *
 * Reutiliza el MISMO diseño que el modal del frontend a través del módulo espejo
 * `anexoFotograficoDoc.js`. Recopila las fotos ya nombradas por slot en Drive
 * ("12. DOCUMENTOS PARA CEE"), construye el HTML, lo renderiza con Puppeteer y lo
 * guarda en "6. ANEXOS CAE", dejando el enlace en
 * `expedientes.documentacion.anexo_fotografico_drive_link`.
 */
const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const reformaUploadService = require('./reformaUploadService');
const { buildAnexoFullHtml, groupRowsIntoActuaciones } = require('./anexoFotograficoDoc');
const { resolveCcaaInstalacion, COD_A_CCAA } = require('./geoCcaa');

const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE';
const SUBCARPETA_ANEXOS = '6. ANEXOS CAE';

// Logo del pie/portada. El contenedor del backend NO tiene el public/ del
// frontend, así que servimos una copia propia (implementation/backend/assets).
let _logoDataUri = null;
function getLogoDataUri() {
    if (_logoDataUri !== null) return _logoDataUri;
    try {
        const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo_brokergy_doc.png'));
        _logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (e) {
        console.warn('[AnexoFoto] No se pudo leer el logo:', e.message);
        _logoDataUri = '';
    }
    return _logoDataUri;
}

const extToMime = (filename) => {
    const ext = (String(filename).split('.').pop() || '').toLowerCase();
    const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', bmp: 'image/bmp' };
    return map[ext] || 'image/jpeg';
};

/**
 * Recopila las fotos del Anexo Fotográfico desde Drive, agrupadas por concepto
 * (mismo criterio que GET /api/public/anexo-photos). Un concepto sin foto no
 * aparece. Orden ANTES→DESPUÉS.
 *
 * @returns {Promise<{ groups: Array<{key,label,fase,photos:[{name,data}]}> }>}
 */
async function collectPhotoGroups(datosCalculo = {}) {
    const dc = datosCalculo || {};
    const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
    if (!driveFolderId) return { groups: [] };
    const subfolderId = await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_DOCS);
    if (!subfolderId) return { groups: [] };

    const driveFiles = await driveService.listFiles(subfolderId);
    const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
    const isImg = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');

    // Conceptos: todas las actuaciones (DESPUÉS) + el estado inicial de cada una
    // (ANTES), excluyendo las fotos de CONTEXTO (fachada de la calle, patios), que
    // no son actuación. Sin vídeos/docs/otros.
    const ANTES_CONTEXTO = new Set(['FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES', 'FOTO_PATIO_LUCES']);
    const concepts = reformaUploadService.buildDocChecklist(dc)
        .filter(s => !/^(VIDEO_|DOC_|OTROS_)/.test(s.key) && (s.fase === 'DESPUES' || !ANTES_CONTEXTO.has(s.key)))
        .map(s => ({ key: s.key, label: s.label, fase: s.fase }));
    // Legacy: "unidad interior / ACS" suelto (expedientes del anexo previo).
    if (!concepts.some(c => c.key === 'FOTO_UNIDAD_INTERIOR')) {
        concepts.push({ key: 'FOTO_UNIDAD_INTERIOR', label: 'Unidad interior / ACS', fase: 'DESPUES' });
    }

    const toB64 = async (file) => {
        const buffer = await driveService.getFileContent(file.id);
        if (!buffer) return null;
        let mt = file.mimeType;
        if (!mt || !mt.startsWith('image/')) mt = extToMime(file.name);
        return { name: file.name, data: `data:${mt};base64,${buffer.toString('base64')}` };
    };

    const groups = [];
    for (const c of concepts) {
        const matches = driveFiles
            .filter(f => isImg(f) && reformaUploadService.fileBelongsToSlot(f.name, c.key))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
        if (!matches.length) continue;
        const photos = [];
        for (const f of matches) {
            // eslint-disable-next-line no-await-in-loop
            const p = await toB64(f);
            if (p) photos.push(p);
        }
        if (photos.length) groups.push({ key: c.key, label: c.label, fase: c.fase, photos });
    }
    return { groups };
}

/**
 * Aplana los grupos en las filas que consume buildAnexoFullHtml.
 * Etiqueta cada foto con su slotKey/fase y numera los duplicados: "Label (2)".
 */
function buildRowsFromGroups(groups) {
    const rows = [];
    for (const g of groups) {
        (g.photos || []).forEach((ph, i) => {
            rows.push({
                id: `drive_${ph.name}`,
                label: i === 0 ? g.label : `${g.label} (${i + 1})`,
                slotKey: g.key,
                fase: g.fase,
                file: { name: ph.name, data: ph.data },
            });
        });
    }
    return rows;
}

// Nombre de provincia por su código INE (subconjunto para el pie/portada). Si no
// está, no pasa nada: la portada usa CCAA + dirección completa.
const PROV_NOMBRE = {
    '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
    '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz',
    '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
    '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa', '21': 'Huelva',
    '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo',
    '28': 'Madrid', '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
    '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra', '37': 'Salamanca',
    '38': 'S.C. de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla', '42': 'Soria',
    '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
    '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza', '01': 'Álava', '51': 'Ceuta', '52': 'Melilla',
};

/**
 * Datos de la portada/pies. Prioriza la dirección de la INSTALACIÓN, nunca la
 * del cliente (regla de oro de documentos).
 */
function buildDocMeta(exp, cliente, op) {
    const inst = exp.instalacion || {};
    const dc = op?.datos_calculo || {};
    const opIn = { ...dc, ...(dc.inputs || {}) };
    const isNum = (v) => /^\d+$/.test(String(v ?? '').trim());

    // Dirección de instalación: propia si misma_direccion === false, si no, cliente.
    const cliAddr = inst.misma_direccion === false ? {} : (cliente || {});
    const calle = inst.direccion || opIn.direccion || opIn.address || cliAddr.direccion || '';
    const num = inst.num || '';
    const cp = inst.codigo_postal || opIn.cp || opIn.codigo_postal || cliAddr.codigo_postal || '';
    const municipio = inst.municipio || opIn.municipio || cliAddr.municipio || '';

    const provCode = (inst.provincia_cod || opIn.provincia_cod
        || (isNum(inst.provincia) ? inst.provincia : '')
        || (isNum(opIn.provincia) ? opIn.provincia : '')
        || (cp ? String(cp).substring(0, 2) : '')) || '';
    const provCodePad = provCode ? String(provCode).padStart(2, '0') : '';
    const provincia = [inst.provincia, opIn.provincia_nombre, dc.provincia, cliAddr.provincia]
        .find(v => v && !isNum(v)) || PROV_NOMBRE[provCodePad] || '';

    const calleFull = [calle, num].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const full = /\b\d{5}\b/.test(calleFull)
        ? calleFull
        : [calleFull, cp, municipio, provincia ? `(${provincia})` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const ccaa = inst.ccaa || dc.ccaa || opIn.ccaa
        || resolveCcaaInstalacion(exp, cliente, op)
        || (provCodePad ? COD_A_CCAA[provCodePad] : '') || '';

    const refCatastral = inst.ref_catastral || op?.ref_catastral || opIn.rc || opIn.ref_catastral || '';
    const utmX = inst.coord_x || opIn.coordX || opIn.coord_x || '';
    const utmY = inst.coord_y || opIn.coordY || opIn.coord_y || '';

    return {
        ca: ccaa,
        direccion: full,
        refCatastral,
        utmX,
        utmY,
        municipioLine: [municipio, provincia ? `(${provincia})` : ''].filter(Boolean).join(' '),
        numexpte: exp.numero_expediente || '',
        logoSrc: getLogoDataUri(),
        clienteNombre: [cliente?.nombre_razon_social, cliente?.apellidos].filter(Boolean).join(' '),
        clienteDni: cliente?.dni || cliente?.nif || '',
    };
}

/**
 * Genera el Anexo Fotográfico de un expediente y lo guarda en Drive
 * ("6. ANEXOS CAE"), dejando el enlace en documentacion.anexo_fotografico_drive_link.
 *
 * @param {string} expedienteId  UUID del expediente (columna id).
 * @returns {Promise<{ ok, link, numPhotos, numActuaciones, groups, message? }>}
 */
async function generateAndSaveAnexo(expedienteId) {
    // 1. Cargar expediente + oportunidad + cliente.
    const { data: exp, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, instalacion, documentacion, cliente_id, oportunidad_id')
        .eq('id', expedienteId)
        .maybeSingle();
    if (error || !exp) return { ok: false, message: 'Expediente no encontrado' };

    const [{ data: op }, { data: cliente }] = await Promise.all([
        exp.oportunidad_id
            ? supabase.from('oportunidades').select('id, ref_catastral, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const dc = op?.datos_calculo || {};
    const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
    if (!driveFolderId) return { ok: false, message: 'El expediente no tiene carpeta Drive configurada' };

    // 2. Recopilar fotos de Drive.
    const { groups } = await collectPhotoGroups(dc);
    const rows = buildRowsFromGroups(groups);
    if (!rows.length) {
        return { ok: false, message: 'No hay fotos nombradas por slot en "12. DOCUMENTOS PARA CEE". Sube/renombra las fotos antes de generar el anexo.' };
    }

    // 3. Construir HTML con el diseño (mismo que el modal).
    const meta = buildDocMeta(exp, cliente, op);
    const html = buildAnexoFullHtml(rows, meta);

    // 4. Renderizar PDF con Puppeteer (mismo pipeline que /api/pdf/*).
    const { getBrowser } = require('./pdfService');
    let browser = null, page = null, pdfBuffer;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) {}
        pdfBuffer = await page.pdf({
            format: 'A4', printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
    } finally {
        if (page) { try { await page.close(); } catch (_) {} }
        if (browser) { try { await browser.close(); } catch (_) {} }
    }

    // 5. Guardar en Drive "6. ANEXOS CAE" (sustituye la versión previa).
    const numexpte = exp.numero_expediente || 'DRAFT';
    const fileName = `${numexpte} - Anexo Fotografico`.replace(/[\\/<>:"|?*]/g, '_') + '.pdf';
    const targetFolderId = await driveService.getOrCreateSubfolder(driveFolderId, SUBCARPETA_ANEXOS);
    try {
        const existing = await driveService.findFileByName(targetFolderId, fileName);
        if (existing) await driveService.deleteFile(existing);
    } catch (_) {}
    const saved = await driveService.saveFileToFolder(targetFolderId, fileName, 'application/pdf', pdfBuffer);
    if (!saved?.link) return { ok: false, message: 'No se pudo guardar el anexo en Drive' };
    try { if (saved.id) await driveService.setFolderPublic(saved.id, 'reader'); } catch (_) {}

    // 6. Enlazar en el expediente (documentacion.anexo_fotografico_drive_link).
    const docUpdate = { ...(exp.documentacion || {}), anexo_fotografico_drive_link: saved.link };
    await supabase.from('expedientes')
        .update({ documentacion: docUpdate, updated_at: new Date().toISOString() })
        .eq('id', expedienteId);

    return {
        ok: true,
        link: saved.link,
        numPhotos: rows.length,
        numActuaciones: groupRowsIntoActuaciones(rows).length,
        groups: groups.map(g => ({ key: g.key, label: g.label, fase: g.fase, count: g.photos.length })),
    };
}

// Actuación a la que pertenece un slot (para orientar a la skill/agente).
const { ANEXO_ACTUACIONES } = require('./anexoFotograficoDoc');
function actuacionForSlot(slotKey) {
    for (const a of ANEXO_ACTUACIONES) {
        if (a.antes.includes(slotKey) || a.despues.includes(slotKey)) return a.id;
    }
    return 'otros';
}

/**
 * Estado LIGERO del anexo (no descarga imágenes): qué slots de foto espera este
 * expediente (según sus actuaciones) y cuáles ya tienen fotos en Drive
 * ("12. DOCUMENTOS PARA CEE"). Pensado para que la skill sepa con qué nombre de
 * slot renombrar cada foto y qué falta.
 *
 * @returns {Promise<{ drive_folder_id, slots, presentes, faltan, anexo_link_actual? }>}
 */
async function getAnexoStatus(datosCalculo = {}) {
    const dc = datosCalculo || {};
    const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id || null;

    // Slots de foto esperados (excluye vídeos/docs/otros y las fotos de contexto).
    const ANTES_CONTEXTO = new Set(['FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES', 'FOTO_PATIO_LUCES']);
    const slots = reformaUploadService.buildDocChecklist(dc)
        .filter(s => !/^(VIDEO_|DOC_|OTROS_)/.test(s.key) && (s.fase === 'DESPUES' || !ANTES_CONTEXTO.has(s.key)))
        .map(s => ({
            key: s.key,
            label: s.label,
            fase: s.fase,
            multiple: !!s.multiple,
            actuacion: actuacionForSlot(s.key),
        }));

    let presentes = [];
    if (driveFolderId) {
        const subfolderId = await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_DOCS);
        if (subfolderId) {
            const files = await driveService.listFiles(subfolderId);
            const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
            const imgs = (files || []).filter(f => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || ''));
            presentes = slots
                .map(s => ({
                    key: s.key,
                    label: s.label,
                    fase: s.fase,
                    count: imgs.filter(f => reformaUploadService.fileBelongsToSlot(f.name, s.key)).length,
                }))
                .filter(s => s.count > 0);
        }
    }
    const presentesKeys = new Set(presentes.map(p => p.key));
    const faltan = slots.filter(s => !presentesKeys.has(s.key)).map(s => s.key);

    return { drive_folder_id: driveFolderId, slots, presentes, faltan };
}

module.exports = {
    collectPhotoGroups,
    buildRowsFromGroups,
    buildDocMeta,
    generateAndSaveAnexo,
    getAnexoStatus,
    actuacionForSlot,
    SUBCARPETA_DOCS,
    SUBCARPETA_ANEXOS,
};
