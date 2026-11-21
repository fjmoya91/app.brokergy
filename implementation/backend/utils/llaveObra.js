// ─── Llave de MINIATURAS de una obra (app del instalador, fase 2) ────────────
//
// Las fotos del gestor de documentación se pintan con <img src> y un <img> no
// lleva la cabecera de sesión. En el enlace público eso se resuelve poniendo el
// `upload_token` en la URL; en la app con sesión el token NO viaja al navegador
// (Fran, 21/11/2026), así que la vista de documentos trae esta llave: una firma
// HMAC sobre el nº de la obra que CADUCA (12 h) y que solo sirve para ver
// miniaturas y ficheros DE ESA obra (la ruta comprueba además que el fichero es
// suyo). No sube, no borra y no abre nada más.
//
// Módulo puro: lo prueba scripts/test_app_instalador.js.
const crypto = require('crypto');

const VIGENCIA_MS = 12 * 60 * 60 * 1000;
const SECRETO_LOCAL = crypto.randomBytes(32).toString('hex');

function secreto(env = process.env) {
    return String(env.APP_INSTALADOR_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || SECRETO_LOCAL);
}
const firma = (texto, env) => crypto.createHmac('sha256', secreto(env)).update(`instalador-miniatura|${texto}`).digest('base64url');

/** `<caduca en ms>.<firma>` para la obra `obraId` (su nº de oportunidad). */
function firmarLlave(obraId, ahora = Date.now(), env = process.env) {
    const exp = ahora + VIGENCIA_MS;
    return `${exp}.${firma(`${obraId}|${exp}`, env)}`;
}

function verificarLlave(obraId, llave, ahora = Date.now(), env = process.env) {
    const m = String(llave || '').match(/^(\d{10,16})\.([\w-]{20,100})$/);
    if (!m || !obraId) return false;
    const exp = Number(m[1]);
    if (!(exp > ahora) || exp > ahora + VIGENCIA_MS + 60000) return false;
    const a = Buffer.from(m[2]);
    const b = Buffer.from(firma(`${obraId}|${exp}`, env));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { firmarLlave, verificarLlave, VIGENCIA_MS };
