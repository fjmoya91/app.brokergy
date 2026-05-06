const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly } = require('../middleware/auth');
const { normalizeData } = require('../utils/normalization');

// GET /api/clientes -> Listar clientes
router.get('/', enforceAuth, async (req, res) => {
    try {
        // 1. Obtener clientes con relaciones básicas
        let query = supabase.from('clientes').select(`
            *,
            prescriptores (id_empresa, razon_social, acronimo),
            usuarios (id_usuario, nombre, apellidos, email)
        `).order('created_at', { ascending: false });
 
        // Filtro por prescriptor si no es admin
        if (req.user.rol_nombre !== 'ADMIN') {
            if (!req.user.prescriptor_id) return res.json([]);
            
            // 1.1 Obtener IDs de clientes vinculados a través de oportunidades de este partner
            const { data: opClients } = await supabase
                .from('oportunidades')
                .select('cliente_id')
                .eq('prescriptor_id', req.user.prescriptor_id);
            
            const linkedClientIds = [...new Set((opClients || []).map(oc => oc.cliente_id).filter(Boolean))];
            
            // 1.2 Construir filtro OR: prescriptor_id del cliente O id_cliente en la lista de vinculados
            let orFilter = `prescriptor_id.eq.${req.user.prescriptor_id}`;
            if (linkedClientIds.length > 0) {
                orFilter += `,id_cliente.in.(${linkedClientIds.join(',')})`;
            }
            
            query = query.or(orFilter);
        }
 
        const { data: clientes, error: cliError } = await query;
        if (cliError) throw cliError;

        // Máscara de seguridad para no-admins
        const processedClientes = clientes.map(c => {
            if (req.user.rol_nombre !== 'ADMIN') {
                return { ...c, numero_cuenta: c.numero_cuenta ? '**** **** **** ****' : null };
            }
            return c;
        });

        // 2. Obtener TODAS las oportunidades vinculadas a estos clientes para evitar N+1
        const clienteIds = processedClientes.map(c => c.id_cliente);
        if (clienteIds.length > 0) {
            const { data: ops, error: opError } = await supabase
                .from('oportunidades')
                .select('id_oportunidad, referencia_cliente, cliente_id')
                .in('cliente_id', clienteIds);
            
            if (!opError && ops) {
                // Mapear oportunidades a sus respectivos clientes
                const dataConOps = processedClientes.map(c => ({
                    ...c,
                    oportunidades: ops.filter(o => o.cliente_id === c.id_cliente)
                }));
                return res.json(dataConOps);
            }
        }
 
        res.json(processedClientes.map(c => ({ ...c, oportunidades: [] })));
    } catch (err) {
        console.error('Error GET clientes:', err);
        res.status(500).json({ error: 'Error al recuperar clientes' });
    }
});

// GET /api/clientes/:id -> Obtener cliente por ID
router.get('/:id', enforceAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select(`
                *,
                prescriptores (id_empresa, razon_social, acronimo),
                usuarios (id_usuario, nombre, apellidos, email)
            `)
            .eq('id_cliente', req.params.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Cliente no encontrado' });

        // Verificar acceso: admin o prescriptor propietario
        if (req.user.rol_nombre !== 'ADMIN' && data.prescriptor_id !== req.user.prescriptor_id) {
            // FALLBACK: Verificar si tiene alguna oportunidad vinculada que pertenezca a este partner
            const { count, error: countErr } = await supabase
                .from('oportunidades')
                .select('*', { count: 'exact', head: true })
                .eq('cliente_id', req.params.id)
                .eq('prescriptor_id', req.user.prescriptor_id);

            if (countErr || !count || count === 0) {
                console.warn(`[Clientes] Acceso denegado para partner ${req.user.prescriptor_id} al cliente ${req.params.id}`);
                return res.status(403).json({ error: 'No autorizado para ver este cliente' });
            }
            console.log(`[Clientes] Acceso concedido vía oportunidad vinculada al partner ${req.user.prescriptor_id}`);
        }

        // Buscar oportunidades vinculadas
        const { data: ops } = await supabase
            .from('oportunidades')
            .select('id_oportunidad, referencia_cliente, ref_catastral, datos_calculo, created_at')
            .eq('cliente_id', req.params.id)
            .order('created_at', { ascending: false });

        // Buscar expedientes vinculados (vía oportunidades)
        const { data: exps } = await supabase
            .from('expedientes')
            .select(`
                id,
                numero_expediente,
                created_at,
                oportunidades!inner (
                    id_oportunidad,
                    cliente_id
                )
            `)
            .eq('oportunidades.cliente_id', req.params.id)
            .order('created_at', { ascending: false });

        // Máscara de seguridad para no-admins
        if (req.user.rol_nombre !== 'ADMIN') {
            data.numero_cuenta = data.numero_cuenta ? '**** **** **** ****' : null;
        }

        res.json({ 
            ...data, 
            oportunidades_vinculadas: ops || [],
            expedientes_vinculados: exps || []
        });
    } catch (err) {
        console.error('Error GET cliente:', err);
        res.status(500).json({ error: 'Error al obtener el cliente' });
    }
});

// POST /api/clientes -> Crear cliente
router.post('/', enforceAuth, async (req, res) => {
    try {
        const body = normalizeData(req.body);
        const {
            nombre_razon_social, apellidos, email, tlf, dni,
            ccaa, provincia, municipio, direccion, codigo_postal,
            numero_cuenta, prescriptor_id, oportunidad_id,
            persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email, notificaciones_contacto_activas, notas
        } = body;


        if (!nombre_razon_social) {
            return res.status(400).json({ error: 'El nombre o razón social es obligatorio' });
        }

        // Determinar prescriptor_id según rol
        let finalPrescriptorId = prescriptor_id || null;
        if (req.user.rol_nombre !== 'ADMIN') {
            // Prescriptor/Partner: se asigna automáticamente a sí mismo
            finalPrescriptorId = req.user.prescriptor_id || null;
        }

        // Determinar instalador_asociado_id según rol
        let finalInstaladorId = body.instalador_asociado_id || null;
        if (req.user.rol_nombre === 'INSTALADOR') {
            finalInstaladorId = req.user.prescriptor_id || null;
        }

        const payload = {
            id_usuario: req.user.id_usuario,
            nombre_razon_social,
            apellidos: apellidos || null,
            email: email || null,
            tlf: tlf || null,
            dni: dni || null,
            ccaa: ccaa || null,
            provincia: provincia || null,
            municipio: municipio || null,
            direccion: direccion || null,
            codigo_postal: codigo_postal || null,
            numero_cuenta: numero_cuenta || null,
            prescriptor_id: finalPrescriptorId,
            persona_contacto_nombre: persona_contacto_nombre || null,
            persona_contacto_tlf: persona_contacto_tlf || null,
            persona_contacto_email: persona_contacto_email || null,
            notificaciones_contacto_activas: notificaciones_contacto_activas === true || notificaciones_contacto_activas === 'true' || false,

            notas: notas || null,
        };

        const { data, error } = await supabase.from('clientes').insert([payload]).select().single();
        if (error) throw error;

        // Si se asocia a una oportunidad, actualizar el cliente_id y campos de partner/instalador en oportunidades
        if (oportunidad_id && data.id_cliente) {
            const opUpdates = { cliente_id: data.id_cliente };
            if (finalPrescriptorId) opUpdates.prescriptor_id = finalPrescriptorId;
            if (finalInstaladorId) opUpdates.instalador_asociado_id = finalInstaladorId;

            // Si viene cod_cliente_interno, actualizarlo en datos_calculo de la oportunidad
            if (body.cod_cliente_interno) {
                try {
                    const { data: opData } = await supabase
                        .from('oportunidades')
                        .select('datos_calculo')
                        .eq('id_oportunidad', oportunidad_id)
                        .single();
                    
                    if (opData) {
                        const newDatos = { 
                            ...(opData.datos_calculo || {}), 
                            cod_cliente_interno: body.cod_cliente_interno 
                        };
                        // También actualizar dentro de inputs si existe
                        if (newDatos.inputs) {
                            newDatos.inputs.cod_cliente_interno = body.cod_cliente_interno;
                        }
                        opUpdates.datos_calculo = newDatos;
                    }
                } catch (jsonErr) {
                    console.warn('No se pudo actualizar datos_calculo:', jsonErr.message);
                }
            }

            const { error: opError } = await supabase
                .from('oportunidades')
                .update(opUpdates)
                .eq('id_oportunidad', oportunidad_id);
            if (opError) {
                console.warn('No se pudo vincular el cliente/partner a la oportunidad:', opError.message);
            }
        }

        res.status(201).json(data);
    } catch (err) {
        console.error('Error POST clientes:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un cliente con ese DNI/NIF.' });
        }
        res.status(500).json({ error: 'Error al crear el cliente', details: err.message });
    }
});

// PUT /api/clientes/:id -> Actualizar cliente
router.put('/:id', enforceAuth, async (req, res) => {
    try {
        const body = normalizeData(req.body);
        // Verificar que existe y tiene acceso
        const { data: existingData, error: fetchErr } = await supabase
            .from('clientes')
            .select('id_cliente, prescriptor_id')
            .eq('id_cliente', req.params.id)
            .single();

        if (fetchErr || !existingData) return res.status(404).json({ error: 'Cliente no encontrado' });
        
        // Verificar permiso: admin o el prescriptor propietario
        if (req.user.rol_nombre !== 'ADMIN' && existingData.prescriptor_id !== req.user.prescriptor_id) {
            // FALLBACK: Permitir si el partner tiene al menos una oportunidad vinculada a este cliente
            const { count } = await supabase
                .from('oportunidades')
                .select('*', { count: 'exact', head: true })
                .eq('cliente_id', req.params.id)
                .eq('prescriptor_id', req.user.prescriptor_id);

            if (!count || count === 0) {
                return res.status(403).json({ error: 'No autorizado para editar este cliente' });
            }
        }

        const {
            nombre_razon_social, apellidos, email, tlf, dni,
            ccaa, provincia, municipio, direccion, codigo_postal,
            numero_cuenta, prescriptor_id,
            persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email, notificaciones_contacto_activas, notas
        } = body;


        const updates = {};
        if (nombre_razon_social !== undefined) updates.nombre_razon_social = nombre_razon_social;
        if (apellidos !== undefined) updates.apellidos = apellidos;
        if (email !== undefined) updates.email = email;
        if (tlf !== undefined) updates.tlf = tlf;
        if (dni !== undefined) updates.dni = dni;
        if (ccaa !== undefined) updates.ccaa = ccaa;
        if (provincia !== undefined) updates.provincia = provincia;
        if (municipio !== undefined) updates.municipio = municipio;
        if (direccion !== undefined) updates.direccion = direccion;
        if (codigo_postal !== undefined) updates.codigo_postal = codigo_postal;
        if (numero_cuenta !== undefined && req.user.rol_nombre === 'ADMIN') updates.numero_cuenta = numero_cuenta;
        if (persona_contacto_nombre !== undefined) updates.persona_contacto_nombre = persona_contacto_nombre;
        if (persona_contacto_tlf !== undefined) updates.persona_contacto_tlf = persona_contacto_tlf;
        if (persona_contacto_email !== undefined) updates.persona_contacto_email = persona_contacto_email;
        if (notificaciones_contacto_activas !== undefined) updates.notificaciones_contacto_activas = notificaciones_contacto_activas === true || notificaciones_contacto_activas === 'true' || false;

        if (notas !== undefined) updates.notas = notas;
        // Solo ADMIN puede reasignar prescriptor
        if (req.user.rol_nombre === 'ADMIN' && prescriptor_id !== undefined) {
            updates.prescriptor_id = prescriptor_id || null;
        }

        const { data, error } = await supabase
            .from('clientes')
            .update(updates)
            .eq('id_cliente', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error PUT cliente:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un cliente con ese DNI/NIF.' });
        }
        res.status(500).json({ error: 'Error al actualizar el cliente', details: err.message });
    }
});

// DELETE /api/clientes/:id -> Eliminar cliente (solo ADMIN)
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo el administrador puede eliminar clientes' });
        }

        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id_cliente', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE cliente:', err);
        res.status(500).json({ error: 'Error al eliminar el cliente' });
    }
});

module.exports = router;
