// ─── certapp/comun.js — piezas que comparten las rutas y servicios de la app ──
// La app de certificadores (cee.brokergy.es) vive en el mismo backend que el CRM
// pero con sus tablas (`certapp_*`). Aquí van los errores con forma `{ error, code }`
// del contrato, el 503 de la BD caída (regla 38), las variables de entorno y la
// ficha de la cuenta que se le enseña al certificador.
// Ver docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const supabase = require('../supabaseClient');

const encendido = (nombre) => String(process.env[nombre] || '').trim().toLowerCase() === 'true';
const numEnv = (nombre, def) => {
    const v = Number(process.env[nombre]);
    return Number.isFinite(v) && v >= 0 ? v : def;
};
// Base de los enlaces que mandamos (activar, recuperar, la obra, la envolvente).
// En local hay que poner CERTAPP_URL=http://localhost:5173: sin ella los enlaces
// apuntan a producción.
const certappUrl = () => String(process.env.CERTAPP_URL || 'https://cee.brokergy.es').trim().replace(/\/+$/, '');
// El nombre comercial está PENDIENTE (NOMBRE_APP en src/certificadores/marca.js);
// en los emails sale este hasta que se decida.
const nombreApp = () => process.env.CERTAPP_NOMBRE_APP || 'CEE by BROKERGY';
// El formulario de la beta da de alta al momento salvo CERTAPP_ALTA_DIRECTA=false.
const altaDirectaActiva = () => String(process.env.CERTAPP_ALTA_DIRECTA ?? 'true').trim().toLowerCase() !== 'false';

const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const esEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(String(v || ''));

/** Texto recortado; null si queda vacío. */
function texto(v, max = 200) {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max).trim();
    return s || null;
}
/** Texto largo (respeta los saltos de línea). */
function textoLargo(v, max = 4000) {
    if (v == null) return null;
    const s = String(v).replace(/\r\n/g, '\n').trim().slice(0, max).trim();
    return s || null;
}
function numero(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}
const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** ¿Dirección de la red interna (Docker, loopback)? Solo de ahí se cree a X-Real-IP. */
function esIpPrivada(ip) {
    const s = String(ip || '').trim().replace(/^::ffff:/i, '');
    return s === '::1' || /^127\./.test(s) || /^10\./.test(s) || /^192\.168\./.test(s)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(s) || /^f[cd][0-9a-f]{2}:/i.test(s) || /^fe80:/i.test(s);
}

/**
 * La IP de quien llama, para los límites. REGLA — nunca la primera de
 * X-Forwarded-For: nginx AÑADE la real al final (`$proxy_add_x_forwarded_for`),
 * así que la primera la escribe el cliente y cambiarla en cada envío saltaba
 * todos los límites. Vale `X-Real-IP` (nginx la pone con `$remote_addr` en
 * app.brokergy.es y en cee.brokergy.es) solo si la petición llega de la red
 * interna (el nginx del Docker); si no, la del socket.
 */
function ipDe(req) {
    const peer = String(req.socket?.remoteAddress || '');
    if (esIpPrivada(peer)) {
        const real = String(req.headers['x-real-ip'] || '').trim();
        if (/^[0-9a-f.:]{3,45}$/i.test(real)) return real;
    }
    return peer;
}

/** Medianoche de hoy en Madrid, en ISO (cupos diarios: asistente, avisos de la beta). */
function inicioDiaMadrid(ahora = new Date()) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
    const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
        .formatToParts(ahora).find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
    const m = off.match(/GMT([+-]\d+)/);
    const h = m ? Number(m[1]) : 1;
    return new Date(`${f}T00:00:00${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`).toISOString();
}

/** ¿El error es de que el SQL de la app aún no se ha aplicado en Supabase? */
function tablaPendiente(err) {
    // También una COLUMNA que falta: el SQL se pasó a medias o es de una versión anterior.
    return /Could not find the (table|function)|schema cache|relation .* does not exist|function .* does not exist|column .* does not exist/i
        .test(String(err?.message || err || ''));
}

// ── Errores con la forma del contrato ───────────────────────────────────────
class ErrorCertapp extends Error {
    constructor(status, mensaje, code, extra = null) {
        super(mensaje);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}
const fallo = (status, mensaje, code, extra) => new ErrorCertapp(status, mensaje, code, extra);

/** Un error de Supabase → excepción 503 (regla 38: nunca se responde como «vacío»). */
function errorBd(error, contexto = '') {
    const e = new ErrorCertapp(503,
        tablaPendiente(error)
            ? 'La app de certificadores todavía no está instalada en la base de datos.'
            : 'No podemos leer los datos ahora mismo. Vuelve a intentarlo en unos segundos.',
        tablaPendiente(error) ? 'CERTAPP_SIN_TABLAS' : 'BD_NO_DISPONIBLE');
    e.detalle = `${contexto}: ${error?.message || error}`;
    return e;
}

/** Respuesta única de error para todas las rutas de la app. */
function responderError(res, e, contexto = 'certapp') {
    if (e instanceof ErrorCertapp) {
        if (e.status >= 500) console.error(`[certapp] ${contexto}:`, e.detalle || e.message);
        return res.status(e.status).json({ error: e.message, code: e.code, ...(e.extra || {}) });
    }
    // obraDeLaCuenta (middleware/certappAuth.js) lanza un Error con status 503.
    if (e?.status === 503) {
        console.error(`[certapp] ${contexto}:`, e.message);
        const pendiente = tablaPendiente(e);
        return res.status(503).json({
            error: pendiente ? 'La app de certificadores todavía no está instalada en la base de datos.'
                : 'No podemos leer los datos ahora mismo. Vuelve a intentarlo en unos segundos.',
            code: pendiente ? 'CERTAPP_SIN_TABLAS' : 'BD_NO_DISPONIBLE',
        });
    }
    console.error(`[certapp] ${contexto}:`, e?.stack || e);
    return res.status(500).json({ error: 'Algo ha fallado. Vuelve a intentarlo.', code: 'ERROR_INTERNO' });
}

// ── La cuenta que ve el certificador (sin lo interno) ───────────────────────
// Fuera: auth_user_id, prefs (nonce de la contraseña), la carpeta de Drive de la
// cuenta (no está compartida con él) y el id de la solicitud de la beta.
const CAMPOS_CUENTA = [
    'id', 'email', 'nombre', 'apellidos', 'nif', 'telefono', 'empresa', 'empresa_nif',
    'titulacion', 'num_colegiado', 'colegio', 'provincia', 'municipio', 'direccion',
    'codigo_postal', 'estado', 'creditos', 'creditos_usados', 'ultimo_acceso_at', 'created_at',
];
function cuentaPublica(c) {
    if (!c) return null;
    const out = {};
    for (const k of CAMPOS_CUENTA) out[k] = c[k] ?? null;
    // De `prefs` solo sale esto (nunca el nonce de los enlaces).
    out.comunidades = Array.isArray(c.prefs?.perfil?.comunidades) ? c.prefs.perfil.comunidades : [];
    out.software = Array.isArray(c.prefs?.perfil?.software) ? c.prefs.perfil.software : [];
    out.ccaa = c.prefs?.perfil?.ccaa || null;
    out.condiciones = c.prefs?.condiciones || null;
    out.telefono_por_confirmar = c.telefono ? null : (c.prefs?.telefono_por_confirmar || null);
    return out;
}

/**
 * Historial de la obra. Best-effort: nunca rompe la operación que lo apunta.
 * REGLA — lo ve el certificador: `por` es 'certificador' · 'cliente' ·
 * 'BROKERGY' · 'IA', nunca el email de una persona del equipo. Quién fue de
 * BROKERGY va en `por_detalle` y el motivo interno en `nota_interna`, que solo
 * devuelve el admin (`obras.eventos(id, n, { admin: true })`).
 */
async function evento(obraId, cuentaId, tipo, textoEvento, por, datos = null, { porDetalle = null, notaInterna = null } = {}) {
    try {
        const { error } = await supabase.from('certapp_eventos').insert({
            obra_id: obraId, cuenta_id: cuentaId || null, tipo,
            texto: textoEvento ? String(textoEvento).slice(0, 1000) : null,
            por: por || null, datos,
            por_detalle: porDetalle ? String(porDetalle).slice(0, 200) : null,
            nota_interna: notaInterna ? String(notaInterna).slice(0, 2000) : null,
        });
        if (error) console.warn(`[certapp] evento ${tipo} sin apuntar:`, error.message);
    } catch (e) { console.warn(`[certapp] evento ${tipo} sin apuntar:`, e.message); }
}

const nuevoToken = () => crypto.randomBytes(16).toString('hex');

// Token del enlace del PROPIETARIO: 12 caracteres [0-9A-Za-z] (~71 bits) para
// que el enlace que va por WhatsApp sea corto (`/s/<token>`, Fran 26/10/2026).
// Sin sesgo: se descartan los bytes ≥ 248 (248 = 4 × 62).
const ALFABETO_CORTO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function tokenCorto(n = 12) {
    let s = '';
    while (s.length < n) for (const b of crypto.randomBytes(n)) if (b < 248 && s.length < n) s += ALFABETO_CORTO[b % 62];
    return s;
}

// ── Límites en memoria ──────────────────────────────────────────────────────
// Con un solo proceso de Node basta; si se reinicia, se olvida, y no pasa nada.
// Todos se apuntan aquí y se LIMPIAN cada 10 min (antes solo se podaban al
// pasar de 5.000 claves, y una ráfaga de IPs distintas los hacía crecer sin fin).
const LIMPIABLES = new Set();
const MAX_CLAVES = 20000;

function recortar(mapa) {
    if (mapa.size <= MAX_CLAVES) return;
    // Lo más antiguo primero (un Map recorre en orden de inserción).
    for (const k of mapa.keys()) { if (mapa.size <= MAX_CLAVES * 0.75) break; mapa.delete(k); }
}

/**
 * Límite por clave (IP, email, cuenta…) en una ventana deslizante.
 * @returns {((clave: string) => boolean) & { limpiar: Function, claves: () => number }} true si todavía puede
 */
function limitador(max, ventanaMs) {
    const golpes = new Map();   // clave → [timestamps]
    const fn = (clave) => {
        const ahora = Date.now();
        const k = String(clave || '');
        const lista = (golpes.get(k) || []).filter(t => t > ahora - ventanaMs);
        if (lista.length >= max) { golpes.set(k, lista); return false; }
        lista.push(ahora);
        golpes.delete(k);   // al final del orden: lo recién usado es lo último que se recorta
        golpes.set(k, lista);
        if (golpes.size > MAX_CLAVES) { fn.limpiar(ahora); recortar(golpes); }
        return true;
    };
    fn.limpiar = (ahora = Date.now()) => {
        for (const [k, v] of golpes) {
            const vivos = v.filter(t => t > ahora - ventanaMs);
            if (vivos.length) golpes.set(k, vivos); else golpes.delete(k);
        }
    };
    fn.claves = () => golpes.size;
    LIMPIABLES.add(fn);
    return fn;
}

/**
 * Una clave vale UNA vez durante `ventanaMs` (el form_token de la beta).
 * @returns {((clave: string) => boolean) & { limpiar: Function, claves: () => number }} true la primera vez
 */
function unaVez(ventanaMs) {
    const vistos = new Map();   // clave → caduca (ms)
    const fn = (clave) => {
        const ahora = Date.now();
        const k = String(clave || '');
        const c = vistos.get(k);
        if (c && c > ahora) return false;
        vistos.set(k, ahora + ventanaMs);
        if (vistos.size > MAX_CLAVES) { fn.limpiar(ahora); recortar(vistos); }
        return true;
    };
    fn.limpiar = (ahora = Date.now()) => { for (const [k, c] of vistos) if (c <= ahora) vistos.delete(k); };
    fn.liberar = (clave) => vistos.delete(String(clave || ''));   // la operación falló: se puede reintentar
    fn.claves = () => vistos.size;
    LIMPIABLES.add(fn);
    return fn;
}

function limpiarLimitadores(ahora = Date.now()) {
    for (const l of LIMPIABLES) { try { l.limpiar(ahora); } catch { /* nunca rompe */ } }
}
const reloj = setInterval(limpiarLimitadores, 10 * 60 * 1000);
if (typeof reloj.unref === 'function') reloj.unref();   // no retiene el proceso (pruebas, scripts)

/** Nombre y apellidos en una línea. */
const nombreCompleto = (o) => [o?.nombre, o?.apellidos].map(s => String(s || '').trim()).filter(Boolean).join(' ');

module.exports = {
    encendido, numEnv, certappUrl, nombreApp, altaDirectaActiva,
    esUuid, esEmail, texto, textoLargo, numero, escapeHtml, ipDe, esIpPrivada, inicioDiaMadrid,
    tablaPendiente, ErrorCertapp, fallo, errorBd, responderError,
    cuentaPublica, evento, nuevoToken, tokenCorto, nombreCompleto, limitador, unaVez, limpiarLimitadores,
};
