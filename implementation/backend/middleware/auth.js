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

// Invalida la entrada cacheada de un token. Necesario cuando el propio usuario
// edita su perfil (PATCH /api/usuarios/me): sin esto, el siguiente /me devolvería
// el perfilCompleto stale hasta que caduque el TTL de 5 min.
function invalidateAuthToken(token) {
    if (token) authCache.delete(token);
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

        // ─── Un fallo al LEER el perfil NO puede volverse un usuario en blanco ───
        // Antes esto solo se registraba y se seguía adelante: el usuario salía con
        // `rol_nombre`, `id_usuario` y `prescriptor_id` a null, y la app le servía —con
        // un HTTP 200— un menú recortado, "USUARIO" en vez de su acrónimo y una cartera
        // VACÍA (GET /oportunidades acaba filtrando por `creador_id = null`). Un partner
        // con 19 oportunidades veía "0 oportunidades · 0,00 €" con toda la apariencia de
        // normalidad, que se lee como que le hemos borrado el trabajo.
        //
        // Y como esa identidad se cacheaba 5 minutos (`setCache` más abajo), el susto
        // SOBREVIVÍA a la recuperación de la base de datos: recargar no lo arreglaba.
        //
        // Medido el 08/09/2026: Postgres se cayó y arrancó en recuperación, Cloudflare
        // sirvió "521 Web server is down" delante de Supabase durante ~1 min, y de ahí
        // salió justo esa pantalla. Ante un error de LECTURA se corta con 503 —"no lo
        // sé ahora mismo"—, no se cachea nada y el frontend puede reintentar.
        if (profileError) {
            console.error('[Auth Middleware] Error al buscar perfil:', profileError.message);
            return res.status(503).json({
                error: 'No hemos podido cargar tu perfil. Vuelve a intentarlo en unos segundos.',
                code: 'PROFILE_UNAVAILABLE'
            });
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

            // Mismo criterio que arriba: sin `prescriptor_id` el partner deja de ver
            // las oportunidades de SU empresa (el filtro de GET /oportunidades cae a
            // `creador_id`), así que un fallo de lectura aquí tampoco puede pasar por
            // "este usuario no tiene empresa".
            if (presErr) {
                console.error('[Auth] Error buscando partner:', presErr.message);
                return res.status(503).json({
                    error: 'No hemos podido cargar los datos de tu empresa. Vuelve a intentarlo en unos segundos.',
                    code: 'PROFILE_UNAVAILABLE'
                });
            }

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
 * Middleware estricto para rutas solo accesibles por ADMINISTRADORES.
 * Reservado para acciones que un TRABAJADOR NO debe poder hacer:
 * borrados, gestión de usuarios y ajustes globales.
 */
const adminOnly = (req, res, next) => {
    enforceAuth(req, res, () => {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden realizar esta acción.' });
        }
        next();
    });
};

/**
 * Middleware para acciones OPERATIVAS internas de Brokergy: lo que hace el
 * equipo del día a día (crear/editar oportunidades y expedientes, generar y
 * enviar documentos, gestionar clientes, operar lotes…). Accesible por ADMIN
 * y por TRABAJADOR. El TRABAJADOR opera igual que un ADMIN, pero NO ve el
 * margen/beneficio de Brokergy (eso se capa en los payloads con los strips)
 * y NO puede borrar ni tocar ajustes globales (eso sigue en `adminOnly`).
 */
const staffOnly = (req, res, next) => {
    enforceAuth(req, res, () => {
        const rol = req.user.rol_nombre;
        if (rol !== 'ADMIN' && rol !== 'TRABAJADOR') {
            return res.status(403).json({ error: 'Acceso denegado. Solo el equipo interno de Brokergy puede realizar esta acción.' });
        }
        next();
    });
};

/**
 * Middleware para módulos INTERNOS de Brokergy (p.ej. Expedientes).
 * ADMIN, TRABAJADOR y CERTIFICADOR. Los partners (PRESCRIPTOR / INSTALADOR /
 * DISTRIBUIDOR) quedan completamente fuera: no son datos de su ámbito.
 * OJO: esto es solo control de ACCESO. El dinero se capa aparte por rol
 * (ADMIN ve todo; TRABAJADOR ve bono/presupuesto sin margen; CERTIFICADOR
 * no ve ninguna cifra).
 */
const internalOnly = (req, res, next) => {
    enforceAuth(req, res, () => {
        const rol = req.user.rol_nombre;
        if (rol !== 'ADMIN' && rol !== 'CERTIFICADOR' && rol !== 'TRABAJADOR') {
            return res.status(403).json({ error: 'Acceso denegado. Este recurso es interno de Brokergy.' });
        }
        next();
    });
};

// ─── Helpers de rol (para usar dentro de handlers, no como middleware) ────────
// Único que ve el margen/beneficio de Brokergy: ADMIN.
const canSeeBrokergyMargin = (req) => !!(req.user && req.user.rol_nombre === 'ADMIN');
const isAdmin = (req) => !!(req.user && req.user.rol_nombre === 'ADMIN');
const isTrabajador = (req) => !!(req.user && req.user.rol_nombre === 'TRABAJADOR');
const isStaff = (req) => !!(req.user && (req.user.rol_nombre === 'ADMIN' || req.user.rol_nombre === 'TRABAJADOR'));

module.exports = {
    requireAuth,
    enforceAuth,
    adminOnly,
    staffOnly,
    internalOnly,
    invalidateAuthToken,
    canSeeBrokergyMargin,
    isAdmin,
    isTrabajador,
    isStaff,
};
