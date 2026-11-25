// ─── riteappAuth.js — quién llama a la API de la app RITE (rite.brokergy.es) ──
// Mismo patrón que certappAuth.js: el MISMO Supabase Auth que el CRM, pero un
// instalador de la app RITE NO es un `usuarios` sino una fila de
// `riteapp_cuentas`. No pasa ningún guardián del CRM (enforceAuth le da 403
// SIN_PERFIL_CRM) y no abre app.brokergy.es con su cuenta.
//
// REGLA (como en la app de certificadores) — cada handler filtra por
// `req.riteapp.cuenta.id` y responde 404 ante una memoria ajena.
// REGLA 38 — con la BD caída, 503: nunca se trata como «sin cuenta».
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../services/supabaseClient');

const cache = new Map();            // token → { datos, expiresAt }
const TTL_MS = 2 * 60 * 1000;

const tokenDe = (req) => {
    const h = req.headers.authorization;
    return h && h.startsWith('Bearer ') ? h.slice(7) : null;
};
function leerCache(token) {
    const e = cache.get(token);
    if (!e || e.expiresAt < Date.now()) { cache.delete(token); return null; }
    return e.datos;
}
function guardarCache(token, datos) {
    cache.set(token, { datos, expiresAt: Date.now() + TTL_MS });
    if (cache.size > 500) for (const [k, v] of cache) if (v.expiresAt < Date.now()) cache.delete(k);
}
const olvidarToken = (token) => { if (token) cache.delete(token); };
const olvidarCuenta = (cuentaId) => { for (const [k, v] of cache) if (v.datos?.cuenta?.id === cuentaId) cache.delete(k); };

/** { ok, authId, email, cuenta|null } · { ok:false, status, error, code } · null sin token. */
async function identificarRiteapp(req) {
    const token = tokenDe(req);
    if (!token) return null;
    const enCache = leerCache(token);
    if (enCache) return enCache;
    const { data: { user } = {}, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return { ok: false, status: 401, error: 'Tu sesión ha caducado. Vuelve a entrar.', code: 'TOKEN_INVALIDO' };
    }
    const { data: cuenta, error } = await supabase.from('riteapp_cuentas').select('*')
        .eq('auth_user_id', user.id).maybeSingle();
    if (error) {
        console.error('[riteappAuth] Error leyendo la cuenta:', error.message);
        return { ok: false, status: 503, error: 'No hemos podido cargar tu cuenta. Vuelve a intentarlo en unos segundos.', code: 'CUENTA_NO_DISPONIBLE' };
    }
    const datos = { ok: true, authId: user.id, email: user.email, cuenta: cuenta || null };
    guardarCache(token, datos);
    return datos;
}

const BLOQUEADA = { error: 'Tu cuenta está bloqueada. Escríbenos si crees que es un error.', code: 'RITEAPP_BLOQUEADA' };

/** Guardián: solo una empresa instaladora con cuenta (no bloqueada). Deja `req.riteapp`. */
async function riteappOnly(req, res, next) {
    try {
        const id = await identificarRiteapp(req);
        if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
        if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
        if (!id.cuenta) return res.status(403).json({ error: 'Esta cuenta aún no está dada de alta en la app RITE.', code: 'RITEAPP_SIN_CUENTA' });
        if (id.cuenta.estado === 'BLOQUEADA') return res.status(403).json(BLOQUEADA);
        req.riteapp = { authId: id.authId, email: id.email, cuenta: id.cuenta, token: tokenDe(req) };
        next();
    } catch (e) {
        console.error('[riteappAuth] Error:', e.message);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
}

/** Guardián del ALTA: una sesión válida de Supabase, tenga o no cuenta. Deja `req.riteappSesion`. */
async function riteappSesion(req, res, next) {
    try {
        const id = await identificarRiteapp(req);
        if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
        if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
        if (id.cuenta?.estado === 'BLOQUEADA') return res.status(403).json(BLOQUEADA);
        req.riteappSesion = { authId: id.authId, email: id.email, cuenta: id.cuenta, token: tokenDe(req) };
        next();
    } catch (e) {
        console.error('[riteappAuth] Error:', e.message);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
}

module.exports = { identificarRiteapp, riteappOnly, riteappSesion, olvidarToken, olvidarCuenta };
