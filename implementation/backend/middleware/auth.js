const supabase = require('../services/supabaseClient');

/**
 * Middleware para validar el token JWT de Supabase desde el header Authorization
 * y anexar el perfil de negocio (usuarios y roles) a req.user.
 * 
 * Es "opcional" por defecto para no romper flujos públicos sin token (si los hay),
 * pero si requireAuth = true, forzará el 401.
 */
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // Sin token
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        
        // Verificamos el token con Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            console.error('[Auth Middleware] Token inválido:', authError?.message);
            // Si hay token pero es inválido, podríamos devolver 401
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        // Si tenemos auth user, buscamos su perfil en nuestra BD 'usuarios'
        const { data: userProfile, error: profileError } = await supabase
            .from('usuarios')
            .select(`
                *,
                roles (
                    nombre_rol
                )
            `)
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (profileError) {
            console.error('[Auth Middleware] Error al buscar perfil:', profileError.message);
        }

        req.user = {
            authId: user.id,
            email: user.email,
            // Datos del perfil extendido
            id_usuario: userProfile?.id_usuario || null,
            id_rol: userProfile?.id_rol || null,
            rol_nombre: userProfile?.roles?.nombre_rol || null,
            perfilCompleto: userProfile || null
        };

        // Extraemos prescriptores si aplica (para inyectar prescriptor_id)
        if (userProfile && userProfile.id_usuario) {
             console.log(`[Auth] Buscando partner para usuario: ${userProfile.id_usuario}`);
             const { data: isPrescriptor, error: presErr } = await supabase
                .from('prescriptores')
                .select('id_empresa, razon_social, logo_empresa')
                .eq('representante_legal_id', userProfile.id_usuario)
                .maybeSingle();
             
             if (presErr) console.error('[Auth] Error buscando partner:', presErr.message);
             
             req.user.prescriptor_id = isPrescriptor?.id_empresa || null;
             req.user.razon_social = isPrescriptor?.razon_social || null;
             req.user.logo_empresa = isPrescriptor?.logo_empresa || null;
             
             console.log(`[Auth] Partner encontrado: ${!!isPrescriptor}, Logo: ${!!req.user.logo_empresa} (${req.user.logo_empresa?.length || 0} chars)`);
        }
        
        next();
    } catch (error) {
        console.error('[Auth Middleware] Error fatal:', error);
        res.status(500).json({ error: 'Error interno en autenticación' });
    }
};

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

module.exports = {
    requireAuth,
    enforceAuth
};
