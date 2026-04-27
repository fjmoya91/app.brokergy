const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const pdfService = require('../services/pdfService');
const { requireAuth } = require('../middleware/auth');
const { normalizeData } = require('../utils/normalization');
const expedienteService = require('../services/expedienteService');
const whatsappService = require('../services/whatsappService');
const emailService = require('../services/emailService');

router.use((req, res, next) => {
    console.log(`[Router Oportunidades] ${req.method} ${req.url}`);
    next();
});

router.get('/test-router', (req, res) => {
    res.json({ message: 'Oportunidades router is alive' });
});

// 1. Registrar una nueva oportunidad (POST /api/oportunidades)
router.post('/', requireAuth, async (req, res) => {
    try {
        const body = normalizeData(req.body);
        const { id_oportunidad, ref_catastral, prescriptor, referencia_cliente, demanda_calefaccion, datos_calculo, nota, creador_id, prescriptor_id, instalador_asociado_id } = body;

        if (!ref_catastral) {
            return res.status(400).json({ error: 'La referencia catastral es obligatoria.' });
        }

        // BÚSQUEDA JERÁRQUICA: Primero por ID, luego por RC (si falla el ID)
        let existingData = null;

        // 1. Intentamos por ID (si viene en el payload)
        if (id_oportunidad) {
            const { data: byId } = await supabase.from('oportunidades').select('*').eq('id_oportunidad', id_oportunidad).maybeSingle();
            existingData = byId;
            if (existingData) console.log(`[Backend] Encontrado por ID: ${id_oportunidad}`);
        }

        // 2. Si no se encontró por ID (o no venía ID), intentamos por RC (si no es MANUAL)
        if (!existingData && ref_catastral && ref_catastral !== 'MANUAL') {
            // Buscamos todos los posibles registros con ese RC para evitar errores de duplicidad
            const { data: byRc, error: rcError } = await supabase.from('oportunidades')
                .select('*')
                .eq('ref_catastral', ref_catastral)
                .order('created_at', { ascending: false });
            
            if (byRc && byRc.length > 0) {
                existingData = byRc[0]; // Tomamos el más reciente
                console.log(`[Backend] Encontrado por RC: ${ref_catastral} -> ID DB: ${existingData.id_oportunidad}`);
            }
        }

        if (existingData) {
            console.log(`[Backend] AUDITORÍA - Registro identificado: ${existingData.id_oportunidad} (UUID: ${existingData.id})`);
        } else {
            console.log(`[Backend] AUDITORÍA - No se encontró registro previo para ID: ${id_oportunidad} / RC: ${ref_catastral}`);
        }

        const inputs = datos_calculo?.inputs || {};
        const isReforma = (inputs.isReforma === true) || (inputs.reformaType && inputs.reformaType !== 'none') || (datos_calculo?.isReforma === true);
        const isHybrid = (inputs.hibridacion === true) || (datos_calculo?.hibridacion === true);
        
        let fichaType = 'RES060';
        if (isReforma) {
            fichaType = 'RES080';
        } else if (isHybrid) {
            fichaType = 'RES093';
        }

        // LÓGICA DE ID: Prioridad absoluta al ID que ya tenemos en DB o el que viene de la sesión previa
        // Si el registro ya existe (por ID o por RC), heredamos su ID real de la base de datos
        let newIdOportunidad = existingData?.id_oportunidad || id_oportunidad;

        // Solo generamos un ID secuencial si realmente NO existe nada previo en DB ni en el payload
        if (!newIdOportunidad) {
            console.log(`[Backend] NUEVA OPORTUNIDAD - Generando ID secuencial para ${fichaType}...`);
            // Buscamos el máximo para EL MISMO TIPO de ficha para tener secuenciales independientes
            const { data: allIds, error: idsError } = await supabase
                .from('oportunidades')
                .select('id_oportunidad')
                .like('id_oportunidad', `%${fichaType}_OP%`);
                
            let nextNum = 1;
            if (!idsError && allIds && allIds.length > 0) {
                const nums = allIds.map(r => {
                    const matchNum = r.id_oportunidad?.match(/(\d+)$/);
                    return matchNum ? parseInt(matchNum[1], 10) : 0;
                }).filter(n => !isNaN(n));
                if (nums.length > 0) nextNum = Math.max(...nums) + 1;
            }
            const currentYearYY = new Date().getFullYear().toString().slice(-2);
            // Formato Deseado: YY + FICHA + _OP + NUM (Ej: 24RES093_OP1)
            newIdOportunidad = `${currentYearYY}${fichaType}_OP${nextNum}`;
            console.log(`[Backend] ID Generado para nueva oportunidad (${fichaType}): ${newIdOportunidad}`);
        } else {
            // Si ya existe pero el fichaType ha cambiado (ej: se activó hibridación), 
            // opcionalmente podríamos renombrar, pero por integridad referencial solemos mantener el ID.
            // No obstante, la columna 'ficha' sí se actualizará abajo.
            console.log(`[Backend] PRESERVANDO ID - El registro ya existe o ya tiene ID: ${newIdOportunidad}`);
        }
        
        let estadoActual = 'PTE ENVIAR';
        let historial = [];

        if (existingData && existingData.datos_calculo) {
            estadoActual = existingData.datos_calculo.estado || 'PTE ENVIAR';
            historial = existingData.datos_calculo.historial || [];
        } else {
            historial.push({
                id: Date.now().toString() + '_system',
                estado: 'PTE ENVIAR',
                fecha: new Date().toISOString(),
                usuario: 'Sistema'
            });
        }

        // Si hay una nota al guardar (ya sea nueva o actualización)
        if (nota) {
            historial.push({
                id: (Date.now() + (existingData ? 0 : 1)).toString() + '_comment',
                tipo: 'comentario',
                texto: nota,
                fecha: new Date().toISOString(),
                usuario: req.user ? (req.user.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user.acronimo || req.user.razon_social || 'PARTNER')) : 'Administrador'
            });
        }

        const datosCalculoFinal = datos_calculo || {};
        datosCalculoFinal.estado = estadoActual;
        datosCalculoFinal.historial = historial;

        let payloadPrescriptorStr = prescriptor || 'BROKERGY';
        if (!prescriptor && req.user && req.user.perfilCompleto) {
            payloadPrescriptorStr = `${req.user.perfilCompleto.nombre || ''} ${req.user.perfilCompleto.apellidos || ''}`.trim();
        }

        console.log('[Backend] Body received for save:', {
            id_oportunidad,
            ref_catastral,
            referencia_cliente,
            prescriptor_id,
            instalador_asociado_id
        });

        const newRecord = {
            id_oportunidad: newIdOportunidad,
            ficha: fichaType,
            ref_catastral,
            prescriptor: payloadPrescriptorStr,
            referencia_cliente: referencia_cliente || null,
            cliente_id: req.body.cliente_id || (existingData ? existingData.cliente_id : null),
            // Prioridad al valor que viene en el body, incluso si es null (para permitir desvincular)
            instalador_asociado_id: body.hasOwnProperty('instalador_asociado_id') ? instalador_asociado_id : (existingData ? existingData.instalador_asociado_id : null),
            demanda_calefaccion: demanda_calefaccion || null,
            datos_calculo: datosCalculoFinal
        };

        // Si tenemos sesión, anexamos los rastros UUID silenciosamente
        if (req.user) {
            newRecord.creador_id = creador_id || req.user.id_usuario;
            newRecord.prescriptor_id = prescriptor_id || req.user.prescriptor_id;
        }

        // Si es una oportunidad de partner pero el nombre del prescriptor sigue siendo default, intentar mejorarlo
        if (newRecord.prescriptor_id && (!prescriptor || prescriptor === 'BROKERGY')) {
            const { data: pData } = await supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', newRecord.prescriptor_id).single();
            if (pData) {
                newRecord.prescriptor = pData.acronimo || pData.razon_social || 'PARTNER';
            }
        }

        // Automatización de Google Drive (para nuevas oportunidades o existentes sin carpeta)
        const hasFolder = existingData?.datos_calculo?.drive_folder_id;
        console.log(`[POST /] Drive Automation check for ${newIdOportunidad}: hasFolder=${!!hasFolder}`);
        
        if (!hasFolder) {
            console.log(`[POST /] Generating Drive folder for ${newIdOportunidad}...`);
            try {
                const driveResult = await driveService.setupOpportunityFolder(newIdOportunidad, referencia_cliente);
                if (driveResult) {
                    console.log(`[POST /] Drive folder created success: ${driveResult.id}`);
                    // Asegurar que poblamos los datos en el payload final
                    if (!newRecord.datos_calculo) newRecord.datos_calculo = {};
                    newRecord.datos_calculo.drive_folder_id = driveResult.id;
                    newRecord.datos_calculo.drive_folder_link = driveResult.link;
                } else {
                    console.warn(`[POST /] Drive setup setupOpportunityFolder returned null for ${newIdOportunidad}`);
                }
            } catch (err) {
                console.error(`[POST /] Exception in Drive creation logic for ${newIdOportunidad}:`, err.message);
            }
        } else {
            // Preservamos los que ya tiene
            if (existingData?.datos_calculo?.drive_folder_id) {
                if (!newRecord.datos_calculo) newRecord.datos_calculo = {};
                newRecord.datos_calculo.drive_folder_id = existingData.datos_calculo.drive_folder_id;
                newRecord.datos_calculo.drive_folder_link = existingData.datos_calculo.drive_folder_link;
            }
        }

        let resultData, resultError;
        if (existingData) {
            // Actualizamos por UUID (id) para permitir que id_oportunidad cambie sin perder el registro
            const { data, error } = await supabase.from('oportunidades').update(newRecord).eq('id', existingData.id).select().single();
            resultData = data;
            resultError = error;
        } else {
            const { data, error } = await supabase.from('oportunidades').insert([newRecord]).select().single();
            resultData = data;
            resultError = error;
        }

        if (resultError) {
            console.error('Error Supabase:', resultError);
            return res.status(500).json({ error: 'Error al guardar.', details: resultError.message });
        }

        res.status(201).json(resultData);
    } catch (error) {
        console.error('Error fatal POST /:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// 2. Obtener lista completa (GET /api/oportunidades)
router.get('/', requireAuth, async (req, res) => {
    try {
        let query = supabase
            .from('oportunidades')
            .select('id, id_oportunidad, ref_catastral, ficha, referencia_cliente, prescriptor, demanda_calefaccion, datos_calculo, created_at, updated_at, creador_id, prescriptor_id, cliente_id, instalador_asociado_id')
            .order('updated_at', { ascending: false });

        // Seguridad Node-Level: Si está autenticado y NO es ADMIN, filtramos por su ID/Empresa
        if (req.user && req.user.rol_nombre !== 'ADMIN') {
            const userId = req.user.id_usuario;
            const empresaId = req.user.prescriptor_id;
            
            if (empresaId) {
                query = query.or(`creador_id.eq.${userId},prescriptor_id.eq.${empresaId}`);
            } else {
                query = query.eq('creador_id', userId);
            }
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching opportunities:', error);
            // Si el error es que falta la columna 'ficha' (común tras esta migración si no se ha ejecutado el SQL), 
            // reintentamos sin esa columna para que la app no rompa.
            if (error.message && (error.message.includes('column "ficha" does not exist') || error.code === '42703')) {
                console.log('[Router Oportunidades] Reintentando sin columna ficha...');
                const retryQuery = supabase
                    .from('oportunidades')
                    .select('id, id_oportunidad, ref_catastral, referencia_cliente, prescriptor, demanda_calefaccion, datos_calculo, created_at, creador_id, prescriptor_id, cliente_id, instalador_asociado_id')
                    .order('created_at', { ascending: false });
                
                // Aplicar mismos filtros si no es ADMIN
                if (req.user && req.user.rol_nombre !== 'ADMIN') {
                    const userId = req.user.id_usuario;
                    const empresaId = req.user.prescriptor_id;
                    if (empresaId) {
                        retryQuery.or(`creador_id.eq.${userId},prescriptor_id.eq.${empresaId}`);
                    } else {
                        retryQuery.eq('creador_id', userId);
                    }
                }
                const { data: retryData, error: retryError } = await retryQuery;
                if (retryError) return res.status(500).json({ error: retryError.message });
                return res.status(200).json(retryData || []);
            }
            return res.status(200).json([]); // Devolvemos array vacío para evitar crashes en el front
        }
        res.status(200).json(data || []);
    } catch (error) {
        console.error('Fatal crash in GET /:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// 3. RUTAS ESPECÍFICAS (Deben ir ANTES de las genéricas de abajo)

// Añadir un comentario (POST /api/oportunidades/:id/comentarios)
router.post('/:id/comentarios', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const body = normalizeData(req.body);
        const { comentario } = body;
        if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
        if (!comentario) return res.status(400).json({ error: 'Comentario vacío.' });
        
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        const hist = dc.historial || [];
        
        console.log('[Backend] req.user details:', {
            rol: req.user.rol_nombre,
            prescriptor_id: req.user.prescriptor_id,
            acronimo: req.user.acronimo,
            razon_social: req.user.razon_social
        });

        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        console.log(`[Backend] Resolved usuarioName: ${usuarioName}`);

        hist.push({
            id: Date.now().toString() + '_comment',
            tipo: 'comentario',
            texto: comentario,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        dc.historial = hist;

        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al guardar.', details: upErr.message });

        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.', details: error.message });
    }
});

// Actualizar estado (PATCH /api/oportunidades/:id/estado)
router.patch('/:id/estado', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { nuevo_estado } = req.body;
    try {
        if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });

        const { data: op, error: getErr } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, cliente_id, prescriptor_id, instalador_asociado_id, datos_calculo, referencia_cliente')
            .eq('id_oportunidad', id)
            .single();

        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        const prevEstado = dc.estado || 'BORRADOR';

        // --- GENERACIÓN BAJO DEMANDA si no existe carpeta ---
        let folderId = dc.drive_folder_id;
        if (!folderId && nuevo_estado !== 'PTE ENVIAR') {
            console.log(`[StatusUpdate] Oportunidad ${id} sin carpeta. Generando ahora...`);
            const driveResult = await driveService.setupOpportunityFolder(id, op.referencia_cliente);
            if (driveResult) {
                folderId = driveResult.id;
                dc.drive_folder_id = folderId;
                dc.drive_folder_link = driveResult.link;
                console.log(`[StatusUpdate] ✅ Carpeta generada bajo demanda: ${folderId}`);
            }
        }
        // ----------------------------------------------------

        dc.estado = nuevo_estado;
        const hist = dc.historial || [];
        hist.push({
            id: Date.now().toString() + '_status',
            estado: nuevo_estado,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        dc.historial = hist;

        // --- LÓGICA ESPECIAL PARA ACEPTACIÓN POR DISTRIBUIDOR ---
        let numeroExpediente = null;
        if (nuevo_estado === 'ACEPTADA' && prevEstado !== 'ACEPTADA') {
            console.log(`[StatusUpdate] Detectada NUEVA ACEPTACIÓN para OP ${id}.`);
            console.log(`[StatusUpdate] Usuario: ${req.user.email} (Rol: ${req.user.rol_nombre})`);
            
            // 1. Asegurar creación de expediente (si no existe ya)
            try {
                const newExp = await expedienteService.createExpediente(op.id, op.cliente_id);
                numeroExpediente = newExp?.numero_expediente;
                console.log(`[StatusUpdate] Expediente procesado: ${numeroExpediente}`);

                // 2. Notificar a administración siempre que sea una aceptación
                console.log(`[StatusUpdate] Notificando a administración (Usuario: ${req.user.email})...`);
                try {
                    const [clientRes, instRes] = await Promise.all([
                        supabase.from('clientes').select('*').eq('id_cliente', op.cliente_id).maybeSingle(),
                        supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', op.instalador_asociado_id || op.prescriptor_id).maybeSingle()
                    ]);
                    
                    const client = clientRes.data;
                    const inst = instRes.data;
                    const address = dc.inputs?.direccion || 'No especificada';
                    const installerName = inst ? (inst.acronimo || inst.razon_social) : 'No asignado';
                    const usuarioName = req.user.acronimo || req.user.razon_social || req.user.email || 'SISTEMA';
                    
                    // --- EXTRACCIÓN DE NOTAS ---
                    const notesList = dc.historial?.filter(h => h.tipo === 'comentario') || [];
                    let notesStr = notesList.length > 0 
                        ? notesList.map(n => `- ${n.texto} (${n.usuario})`).join('\n')
                        : '';
                    
                    // Añadir notas del cliente si existen
                    if (client?.notas) {
                        notesStr = `[NOTA CLIENTE]: ${client.notas}\n` + (notesStr ? `\n[HISTORIAL]:\n${notesStr}` : '');
                    }

                    if (!notesStr) notesStr = 'Sin notas adicionales.';

                    const deepLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${numeroExpediente || id}`;

                    // WhatsApp a Admin (Paco)
                    const adminMsg = 
`*${id} – ACEPTACIÓN DE EXPEDIENTE*

¡Hola BROKERGY! 👋
Se ha marcado como ACEPTADA la oportunidad por *${usuarioName}*:

*Cliente:* ${client?.nombre_razon_social || op.referencia_cliente || 'S/N'} ${client?.apellidos || ''}
*Expediente:* ${numeroExpediente || id}
*Instalador:* ${installerName}

*NOTAS:*
${notesStr}

🔗 *Acceso Directo:* ${deepLink}

¡Muchas gracias!
*BROKERGY — Ingeniería Energética*`;


                    whatsappService.sendText('34623926179', adminMsg)
                        .then(() => console.log(`[StatusUpdate] WhatsApp Admin enviado`))
                        .catch(e => console.warn('[StatusUpdate] Error WhatsApp Admin:', e.message));

                    // Email a Admin
                    await emailService.sendAdminNotificationEmail({
                        numeroExpediente: numeroExpediente || id,
                        clientName: `${client?.nombre_razon_social || op.referencia_cliente || 'S/N'} ${client?.apellidos || ''}`.trim(),
                        address,
                        distributorName: usuarioName,
                        installerName,
                        notes: notesStr,
                        expedienteId: numeroExpediente || id
                    }).then(() => console.log(`[StatusUpdate] Email Admin enviado`))
                    .catch(e => console.warn('[StatusUpdate] Error Email Admin:', e.message));

                } catch (notifyErr) {
                    console.error('[StatusUpdate] Error preparando notificaciones:', notifyErr.message);
                }
            } catch (err) {
                console.error('[StatusUpdate] Error al procesar expediente/aceptación:', err.message);
            }
        }

        // --------------------------------------------------------

        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al actualizar.' });

        // --- Automatización de MOVIMIENTO en Drive ---
        if (folderId) {
            console.log(`[StatusUpdate] Detectada carpeta Drive vinculada (${folderId}). Procesando automovimiento...`);
            // Mapa de IDs según el estado (Sacados de la petición del usuario)
            const FOLDER_MAP = {
                'EN CURSO':   process.env.DRIVE_FOLDER_EN_CURSO,
                'ENVIADA':    process.env.DRIVE_FOLDER_ENVIADA,
                'ACEPTADA':   process.env.DRIVE_FOLDER_ACEPTADA,
                'PTE ENVIAR': process.env.DRIVE_ROOT_FOLDER_ID,
            };

            const targetFolderId = FOLDER_MAP[nuevo_estado];
            if (targetFolderId) {
                console.log(`[StatusUpdate] Enviando comando de movimiento a carpeta ID Target: ${targetFolderId}`);
                driveService.moveFolder(folderId, targetFolderId).then(success => {
                    if (success) console.log(`[StatusUpdate] ✅ Carpeta movida con éxito.`);
                    else console.error(`[StatusUpdate] ❌ Falló el movimiento de carpeta.`);
                }).catch(err => {
                    console.error('[StatusUpdate] Error fatal moviendo carpeta:', err.message);
                });
            } else {
                console.log(`[StatusUpdate] El estado '${nuevo_estado}' no tiene carpeta de destino configurada.`);
            }
        } else {
            console.warn(`[StatusUpdate] La oportunidad ${id} no tiene una carpeta de Drive vinculada. No se puede mover.`);
        }
        // ----------------------------------------------

        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Asignar Prescriptor (PATCH /api/oportunidades/:id/asignar)
router.patch('/:id/asignar', async (req, res) => {
    const { id } = req.params;
    const { prescriptor_id, prescriptor_name } = req.body;
    try {
        const updateData = {
            prescriptor_id: prescriptor_id || null,
            prescriptor: prescriptor_name || 'BROKERGY'
        };

        const { data: upData, error: upErr } = await supabase
            .from('oportunidades')
            .update(updateData)
            .eq('id_oportunidad', id)
            .select();

        if (upErr) return res.status(500).json({ error: 'Error al asignar prescriptor.', details: upErr.message });
        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar historial completo (DELETE /api/oportunidades/:id/historial)
router.delete('/:id/historial', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        dc.historial = [];
        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al borrar.' });
        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar entrada específica (DELETE /api/oportunidades/:id/historial/:entryId)
router.delete('/:id/historial/:entryId', async (req, res) => {
    const { id, entryId } = req.params;
    try {
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        const hist = dc.historial || [];
        dc.historial = hist.filter(h => h.id !== entryId);

        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al borrar.' });
        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Actualizar entrada específica (PUT /api/oportunidades/:id/historial/:entryId)
router.put('/:id/historial/:entryId', requireAuth, async (req, res) => {
    const { id, entryId } = req.params;
    const { texto } = req.body;

    // Solo ADMIN puede editar notas (consistencia con expedientes)
    if (req.user?.rol_nombre !== 'ADMIN') {
        return res.status(403).json({ error: 'No tienes permisos para editar notas.' });
    }

    try {
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        const hist = dc.historial || [];
        
        const entryIndex = hist.findIndex(h => h.id === entryId);
        if (entryIndex === -1) return res.status(404).json({ error: 'Entrada no encontrada.' });

        // Solo permitimos editar si es de tipo comentario
        if (hist[entryIndex].tipo !== 'comentario') {
            return res.status(400).json({ error: 'Solo se pueden editar notas manuales.' });
        }

        hist[entryIndex].texto = texto;
        hist[entryIndex].updated_at = new Date().toISOString();
        dc.historial = hist;

        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al actualizar.' });
        
        res.status(200).json({ success: true, data: upData[0] });
    } catch (error) {
        console.error('Error PUT /historial/:entryId:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// 4. RUTAS GENÉRICAS (Al final)

// Obtener una (GET /api/oportunidades/:id)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Backend] Buscando oportunidad por ID o RC: ${id}`);

        // Buscamos primero por ID interno, si no por Ref Catastral
        // Nota: Quitamos las comillas dobles internas ya que para alfanuméricos simples no son necesarias en PostgREST
        const { data, error } = await supabase
            .from('oportunidades')
            .select('*')
            .or(`id_oportunidad.eq.${id},ref_catastral.eq.${id}`)
            .maybeSingle();

        if (error) {
            console.error('[Backend] Error en búsqueda or:', error);
            return res.status(500).json({ error: 'Error consulta.' });
        }

        if (!data) {
            console.log(`[Backend] Oportunidad no encontrada para: ${id}`);
            return res.status(404).json({ error: 'No encontrada.' });
        }

        console.log(`[Backend] Oportunidad encontrada: ${data.id_oportunidad}`);
        res.status(200).json(data);
    } catch (error) {
        console.error('[Backend] Error fatal GET /:id:', error);
        res.status(500).json({ error: 'Error servidor.' });
    }
});

// Obtener anexos (archivos en carpeta "0. PRESUPUESTO")
router.get('/:id/anexos', async (req, res) => {
    try {
        const { id } = req.params;
        const { driveFolderId } = req.query;
        let finalFolderId = driveFolderId;

        if (!finalFolderId) {
            const { data: op, error: opErr } = await supabase
                .from('oportunidades')
                .select('drive_folder_id')
                .or(`id_oportunidad.eq."${id}",ref_catastral.eq."${id}"`)
                .maybeSingle();
            
            if (opErr) throw opErr;
            finalFolderId = op?.drive_folder_id;
        }

        if (!finalFolderId) {
            console.warn(`[Anexos] Oportunidad ${id} no tiene carpeta de Drive asociada.`);
            return res.json([]);
        }

        // Buscar la carpeta "0. PRESUPUESTO"
        const budgetFolderId = await driveService.getOrCreateSubfolder(finalFolderId, '0. PRESUPUESTO');
        const files = await driveService.listFiles(budgetFolderId);

        res.json(files);
    } catch (error) {
        console.error('Error listando anexos:', error);
        res.status(500).json({ error: 'Error al listar anexos.', details: error.message });
    }
});

// Obtener contenido de un archivo específico
router.get('/:id/anexos/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const content = await driveService.getFileContent(fileId);
        if (!content) return res.status(404).send('Archivo no encontrado');
        
        // Determinar mimetype (opcional, Google Drive suele enviarlo)
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(content);
    } catch (error) {
        console.error('Error obteniendo contenido de anexo:', error);
        res.status(500).send('Error');
    }
});


// Subir un nuevo anexo a "0. PRESUPUESTO"
router.post('/:id/anexos', async (req, res) => {
    try {
        const { id } = req.params;
        const { fileName, mimeType, base64, driveFolderId, isBudget } = req.body;

        if (!base64) return res.status(400).json({ error: 'Falta el contenido del archivo.' });

        let finalFolderId = driveFolderId;

        if (!finalFolderId) {
            const { data: op, error: opErr } = await supabase
                .from('oportunidades')
                .select('drive_folder_id')
                .or(`id_oportunidad.eq."${id}",ref_catastral.eq."${id}"`)
                .maybeSingle();

            if (opErr) throw opErr;
            finalFolderId = op?.drive_folder_id;
        }

        if (!finalFolderId) {
            return res.status(400).json({ 
                error: 'NO_DRIVE_FOLDER', 
                message: 'La oportunidad no tiene una carpeta de Drive asociada.' 
            });
        }

        const budgetFolderId = await driveService.getOrCreateSubfolder(finalFolderId, '0. PRESUPUESTO');
        
        let finalFileName = fileName;
        let finalMimeType = mimeType;
        let finalBuffer;

        // LÓGICA DE PRESUPUESTO
        if (isBudget) {
            finalFileName = "PRESUPUESTO DE LA INSTALACIÓN.pdf";
            const oldFileName = "PRESUPUESTO DE LA INSTALACIÓN_old.pdf";
            finalMimeType = "application/pdf";
            
            // 1. Manejar sustitución (Versioning simple)
            const existingId = await driveService.findFileByName(budgetFolderId, finalFileName);
            if (existingId) {
                console.log(`[Anexos] Presupuesto existente detectado (${existingId}). Renombrando a _old...`);
                // Check if _old already exists and delete it
                const oldId = await driveService.findFileByName(budgetFolderId, oldFileName);
                if (oldId) {
                    console.log(`[Anexos] Borrando _old anterior (${oldId})...`);
                    await driveService.deleteFile(oldId);
                }
                await driveService.renameFolder(existingId, oldFileName);
            }
        }

        // CONVERSIÓN DE IMAGEN A PDF (Si es imagen o si es presupuesto y vino como imagen)
        if (mimeType.startsWith('image/')) {
            console.log(`[Anexos] Detectada imagen. Convirtiendo a PDF...`);
            finalBuffer = await pdfService.imageToPdf(base64.includes(',') ? base64.split(',')[1] : base64, mimeType);
            finalMimeType = "application/pdf";
            // Si no es presupuesto, le cambiamos la extensión al nombre
            if (!isBudget) {
                finalFileName = fileName.split('.').slice(0, -1).join('.') + '.pdf';
            }
        } else {
            // Buffer normal desde base64
            finalBuffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
        }
        
        const file = await driveService.saveFileToFolder(budgetFolderId, finalFileName, finalMimeType, finalBuffer);
        
        if (!file) throw new Error("No se pudo guardar el archivo en Drive.");

        res.json({ success: true, file });
    } catch (error) {
        console.error('Error subiendo anexo:', error);
        res.status(500).json({ 
            error: 'Error al subir anexo.', 
            message: error.message 
        });
    }
});

// Eliminar un anexo específico de Drive
router.delete('/:id/anexos/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const success = await driveService.deleteFile(fileId);
        
        if (!success) {
            return res.status(500).json({ error: 'No se pudo eliminar el archivo de Drive.' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando anexo:', error);
        res.status(500).json({ error: 'Error interno al eliminar anexo.' });
    }
});

// Eliminar una (DELETE /api/oportunidades/:id)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Obtener el UUID interno de la oportunidad para verificar relaciones
        const { data: op, error: opErr } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad')
            .or(`id_oportunidad.eq.${id},ref_catastral.eq.${id}`)
            .maybeSingle();

        if (opErr) return res.status(500).json({ error: 'Error al consultar oportunidad.' });
        if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada.' });

        // 2. Verificar si existe un expediente asociado (usando el UUID interno 'id')
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('numero_expediente')
            .eq('oportunidad_id', op.id)
            .maybeSingle();

        if (expErr) return res.status(500).json({ error: 'Error al consultar expedientes asociados.' });

        if (exp) {
            return res.status(400).json({ 
                error: 'HAS_EXPEDIENTE',
                message: `Esta oportunidad ya ha sido aceptada y ha generado un número de expediente [${exp.numero_expediente}]. Póngase en contacto con el administrador para borrarlo.`,
                numero_expediente: exp.numero_expediente
            });
        }

        // 3. Eliminar la oportunidad por su UUID
        const { error: delErr } = await supabase
            .from('oportunidades')
            .delete()
            .eq('id', op.id);

        if (delErr) return res.status(500).json({ error: 'Error al eliminar.' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error fatal DELETE /:', error);
        res.status(500).json({ error: 'Error servidor.' });
    }
});

module.exports = router;
