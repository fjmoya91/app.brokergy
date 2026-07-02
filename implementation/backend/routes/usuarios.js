const express = require('express');
const router = express.Router();
const { requireAuth, enforceAuth, adminOnly, invalidateAuthToken } = require('../middleware/auth');
const supabase = require('../services/supabaseClient');

// id_rol del rol TRABAJADOR (ver scripts/rol_trabajador.sql). El panel de usuarios
// internos crea y gestiona SOLO trabajadores; los ADMIN se gestionan aparte.
const ROL_TRABAJADOR = 8;
const ROLES_INTERNOS = [1, ROL_TRABAJADOR]; // ADMIN + TRABAJADOR

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

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de USUARIOS INTERNOS (ADMIN + TRABAJADOR) — solo ADMIN.
// El TRABAJADOR opera como el ADMIN pero sin ver el margen/beneficio de Brokergy
// y sin poder borrar. Se dan de alta desde el panel de admin.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/usuarios — lista de usuarios internos (ADMIN + TRABAJADOR)
router.get('/', adminOnly, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id_usuario, auth_user_id, id_rol, nombre, apellidos, email, tlf, nif, ccaa, provincia, municipio, direccion, codigo_postal, activo, created_at, avatar_url, roles ( nombre_rol )')
            .in('id_rol', ROLES_INTERNOS)
            .order('created_at', { ascending: true });
        if (error) throw error;
        res.json((data || []).map(u => ({ ...u, rol_nombre: u.roles?.nombre_rol || null })));
    } catch (err) {
        console.error('[GET /usuarios] Error:', err);
        res.status(500).json({ error: 'Error al listar los usuarios internos' });
    }
});

// POST /api/usuarios — crear un TRABAJADOR (auth + fila en `usuarios`)
router.post('/', adminOnly, async (req, res) => {
    let createdAuthId = null;
    try {
        const body = req.body || {};
        const nombre = (body.nombre || '').trim();
        const apellidos = (body.apellidos || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password ? String(body.password) : '';
        const nif = (body.nif || '').trim().toUpperCase() || null;
        const tlf = (body.tlf || '').trim() || null;

        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
        if (!email) return res.status(400).json({ error: 'El email es obligatorio.' });
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        // 1. Crear el usuario en Supabase Auth (email confirmado, sin email de invitación).
        const { data: authRes, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { nombre, apellidos, rol: 'TRABAJADOR' },
        });
        if (authErr) {
            const msg = /already been registered|already exists/i.test(authErr.message || '')
                ? 'Ya existe un usuario con ese email.'
                : `Error en el sistema de autenticación: ${authErr.message}`;
            return res.status(400).json({ error: msg });
        }
        createdAuthId = authRes.user.id;

        // 2. Crear la fila en `usuarios` con el rol TRABAJADOR.
        const { data: perfil, error: dbErr } = await supabase
            .from('usuarios')
            .insert({
                auth_user_id: createdAuthId,
                id_rol: ROL_TRABAJADOR,
                nombre,
                apellidos: apellidos || null,
                email,
                nif,
                tlf,
                activo: true,
            })
            .select('id_usuario, auth_user_id, id_rol, nombre, apellidos, email, tlf, nif, activo, created_at, roles ( nombre_rol )')
            .single();
        if (dbErr) {
            // Rollback del usuario de Auth para no dejar cuentas huérfanas.
            await supabase.auth.admin.deleteUser(createdAuthId).catch(() => {});
            throw new Error(dbErr.message);
        }

        res.status(201).json({ ...perfil, rol_nombre: perfil.roles?.nombre_rol || 'TRABAJADOR' });
    } catch (err) {
        console.error('[POST /usuarios] Error:', err);
        res.status(500).json({ error: err.message || 'Error al crear el usuario' });
    }
});

// PATCH /api/usuarios/:id — el ADMIN edita los datos de un TRABAJADOR
// (nombre, contacto, dirección, foto, email y contraseña). Mismo modelo que
// PATCH /me pero apuntando a otro usuario. Solo aplica a TRABAJADORES.
router.patch('/:id', adminOnly, async (req, res) => {
    try {
        const { data: target, error: getErr } = await supabase
            .from('usuarios')
            .select('id_usuario, auth_user_id, id_rol, email')
            .eq('id_usuario', req.params.id)
            .maybeSingle();
        if (getErr) throw getErr;
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
        if (target.id_rol !== ROL_TRABAJADOR) {
            return res.status(400).json({ error: 'Solo se pueden editar trabajadores desde aquí.' });
        }

        const body = req.body || {};
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
        if (body.avatar_url !== undefined) update.avatar_url = body.avatar_url || null;

        if (update.nombre === null) {
            return res.status(400).json({ error: 'El nombre es obligatorio.' });
        }

        // Email: si cambia, se sincroniza también con Supabase Auth.
        let nuevoEmail = null;
        if (typeof body.email === 'string') {
            const e = body.email.trim().toLowerCase();
            if (e && e !== (target.email || '').toLowerCase()) {
                nuevoEmail = e;
                update.email = e;
            }
        }

        // Contraseña: opcional (el ADMIN puede fijar una nueva).
        let nuevaPassword = null;
        if (body.password) {
            if (String(body.password).length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
            }
            nuevaPassword = String(body.password);
        }

        if (Object.keys(update).length > 0) {
            const { error: dbErr } = await supabase.from('usuarios').update(update).eq('id_usuario', target.id_usuario);
            if (dbErr) throw new Error(`Error al guardar los datos: ${dbErr.message}`);
        }

        const authUpdates = {};
        if (nuevoEmail) authUpdates.email = nuevoEmail;
        if (nuevaPassword) authUpdates.password = nuevaPassword;
        if (Object.keys(authUpdates).length > 0) {
            if (!target.auth_user_id) {
                return res.status(400).json({ error: 'El trabajador no tiene un acceso vinculado correctamente.' });
            }
            const { error: authErr } = await supabase.auth.admin.updateUserById(target.auth_user_id, authUpdates);
            if (authErr) {
                const msg = /already been registered|already exists/i.test(authErr.message || '')
                    ? 'Ya existe un usuario con ese email.'
                    : `Error en el sistema de autenticación: ${authErr.message}`;
                return res.status(400).json({ error: msg });
            }
        }

        const { data: fresh, error: freshErr } = await supabase
            .from('usuarios')
            .select('id_usuario, auth_user_id, id_rol, nombre, apellidos, email, tlf, nif, ccaa, provincia, municipio, direccion, codigo_postal, activo, avatar_url, created_at, roles ( nombre_rol )')
            .eq('id_usuario', target.id_usuario)
            .maybeSingle();
        if (freshErr) throw freshErr;

        res.json({ ...fresh, rol_nombre: fresh?.roles?.nombre_rol || 'TRABAJADOR' });
    } catch (err) {
        console.error('[PATCH /usuarios/:id] Error:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar el trabajador' });
    }
});

// PATCH /api/usuarios/:id/activo — activar / desactivar un TRABAJADOR
router.patch('/:id/activo', adminOnly, async (req, res) => {
    try {
        const activar = req.body?.activar === true || req.body?.activar === 'true';

        const { data: target, error: getErr } = await supabase
            .from('usuarios')
            .select('id_usuario, auth_user_id, id_rol')
            .eq('id_usuario', req.params.id)
            .maybeSingle();
        if (getErr) throw getErr;
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

        // Guardarraíl: este endpoint solo gestiona TRABAJADORES (no toca ADMIN ni otros).
        if (target.id_rol !== ROL_TRABAJADOR) {
            return res.status(400).json({ error: 'Solo se puede activar/desactivar a un trabajador desde aquí.' });
        }
        if (target.id_usuario === req.user.id_usuario) {
            return res.status(400).json({ error: 'No puedes cambiar el estado de tu propia cuenta.' });
        }

        // Banear / desbanear en Auth (mismo patrón que prescriptores) + flag `activo`.
        if (target.auth_user_id) {
            const banDuration = activar ? 'none' : '876000h'; // ~100 años
            const { error: authErr } = await supabase.auth.admin.updateUserById(target.auth_user_id, { ban_duration: banDuration });
            if (authErr) console.warn('[PATCH /usuarios/:id/activo] Auth ban:', authErr.message);
        }

        const { data: updated, error: upErr } = await supabase
            .from('usuarios')
            .update({ activo: activar })
            .eq('id_usuario', target.id_usuario)
            .select('id_usuario, id_rol, nombre, apellidos, email, activo, roles ( nombre_rol )')
            .single();
        if (upErr) throw upErr;

        res.json({ ...updated, rol_nombre: updated.roles?.nombre_rol || 'TRABAJADOR' });
    } catch (err) {
        console.error('[PATCH /usuarios/:id/activo] Error:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar el estado del usuario' });
    }
});

module.exports = router;
