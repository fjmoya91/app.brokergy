const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly, isStaff } = require('../middleware/auth');
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
 
        // Filtro por prescriptor si no es equipo interno (ADMIN/TRABAJADOR)
        if (!isStaff(req)) {
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
            if (!isStaff(req)) {
                return { ...c, numero_cuenta: c.numero_cuenta ? '**** **** **** ****' : null };
            }
            return c;
        });

        // 2. Obtener TODAS las oportunidades vinculadas a estos clientes para evitar N+1
        const clienteIds = processedClientes.map(c => c.id_cliente);
        if (clienteIds.length > 0) {
            const { data: ops, error: opError } = await supabase
                .from('oportunidades')
                .select('id, id_oportunidad, referencia_cliente, cliente_id')
                .in('cliente_id', clienteIds);
            
            if (!opError && ops) {
                // Expedientes de cada cliente, para los accesos directos del listado
                // (abrir el expediente, su carpeta de Drive y la local). Se buscan por
                // LOS DOS caminos y se fusionan, igual que en la ficha del cliente: por
                // la oportunidad y por el propio expediente, que no siempre coinciden
                // (un migrado puede tener ya el cliente real mientras su oportunidad
                // sigue apuntando al placeholder de la migracion).
                //
                // INTERNOS: solo staff. Y SIN columnas JSONB (regla 22) — aqui son
                // cientos de filas y `datos_calculo` pesa 86 KB de media.
                const expsPorCliente = new Map(); // id_cliente -> [expediente]
                if (isStaff(req)) {
                    const CAMPOS_EXP = 'id, numero_expediente, created_at, cliente_id, oportunidad_id';
                    const opIds = ops.map(o => o.id).filter(Boolean);
                    const [porCli, porOp] = await Promise.all([
                        supabase.from('expedientes').select(CAMPOS_EXP).in('cliente_id', clienteIds),
                        opIds.length
                            ? supabase.from('expedientes').select(CAMPOS_EXP).in('oportunidad_id', opIds)
                            : Promise.resolve({ data: [] }),
                    ]);
                    const opACliente = new Map(ops.map(o => [o.id, o.cliente_id]));
                    const porExpId = new Map();
                    for (const e of [...(porCli.data || []), ...(porOp.data || [])]) {
                        if (!e?.id || porExpId.has(e.id)) continue;
                        const dueno = e.cliente_id || opACliente.get(e.oportunidad_id) || null;
                        if (!dueno) continue;
                        porExpId.set(e.id, true);
                        const lista = expsPorCliente.get(dueno) || [];
                        lista.push(e);
                        expsPorCliente.set(dueno, lista);
                    }
                    // El mas reciente primero: es al que apuntan los accesos directos.
                    for (const lista of expsPorCliente.values()) {
                        lista.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    }
                }

                // Mapear oportunidades a sus respectivos clientes
                const dataConOps = processedClientes.map(c => ({
                    ...c,
                    oportunidades: ops.filter(o => o.cliente_id === c.id_cliente),
                    expedientes: expsPorCliente.get(c.id_cliente) || []
                }));
                return res.json(dataConOps);
            }
        }
 
        res.json(processedClientes.map(c => ({ ...c, oportunidades: [], expedientes: [] })));
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

        // Verificar acceso: equipo interno (ADMIN/TRABAJADOR) o prescriptor propietario
        if (!isStaff(req) && data.prescriptor_id !== req.user.prescriptor_id) {
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
        const CAMPOS_OP = 'id, id_oportunidad, referencia_cliente, ref_catastral, datos_calculo, created_at';
        const { data: opsDirectas } = await supabase
            .from('oportunidades')
            .select(CAMPOS_OP)
            .eq('cliente_id', req.params.id)
            .order('created_at', { ascending: false });
        const ops = opsDirectas || [];

        // Buscar expedientes vinculados. Se buscan por LOS DOS caminos y se fusionan:
        // por la oportunidad (`oportunidades.cliente_id`) y por el propio expediente
        // (`expedientes.cliente_id`). No siempre coinciden — un expediente migrado puede
        // tener ya el cliente real mientras su oportunidad sigue apuntando al cliente
        // placeholder que creó la migración, y entonces la ficha del cliente real se
        // quedaba vacía (caso 25RES060_78).
        // Los expedientes son INTERNOS de Brokergy: solo se exponen al ADMIN.
        // Un partner no debe ver ni poder acceder a los expedientes de sus clientes.
        let exps = [];
        if (isStaff(req)) {
            const CAMPOS = 'id, numero_expediente, created_at, cliente_id, oportunidad_id';
            const [porOportunidad, porExpediente] = await Promise.all([
                supabase.from('expedientes')
                    .select(`${CAMPOS}, oportunidades!inner (id_oportunidad, cliente_id)`)
                    .eq('oportunidades.cliente_id', req.params.id),
                supabase.from('expedientes')
                    .select(`${CAMPOS}, oportunidades (id_oportunidad, cliente_id)`)
                    .eq('cliente_id', req.params.id),
            ]);
            const porId = new Map();
            for (const e of [...(porOportunidad.data || []), ...(porExpediente.data || [])]) {
                if (e?.id && !porId.has(e.id)) porId.set(e.id, e);
            }
            exps = [...porId.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Y su oportunidad, si por el desajuste de arriba no venía en la lista.
            const faltan = exps
                .map(e => e.oportunidad_id)
                .filter(id => id && !ops.some(o => o.id === id));
            if (faltan.length) {
                const { data: opsExtra } = await supabase
                    .from('oportunidades').select(CAMPOS_OP).in('id', [...new Set(faltan)]);
                for (const o of opsExtra || []) ops.push(o);
                ops.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            }
        }

        // CEE contratados sueltos del cliente. Mismo criterio que los expedientes:
        // son internos de Brokergy y solo los ve el equipo. Se listan aparte y no
        // mezclados con los CAE porque son otro negocio y otra numeracion: verlos
        // en la misma lista haria pensar que a un cliente con un CEE suelto se le
        // esta tramitando un bono.
        let ceeDirectos = [];
        if (isStaff(req)) {
            const { data: cees } = await supabase
                .from('cee_directos')
                .select('id, numero_expediente, nombre, estado, alcance, created_at')
                .eq('cliente_id', req.params.id)
                .order('correlativo', { ascending: false });
            ceeDirectos = cees || [];
        }

        // Máscara de seguridad para no-staff (partners)
        if (!isStaff(req)) {
            data.numero_cuenta = data.numero_cuenta ? '**** **** **** ****' : null;
        }

        res.json({ 
            ...data, 
            oportunidades_vinculadas: ops || [],
            expedientes_vinculados: exps || [],
            cee_directos_vinculados: ceeDirectos
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
            nombre_razon_social, apellidos, email, tlf, dni, sexo,
            ccaa, provincia, municipio, direccion, codigo_postal,
            numero_cuenta, prescriptor_id, oportunidad_id,
            persona_contacto_nombre, persona_contacto_tlf, notificaciones_contacto_activas, notas,
            es_empresa, representante_nombre, representante_apellidos, representante_dni
        } = body;


        if (!nombre_razon_social) {
            return res.status(400).json({ error: 'El nombre o razón social es obligatorio' });
        }

        // Determinar prescriptor_id según rol
        let finalPrescriptorId = prescriptor_id || null;
        if (!isStaff(req)) {
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
            sexo: sexo || null,
            ccaa: ccaa || null,
            provincia: provincia || null,
            municipio: municipio || null,
            direccion: direccion || null,
            codigo_postal: codigo_postal || null,
            numero_cuenta: numero_cuenta || null,
            prescriptor_id: finalPrescriptorId,
            es_empresa: es_empresa === true || es_empresa === 'true' || false,
            representante_nombre: representante_nombre || null,
            representante_apellidos: representante_apellidos || null,
            representante_dni: representante_dni || null,
            persona_contacto_nombre: persona_contacto_nombre || null,
            persona_contacto_tlf: persona_contacto_tlf || null,
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
            const dniFinal = body?.dni || null;
            let existingCliente = null;
            if (dniFinal) {
                const { data } = await supabase
                    .from('clientes')
                    .select('id_cliente, nombre_razon_social, apellidos, dni, municipio, email, tlf')
                    .eq('dni', dniFinal)
                    .maybeSingle();
                existingCliente = data;
            }
            return res.status(409).json({ error: 'Ya existe un cliente con ese DNI/NIF.', existing_cliente: existingCliente });
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
        if (!isStaff(req) && existingData.prescriptor_id !== req.user.prescriptor_id) {
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
            nombre_razon_social, apellidos, email, tlf, dni, sexo,
            ccaa, provincia, municipio, direccion, codigo_postal,
            numero_cuenta, prescriptor_id,
            persona_contacto_nombre, persona_contacto_tlf, notificaciones_contacto_activas, notas,
            es_empresa, representante_nombre, representante_apellidos, representante_dni
        } = body;


        const updates = {};
        if (nombre_razon_social !== undefined) updates.nombre_razon_social = nombre_razon_social;
        if (apellidos !== undefined) updates.apellidos = apellidos;
        if (email !== undefined) updates.email = email;
        if (tlf !== undefined) updates.tlf = tlf;
        if (dni !== undefined) updates.dni = dni;
        if (sexo !== undefined) updates.sexo = sexo || null;
        if (ccaa !== undefined) updates.ccaa = ccaa;
        if (provincia !== undefined) updates.provincia = provincia;
        if (municipio !== undefined) updates.municipio = municipio;
        if (direccion !== undefined) updates.direccion = direccion;
        if (codigo_postal !== undefined) updates.codigo_postal = codigo_postal;
        if (numero_cuenta !== undefined && isStaff(req)) updates.numero_cuenta = numero_cuenta;
        // Empresa + representante legal (quien firma los anexos por la sociedad)
        if (es_empresa !== undefined) updates.es_empresa = es_empresa === true || es_empresa === 'true' || false;
        if (representante_nombre !== undefined) updates.representante_nombre = representante_nombre;
        if (representante_apellidos !== undefined) updates.representante_apellidos = representante_apellidos;
        if (representante_dni !== undefined) updates.representante_dni = representante_dni;
        if (persona_contacto_nombre !== undefined) updates.persona_contacto_nombre = persona_contacto_nombre;
        if (persona_contacto_tlf !== undefined) updates.persona_contacto_tlf = persona_contacto_tlf;
        if (notificaciones_contacto_activas !== undefined) updates.notificaciones_contacto_activas = notificaciones_contacto_activas === true || notificaciones_contacto_activas === 'true' || false;

        if (notas !== undefined) updates.notas = notas;
        // Solo el equipo interno (ADMIN/TRABAJADOR) puede reasignar prescriptor
        if (isStaff(req) && prescriptor_id !== undefined) {
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
            const dniFinal = (req.body?.dni || '').toString().trim().toUpperCase() || null;
            let existingCliente = null;
            if (dniFinal) {
                const { data } = await supabase
                    .from('clientes')
                    .select('id_cliente, nombre_razon_social, apellidos, dni, municipio, email, tlf')
                    .eq('dni', dniFinal)
                    .neq('id_cliente', req.params.id)
                    .maybeSingle();
                existingCliente = data;
            }
            return res.status(409).json({ error: 'Ya existe un cliente con ese DNI/NIF.', existing_cliente: existingCliente });
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
