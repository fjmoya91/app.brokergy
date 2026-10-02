// ============================================================================
// carpetaLocalEnlace.js — el enlace «Abrir la carpeta LOCAL» que va en un email.
//
// Gmail y Outlook no dejan enlazar un protocolo propio (`brokergylocal:`), así
// que el email apunta a una página https —`GET /api/expedientes/:id/open-local-
// folder`— que resuelve la ruta en el espejo de Drive del PC y lanza el
// protocolo desde el navegador.
//
// La firma es un HMAC: sin ella la ruta (que es pública) serviría para listar
// la ruta local de cualquier carpeta de Drive. Dos formas:
//   · sin carpeta → la RAÍZ del expediente CAE (el email de «Revisión
//     solicitada»; los enlaces ya enviados siguen valiendo con ella);
//   · con carpeta → UNA carpeta concreta (la del CEE, en el aviso del Agente IA).
//     Firma `id + carpeta`, así que no se le puede cambiar la carpeta al enlace.
//     Vale para los TRES negocios: la página no resuelve el expediente, solo la
//     carpeta firmada.
// ============================================================================

const crypto = require('crypto');

const secreto = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-open-folder';
const FRONT = () => String(process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/+$/, '');

/** El id de una carpeta de Drive a partir de su enlace (o el id tal cual). */
function idDeCarpeta(link) {
    const s = String(link || '').trim();
    if (!s) return null;
    const m = s.match(/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

function firmaCarpeta(id, carpetaId = null) {
    const base = carpetaId ? `open-folder:${id}:${carpetaId}` : `open-folder:${id}`;
    return crypto.createHmac('sha256', secreto()).update(base).digest('hex');
}

function firmaCarpetaValida(id, token, carpetaId = null) {
    if (!token) return false;
    const a = Buffer.from(String(token));
    const b = Buffer.from(firmaCarpeta(id, carpetaId));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ORIGENES = new Set(['cae', 'cee', 'op']);

/**
 * El enlace https que abre la carpeta local. `carpeta` es el enlace (o id) de
 * Drive; sin él, la raíz del expediente. `origen` solo decide a dónde lleva el
 * botón «Volver» de la página (cae → ?exp=, cee → ?cee=, op → ?op=).
 * @returns {string|null}
 */
function enlaceCarpetaLocal({ id, carpeta = null, origen = 'cae' } = {}) {
    if (!id) return null;
    const carpetaId = carpeta ? idDeCarpeta(carpeta) : null;
    if (carpeta && !carpetaId) return null;
    const q = new URLSearchParams({ token: firmaCarpeta(id, carpetaId) });
    if (carpetaId) q.set('folder', carpetaId);
    if (ORIGENES.has(origen) && origen !== 'cae') q.set('origen', origen);
    return `${FRONT()}/api/expedientes/${encodeURIComponent(id)}/open-local-folder?${q.toString()}`;
}

/** A dónde vuelve la página: el parámetro solo elige de una lista cerrada. */
function enlaceVolver(id, origen) {
    const k = origen === 'cee' ? 'cee' : origen === 'op' ? 'op' : 'exp';
    return `${FRONT()}/?${k}=${encodeURIComponent(id)}`;
}

module.exports = { idDeCarpeta, firmaCarpeta, firmaCarpetaValida, enlaceCarpetaLocal, enlaceVolver };
