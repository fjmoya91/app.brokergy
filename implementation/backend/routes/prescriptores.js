const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { requireAuth, enforceAuth } = require('../middleware/auth');

// GET /api/prescriptores -> Listar prescriptores
router.get('/', enforceAuth, async (req, res) => {
    try {
        let query = supabase.from('prescriptores').select(`
            *,
            acronimo,
            usuarios (nombre, apellidos, nif, email, tlf)
        `).order('created_at', { ascending: false });

        if (req.user.rol_nombre !== 'ADMIN') {
            // Un prescriptor solo ve el suyo (aunque la tabla de prescriptores es para ADMIN principalmente,
            // pero si ellos entran a "Mi Perfil Empresa", usan esto)
            query = query.eq('representante_legal_id', req.user.id_usuario);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error GET prescriptores:', err);
        res.status(500).json({ error: 'Error al recuperar prescriptores' });
    }
});

// POST /api/prescriptores -> Crear prescriptor
router.post('/', enforceAuth, async (req, res) => {
    try {
        // Validación básica (solo ADMIN por ahora o auto-alta)
        if (req.user.rol_nombre !== 'ADMIN') {
             return res.status(403).json({ error: 'No autorizado para crear prescriptores.' });
        }

        const payload = req.body;
        // Si no se asigno representante, se deja nulo por si aplica.
        // Si es_autonomo, algunos datos podrian heredarse en el front o aqui.
        
        const { data, error } = await supabase.from('prescriptores').insert([payload]).select();
        
        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (err) {
        console.error('Error POST prescriptores:', err);
        res.status(500).json({ error: 'Error al crear prescriptor', details: err.message });
    }
});

// POST /api/prescriptores/avanzado -> Crea usuario auth + perfil + empresa
router.post('/avanzado', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
             return res.status(403).json({ error: 'No autorizado para altas masivas.' });
        }

        const payload = req.body;
        let finalRepresentanteId = payload.representante_legal_id;

        // 1. Si es nuevo usuario, lo creamos
        if (payload.nuevo_usuario) {
            // Generar nuevo usuario en Auth
            const authRes = await supabase.auth.admin.createUser({
                email: payload.usuario_email,
                password: payload.usuario_password,
                email_confirm: true // bypass confirmación
            });

            if (authRes.error) throw new Error(`Auth Error: ${authRes.error.message}`);
            const newAuthUserId = authRes.data.user.id;

            // Conseguir el ID de rol acorde al "tipo_empresa"
            // Por defecto, asimilamos el rol al tipo de empresa (DISTRIBUIDOR -> DISTRIBUIDOR) o 'DISTRIBUIDOR' si es OTRO/ASESORIA
            let roleToSearch = payload.tipo_empresa === 'OTRO' ? 'ASESORIA' : payload.tipo_empresa;
            let { data: roleData } = await supabase.from('roles').select('id_rol').eq('nombre_rol', roleToSearch).maybeSingle();
            
            if (!roleData) {
                // fallback
                let { data: fb } = await supabase.from('roles').select('id_rol').eq('nombre_rol', 'DISTRIBUIDOR').single();
                roleData = fb;
            }

            // Insertar en tabla usuarios
            const { data: newUserDB, error: newUserErr } = await supabase.from('usuarios').insert([{
                auth_user_id: newAuthUserId,
                id_rol: roleData.id_rol,
                nombre: payload.usuario_nombre,
                apellidos: payload.usuario_apellidos,
                nif: payload.usuario_nif,
                email: payload.usuario_email,
                tlf: payload.usuario_tlf,
                ccaa: payload.ccaa, // asume misma que empresa inicialmente
                provincia: payload.provincia,
                municipio: payload.municipio,
                direccion: payload.direccion,
                codigo_postal: payload.codigo_postal
            }]).select().single();

            if (newUserErr) {
                // Rollback auth user
                await supabase.auth.admin.deleteUser(newAuthUserId);
                throw new Error(`User DB Error: ${newUserErr.message}`);
            }

            finalRepresentanteId = newUserDB.id_usuario;
        }

        // 2. Insertar empresa (prescriptores)
        let empresaPayload = {
            es_autonomo: payload.es_autonomo,
            razon_social: payload.es_autonomo ? `${payload.usuario_nombre} ${payload.usuario_apellidos || ''}`.trim() : payload.razon_social,
            acronimo: payload.acronimo,
            cif: payload.es_autonomo ? payload.usuario_nif : payload.cif,
            email: payload.es_autonomo ? payload.usuario_email : payload.email,
            tlf: payload.es_autonomo ? payload.usuario_tlf : payload.tlf,
            representante_legal_id: finalRepresentanteId,
            ccaa: payload.ccaa,
            provincia: payload.provincia,
            municipio: payload.municipio,
            direccion: payload.direccion,
            codigo_postal: payload.codigo_postal,
            tipo_empresa: payload.tipo_empresa, // 'OTRO' mapeado desde front si es Asesoria
            marca_referencia: payload.marca_referencia,
            marca_secundaria: payload.marca_secundaria,
            tiene_carnet_rite: payload.tiene_carnet_rite || false,
            numero_carnet_rite: payload.numero_carnet_rite,
            cargo: payload.cargo,
            logo_empresa: payload.logo_empresa
        };

        console.log(`[Avanzado] Creando Empresa:`, empresaPayload);
        const { data: empData, error: empErr } = await supabase.from('prescriptores').insert([empresaPayload]).select();
        
        if (empErr) {
             console.error('[Avanzado] Error Supabase:', empErr);
             throw new Error(`Enterprise Error: ${empErr.message}`);
        }

        console.log(`[Avanzado] Empresa creada OK:`, empData[0]);
        res.status(201).json({ message: 'Alta completada', prescriptor: empData[0] });

    } catch (err) {
        console.error('Error POST avanzado:', err);
        res.status(500).json({ error: 'Error al completar el alta.', details: err.message });
    }
});

router.patch('/:id', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            if (req.user.prescriptor_id !== req.params.id) {
                return res.status(403).json({ error: 'No autorizado.' });
            }
        }

        const payload = req.body;

        // 1. Preparamos datos de la empresa
        let prescriptorPayload = {
            es_autonomo: payload.es_autonomo,
            razon_social: payload.es_autonomo ? `${payload.usuario_nombre || ''} ${payload.usuario_apellidos || ''}`.trim() : payload.razon_social,
            acronimo: payload.acronimo,
            cif: payload.es_autonomo ? payload.usuario_nif : payload.cif,
            email: payload.es_autonomo ? payload.usuario_email : payload.email,
            tlf: payload.es_autonomo ? payload.usuario_tlf : payload.tlf,
            ccaa: payload.ccaa,
            provincia: payload.provincia,
            municipio: payload.municipio,
            direccion: payload.direccion,
            codigo_postal: payload.codigo_postal,
            tipo_empresa: payload.tipo_empresa,
            marca_referencia: payload.marca_referencia,
            marca_secundaria: payload.marca_secundaria,
            tiene_carnet_rite: payload.tiene_carnet_rite,
            numero_carnet_rite: payload.numero_carnet_rite,
            cargo: payload.cargo
        };

        if (payload.logo_empresa !== undefined) {
            prescriptorPayload.logo_empresa = payload.logo_empresa;
            console.log(`[PATCH] Logo recibido en payload (Size: ${payload.logo_empresa?.length || 0})`);
        }

        // Limpiar undefined
        Object.keys(prescriptorPayload).forEach(key => prescriptorPayload[key] === undefined && delete prescriptorPayload[key]);

        // 2. Actualizamos prescriptor
        console.log(`[PATCH] Actualizando prescriptor ${req.params.id} con payload:`, prescriptorPayload);
        const { data: presData, error: presError } = await supabase
            .from('prescriptores')
            .update(prescriptorPayload)
            .eq('id_empresa', req.params.id)
            .select('*, acronimo')
            .single();

        if (presError) {
            console.error('[PATCH] Error Supabase:', presError);
            throw presError;
        }

        console.log(`[PATCH] Prescriptor actualizado OK:`, presData);

        // 3. Actualizar Identidad (Usuario y Auth)
        if (presData && presData.representante_legal_id) {
            // A. Recuperar información actual de Auth
            const { data: uInfo, error: uInfoErr } = await supabase
                .from('usuarios')
                .select('auth_user_id, email')
                .eq('id_usuario', presData.representante_legal_id)
                .maybeSingle();
            
            if (uInfoErr) {
                console.error('[PATCH] Error al buscar usuario relacionado:', uInfoErr.message);
            } else if (!uInfo) {
                console.error('[PATCH] No se encontró el registro en la tabla usuarios para ID:', presData.representante_legal_id);
            } else {
                console.log(`[PATCH] Usuario encontrado. AuthUserID: ${uInfo.auth_user_id}`);
                
                // B. Actualizar tabla usuarios (Metadatos)
                const usuarioUpdate = {
                    nombre: payload.usuario_nombre || '',
                    apellidos: payload.usuario_apellidos || '',
                    nif: payload.usuario_nif,
                    tlf: payload.usuario_tlf
                };
                
                // Solo si el email no es una máscara
                if (payload.usuario_email && !payload.usuario_email.includes('••••')) {
                    usuarioUpdate.email = payload.usuario_email.trim().toLowerCase();
                }

                const { error: dbErr } = await supabase
                    .from('usuarios')
                    .update(usuarioUpdate)
                    .eq('id_usuario', presData.representante_legal_id);
                
                if (dbErr) {
                    console.error('[PATCH] Error actualizando tabla usuarios:', dbErr.message);
                } else {
                    console.log('[PATCH] Tabla usuarios actualizada correctamente.');
                }

                // C. Sincronizar con Supabase Auth (Email y Password)
                const authUpdates = {};
                
                // Cambio de Email
                if (usuarioUpdate.email && usuarioUpdate.email !== uInfo.email) {
                    authUpdates.email = usuarioUpdate.email;
                    console.log(`[PATCH] Preparando cambio de email en Auth: ${uInfo.email} -> ${usuarioUpdate.email}`);
                }
                
                // Cambio de Contraseña
                if (payload.usuario_password && payload.usuario_password.trim() !== '') {
                    authUpdates.password = payload.usuario_password.trim();
                    console.log('[PATCH] Preparando cambio de contraseña en Auth.');
                }

                if (Object.keys(authUpdates).length > 0) {
                    if (!uInfo.auth_user_id) {
                        console.error('[PATCH] El usuario no tiene vinculado un auth_user_id. No se puede actualizar Auth.');
                        throw new Error('El usuario no tiene una cuenta de acceso vinculada correctamente.');
                    }

                    const { data: authData, error: authErr } = await supabase.auth.admin.updateUserById(uInfo.auth_user_id, authUpdates);
                    if (authErr) {
                        console.error('[PATCH] Error en Supabase Auth Admin:', authErr.message);
                        throw new Error(`Error en el sistema de autenticación: ${authErr.message}`);
                    }
                    console.log('[PATCH] Supabase Auth actualizado correctamente para:', uInfo.auth_user_id);
                }
            }
        }

      res.json(presData);
    } catch (err) {
        console.error('Error PATCH prescriptores:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar prescriptor' });
    }
});

// 4. Eliminar Prescriptor (Sólo ADMIN)
router.delete('/:id', requireAuth, async (req, res) => {
    // Seguridad: Solo ADMIN puede borrar
    if (req.user.rol_nombre !== 'ADMIN') {
        return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }

    try {
        const { id } = req.params;
        console.log(`[DELETE] Petición de eliminación para prescriptor: ${id}`);

        // A. Obtener IDs asociados (Usuario y Auth ID) para limpieza completa
        const { data: prescriptor, error: getErr } = await supabase
            .from('prescriptores')
            .select('representante_legal_id, usuarios(auth_user_id)')
            .eq('id_empresa', id)
            .single();

        if (getErr || !prescriptor) {
            return res.status(404).json({ error: 'Prescriptor no encontrado.' });
        }

        const repId = prescriptor.representante_legal_id;
        const authUserId = prescriptor.usuarios?.auth_user_id;

        // B. Eliminar el prescriptor
        // Ojo: Si hay FKs en oportunidades sin CASCADE, esto fallará. 
        // En una app real se haría Soft Delete o se manejarían las dependencias.
        const { error: delPresErr } = await supabase
            .from('prescriptores')
            .delete()
            .eq('id_empresa', id);
        
        if (delPresErr) {
            console.error('[DELETE] Error eliminando de tabla prescriptores:', delPresErr.message);
            throw new Error(`No se puede eliminar el partner: ${delPresErr.message}`);
        }

        // C. Eliminar usuario asociado de la tabla 'usuarios'
        if (repId) {
            const { error: delUserErr } = await supabase
                .from('usuarios')
                .delete()
                .eq('id_usuario', repId);
            
            if (delUserErr) {
                console.warn('[DELETE] No se pudo borrar el usuario local asociado:', delUserErr.message);
            }
        }

        // D. Eliminar de Supabase Auth
        if (authUserId) {
            const { error: delAuthErr } = await supabase.auth.admin.deleteUser(authUserId);
            if (delAuthErr) {
                console.warn('[DELETE] No se pudo borrar el usuario de Auth:', delAuthErr.message);
            } else {
                console.log('[DELETE] Usuario de Auth eliminado correctamente:', authUserId);
            }
        }

        res.json({ success: true, message: 'Prescriptor y accesos eliminados correctamente.' });
    } catch (err) {
        console.error('Error fatal DELETE prescriptor:', err);
        res.status(500).json({ error: err.message || 'Error al eliminar el prescriptor' });
    }
});

module.exports = router;
