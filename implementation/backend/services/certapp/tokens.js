// ─── certapp/tokens.js — enlaces firmados de la app de certificadores ────────
// Mismo patrón que utils/accionToken.js: HMAC STATELESS (nada en la BD que el
// autoguardado pueda pisar), la caducidad viaja en MINUTOS epoch DENTRO de lo
// firmado y la firma se trunca a 32 hex.
//
// · Activar la cuenta (invitación, 14 días) y recuperar la contraseña (2 h):
//   `{a|r}.{cuentaId}.{expiraMin}.{firma}`. Lo firmado incluye un NONCE que vive
//   en `certapp_cuentas.prefs.pwd_nonce` y se ROTA al poner la contraseña: el
//   enlace sirve UNA vez, y uno viejo deja de valer en cuanto se usa otro.
// · Entrar sin contraseña (`e`, 1 h; el del alta, 7 días): el mismo formato y el
//   mismo nonce. Se canjea en el servidor por una sesión de Supabase
//   (cuentas.canjearEnlace), y al canjearlo se rota: también sirve UNA vez.
// · Miniaturas y ficheros de una obra (12 h): `{expiraMin}.{firma}` sobre
//   obraId + driveId, para un <img>/<a> que no puede llevar la cabecera de sesión.
//   REGLA — la firma de una MINIATURA no vale para el FICHERO (propósitos
//   distintos dentro de lo firmado): una galería no regala la descarga entera.
//   La caducidad se redondea a la hora: la URL es la misma durante una hora y el
//   navegador la puede cachear.
// · Formulario de la beta: `{segundos}.{nonce}.{firma}` (GET /beta/token). Vale
//   entre 3 s y 2 h después de pedirlo, y la ruta lo da por usado una vez.
//
// REGLA — el secreto es CERTAPP_TOKEN_SECRET. En producción (NODE_ENV=production)
// sin él se FALLA CERRADO: todo lo que firma o verifica responde 503
// (CERTAPP_SIN_SECRETO) y al arrancar sale un console.error. Nunca un literal del
// repo (el repo es público: con él cualquiera firmaría enlaces).
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');

const FIRMA_HEX = 32;
const aMinutos = (ms) => Math.floor(ms / 60000);
const enProduccion = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
// Solo fuera de producción: si no hay ninguna clave, una al azar por proceso
// (los enlaces mueren al reiniciar, y en local da igual).
const SECRETO_LOCAL = crypto.randomBytes(32).toString('hex');

if (enProduccion() && !String(process.env.CERTAPP_TOKEN_SECRET || '').trim()) {
    console.error('[certapp] ⛔ Falta CERTAPP_TOKEN_SECRET en producción: la app de certificadores NO firma ni '
        + 'acepta enlaces (activar, recuperar, miniaturas, ficheros, formulario de la beta) y responde 503. '
        + 'Ponla en el .env del VPS (64 caracteres al azar: `openssl rand -hex 32`) y reinicia el backend.');
}

function secreto() {
    const s = String(process.env.CERTAPP_TOKEN_SECRET || '').trim();
    if (s) return s;
    if (enProduccion()) {
        const { fallo } = require('./comun');
        const e = fallo(503, 'La app de certificadores no está bien configurada. Avísanos y lo arreglamos.', 'CERTAPP_SIN_SECRETO');
        e.detalle = 'Falta CERTAPP_TOKEN_SECRET (NODE_ENV=production)';
        throw e;
    }
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || SECRETO_LOCAL;
}

const VIGENCIA = {
    a: Number(process.env.CERTAPP_INVITACION_DIAS || 14) * 86400000,   // activar (invitación)
    r: 2 * 3600000,                                                       // recuperar contraseña
    e: 3600000,                                                           // entrar sin contraseña
};
const VIGENCIA_ALTA_MS = 7 * 86400000;                                    // el enlace del email del alta
const VIGENCIA_FICHERO_MS = 12 * 3600000;
const FORMULARIO = { minMs: 3000, maxMs: 2 * 3600000 };

function hmac(texto) {
    return crypto.createHmac('sha256', secreto()).update(texto).digest('hex').slice(0, FIRMA_HEX);
}
/** HMAC completo (para guardar una huella, p. ej. de la IP, sin poder revertirla). */
function huella(texto) {
    return crypto.createHmac('sha256', secreto()).update(`certapp:huella:${texto}`).digest('hex').slice(0, 32);
}
function iguales(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const payloadCuenta = (tipo, cuentaId, nonce, expiraMin) => `certapp:${tipo}:${cuentaId}:${nonce || '-'}:${expiraMin}`;

/**
 * Firma el enlace de activar ('a'), de recuperar ('r') la contraseña o de entrar ('e').
 * @returns {string} token
 */
function firmarCuenta(tipo, cuentaId, nonce, vigenciaMs = VIGENCIA[tipo]) {
    if (!['a', 'r', 'e'].includes(tipo)) throw new Error(`Tipo de token desconocido: ${tipo}`);
    const expiraMin = aMinutos(Date.now() + vigenciaMs);
    return `${tipo}.${cuentaId}.${expiraMin}.${hmac(payloadCuenta(tipo, cuentaId, nonce, expiraMin))}`;
}

/** Trocea el token sin validarlo (para saber de qué cuenta es). */
function leerCuenta(token) {
    const m = String(token || '').trim().match(/^([are])\.([0-9a-f-]{36})\.(\d{6,10})\.([0-9a-f]{32})$/i);
    if (!m) return null;
    return { tipo: m[1], cuentaId: m[2].toLowerCase(), expiraMin: Number(m[3]), firma: m[4].toLowerCase() };
}

/**
 * ¿Vale el token con el nonce ACTUAL de la cuenta?
 * @returns {{ ok: boolean, motivo?: 'formato'|'caducado'|'firma' }}
 */
function verificarCuenta(datos, nonce) {
    if (!datos) return { ok: false, motivo: 'formato' };
    // La caducidad antes que la firma: «pide otro enlace» es más útil que «no vale».
    if (aMinutos(Date.now()) > datos.expiraMin) return { ok: false, motivo: 'caducado' };
    const esperado = hmac(payloadCuenta(datos.tipo, datos.cuentaId, nonce, datos.expiraMin));
    return iguales(datos.firma, esperado) ? { ok: true } : { ok: false, motivo: 'firma' };
}

// ── Miniaturas y ficheros ───────────────────────────────────────────────────
const PROPOSITOS = ['mini', 'fichero'];
const payloadRecurso = (proposito, obraId, driveId, expiraMin) => `certapp:${proposito}:${obraId}:${driveId}:${expiraMin}`;

function firmarRecurso(proposito, obraId, driveId, vigenciaMs = VIGENCIA_FICHERO_MS) {
    if (!PROPOSITOS.includes(proposito)) throw new Error(`Propósito desconocido: ${proposito}`);
    const expiraMin = Math.ceil(aMinutos(Date.now() + vigenciaMs) / 60) * 60;
    return `${expiraMin}.${hmac(payloadRecurso(proposito, obraId, driveId, expiraMin))}`;
}

function verificarRecurso(proposito, obraId, driveId, t) {
    if (!PROPOSITOS.includes(proposito)) return false;
    const m = String(t || '').match(/^(\d{6,10})\.([0-9a-f]{32})$/i);
    if (!m) return false;
    const expiraMin = Number(m[1]);
    if (aMinutos(Date.now()) > expiraMin) return false;
    return iguales(m[2].toLowerCase(), hmac(payloadRecurso(proposito, obraId, driveId, expiraMin)));
}

/** `t` para /fichero (la descarga). Redondeado a la hora siguiente (URL estable, cacheable). */
const firmarFichero = (obraId, driveId, vigenciaMs) => firmarRecurso('fichero', obraId, driveId, vigenciaMs);
const verificarFichero = (obraId, driveId, t) => verificarRecurso('fichero', obraId, driveId, t);
/** `t` para /thumb (solo la miniatura: no vale para /fichero). */
const firmarMiniatura = (obraId, driveId, vigenciaMs) => firmarRecurso('mini', obraId, driveId, vigenciaMs);
const verificarMiniatura = (obraId, driveId, t) => verificarRecurso('mini', obraId, driveId, t);

// ── Formulario de la beta ───────────────────────────────────────────────────
const payloadFormulario = (seg, nonce) => `certapp:form:beta:${seg}:${nonce}`;

/** Token del formulario de la beta (GET /beta/token). `ahoraMs` solo para las pruebas. */
function firmarFormulario(ahoraMs = Date.now()) {
    const seg = Math.floor(ahoraMs / 1000);
    const nonce = crypto.randomBytes(8).toString('hex');
    return `${seg}.${nonce}.${hmac(payloadFormulario(seg, nonce))}`;
}

/**
 * ¿Vale el token del formulario? Entre 3 s y 2 h desde que se pidió.
 * @returns {{ ok: boolean, motivo?: 'formato'|'firma'|'pronto'|'caducado' }}
 */
function verificarFormulario(token, ahoraMs = Date.now()) {
    const m = String(token || '').trim().match(/^(\d{9,11})\.([0-9a-f]{16})\.([0-9a-f]{32})$/i);
    if (!m) return { ok: false, motivo: 'formato' };
    const seg = Number(m[1]);
    if (!iguales(m[3].toLowerCase(), hmac(payloadFormulario(seg, m[2].toLowerCase())))) return { ok: false, motivo: 'firma' };
    const edad = ahoraMs - seg * 1000;
    if (edad < FORMULARIO.minMs) return { ok: false, motivo: 'pronto' };
    if (edad > FORMULARIO.maxMs) return { ok: false, motivo: 'caducado' };
    return { ok: true };
}

const nuevoNonce = () => crypto.randomBytes(8).toString('hex');

module.exports = {
    firmarCuenta, leerCuenta, verificarCuenta,
    firmarFichero, verificarFichero, firmarMiniatura, verificarMiniatura,
    firmarFormulario, verificarFormulario, huella, nuevoNonce,
    VIGENCIA, VIGENCIA_ALTA_MS, FORMULARIO,
};
