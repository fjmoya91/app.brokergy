const express = require('express');
const router = express.Router();
const { requireAuth, enforceAuth, invalidateAuthToken } = require('../middleware/auth');
const supabase = require('../services/supabaseClient');

router.get('/me', requireAuth, (req, res) => {
    // Si no hay req.user validado por el middleware (no token o token inválido)
    if (!req.user) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    // req.user ya viene enriquecido desde Supabase por nuestro middleware auth.js
    res.json(req.user);
});

// Actualizar el perfil del PROPIO usuario logueado (datos personales, dirección,
// foto, email y contraseña). Pensado para usuarios internos (ADMIN, CERTIFICADOR)
// que no tienen ficha en `prescriptores` y por tanto no pasan por PATCH /prescriptores.
// Cada usuario solo puede tocar SUS datos: el id sale del token, nunca del body.
router.patch('/me', enforceAuth, async (req, res) => {
    try {
        const me = req.user;
        if (!me?.id_usuario) {
            return res.status(400).json({ error: 'Tu usuario no tiene un perfil asociado.' });
        }

        const perfil = me.perfilCompleto || {};
        const authUserId = perfil.auth_user_id;
        const body = req.body || {};

        // ── Campos de la tabla `usuarios` editables por el propio usuario ──────
        const update = {};
        const setStr = (key, val, { upper = false, lower = false } = {}) => {
            if (val === undefined) return;
            let v = (val === null) ? null : String(val).trim();
            if (v === '') v = null;
            if (v && upper) v = v.toUpperCase();
            if (v && lower) v = v.toLowerCase();
            update[key] = v;
        };
        setStr('nombre', body.nombre);
        setStr('apellidos', body.apellidos);
        setStr('nif', body.nif, { upper: true });
        setStr('tlf', body.tlf);
        setStr('ccaa', body.ccaa);
        setStr('provincia', body.provincia);
        setStr('municipio', body.municipio);
        setStr('direccion', body.direccion, { upper: true });
        setStr('codigo_postal', body.codigo_postal);
        if (body.avatar_url !== undefined) {
            update.avatar_url = body.avatar_url || null;
        }

        // `nombre` es NOT NULL en BD: no permitir vaciarlo.
        if (update.nombre === null) {
            return res.status(400).json({ error: 'El nombre es obligatorio.' });
        }

        // ── Email: si cambia, se sincroniza también con Supabase Auth ──────────
        let nuevoEmail = null;
        if (typeof body.email === 'string') {
            const e = body.email.trim().toLowerCase();
            if (e && e !== (perfil.email || '').toLowerCase()) {
                nuevoEmail = e;
                update.email = e;
            }
        }

        // ── Contraseña: opcional, validada ─────────────────────────────────────
        let nuevaPassword = null;
        if (body.password) {
            if (String(body.password).length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
            }
            nuevaPassword = String(body.password);
        }

        // 1. Actualizar la fila en `usuarios`
        if (Object.keys(update).length > 0) {
            const { error: dbErr } = await supabase
                .from('usuarios')
                .update(update)
                .eq('id_usuario', me.id_usuario);
            if (dbErr) throw new Error(`Error al guardar los datos: ${dbErr.message}`);
        }

        // 2. Sincronizar email / contraseña con Supabase Auth
        const authUpdates = {};
        if (nuevoEmail) authUpdates.email = nuevoEmail;
        if (nuevaPassword) authUpdates.password = nuevaPassword;
        if (Object.keys(authUpdates).length > 0) {
            if (!authUserId) {
                return res.status(400).json({ error: 'Tu cuenta no tiene un acceso vinculado correctamente.' });
            }
            const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, authUpdates);
            if (authErr) throw new Error(`Error en el sistema de autenticación: ${authErr.message}`);
        }

        // 3. Invalidar la caché del token para que /me devuelva datos frescos al instante
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            invalidateAuthToken(authHeader.split(' ')[1]);
        }

        // 4. Devolver el perfil actualizado
        const { data: fresh, error: freshErr } = await supabase
            .from('usuarios')
            .select('*, roles ( nombre_rol )')
            .eq('id_usuario', me.id_usuario)
            .maybeSingle();
        if (freshErr) console.error('[PATCH /usuarios/me] No se pudo releer el perfil:', freshErr.message);

        res.json({ ok: true, perfil: fresh || null });
    } catch (err) {
        console.error('[PATCH /usuarios/me] Error:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar el perfil' });
    }
});

module.exports = router;
