// ─── certapp/docs.js — fotos y documentos de una obra, por apartado (slot) ───
// Los apartados son los de SLOTS (frontend/src/certificadores/logic/cuestionario.js).
// Los ficheros van a Drive, a «4. DOCUMENTACIÓN PARA CEE», con el nombre
// `{LABEL EN MAYÚSCULAS} {n}.{ext}` («PLACA DE LA CALDERA 1.jpg»), que es lo que
// leen la skill y la envolvente. En la BD solo los metadatos, por la RPC
// `certapp_docs_append` (regla 21: nunca base64; regla 19: nunca leer y
// reescribir el JSONB entero).
//
// REGLA — el TIPO sale de los BYTES (services/certapp/tipos.js), nunca del
// mimetype ni de la extensión que manda el navegador: la extensión y el
// Content-Type que se guardan en Drive son los detectados. Así un SVG o un HTML
// disfrazado de «foto.jpg» no entra.
//
// REGLA — el PROPIETARIO (enlace sin cuenta, `por: 'cliente'`) solo sube a los
// apartados que le tocan (`slotsAplicables`), en DOC_* solo PDF o fotos (nunca un
// .cex: CE3X lo abre con pickle), y no reemplaza ni manda a la papelera lo del
// certificador: en un apartado de un solo archivo que ya tiene uno del
// certificador, lo suyo se rechaza con un mensaje. Y en SU vista solo ve lo que
// ha subido él.
//
// REGLA — en un ENCARGO de BROKERGY (`seguimiento.crm`, services/certapp/crm.js)
// las fotos NO van a la carpeta de la app: van a la del expediente del CRM por su
// propia subida (subirFicherosASlot / ceeDirectoDocsService) y se apuntan en los
// dos sitios con el mismo driveId. Lo que vino del CRM no se manda a la papelera
// desde la app: solo se desengancha de la obra.
//
// Mismo patrón que subirFicherosASlot del CAE: se lista Drive UNA vez, se
// reservan los números, se sube con concurrencia limitada y se registra en
// serie; si una parte falla, se devuelve lo que sí entró (200 parcial).
// ─────────────────────────────────────────────────────────────────────────────
const multer = require('multer');
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const drive = require('./drive');
const tokens = require('./tokens');
const tipos = require('./tipos');
const { cuestionario: logica } = require('./logica');
const { fallo, errorBd } = require('./comun');
const crm = require('./crm');

const MB = 1024 * 1024;
const MAX_VIDEO = 110 * MB;
const MAX_OTRO = 25 * MB;
const MAX_FICHEROS = 20;

const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO, files: MAX_FICHEROS } });

/** Middleware multipart `files` con los errores en castellano (413 legible). */
function recibirFicheros(req, res, next) {
    subida.array('files', MAX_FICHEROS)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Algún archivo es demasiado grande (fotos y documentos hasta 25 MB, vídeos hasta 110 MB).', code: 'FICHERO_GRANDE' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(413).json({ error: `Demasiados archivos de una vez (máximo ${MAX_FICHEROS}).`, code: 'DEMASIADOS_FICHEROS' });
        }
        console.error('[certapp docs] multer:', err.message);
        return res.status(400).json({ error: 'No se han podido leer los archivos. Vuelve a intentarlo.', code: 'SUBIDA_ILEGIBLE' });
    });
}

/**
 * ¿Vale este fichero para este apartado y para quien lo sube? Devuelve
 * `{ motivo }` si no, o `{ tipo }` (el detectado por los bytes) si sí.
 */
function revisarFichero(slot, f, por = 'certificador') {
    if (!slot.video && f.size > MAX_OTRO) return { motivo: 'pasa de 25 MB' };
    if (slot.video && f.size > MAX_VIDEO) return { motivo: 'pasa de 110 MB' };
    const t = tipos.detectar(f.buffer);
    const motivo = tipos.motivoTipo(slot, t, por);
    return motivo ? { motivo } : { tipo: t };
}

/** Compatibilidad: el motivo de rechazo o null. */
const rechazo = (slot, f, por) => revisarFichero(slot, f, por).motivo || null;

const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const esDelCliente = (e) => (e?.por || e?.subido_por) === 'cliente';

async function slotDe(slotId) {
    const { SLOTS } = await logica();
    const slot = SLOTS.find(s => s.id === slotId);
    if (!slot) throw fallo(400, 'Ese apartado no existe.', 'SLOT_DESCONOCIDO');
    return slot;
}

async function mapLimit(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    const trabajadores = Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) {
            const k = i++;
            out[k] = await fn(items[k], k);
        }
    });
    await Promise.all(trabajadores);
    return out;
}

/**
 * Sube una tanda de ficheros a un apartado.
 * @param {object} obra   fila de certapp_obras
 * @param {object} cuenta fila de certapp_cuentas (para la carpeta si aún no existe)
 * @param {string} por    'certificador' · 'cliente' · 'BROKERGY'
 * @returns {{ subidos: object[], rechazados: object[], errores: object[] }}
 */
async function subir(obra, cuenta, slotId, ficheros = [], { por = 'certificador' } = {}) {
    const slot = await slotDe(slotId);
    if (!ficheros.length) throw fallo(400, 'No ha llegado ningún archivo.', 'SIN_FICHEROS');
    if (obra.estado === 'ARCHIVADA') throw fallo(409, 'Esta obra está archivada.', 'ARCHIVADA');

    const previos = obra.documentacion?.reforma_uploads?.[slotId] || [];
    if (por === 'cliente') {
        const { slotsAplicables } = await logica();
        if (!slotsAplicables(obra.cuestionario || {}).some(s => s.id === slotId)) {
            throw fallo(400, 'Este apartado no hace falta para esta vivienda.', 'SLOT_NO_APLICA');
        }
        if (!slot.multiple && previos.some(e => e?.driveId && !esDelCliente(e))) {
            throw fallo(409, 'Tu certificador ya ha subido este archivo: no hace falta otro.', 'YA_LO_TIENE_EL_CERTIFICADOR');
        }
    }

    const rechazados = [];
    let validos = [];
    for (const f of ficheros) {
        const r = revisarFichero(slot, f, por);
        if (r.motivo) rechazados.push({ nombre: f.originalname, motivo: r.motivo });
        else validos.push({ f, tipo: r.tipo });
    }
    if (!slot.multiple && validos.length > 1) {
        for (const v of validos.slice(1)) rechazados.push({ nombre: v.f.originalname, motivo: 'este apartado lleva un solo archivo' });
        validos = validos.slice(0, 1);
    }
    if (!validos.length) {
        const grande = rechazados.some(r => /MB/.test(r.motivo));
        throw fallo(grande ? 413 : 400, `No se ha subido nada: ${rechazados.map(r => `${r.nombre} (${r.motivo})`).join(', ')}.`,
            grande ? 'FICHERO_GRANDE' : 'TIPO_NO_ADMITIDO', { rechazados });
    }

    // Un ENCARGO de BROKERGY: a la carpeta del expediente del CRM, apuntado allí y
    // aquí con el mismo driveId (services/certapp/crm.js). Sin copia en la de la app.
    const deCrm = crm.esDeCrm(obra);
    const subidas = deCrm ? await crm.subirFotos(obra, slot, validos, { por }) : await subirASuCarpeta(obra, cuenta, slot, validos, por);

    // Registro en SERIE (cada append es atómico; en paralelo también lo sería, pero
    // en serie el orden de la galería es el de la tanda).
    const anteriores = !slot.multiple ? previos : [];
    const subidos = [];
    const errores = subidas.filter(s => !s.ok).map(s => ({ nombre: s.nombre, error: 'Drive no lo ha aceptado' }));
    for (const s of subidas.filter(x => x.ok)) {
        const { error } = await supabase.rpc('certapp_docs_append', {
            p_id: obra.id, p_slot: slotId, p_entry: s.entry, p_multiple: !!slot.multiple,
        });
        if (error) {
            console.error('[certapp docs] append:', error.message);
            errores.push({ nombre: s.entry.nombre, error: 'subido a Drive pero sin apuntar' });
            continue;
        }
        subidos.push(s.entry);
    }
    // Apartado de un solo archivo: el anterior va a la papelera de Drive (el
    // cliente nunca llega aquí con uno del certificador: se ha cortado arriba).
    // En un encargo, lo que vino del CRM solo se desengancha (crm.quitarFoto).
    if (!slot.multiple && subidos.length) {
        for (const a of anteriores) {
            if (!a?.driveId) continue;
            if (por === 'cliente' && !esDelCliente(a)) continue;
            if (deCrm && !(await crm.quitarFoto(obra, a))) continue;
            driveService.deleteFile(a.driveId).catch(() => {});
        }
    }
    if (!subidos.length && errores.length) {
        throw fallo(502, 'Google Drive no ha aceptado los archivos. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO', { errores, rechazados });
    }
    return { subidos, rechazados, errores };
}

/** La tanda a «4. DOCUMENTACIÓN PARA CEE» de la obra, con el nombre `{LABEL} {n}.{ext}`. */
async function subirASuCarpeta(obra, cuenta, slot, validos, por) {
    const carpeta = await drive.carpetaDocs(obra, cuenta);
    const label = slot.label.toUpperCase();
    // Números ya usados: lo que hay en Drive con ese prefijo (una sola consulta).
    const existentes = await driveService.listFilesByPrefix(carpeta, label);
    const re = new RegExp(`^${escRegex(label)} (\\d+)\\.`, 'i');
    let n = existentes.reduce((max, f) => { const m = (f.name || '').match(re); return m ? Math.max(max, Number(m[1])) : max; }, 0);
    // La extensión y el tipo, los DETECTADOS (no los del navegador).
    const plan = validos.map(({ f, tipo }) => ({ f, tipo, nombre: `${label} ${++n}.${tipo.ext}` }));

    return mapLimit(plan, 3, async ({ f, tipo, nombre }) => {
        try {
            const r = await driveService.saveFileToFolder(carpeta, nombre, tipo.mime, f.buffer, { throwOnError: true });
            const at = new Date().toISOString();
            const mime = tipo.mime;
            // Con los alias de `reforma_uploads` del CRM y de los CEE directos
            // (`name`, `at`, `subido_por`, `mimeType`, `estado`), para que la
            // envolvente y el generador (origen `ext`) la lean igual que allí.
            return { ok: true, entry: {
                driveId: r.id, nombre, mime, link: r.link || null, size: f.size, subido_at: at, por,
                name: nombre, at, subido_por: por, mimeType: mime, estado: 'subida',
            } };
        } catch (e) {
            return { ok: false, nombre: f.originalname, error: e.message };
        }
    });
}

/**
 * Quita un fichero de un apartado (y lo manda a la papelera de Drive). En un
 * encargo, lo que vino del CRM solo se desengancha de la obra (crm.quitarFoto).
 */
async function borrar(obra, slotId, driveId) {
    await slotDe(slotId);
    const lista = obra.documentacion?.reforma_uploads?.[slotId] || [];
    const entrada = lista.find(e => e?.driveId === driveId);
    if (!entrada) throw fallo(404, 'Ese archivo no está en este apartado.', 'FICHERO_NO_ENCONTRADO');
    const resto = lista.filter(e => e?.driveId !== driveId);
    const { error } = await supabase.rpc('certapp_docs_replace_slot', { p_id: obra.id, p_slot: slotId, p_array: resto });
    if (error) throw errorBd(error, 'borrar fichero');
    if (crm.esDeCrm(obra) && !(await crm.quitarFoto(obra, entrada))) return { ok: true, quedan: resto.length };
    driveService.deleteFile(driveId).catch(() => {});
    return { ok: true, quedan: resto.length };
}

// ── Lo que se enseña ────────────────────────────────────────────────────────
const conMiniatura = (mime, nombre) => /^(image|video)\//.test(mime || '') || /\.pdf$/i.test(nombre || '') || mime === 'application/pdf';
// Firmas DISTINTAS: la de la miniatura no descarga el fichero (tokens.js).
const urlThumb = (obraId, driveId) => `/api/public/certapp/thumb/${obraId}/${encodeURIComponent(driveId)}?t=${tokens.firmarMiniatura(obraId, driveId)}`;
const urlFichero = (obraId, driveId) => `/api/public/certapp/fichero/${obraId}/${encodeURIComponent(driveId)}?t=${tokens.firmarFichero(obraId, driveId)}`;

/**
 * `{ slots: { [slot]: [{ driveId, nombre, mime, link, thumb, subido_at, por }] } }`
 * con TODOS los apartados (vacíos incluidos). `link` es la descarga firmada; el
 * enlace de Drive solo lo ve el ADMIN (`admin: true`), como en el CRM.
 */
async function vista(obra, { admin = false } = {}) {
    const { SLOT_IDS } = await logica();
    const uploads = obra.documentacion?.reforma_uploads || {};
    const slots = {};
    for (const id of SLOT_IDS) {
        slots[id] = (Array.isArray(uploads[id]) ? uploads[id] : []).filter(e => e?.driveId).map(e => ({
            driveId: e.driveId,
            nombre: e.nombre || e.name || null,
            mime: e.mime || e.mimeType || null,
            link: admin ? (e.link || null) : urlFichero(obra.id, e.driveId),
            thumb: conMiniatura(e.mime || e.mimeType, e.nombre || e.name) ? urlThumb(obra.id, e.driveId) : null,
            subido_at: e.subido_at || e.at || null,
            por: e.por || e.subido_por || null,
        }));
    }
    return { slots };
}

/**
 * La vista del PROPIETARIO (enlace sin cuenta): los apartados que le tocan y,
 * de cada uno, SOLO lo que ha subido él (sin descarga: solo la miniatura). Un
 * apartado de un solo archivo que ya tiene el del certificador sale `cubierto`.
 */
async function vistaCliente(obra, { caducaAt = null } = {}) {
    const { slotsAplicables } = await logica();
    const uploads = obra.documentacion?.reforma_uploads || {};
    const aplican = slotsAplicables(obra.cuestionario || {});
    return {
        obra: {
            id: obra.id,
            numero_expediente: obra.numero_expediente,
            direccion: obra.direccion || null,
            municipio: obra.municipio || null,
            titular: obra.titular?.nombre || null,
            cerrada: ['LISTO', 'VALIDADO', 'ARCHIVADA'].includes(obra.estado),
            caduca_at: caducaAt,
        },
        apartados: aplican.map((s) => {
            const lista = (Array.isArray(uploads[s.id]) ? uploads[s.id] : []).filter(e => e?.driveId);
            return {
                id: s.id, label: s.label, ayuda: s.ayuda || null, multiple: !!s.multiple,
                video: !!s.video, documento: !!s.documento, placa: !!s.placa,
                cubierto: !s.multiple && lista.some(e => !esDelCliente(e)),
                ficheros: lista.filter(esDelCliente).map(e => ({
                    driveId: e.driveId,
                    nombre: e.nombre || e.name || null,
                    mime: e.mime || e.mimeType || null,
                    thumb: conMiniatura(e.mime || e.mimeType, e.nombre || e.name) ? urlThumb(obra.id, e.driveId) : null,
                    subido_at: e.subido_at || e.at || null,
                })),
            };
        }),
    };
}

module.exports = { recibirFicheros, subir, borrar, vista, vistaCliente, urlFichero, urlThumb, revisarFichero, rechazo, MAX_FICHEROS };
