const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { sendPasswordResetEmail } = require('../services/emailService');

/**
 * POST /api/auth/forgot-password
 * Genera un token de reset y envía email con enlace.
 * 
 * NOTA: Este endpoint NO requiere autenticación (el usuario no está logueado).
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'El email es obligatorio.' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // 1. Verificar que el email existe en la tabla usuarios
        const { data: usuario, error: userErr } = await supabase
            .from('usuarios')
            .select('id_usuario, nombre, apellidos, email, auth_user_id')
            .eq('email', cleanEmail)
            .maybeSingle();

        // Si no lo encontramos por email en usuarios, buscar en auth.users
        let targetUser = usuario;
        if (!targetUser) {
            const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
            if (!listErr && users) {
                const authUser = users.find(u => u.email?.toLowerCase() === cleanEmail);
                if (authUser) {
                    // Buscar en tabla usuarios por auth_user_id
                    const { data: profileByAuth } = await supabase
                        .from('usuarios')
                        .select('id_usuario, nombre, apellidos, email, auth_user_id')
                        .eq('auth_user_id', authUser.id)
                        .maybeSingle();
                    
                    targetUser = profileByAuth || { email: cleanEmail, auth_user_id: authUser.id };
                }
            }
        }

        // SIEMPRE responder 200 aunque no exista (evitar enumeración de emails)
        if (!targetUser || !targetUser.auth_user_id) {
            console.warn(`[Auth] Reset solicitado para email inexistente: ${cleanEmail}`);
            return res.json({ 
                message: 'Si el email está registrado, recibirás un enlace para recuperar tu contraseña.' 
            });
        }

        // 2. Generar token seguro
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

        // 3. Invalidar tokens previos para este email
        await supabase
            .from('password_resets')
            .update({ used: true })
            .eq('email', cleanEmail)
            .eq('used', false);

        // 4. Guardar nuevo token
        const { error: insertErr } = await supabase
            .from('password_resets')
            .insert({
                email: cleanEmail,
                token: token,
                expires_at: expiresAt.toISOString(),
                used: false,
            });

        if (insertErr) {
            console.error('[Auth] Error guardando token de reset:', insertErr.message);
            return res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
        }

        // 5. Construir enlace de reset
        // En producción, usar la URL del frontend desplegado
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || 'https://app.brokergy.es';
        const resetLink = `${baseUrl}/reset-password?token=${token}`;

        // 6. Enviar email
        const userName = targetUser.nombre 
            ? `${targetUser.nombre}${targetUser.apellidos ? ' ' + targetUser.apellidos : ''}`
            : null;

        await sendPasswordResetEmail(cleanEmail, resetLink, userName);

        console.log(`[Auth] Email de reset enviado a ${cleanEmail}`);
        
        res.json({ 
            message: 'Si el email está registrado, recibirás un enlace para recuperar tu contraseña.' 
        });

    } catch (error) {
        console.error('[Auth] Error en forgot-password:', error);
        res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
    }
});

/**
 * POST /api/auth/reset-password
 * Verifica el token y actualiza la contraseña.
 * 
 * NOTA: Este endpoint NO requiere autenticación.
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        // 1. Buscar token válido
        const { data: resetRecord, error: tokenErr } = await supabase
            .from('password_resets')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .maybeSingle();

        if (tokenErr || !resetRecord) {
            return res.status(400).json({ 
                error: 'El enlace no es válido o ya fue utilizado. Solicita uno nuevo.' 
            });
        }

        // 2. Verificar que no ha expirado
        if (new Date(resetRecord.expires_at) < new Date()) {
            // Marcar como usado
            await supabase
                .from('password_resets')
                .update({ used: true })
                .eq('id', resetRecord.id);

            return res.status(400).json({ 
                error: 'El enlace ha expirado. Solicita uno nuevo (validez: 1 hora).' 
            });
        }

        // 3. Buscar el auth_user_id del usuario
        const email = resetRecord.email;
        
        // Intentar encontrar por email en usuarios
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('auth_user_id')
            .eq('email', email)
            .maybeSingle();

        let authUserId = usuario?.auth_user_id;

        // Si no encontramos en usuarios, buscar directamente en auth
        if (!authUserId) {
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            authUserId = authUser?.id;
        }

        if (!authUserId) {
            return res.status(400).json({ error: 'No se encontró la cuenta asociada a este email.' });
        }

        // 4. Actualizar contraseña en Supabase Auth
        const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
            password: password,
        });

        if (updateErr) {
            console.error('[Auth] Error actualizando contraseña:', updateErr.message);
            return res.status(500).json({ error: 'Error al actualizar la contraseña. Inténtalo de nuevo.' });
        }

        // 5. Marcar token como usado
        await supabase
            .from('password_resets')
            .update({ used: true })
            .eq('id', resetRecord.id);

        console.log(`[Auth] Contraseña actualizada para ${email}`);

        res.json({ 
            success: true, 
            message: 'Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión.' 
        });

    } catch (error) {
        console.error('[Auth] Error en reset-password:', error);
        res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
    }
});

/**
 * GET /api/auth/verify-token
 * Verifica si un token de reset es válido (para mostrar el formulario o un error).
 */
router.get('/verify-token', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token no proporcionado.' });
        }

        const { data: resetRecord } = await supabase
            .from('password_resets')
            .select('email, expires_at, used')
            .eq('token', token)
            .maybeSingle();

        if (!resetRecord || resetRecord.used) {
            return res.json({ valid: false, error: 'El enlace no es válido o ya fue utilizado.' });
        }

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.json({ valid: false, error: 'El enlace ha expirado. Solicita uno nuevo.' });
        }

        res.json({ valid: true, email: resetRecord.email });

    } catch (error) {
        console.error('[Auth] Error verificando token:', error);
        res.status(500).json({ valid: false, error: 'Error interno.' });
    }
});

module.exports = router;
