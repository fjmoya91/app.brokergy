// ─── certapp/drive.js — las carpetas de Drive de la app de certificadores ────
//
//   CERTAPP_DRIVE_ROOT_ID («APP CERTIFICADORES (cee.brokergy.es)»)
//     └─ {APELLIDOS, NOMBRE} · {email}          una por cuenta
//          └─ {2026EXT_n} - {NOMBRE}            una por obra
//               ├─ 1. CEE                        lo que entrega la IA (.cex, XML, PDF, croquis)
//               └─ 4. DOCUMENTACIÓN PARA CEE     las fotos del certificador y del propietario
//
// Los nombres de las subcarpetas son los de los CEE directos (ceeDirectoFolders):
// el generador y la envolvente buscan ahí con el origen `ext`.
//
// REGLA — la carpeta se comparte con el EMAIL del certificador (al entregar),
// nunca «cualquiera con el enlace»: dentro hay datos de su cliente.
//
// REGLA — Drive no bloquea: sin CERTAPP_DRIVE_ROOT_ID, o si Drive falla, el alta
// de la cuenta o de la obra sigue (sin carpeta) y se dice. Todo es idempotente:
// el id se guarda en la fila y, si no lo hay, se busca por nombre antes de crear.
// ─────────────────────────────────────────────────────────────────────────────
const { google } = require('googleapis');
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const { SUB_CEE_UNICO, SUB_DOCS } = require('../ceeDirectoFolders');
const { fallo } = require('./comun');

const raiz = () => String(process.env.CERTAPP_DRIVE_ROOT_ID || '').trim() || null;
const NOMBRE_RAIZ = 'APP CERTIFICADORES (cee.brokergy.es)';

/** Nombre válido para Drive y para el espejo de Windows (sin \ / : * ? " < > |). */
function limpio(s, max = 90) {
    return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function nombreCarpetaCuenta(cuenta) {
    const ap = limpio(cuenta?.apellidos).toUpperCase();
    const no = limpio(cuenta?.nombre).toUpperCase();
    const quien = ap && no ? `${ap}, ${no}` : (ap || no);
    const email = limpio(String(cuenta?.email || '').toLowerCase(), 120);
    return quien ? `${quien} · ${email}` : email;
}

function nombreCarpetaObra(obra) {
    const n = limpio(obra?.nombre).toUpperCase();
    return n ? `${obra.numero_expediente} - ${n}` : String(obra.numero_expediente);
}

// getOrCreateSubfolder devuelve el PADRE si falla (su contrato histórico): aquí
// eso metería las fotos en la carpeta de arriba, así que se comprueba.
async function subcarpeta(padreId, nombre) {
    const id = await driveService.getOrCreateSubfolder(padreId, nombre);
    if (!id || id === padreId) throw new Error(`Drive no ha podido crear «${nombre}»`);
    return id;
}

/**
 * La carpeta de la cuenta. Idempotente; guarda el id en la fila.
 * @returns {Promise<{ ok: boolean, id?: string, link?: string, motivo?: string }>}
 */
async function asegurarCarpetaCuenta(cuenta) {
    if (!raiz()) return { ok: false, motivo: 'SIN_RAIZ' };
    if (cuenta?.drive_folder_id) return { ok: true, id: cuenta.drive_folder_id, link: cuenta.drive_folder_link };
    try {
        const id = await subcarpeta(raiz(), nombreCarpetaCuenta(cuenta));
        const link = await driveService.getWebViewLink(id);
        const { error } = await supabase.from('certapp_cuentas')
            .update({ drive_folder_id: id, drive_folder_link: link }).eq('id', cuenta.id);
        if (error) console.warn('[certapp drive] carpeta de la cuenta sin guardar en la BD:', error.message);
        cuenta.drive_folder_id = id;
        cuenta.drive_folder_link = link;
        return { ok: true, id, link };
    } catch (e) {
        console.warn(`[certapp drive] carpeta de la cuenta ${cuenta?.email}:`, e.message);
        return { ok: false, motivo: 'DRIVE_FALLO', error: e.message };
    }
}

/**
 * La carpeta de la obra con sus dos subcarpetas. Idempotente; guarda el id.
 * @returns {Promise<{ ok: boolean, id?: string, link?: string, motivo?: string }>}
 */
async function asegurarCarpetaObra(obra, cuenta) {
    if (!raiz()) return { ok: false, motivo: 'SIN_RAIZ' };
    try {
        let id = obra.drive_folder_id;
        let link = obra.drive_folder_link;
        if (!id) {
            const c = await asegurarCarpetaCuenta(cuenta);
            if (!c.ok) return c;
            id = await subcarpeta(c.id, nombreCarpetaObra(obra));
            link = await driveService.getWebViewLink(id);
            const { error } = await supabase.from('certapp_obras')
                .update({ drive_folder_id: id, drive_folder_link: link }).eq('id', obra.id);
            if (error) console.warn('[certapp drive] carpeta de la obra sin guardar en la BD:', error.message);
            obra.drive_folder_id = id;
            obra.drive_folder_link = link;
        }
        const cee = await subcarpeta(id, SUB_CEE_UNICO);
        const docs = await subcarpeta(id, SUB_DOCS);
        cacheSub.set(`${id}|${SUB_CEE_UNICO}`, cee);
        cacheSub.set(`${id}|${SUB_DOCS}`, docs);
        return { ok: true, id, link };
    } catch (e) {
        console.warn(`[certapp drive] carpeta de la obra ${obra?.numero_expediente}:`, e.message);
        return { ok: false, motivo: 'DRIVE_FALLO', error: e.message };
    }
}

// Las subcarpetas no cambian de id: se recuerdan para no listar Drive en cada foto.
const cacheSub = new Map();

/** La subcarpeta «4. DOCUMENTACIÓN PARA CEE» (o «1. CEE») de la obra; la crea si falta. */
async function subcarpetaObra(obra, cuenta, nombre) {
    if (!obra.drive_folder_id) {
        const r = await asegurarCarpetaObra(obra, cuenta);
        if (!r.ok) {
            throw r.motivo === 'SIN_RAIZ'
                ? fallo(503, 'Falta configurar la carpeta de Drive de la app (CERTAPP_DRIVE_ROOT_ID).', 'DRIVE_SIN_CONFIGURAR')
                : fallo(502, 'Google Drive no responde ahora mismo. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO');
        }
    }
    const clave = `${obra.drive_folder_id}|${nombre}`;
    if (cacheSub.has(clave)) return cacheSub.get(clave);
    try {
        const id = await subcarpeta(obra.drive_folder_id, nombre);
        cacheSub.set(clave, id);
        return id;
    } catch (e) {
        console.warn(`[certapp drive] ${nombre} de ${obra.numero_expediente}:`, e.message);
        throw fallo(502, 'Google Drive no responde ahora mismo. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO');
    }
}
const carpetaDocs = (obra, cuenta) => subcarpetaObra(obra, cuenta, SUB_DOCS);

/** «1. CEE» SIN crearla (para leer lo entregado). null si no existe. */
async function carpetaCeeSiExiste(obra) {
    if (!obra?.drive_folder_id) return null;
    const clave = `${obra.drive_folder_id}|${SUB_CEE_UNICO}`;
    if (cacheSub.has(clave)) return cacheSub.get(clave);
    const id = await driveService.findSubfolderByName(obra.drive_folder_id, SUB_CEE_UNICO);
    if (id) cacheSub.set(clave, id);
    return id;
}

/**
 * Comparte la carpeta de la OBRA con el email del certificador, como LECTOR.
 * Idempotente (si ya tenía permiso, ok). Nunca «cualquiera con el enlace».
 *
 * REGLA — lector, no editor: con permiso de escritura un tercero podía dejar o
 * sustituir un .cex en «1. CEE», y CE3X lo abre con pickle en el PC de BROKERGY.
 * Lo que tenga que subir, lo sube por la app (que comprueba el tipo).
 */
async function compartirConCertificador(obra, email) {
    if (!obra?.drive_folder_id) return { ok: false, motivo: 'SIN_CARPETA' };
    try {
        const r = await driveService.grantPermissionToEmail(obra.drive_folder_id, String(email).toLowerCase(), 'reader');
        return { ok: true, yaTenia: !!r?.alreadyGranted };
    } catch (e) {
        const detalle = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
        // Un email que no es de Google no se puede invitar sin mandarle el aviso de
        // Drive: lo decimos y el certificador baja los ficheros desde la app.
        return { ok: false, motivo: 'DRIVE_COMPARTIR', error: detalle };
    }
}

// ── Lectura directa (miniaturas y descargas firmadas) ───────────────────────
// driveService no expone su cliente ni el token. Para pedir la miniatura de un
// fichero PRIVADO hace falta el token de acceso (el `thumbnailLink` de un
// fichero que no es público no se abre sin él), y para servir un .cex o un PDF
// sin cargarlo entero en memoria hace falta el stream. Mismo OAuth que
// driveService, solo lectura.
let lector = null;
function clienteLectura() {
    if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return null;
    if (!lector) {
        const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
        lector = { auth, drive: google.drive({ version: 'v3', auth }) };
    }
    return lector;
}

// Caché de miniaturas: una galería de 20 fotos se pide entera al abrir la obra.
// REGLA — el tamaño va a uno de TAMANOS_MINI (si no, `?sz=` distinto en cada
// petición llenaba la caché) y la copia en BRUTO (sin thumbnailLink) se sirve
// pero NO se cachea: podían ser 300 entradas de 12 MB.
const cacheMini = new Map();   // driveId|sz → { buf, type, hasta }
const MINI_TTL_MS = 60 * 60 * 1000;
const MINI_MAX_ENTRADAS = 300;
const MINI_MAX_BYTES = 2 * 1024 * 1024;   // una miniatura de verdad pesa decenas de KB
const TAMANOS_MINI = [200, 400, 800];
const MIME_MINI = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** El tamaño de miniatura permitido más cercano al pedido. */
function tamanoMini(sz) {
    const n = Number(sz);
    if (!Number.isFinite(n) || n <= 0) return 400;
    return TAMANOS_MINI.reduce((mejor, t) => (Math.abs(t - n) < Math.abs(mejor - n) ? t : mejor), TAMANOS_MINI[0]);
}

/**
 * Miniatura de un fichero privado: thumbnailLink con el token; si no hay, los
 * bytes (solo jpg/png/webp ≤ 12 MB, sin cachear). `type` siempre de MIME_MINI.
 */
async function miniatura(driveId, szPedido = 400) {
    const sz = tamanoMini(szPedido);
    const clave = `${driveId}|${sz}`;
    const c = cacheMini.get(clave);
    if (c && c.hasta > Date.now()) return c;
    const cli = clienteLectura();
    if (!cli) return null;
    const { data: meta } = await cli.drive.files.get({ fileId: driveId, fields: 'id, mimeType, size, thumbnailLink, trashed' });
    if (!meta || meta.trashed) return null;
    if (meta.thumbnailLink) {
        try {
            const { token } = await cli.auth.getAccessToken();
            const url = meta.thumbnailLink.replace(/=s\d+$/, `=s${sz}`);
            const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(9000) });
            const type = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
            if (r.ok && MIME_MINI.has(type)) {
                const buf = Buffer.from(await r.arrayBuffer());
                const entrada = { buf, type, hasta: Date.now() + MINI_TTL_MS };
                if (buf.length <= MINI_MAX_BYTES) {
                    cacheMini.set(clave, entrada);
                    if (cacheMini.size > MINI_MAX_ENTRADAS) {
                        const ahora = Date.now();
                        for (const [k, v] of cacheMini) { if (v.hasta < ahora || cacheMini.size > MINI_MAX_ENTRADAS) cacheMini.delete(k); else break; }
                    }
                }
                return entrada;
            }
        } catch (e) { /* cae a los bytes */ }
    }
    const mime = String(meta.mimeType || '').toLowerCase();
    if (MIME_MINI.has(mime) && Number(meta.size || 0) <= 12 * 1024 * 1024) {
        const buf = await driveService.getFileContent(driveId);
        if (buf) return { buf, type: mime, hasta: 0 };   // en bruto: no se cachea
    }
    return null;
}

/** El fichero original en stream (descargas firmadas). */
async function abrirFichero(driveId) {
    const cli = clienteLectura();
    if (!cli) return null;
    const { data: meta } = await cli.drive.files.get({ fileId: driveId, fields: 'id, name, mimeType, size, trashed' });
    if (!meta || meta.trashed) return null;
    const r = await cli.drive.files.get({ fileId: driveId, alt: 'media' }, { responseType: 'stream' });
    return { meta, stream: r.data };
}

/**
 * Lo que hay DIRECTAMENTE en una carpeta (sin bajar a las subcarpetas), con el
 * tamaño y la fecha: lo que pinta «Documentos». Las carpetas vienen con su
 * mimeType de carpeta, para encontrar OLD y la cuarentena.
 */
async function listar(carpetaId) {
    const cli = clienteLectura();
    if (!cli) return (await driveService.listFiles(carpetaId)) || [];
    const { data } = await cli.drive.files.list({
        q: `'${carpetaId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        pageSize: 200,
    });
    return data?.files || [];
}

/**
 * Crea UNA vez la carpeta raíz de la app en «Mi unidad» (para probar en local
 * o al montar producción). Devuelve su id: va a CERTAPP_DRIVE_ROOT_ID.
 */
async function crearRaiz(nombre = NOMBRE_RAIZ) {
    const existente = await driveService.findSubfolderByName('root', nombre);
    if (existente) return { id: existente, creada: false, link: await driveService.getWebViewLink(existente) };
    const id = await driveService.createSubfolder('root', nombre);
    return { id, creada: true, link: await driveService.getWebViewLink(id) };
}

/** La carpeta de una obra borrada, a la papelera de Drive (no se borra: 30 días para recuperarla). */
async function aLaPapelera(carpetaId) {
    if (!carpetaId) return false;
    return driveService.deleteFile(carpetaId);
}

module.exports = {
    raiz, NOMBRE_RAIZ, nombreCarpetaCuenta, nombreCarpetaObra,
    asegurarCarpetaCuenta, asegurarCarpetaObra, carpetaDocs, carpetaCeeSiExiste,
    compartirConCertificador, miniatura, tamanoMini, abrirFichero, listar, crearRaiz, aLaPapelera,
    SUB_CEE: SUB_CEE_UNICO, SUB_DOCS, TAMANOS_MINI,
};
