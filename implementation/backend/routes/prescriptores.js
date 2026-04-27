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
            usuarios (nombre, apellidos, nif, email, tlf, activo)
        `).order('created_at', { ascending: false });

        if (req.user.rol_nombre !== 'ADMIN') {
            if (req.user.rol_nombre === 'DISTRIBUIDOR' && req.user.prescriptor_id) {
                // Obtener IDs de instaladores asociados
                const { data: assoc } = await supabase
                    .from('distribuidor_instalador')
                    .select('instalador_id')
                    .eq('distribuidor_id', req.user.prescriptor_id);
                
                const assocIds = assoc ? assoc.map(a => a.instalador_id) : [];
                // Solo mostramos los instaladores asociados, no al propio distribuidor
                query = query.in('id_empresa', assocIds);
            } else {
                query = query.eq('representante_legal_id', req.user.id_usuario);
            }
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error GET prescriptores:', err);
        res.status(500).json({ error: 'Error al recuperar prescriptores' });
    }
});

// GET /api/prescriptores/:id/instaladores -> Listar instaladores de un distribuidor
router.get('/:id/instaladores', enforceAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Seguridad: solo el admin o el propio distribuidor pueden ver esto
        if (req.user.rol_nombre !== 'ADMIN' && req.user.prescriptor_id !== id) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        const { data: assoc, error: assocErr } = await supabase
            .from('distribuidor_instalador')
            .select(`
                cod_cliente_interno,
                instalador_id,
                prescriptores!distribuidor_instalador_instalador_id_fkey (
                    *,
                    usuarios (nombre, apellidos, email, tlf, activo)
                )
            `)
            .eq('distribuidor_id', id);
        
        if (assocErr) throw assocErr;
        
        // Formatear la salida para que sea un array de objetos planos con la data del instalador + el cod_interno
        const formatted = (assoc || []).map(a => ({
            ...(a.prescriptores || {}),
            cod_cliente_interno: a.cod_cliente_interno
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Error GET instaladores asociados:', err);
        res.status(500).json({ error: 'Error al recuperar instaladores asociados' });
    }
});

// GET /api/prescriptores/check-internal-number -> Comprobar si un número de cliente ya existe en la red del distribuidor
router.get('/check-internal-number', enforceAuth, async (req, res) => {
    try {
        const { number, installerId } = req.query;
        const distribuidorId = req.user.prescriptor_id;

        console.log('[Backend] Checking internal number:', { number, installerId, distribuidorId });

        if (!distribuidorId) return res.json({ exists: false });
        if (!number) return res.json({ exists: false });

        let query = supabase
            .from('distribuidor_instalador')
            .select(`
                cod_cliente_interno,
                instalador_id,
                prescriptores!distribuidor_instalador_instalador_id_fkey (acronimo, razon_social)
            `)
            .eq('distribuidor_id', distribuidorId)
            .eq('cod_cliente_interno', number);
        
        // Si nos pasan un installerId, excluimos a ese mismo instalador de la búsqueda (por si es su propio número)
        if (installerId && installerId !== 'null' && installerId !== 'undefined') {
            query = query.neq('instalador_id', installerId);
        }

        const { data: results, error } = await query.limit(1);

        if (error) {
            console.error('[Backend] Error checking internal number:', error);
            // Intentar sin el join por si acaso falla la relación
            const { data: simpleData, error: simpleError } = await supabase
                .from('distribuidor_instalador')
                .select('instalador_id')
                .eq('distribuidor_id', distribuidorId)
                .eq('cod_cliente_interno', number)
                .limit(1);
            
            if (simpleError) throw simpleError;
            if (simpleData && simpleData.length > 0) {
                return res.json({ 
                    exists: true, 
                    installerName: 'otro instalador',
                    installerId: simpleData[0].instalador_id
                });
            }
            return res.json({ exists: false });
        }

        console.log('[Backend] Query result:', results);

        if (results && results.length > 0) {
            const data = results[0];
            const name = data.prescriptores?.acronimo || data.prescriptores?.razon_social || 'otro instalador';
            return res.json({ 
                exists: true, 
                installerName: name,
                installerId: data.instalador_id
            });
        }

        res.json({ exists: false });
    } catch (err) {
        console.error('Error checking internal number:', err);
        res.status(500).json({ error: 'Error al verificar el número interno' });
    }
});

// POST /api/prescriptores/update-internal-number -> Actualizar el número de cliente interno de un instalador
router.post('/update-internal-number', enforceAuth, async (req, res) => {
    try {
        const { installerId, number } = req.body;
        const distribuidorId = req.user.prescriptor_id;

        console.log('[Backend] Updating internal number:', { installerId, number, distribuidorId });

        if (!distribuidorId || !installerId) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos' });
        }

        const { error } = await supabase
            .from('distribuidor_instalador')
            .update({ cod_cliente_interno: number || null })
            .eq('distribuidor_id', distribuidorId)
            .eq('instalador_id', installerId);

        if (error) {
            console.error('[Backend] Error updating internal number:', error);
            throw error;
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating internal number:', err);
        res.status(500).json({ error: 'Error al actualizar el número interno' });
    }
});

// POST /api/prescriptores/:id/instaladores/asociar -> Asociar instalador existente (solo admin)
router.post('/:id/instaladores/asociar', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'No autorizado. Solo administrador.' });
        }
        
        const { id: distribuidor_id } = req.params;
        const { instalador_id } = req.body;

        if (!instalador_id) return res.status(400).json({ error: 'Falta instalador_id' });

        const { error } = await supabase
            .from('distribuidor_instalador')
            .insert([{ distribuidor_id, instalador_id }]);
            
        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: 'Este instalador ya está asociado al distribuidor.' });
            throw error;
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error POST asociar instalador:', err);
        res.status(500).json({ error: 'Error al asociar instalador' });
    }
});

// POST /api/prescriptores/asociar-mi-red -> El distribuidor asocia un instalador existente a su propia red
router.post('/asociar-mi-red', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'DISTRIBUIDOR' || !req.user.prescriptor_id) {
            return res.status(403).json({ error: 'Solo distribuidores pueden realizar esta acción.' });
        }

        const { instalador_id } = req.body;
        if (!instalador_id) return res.status(400).json({ error: 'Falta instalador_id' });

        const { error } = await supabase
            .from('distribuidor_instalador')
            .insert([{ 
                distribuidor_id: req.user.prescriptor_id, 
                instalador_id 
            }]);
            
        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: 'Este instalador ya está en tu red.' });
            throw error;
        }

        // Recuperar datos del instalador para devolverlo
        const { data: inst } = await supabase.from('prescriptores').select('*').eq('id_empresa', instalador_id).single();

        res.json({ success: true, prescriptor: inst });
    } catch (err) {
        console.error('Error POST asociar-mi-red:', err);
        res.status(500).json({ error: 'Error al vincular instalador' });
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
        // Permitimos ADMIN y DISTRIBUIDOR
        if (req.user.rol_nombre !== 'ADMIN' && req.user.rol_nombre !== 'DISTRIBUIDOR') {
             return res.status(403).json({ error: 'No autorizado para crear.' });
        }

        const payload = req.body;
        let finalRepresentanteId = payload.representante_legal_id;

        // --- DETECCIÓN DE DUPLICADOS (CIF o Email) ---
        const orQuery = [];
        if (payload.cif) orQuery.push(`cif.eq."${payload.cif}"`);
        if (payload.email) orQuery.push(`email.eq."${payload.email}"`);
        
        if (orQuery.length > 0) {
            const { data: existing } = await supabase
                .from('prescriptores')
                .select('*')
                .or(orQuery.join(','))
                .maybeSingle();

            if (existing) {
                // Comprobamos si YA está asociado al distribuidor actual
                let isAlreadyAssoc = false;
                if (req.user.prescriptor_id) {
                    const { data: assoc } = await supabase
                        .from('distribuidor_instalador')
                        .select('*')
                        .eq('distribuidor_id', req.user.prescriptor_id)
                        .eq('instalador_id', existing.id_empresa)
                        .maybeSingle();
                    isAlreadyAssoc = !!assoc;
                }

                if (isAlreadyAssoc) {
                    return res.status(409).json({ 
                        error: 'Este instalador ya existe en tu lista de partners.',
                        code: 'ALREADY_IN_YOUR_LIST'
                    });
                }

                // Caso especial: DISTRIBUIDOR intenta crear un partner que existe en el sistema general
                if (req.user.rol_nombre?.toUpperCase() === 'DISTRIBUIDOR') {
                    return res.status(409).json({ 
                        code: 'OFFER_ASSOCIATION',
                        error: 'Este partner ya pertenece a la red de BROKERGY',
                        existing 
                    });
                }

                return res.status(409).json({ 
                    error: `Ya existe un partner registrado con este ${payload.cif === existing.cif ? 'CIF' : 'Email'}.`,
                    code: 'DUPLICATE_ENTRY',
                    existing 
                });
            }
        }

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
            let roleToSearch = payload.tipo_empresa === 'OTRO' ? 'ASESORIA' : payload.tipo_empresa;
            let { data: roleData } = await supabase.from('roles').select('id_rol').eq('nombre_rol', roleToSearch).maybeSingle();
            
            if (!roleData) {
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
                ccaa: payload.ccaa,
                provincia: payload.provincia,
                municipio: payload.municipio,
                direccion: payload.direccion,
                codigo_postal: payload.codigo_postal
            }]).select().single();

            if (newUserErr) {
                await supabase.auth.admin.deleteUser(newAuthUserId);
                throw new Error(`User DB Error: ${newUserErr.message}`);
            }

            finalRepresentanteId = newUserDB.id_usuario;
        }

        // 2. Insertar empresa (prescriptores)
        let empresaPayload = {
            es_autonomo: payload.es_autonomo,
            razon_social: payload.es_autonomo ? `${payload.usuario_nombre || payload.nombre_responsable || ''} ${payload.usuario_apellidos || payload.apellidos_responsable || ''}`.trim() : payload.razon_social,
            acronimo: payload.acronimo,
            cif: payload.es_autonomo ? (payload.usuario_nif || payload.cif) : payload.cif,
            email: payload.es_autonomo ? payload.usuario_email : payload.email,
            tlf: payload.es_autonomo ? payload.usuario_tlf : payload.tlf,
            representante_legal_id: finalRepresentanteId,
            ccaa: payload.ccaa,
            provincia: payload.provincia,
            municipio: payload.municipio,
            direccion: payload.direccion,
            codigo_postal: payload.codigo_postal,
            tipo_empresa: payload.tipo_empresa,
            marca_referencia: payload.marca_referencia,
            marca_secundaria: payload.marca_secundaria,
            tiene_carnet_rite: payload.tiene_carnet_rite || false,
            numero_carnet_rite: payload.numero_carnet_rite,
            cargo: payload.cargo,
            logo_empresa: payload.logo_empresa,
            contacto_alternativo_activo: payload.contacto_alternativo_activo || false,
            nombre_contacto: payload.nombre_contacto,
            tlf_contacto: payload.tlf_contacto,
            email_contacto: payload.email_contacto,
            contacto_notificaciones_activas: payload.contacto_notificaciones_activas || false
        };

        console.log(`[Avanzado] Creando Empresa:`, empresaPayload);
        const { data: empData, error: empErr } = await supabase.from('prescriptores').insert([empresaPayload]).select();
        
        if (empErr) {
             console.error('[Avanzado] Error Supabase:', empErr);
             throw new Error(`Enterprise Error: ${empErr.message}`);
        }
        
        const nuevoPrescriptor = empData[0];

        console.log(`[Avanzado] Empresa creada OK:`, nuevoPrescriptor);

        // 3. Asociar instaladores si es DISTRIBUIDOR
        if (nuevoPrescriptor.tipo_empresa === 'DISTRIBUIDOR' && payload.instaladores_asociados?.length > 0) {
            const inserts = payload.instaladores_asociados.map(instId => ({
                distribuidor_id: nuevoPrescriptor.id_empresa,
                instalador_id: instId
            }));
            await supabase.from('distribuidor_instalador').insert(inserts);
        }

        // 4. Asociar automáticamente si quien crea es un DISTRIBUIDOR y ha creado un nuevo INSTALADOR
        if (req.user.rol_nombre === 'DISTRIBUIDOR' && nuevoPrescriptor.tipo_empresa === 'INSTALADOR') {
            await supabase.from('distribuidor_instalador').insert([{
                distribuidor_id: req.user.prescriptor_id,
                instalador_id: nuevoPrescriptor.id_empresa
            }]);
            console.log(`[Avanzado] Nuevo Instalador ${nuevoPrescriptor.id_empresa} asociado automáticamente al distribuidor ${req.user.prescriptor_id}`);
        }
        
        res.status(201).json({ message: 'Alta completada', prescriptor: nuevoPrescriptor });

    } catch (err) {
        console.error('Error POST avanzado:', err);
        res.status(500).json({ error: 'Error al completar el alta.', details: err.message });
    }
});

// PATCH /api/prescriptores/:id/acceso -> Activar o desactivar acceso al portal
router.patch('/:id/acceso', enforceAuth, async (req, res) => {
    if (req.user.rol_nombre !== 'ADMIN') {
        return res.status(403).json({ error: 'Solo ADMIN puede gestionar accesos.' });
    }

    const { activar } = req.body;
    const { id } = req.params;

    try {
        const { data: prescriptor, error: getErr } = await supabase
            .from('prescriptores')
            .select('*, usuarios(id_usuario, auth_user_id, activo, email)')
            .eq('id_empresa', id)
            .single();

        if (getErr || !prescriptor) {
            return res.status(404).json({ error: 'Prescriptor no encontrado.' });
        }

        if (activar) {
            const email = prescriptor.email || prescriptor.usuarios?.email;
            if (!email) {
                return res.status(400).json({ error: 'Este partner no tiene email registrado. Añade un email y guarda los cambios antes de activar el acceso.' });
            }

            if (prescriptor.representante_legal_id && prescriptor.usuarios) {
                // Cuenta existente: reactivar
                if (prescriptor.usuarios.auth_user_id) {
                    await supabase.auth.admin.updateUserById(prescriptor.usuarios.auth_user_id, { ban_duration: 'none' });
                }
                await supabase.from('usuarios').update({ activo: true }).eq('id_usuario', prescriptor.representante_legal_id);
                console.log(`[Acceso] Reactivado para prescriptor ${id}`);
            } else {
                // Sin cuenta: crear auth + usuario
                const { data: roleData } = await supabase.from('roles').select('id_rol').eq('nombre_rol', 'INSTALADOR').maybeSingle();
                let rolFallback = roleData;
                if (!rolFallback) {
                    const { data: fb } = await supabase.from('roles').select('id_rol').eq('nombre_rol', 'DISTRIBUIDOR').single();
                    rolFallback = fb;
                }

                const password = prescriptor.cif || email;
                const authRes = await supabase.auth.admin.createUser({
                    email: email.trim().toLowerCase(),
                    password,
                    email_confirm: true
                });
                if (authRes.error) throw new Error(`Auth Error: ${authRes.error.message}`);

                const { data: newUser, error: newUserErr } = await supabase.from('usuarios').insert([{
                    auth_user_id: authRes.data.user.id,
                    id_rol: rolFallback.id_rol,
                    nombre: prescriptor.razon_social || email,
                    email: email.trim().toLowerCase(),
                    tlf: prescriptor.tlf,
                    activo: true
                }]).select().single();

                if (newUserErr) {
                    await supabase.auth.admin.deleteUser(authRes.data.user.id);
                    throw new Error(`User DB Error: ${newUserErr.message}`);
                }

                await supabase.from('prescriptores').update({ representante_legal_id: newUser.id_usuario }).eq('id_empresa', id);
                console.log(`[Acceso] Cuenta creada para prescriptor ${id}, contraseña inicial = CIF`);
            }
        } else {
            // Desactivar
            if (prescriptor.representante_legal_id && prescriptor.usuarios) {
                if (prescriptor.usuarios.auth_user_id) {
                    await supabase.auth.admin.updateUserById(prescriptor.usuarios.auth_user_id, { ban_duration: '876000h' });
                }
                await supabase.from('usuarios').update({ activo: false }).eq('id_usuario', prescriptor.representante_legal_id);
                console.log(`[Acceso] Desactivado para prescriptor ${id}`);
            }
        }

        res.json({ success: true, activo: activar });
    } catch (err) {
        console.error('Error PATCH acceso:', err);
        res.status(500).json({ error: err.message || 'Error al gestionar el acceso' });
    }
});

// GET /api/prescriptores/:id -> Obtener un prescriptor por ID
router.get('/:id', enforceAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('prescriptores')
            .select(`
                *,
                acronimo,
                usuarios (nombre, apellidos, nif, email, tlf, activo)
            `)
            .eq('id_empresa', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Prescriptor no encontrado' });
            }
            throw error;
        }

        res.json(data);
    } catch (err) {
        console.error('Error GET prescriptor by ID:', err);
        res.status(500).json({ error: 'Error al recuperar el prescriptor' });
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
            cif: payload.es_autonomo ? (payload.usuario_nif || payload.cif) : payload.cif,
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
            cargo: payload.cargo,
            nombre_responsable: payload.nombre_responsable,
            apellidos_responsable: payload.apellidos_responsable,
            contacto_alternativo_activo: payload.contacto_alternativo_activo,
            nombre_contacto: payload.nombre_contacto,
            tlf_contacto: payload.tlf_contacto,
            email_contacto: payload.email_contacto,
            contacto_notificaciones_activas: payload.contacto_notificaciones_activas
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

        // 2.5 Sincronizar instaladores asociados (si se proporcionan)
        if (payload.instaladores_asociados && Array.isArray(payload.instaladores_asociados)) {
            console.log(`[PATCH] Sincronizando instaladores para distribuidor ${req.params.id}:`, payload.instaladores_asociados);
            
            // Eliminar asociaciones previas
            const { error: delError } = await supabase
                .from('distribuidor_instalador')
                .delete()
                .eq('distribuidor_id', req.params.id);
            
            if (delError) {
                console.error('[PATCH] Error eliminando asociaciones previas:', delError);
            } else if (payload.instaladores_asociados.length > 0) {
                // Insertar nuevas
                const inserts = payload.instaladores_asociados.map(instId => ({
                    distribuidor_id: req.params.id,
                    instalador_id: instId
                }));
                const { error: insError } = await supabase
                    .from('distribuidor_instalador')
                    .insert(inserts);
                
                if (insError) console.error('[PATCH] Error insertando nuevas asociaciones:', insError);
            }
        }

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
                
                // B. Actualizar tabla usuarios (Metadatos y Rol)
                const usuarioUpdate = {
                    nombre: payload.usuario_nombre || '',
                    apellidos: payload.usuario_apellidos || '',
                    nif: payload.usuario_nif,
                    tlf: payload.usuario_tlf
                };

                // SINCRONIZACIÓN DE ROL: Si se cambia tipo_empresa, actualizamos id_rol en usuarios
                if (payload.tipo_empresa) {
                    try {
                        let roleToSearch = payload.tipo_empresa === 'OTRO' ? 'ASESORIA' : payload.tipo_empresa;
                        const { data: roleData } = await supabase
                            .from('roles')
                            .select('id_rol')
                            .eq('nombre_rol', roleToSearch)
                            .maybeSingle();
                        
                        if (roleData) {
                            usuarioUpdate.id_rol = roleData.id_rol;
                            console.log(`[PATCH] Sincronizando rol para usuario: ${payload.tipo_empresa} -> ID ${roleData.id_rol}`);
                        }
                    } catch (roleErr) {
                        console.error('[PATCH] Error al sincronizar rol:', roleErr.message);
                    }
                }
                
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
