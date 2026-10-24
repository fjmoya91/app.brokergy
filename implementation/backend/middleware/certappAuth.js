// ─── certappAuth.js — quién llama a la API de la app de certificadores ──────
// La app de certificadores (cee.brokergy.es) usa el MISMO Supabase Auth que el
// CRM, pero un certificador externo NO es un `usuarios`: es una fila de
// `certapp_cuentas`. Así no pasa ninguno de los guardianes del CRM
// (`internalOnly` deja entrar a CERTIFICADOR, que es otra cosa: los técnicos de
// BROKERGY) y no puede abrir app.brokergy.es con su cuenta.
//
// REGLA — cada handler filtra por `req.certapp.cuenta.id` y responde 404 (no
// 403) ante una obra ajena: no se confirma que exista (mismo criterio que
// `suyaSiPartner`, regla 102). `obraDeLaCuenta` es la comprobación única.
//
// REGLA — con la BD caída, 503 (regla 38): nunca se trata como «sin cuenta».
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../services/supabaseClient');
const { requireAuth } = require('./auth');

const cache = new Map();            // token → { datos, expiresAt }
const TTL_MS = 2 * 60 * 1000;       // corto: bloquear una cuenta debe notarse pronto

function leerCache(token) {
    const e = cache.get(token);
    if (!e || e.expiresAt < Date.now()) { cache.delete(token); return null; }
    return e.datos;
}

function guardarCache(token, datos) {
    cache.set(token, { datos, expiresAt: Date.now() + TTL_MS });
    if (cache.size > 500) {
        for (const [k, v] of cache) if (v.expiresAt < Date.now()) cache.delete(k);
    }
}

/** Olvida lo cacheado de un token (tras editar el perfil o bloquear la cuenta). */
function olvidarToken(token) {
    if (token) cache.delete(token);
}

/** Olvida TODO lo cacheado de una cuenta (bloqueo o cambio de créditos desde el admin). */
function olvidarCuenta(cuentaId) {
    for (const [k, v] of cache) if (v.datos?.cuenta?.id === cuentaId) cache.delete(k);
}

function tokenDe(req) {
    const h = req.headers.authorization;
    return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * Identifica sin cortar. Devuelve:
 *   { ok: true, authId, email, cuenta }       cuenta puede ser null (no es certificador)
 *   { ok: false, status, error, code }        token malo (401) o BD caída (503)
 *   null                                      no hay token
 */
async function identificarCertapp(req) {
    const token = tokenDe(req);
    if (!token) return null;
    const enCache = leerCache(token);
    if (enCache) return enCache;

    const { data: { user } = {}, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return { ok: false, status: 401, error: 'Tu sesión ha caducado. Vuelve a entrar.', code: 'TOKEN_INVALIDO' };
    }

    const { data: cuenta, error } = await supabase
        .from('certapp_cuentas')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();
    if (error) {
        console.error('[certappAuth] Error leyendo la cuenta:', error.message);
        return { ok: false, status: 503, error: 'No hemos podido cargar tu cuenta. Vuelve a intentarlo en unos segundos.', code: 'CUENTA_NO_DISPONIBLE' };
    }

    const datos = { ok: true, authId: user.id, email: user.email, cuenta: cuenta || null };
    guardarCache(token, datos);
    return datos;
}

/** Guardián: solo un certificador con cuenta ACTIVA. Deja `req.certapp`. */
async function certappOnly(req, res, next) {
    try {
        const id = await identificarCertapp(req);
        if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
        if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
        if (!id.cuenta) {
            return res.status(403).json({ error: 'Esta cuenta no tiene acceso a la app de certificadores.', code: 'CERTAPP_SIN_CUENTA' });
        }
        if (id.cuenta.estado === 'BLOQUEADA') {
            return res.status(403).json({ error: 'Tu cuenta está bloqueada. Escríbenos si crees que es un error.', code: 'CERTAPP_BLOQUEADA' });
        }
        req.certapp = { authId: id.authId, email: id.email, cuenta: id.cuenta };
        // Primer acceso con la contraseña ya puesta: la cuenta pasa a ACTIVA.
        if (id.cuenta.estado === 'PENDIENTE') {
            supabase.from('certapp_cuentas').update({ estado: 'ACTIVA' }).eq('id', id.cuenta.id).then(() => {});
            id.cuenta.estado = 'ACTIVA';
        }
        next();
    } catch (e) {
        console.error('[certappAuth] Error:', e.message);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
}

/**
 * Guardián del ALTA con Google (POST /api/certapp/alta): una sesión válida de
 * Supabase, tenga o no cuenta. Deja `req.certappSesion = { authId, email, cuenta, token }`.
 */
async function certappSesion(req, res, next) {
    try {
        const id = await identificarCertapp(req);
        if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
        if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
        if (id.cuenta?.estado === 'BLOQUEADA') {
            return res.status(403).json({ error: 'Tu cuenta está bloqueada. Escríbenos si crees que es un error.', code: 'CERTAPP_BLOQUEADA' });
        }
        req.certappSesion = { authId: id.authId, email: id.email, cuenta: id.cuenta, token: tokenDe(req) };
        next();
    } catch (e) {
        console.error('[certappAuth] Error:', e.message);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
}

/**
 * Guardián de `/api/certapp/me` y de lo que comparten las dos vistas: pasa un
 * certificador (req.certapp) o un ADMIN de BROKERGY (req.user), o los dos.
 */
async function certappOAdmin(req, res, next) {
    try {
        const id = await identificarCertapp(req);
        if (!id) return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'SIN_SESION' });
        if (!id.ok) return res.status(id.status).json({ error: id.error, code: id.code });
        if (id.cuenta && id.cuenta.estado !== 'BLOQUEADA') {
            req.certapp = { authId: id.authId, email: id.email, cuenta: id.cuenta };
        }
        requireAuth(req, res, () => {
            const esAdmin = req.user?.rol_nombre === 'ADMIN';
            if (!req.certapp && !esAdmin) {
                return res.status(403).json({ error: 'Esta cuenta no tiene acceso a la app de certificadores.', code: 'CERTAPP_SIN_CUENTA' });
            }
            req.certappAdmin = esAdmin;
            next();
        });
    } catch (e) {
        console.error('[certappAuth] Error:', e.message);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
}

/**
 * ¿Es esta obra de esta cuenta? La comprobación ÚNICA de propiedad. Devuelve
 * true / false, o lanza si la BD falla (el handler responde 503).
 */
async function obraDeLaCuenta(obraId, cuentaId) {
    if (!obraId || !cuentaId) return false;
    if (!/^[0-9a-f-]{36}$/i.test(String(obraId))) return false;
    const { data, error } = await supabase
        .from('certapp_obras')
        .select('id')
        .eq('id', obraId)
        .eq('cuenta_id', cuentaId)
        .maybeSingle();
    if (error) {
        const e = new Error(error.message);
        e.status = 503;
        throw e;
    }
    return !!data;
}

module.exports = {
    identificarCertapp,
    certappOnly,
    certappOAdmin,
    certappSesion,
    obraDeLaCuenta,
    olvidarToken,
    olvidarCuenta,
};
