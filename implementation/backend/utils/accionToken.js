// ─── accionToken — enlaces de acción firmados del parte diario ────────────────
//
// El parte diario de seguimiento (`seguimientoDiario.js`) llega por WhatsApp y por
// email con un enlace por expediente atascado. Al pulsarlo se abre una página que
// permite mandar el recordatorio al certificador / al cliente SIN entrar en la app.
//
// La firma es HMAC STATELESS, igual que `approveCeeSignature` (routes/expedientes.js):
// no se guarda ningún token en la BD, así que el autoguardado del expediente no lo
// puede pisar y no hay que limpiar nada. El endpoint recomputa la firma y compara.
//
// DIFERENCIA con approveCeeSignature: estos enlaces CADUCAN. Aquel solo aprueba algo
// tuyo y su peor caso es que te apruebes un CEE dos veces; estos DISPARAN UN MENSAJE
// A UN TERCERO (el certificador, el cliente). Un parte de hace tres meses reenviado
// o filtrado no puede seguir siendo un gatillo vivo, así que la fecha de caducidad
// viaja en el enlace y va DENTRO de lo firmado — si se manipula, la firma no cuadra.
//
// El enlace por sí solo tampoco envía nada: abre una página de confirmación con el
// mensaje editable (ver routes/acciones.js). La firma autoriza a PREPARAR el envío,
// no a ejecutarlo a ciegas.

const crypto = require('crypto');

// 14 días: cubre de sobra las vacaciones de quien lee el parte, y es mucho menos que
// la vida de un expediente (meses). Un atasco que siga vivo saldrá en el parte de
// mañana con un enlace nuevo, así que caducar pronto no pierde nada.
const VIGENCIA_MS = Number(process.env.ACCION_TOKEN_DIAS || 14) * 86400000;

const secreto = () =>
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-accion-token';

// La caducidad viaja en MINUTOS epoch, no en milisegundos: son 8 dígitos en vez de
// 13. Y la firma se trunca a 32 hex (128 bits), que para autenticar un enlace es de
// sobra. Suena a detalle tonto, pero el parte lleva una URL por línea y el mensaje
// de WhatsApp se iba de 4.000 caracteres solo en tokens: a partir de ahí el móvil lo
// pliega tras un "Leer más" y deja de cumplir su función, que es que se lea de un vistazo.
const FIRMA_HEX = 32;
const aMinutos = (ms) => Math.floor(ms / 60000);

/** Payload canónico. Cualquier cambio en `scope` invalida los enlaces ya emitidos. */
const payload = (tipo, expId, scope, expiraMin) =>
    `accion:${tipo}:${expId}:${scope || '-'}:${expiraMin}`;

/**
 * Firma una acción.
 * @param {string} tipo    'cert-registro' | 'cert-emision' | 'fin-obra' | …
 * @param {string} expId   uuid del expediente
 * @param {string} [scope] matiz de la acción ('inicial' | 'final' | clave del doc…)
 * @param {number} [vigenciaMs]
 * @returns {{ token: string, expira: number, query: string }}
 */
function firmarAccion(tipo, expId, scope = null, vigenciaMs = VIGENCIA_MS) {
    const expira = aMinutos(Date.now() + vigenciaMs);
    const token = crypto.createHmac('sha256', secreto())
        .update(payload(tipo, expId, scope, expira))
        .digest('hex').slice(0, FIRMA_HEX);
    const query = `e=${expira}&s=${token}${scope ? `&p=${encodeURIComponent(scope)}` : ''}`;
    return { token, expira, query };
}

/**
 * Verifica una acción firmada.
 * @returns {{ ok: boolean, motivo?: 'sin-token'|'caducado'|'firma-invalida' }}
 */
function verificarAccion(tipo, expId, scope, expira, token) {
    if (!token || !expira) return { ok: false, motivo: 'sin-token' };
    const expiraMin = Number(expira);
    if (!Number.isFinite(expiraMin)) return { ok: false, motivo: 'firma-invalida' };
    // La caducidad se comprueba ANTES que la firma para poder distinguir en la página
    // "este enlace es viejo, abre el expediente" de "este enlace no es nuestro".
    if (aMinutos(Date.now()) > expiraMin) return { ok: false, motivo: 'caducado' };

    const esperado = crypto.createHmac('sha256', secreto())
        .update(payload(tipo, expId, scope, expiraMin))
        .digest('hex').slice(0, FIRMA_HEX);
    const a = Buffer.from(String(token));
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, motivo: 'firma-invalida' };
    }
    return { ok: true };
}

/** URL completa de la página de acción, lista para meter en el mensaje. */
function urlAccion(tipo, expId, scope = null) {
    const base = process.env.FRONTEND_URL || 'https://app.brokergy.es';
    const { query } = firmarAccion(tipo, expId, scope);
    return `${base}/api/acciones/${tipo}/${expId}?${query}`;
}

module.exports = { firmarAccion, verificarAccion, urlAccion, VIGENCIA_MS };
