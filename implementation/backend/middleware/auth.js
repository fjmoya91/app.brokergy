const supabase = require('../services/supabaseClient');

// Cache en memoria: token → { userData, expiresAt }
// TTL de 5 minutos — equilibrio entre seguridad y reducción de queries a Supabase
const authCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(token) {
    const entry = authCache.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
        authCache.delete(token);
        return null;
    }
    return entry.userData;
}

function setCache(token, userData) {
    authCache.set(token, { userData, expiresAt: Date.now() + CACHE_TTL_MS });
    // Limpiar entradas expiradas si el mapa crece demasiado
    if (authCache.size > 500) {
        for (const [k, v] of authCache) {
            if (v.expiresAt < Date.now()) authCache.delete(k);
        }
    }
}

const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];

        // Devolver desde caché si está disponible (evita 3 queries a Supabase por request)
        const cached = getCached(token);
        if (cached) {
            req.user = cached;
            return next();
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error('[Auth Middleware] Token inválido:', authError?.message);
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        const { data: userProfile, error: profileError } = await supabase
            .from('usuarios')
            .select(`*, roles ( nombre_rol )`)
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (profileError) {
            console.error('[Auth Middleware] Error al buscar perfil:', profileError.message);
        }

        if (userProfile && userProfile.activo === false) {
            console.warn('[Auth] Acceso denegado: usuario desactivado:', user.id);
            return res.status(403).json({ error: 'Tu cuenta ha sido desactivada. Contacta con el administrador.' });
        }

        const userData = {
            authId: user.id,
            email: user.email,
            id_usuario: userProfile?.id_usuario || null,
            id_rol: userProfile?.id_rol || null,
            rol_nombre: userProfile?.roles?.nombre_rol || null,
            perfilCompleto: userProfile || null,
            prescriptor_id: null,
            razon_social: null,
            acronimo: null,
            logo_empresa: null,
            marcas_autorizadas: null,
        };

        if (userProfile?.id_usuario) {
            const { data: isPrescriptor, error: presErr } = await supabase
                .from('prescriptores')
                .select('id_empresa, razon_social, logo_empresa, acronimo, marca_referencia')
                .eq('representante_legal_id', userProfile.id_usuario)
                .maybeSingle();

            if (presErr) console.error('[Auth] Error buscando partner:', presErr.message);

            userData.prescriptor_id = isPrescriptor?.id_empresa || null;
            userData.razon_social = isPrescriptor?.razon_social || null;
            userData.acronimo = isPrescriptor?.acronimo || null;
            userData.logo_empresa = isPrescriptor?.logo_empresa || null;
            userData.marcas_autorizadas = isPrescriptor?.marca_referencia || null;
        }

        setCache(token, userData);
        req.user = userData;
        next();
    } catch (error) {
        console.error('[Auth Middleware] Error fatal:', error);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
};

/**
 * Middleware estricto para rutas que solo admin/prescriptores deberían tocar
 */
/**
 * Middleware estricto para rutas que solo admin/prescriptores deberían tocar
 */
const enforceAuth = (req, res, next) => {
    requireAuth(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción' });
        }
        next();
    });
};

/**
 * Middleware estricto para rutas solo accesibles por ADMINISTRADORES
 */
const adminOnly = (req, res, next) => {
    enforceAuth(req, res, () => {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden realizar esta acción.' });
        }
        next();
    });
};

module.exports = {
    requireAuth,
    enforceAuth,
    adminOnly
};
