// ─── ceeDirectoDocsService.js ────────────────────────────────────────────────
// La documentación que necesita el técnico para hacer un CEE —fachada, patios,
// vídeo, planos, CEE anterior— en los CEE DIRECTOS.
//
// Es LA MISMA gestión que tienen los CAE para su CEE: mismos apartados (con sus
// rótulos para el cliente), misma pantalla (`DocsManager`, con otra base de
// rutas) y la MISMA subida (`reformaUploadService.subirFicherosASlot`, con un
// `destino` propio). Lo único que cambia es el dueño:
//
//   CAE           → oportunidades.datos_calculo.reforma_uploads · "12. DOCUMENTOS PARA CEE" · upload_token
//   CEE directo   → cee_directos.documentacion.reforma_uploads  · "4. DOCUMENTACIÓN PARA CEE" · portal_token
//
// Drive es la fuente de verdad de qué ficheros hay (regla 20): la vista lista la
// carpeta y encima pone el estado de la BD. En BD, solo metadatos (regla 21).
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const reforma = require('./reformaUploadService');
const svc = require('./ceeDirectoService');

const SUBCARPETA = '4. DOCUMENTACIÓN PARA CEE';
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

// Los apartados del CEE, en el orden en que se piden.
const CLAVES = ['FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES', 'VIDEO_VIVIENDA', 'DOC_PLANOS', 'DOC_CEE_EXISTENTE', 'OTROS_ANTES'];

// La fachada es lo único IMPRESCINDIBLE (de ella salen las ventanas y su
// tamaño); patios, vídeo y planos ayudan y se piden, pero hay viviendas sin
// patio y casi nadie tiene planos. Los demás se reclaman como "si los tienes".
const OBLIGATORIOS = new Set(['FOTO_FACHADA_PRINCIPAL']);
const RECOMENDADOS = ['FOTO_PATIOS_INTERIORES', 'VIDEO_VIVIENDA', 'DOC_PLANOS'];

/**
 * El checklist: las MISMAS definiciones que el CAE (`buildDocChecklist`), para
 * que el rótulo y la ayuda que lee el cliente sean idénticos en los dos
 * negocios. Sin el "unir en PDF" (esa ruta es solo del CAE) y todo en la fase
 * de antes: aquí no hay obra.
 */
function checklist() {
    const base = reforma.buildDocChecklist({});
    return CLAVES.map(k => base.find(s => s.key === k)).filter(Boolean).map(s => {
        const out = { ...s, fase: 'ANTES', destino: 'CEE', required: OBLIGATORIOS.has(s.key) };
        delete out.mergePdf;
        delete out.prescindible;
        if (s.key === 'OTROS_ANTES') {
            out.label = 'Otros documentos';
            out.help = 'Cualquier otra cosa que ayude al técnico (fotos, papeles, vídeos).';
        }
        return out;
    });
}

/** Compara el token en tiempo constante: detrás de este enlace se sube a su carpeta. */
function tokenValido(row, token) {
    const a = Buffer.from(String(row?.portal_token || ''));
    const b = Buffer.from(String(token || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Algunos encargos antiguos no tienen token: se le da uno al pedirlo. */
async function asegurarToken(row) {
    if (row.portal_token) return row.portal_token;
    const token = svc.nuevoPortalToken();
    await supabase.from(svc.TABLA).update({ portal_token: token }).eq('id', row.id);
    row.portal_token = token;
    return token;
}

/** Enlace público de subida, opcionalmente filtrado a lo que falta. */
async function enlace(row, need = null) {
    const token = await asegurarToken(row);
    const q = need && need.length ? `&need=${encodeURIComponent(need.join(','))}` : '';
    return `${FRONTEND()}/subir-cee-docs/${row.id}?token=${token}${q}`;
}

/** La carpeta del expediente; si aún no existe, se crea (idempotente: adopta la que haya). */
async function carpeta(row) {
    if (row.drive_folder_id) return row.drive_folder_id;
    const folders = require('./ceeDirectoFolders');
    const c = await folders.crearCarpeta(row.numero_expediente, row.nombre, row.alcance);
    if (!c?.id) throw new Error('No se pudo preparar la carpeta de Drive del expediente');
    await supabase.from(svc.TABLA).update({ drive_folder_id: c.id, drive_folder_link: c.link }).eq('id', row.id);
    row.drive_folder_id = c.id;
    return c.id;
}

async function listarDrive(row) {
    if (!row.drive_folder_id) return [];
    try {
        const subId = await driveService.findSubfolderByName(row.drive_folder_id, SUBCARPETA);
        return subId ? (await driveService.listFiles(subId)) || [] : [];
    } catch (e) {
        console.warn('[cee-directo docs] listado Drive:', e.message);
        return [];
    }
}

const rollup = (items) => {
    if (!items.length) return 'pendiente';
    if (items.some(i => i.estado === 'rechazada')) return 'rechazada';
    if (items.every(i => i.estado === 'validada')) return 'validada';
    return 'subida';
};

/**
 * La vista que pinta `DocsManager`: la MISMA forma que la del CAE (slots con sus
 * items), para que el componente no sepa en qué negocio está.
 */
async function vista(row, { need = null, admin = false } = {}) {
    const lista = checklist();
    const uploads = row.documentacion?.reforma_uploads || {};
    const overrides = row.documentacion?.docs_overrides || {};
    const driveFiles = await listarDrive(row);
    const usados = new Set();

    const slots = lista.map(s => {
        const db = new Map((uploads[s.key] || []).map(it => [it.name, it]));
        const enDrive = driveFiles.filter(f => reforma.fileBelongsToSlot(f.name, s.key));
        enDrive.forEach(f => usados.add(f.id));
        const items = enDrive.length
            ? enDrive.map(f => {
                const d = db.get(f.name) || {};
                return {
                    name: f.name, label: s.named ? reforma.parseOtrosLabel(f.name, s.key) : null,
                    link: f.webViewLink || d.link || null, at: d.at || null, driveId: f.id,
                    mimeType: f.mimeType || null, estado: d.estado || 'subida', motivo: d.motivo || null,
                    subido_por: d.subido_por || null
                };
            })
            : (uploads[s.key] || []).map(it => ({ ...it, label: s.named ? reforma.parseOtrosLabel(it.name, s.key) : null }));
        const waived = !!overrides[s.key]?.waived;
        return { ...s, baseRequired: !!s.required, required: waived ? false : s.required, waived, estado: rollup(items), items };
    });

    // Lo que ya estaba en la carpeta y no encaja en ninguna casilla también se
    // enseña (regla 20: nada de la carpeta queda invisible). Solo al equipo.
    const sobrantes = driveFiles.filter(f => !usados.has(f.id) && f.mimeType !== 'application/vnd.google-apps.folder');
    if (admin && sobrantes.length) {
        slots.push({
            key: 'OTROS_EXISTENTES', fase: 'ANTES', destino: 'CEE', required: false, multiple: true, existing: true,
            label: 'Otras fotos y documentos ya aportados',
            help: 'Material que ya está en la carpeta y no encaja en las casillas anteriores.',
            estado: 'subida',
            items: sobrantes.map(f => ({
                name: f.name, label: String(f.name || '').replace(/\.[a-z0-9]+$/i, ''), link: f.webViewLink || null,
                driveId: f.id, mimeType: f.mimeType || null, estado: 'subida'
            }))
        });
    }

    const pedidos = need ? new Set(String(need).split(',').map(x => x.trim()).filter(Boolean)) : null;
    const cli = row.cliente;
    return {
        id: row.id,
        numero_expediente: row.numero_expediente,
        cliente: cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : row.nombre,
        aceptada: false,         // aquí no hay fase de DESPUÉS: nada que desbloquear
        fin_obra: null,
        alcance: {},
        addableConcepts: [],
        slots: pedidos ? slots.filter(s => pedidos.has(s.key)) : slots,
        ...(admin ? { uuid: row.id, upload_token: await asegurarToken(row) } : {})
    };
}

/** Sube una tanda a un apartado, por la MISMA función que el CAE. */
async function subir(row, slotKey, archivos, { label = null, subidoPor = 'cliente' } = {}) {
    const slotDef = checklist().find(s => s.key === slotKey);
    if (!slotDef) throw Object.assign(new Error('Tipo de documento no válido'), { status: 400 });
    const folderId = await carpeta(row);
    return reforma.subirFicherosASlot({
        slotDef, archivos, label, subidoPor,
        destino: {
            folderId,
            subcarpeta: SUBCARPETA,
            prev: row.documentacion?.reforma_uploads?.[slotKey] || [],
            registrar: (slot, entry, multiple) => supabase.rpc('cee_directo_docs_append', {
                p_id: row.id, p_slot: slot, p_entry: entry, p_multiple: multiple
            })
        }
    });
}

/** Borra un fichero de un apartado (Drive + estado). */
async function borrar(row, slotKey, { name, driveId }) {
    const list = Array.isArray(row.documentacion?.reforma_uploads?.[slotKey]) ? row.documentacion.reforma_uploads[slotKey] : [];
    const target = driveId || list.find(it => it.name === name)?.driveId;
    // Solo se borra lo que es de ESTE expediente: el driveId llega del navegador.
    if (target) {
        const enCarpeta = (await listarDrive(row)).some(f => f.id === target);
        if (!enCarpeta && !list.some(it => it.driveId === target)) {
            throw Object.assign(new Error('Ese fichero no es de este expediente'), { status: 403 });
        }
        try { await driveService.deleteFile(target); } catch (e) { console.warn('[cee-directo docs] borrar:', e.message); }
    }
    const resto = list.filter(it => (driveId ? it.driveId !== driveId : it.name !== name));
    const { error } = await supabase.rpc('cee_directo_docs_replace_slot', { p_id: row.id, p_slot: slotKey, p_array: resto });
    if (error) throw new Error('No se pudo borrar el archivo.');
}

/** Valida o rechaza una foto concreta (estado POR FOTO, como en el CAE). */
async function marcar(row, slotKey, name, patch) {
    const list = Array.isArray(row.documentacion?.reforma_uploads?.[slotKey]) ? [...row.documentacion.reforma_uploads[slotKey]] : [];
    const i = list.findIndex(it => it.name === name);
    if (i >= 0) list[i] = { ...list[i], ...patch };
    else {
        // Estaba en Drive pero no registrado (subido a mano): se registra ahora.
        const f = (await listarDrive(row)).find(x => x.name === name);
        if (!f) throw Object.assign(new Error('Archivo no encontrado'), { status: 404 });
        list.push({ name, link: f.webViewLink || null, driveId: f.id, at: new Date().toISOString(), subido_por: null, ...patch });
    }
    const { error } = await supabase.rpc('cee_directo_docs_replace_slot', { p_id: row.id, p_slot: slotKey, p_array: list });
    if (error) throw new Error(error.message);
}

/**
 * Qué falta: lo IMPRESCINDIBLE (fachada) y, aparte, lo recomendable que no ha
 * llegado. `completo` = no falta lo imprescindible y ha llegado al menos una cosa
 * más; es lo que decide si al cliente se le manda el enlace para completarlo.
 */
async function faltan(row) {
    const v = await vista(row);
    const vacio = (k) => !(v.slots.find(s => s.key === k)?.items?.length);
    const obligatorios = [...OBLIGATORIOS].filter(k => vacio(k) && !v.slots.find(s => s.key === k)?.waived);
    const recomendados = RECOMENDADOS.filter(vacio);
    const etiqueta = (k) => v.slots.find(s => s.key === k)?.labelCliente || k;
    return {
        obligatorios, recomendados,
        etiquetas: [...obligatorios, ...recomendados].map(etiqueta),
        completo: obligatorios.length === 0 && recomendados.length < RECOMENDADOS.length,
    };
}

module.exports = { SUBCARPETA, checklist, tokenValido, asegurarToken, enlace, vista, subir, borrar, marcar, faltan, carpeta };
