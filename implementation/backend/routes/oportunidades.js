const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { requireAuth } = require('../middleware/auth');

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
        const { id_oportunidad, ref_catastral, prescriptor, referencia_cliente, demanda_calefaccion, datos_calculo, nota, creador_id, prescriptor_id } = req.body;

        if (!ref_catastral) {
            return res.status(400).json({ error: 'La referencia catastral es obligatoria.' });
        }

        let existingData = null;
        if (id_oportunidad) {
            const { data } = await supabase.from('oportunidades').select('*').eq('id_oportunidad', id_oportunidad).single();
            existingData = data;
        } else {
            const { data } = await supabase.from('oportunidades').select('*').eq('ref_catastral', ref_catastral).single();
            existingData = data;
        }

        let newIdOportunidad = existingData?.id_oportunidad;

        if (!newIdOportunidad) {
            const { data: allIds, error: idsError } = await supabase.from('oportunidades').select('id_oportunidad');
            let nextNum = 1;
            if (!idsError && allIds && allIds.length > 0) {
                const nums = allIds.map(r => {
                    const matchNew = r.id_oportunidad?.match(/RES060_OP(\d+)$/);
                    const matchOld = r.id_oportunidad?.match(/^OP_(\d+)$/);
                    const numStr = matchNew ? matchNew[1] : (matchOld ? matchOld[1] : null);
                    return numStr ? parseInt(numStr, 10) : 0;
                }).filter(n => !isNaN(n));
                if (nums.length > 0) nextNum = Math.max(...nums) + 1;
            }
            const currentYearYY = new Date().getFullYear().toString().slice(-2);
            newIdOportunidad = `${currentYearYY}RES060_OP${nextNum}`;
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
                usuario: 'Administrador'
            });
        }

        const datosCalculoFinal = datos_calculo || {};
        datosCalculoFinal.estado = estadoActual;
        datosCalculoFinal.historial = historial;

        let payloadPrescriptorStr = prescriptor || 'BROKERGY';
        if (!prescriptor && req.user && req.user.perfilCompleto) {
            payloadPrescriptorStr = `${req.user.perfilCompleto.nombre || ''} ${req.user.perfilCompleto.apellidos || ''}`.trim();
        }

        const newRecord = {
            id_oportunidad: newIdOportunidad,
            ref_catastral,
            prescriptor: payloadPrescriptorStr,
            referencia_cliente: referencia_cliente || null,
            demanda_calefaccion: demanda_calefaccion || null,
            datos_calculo: datosCalculoFinal
        };

        // Si tenemos sesión, anexamos los rastros UUID silenciosamente
        if (req.user) {
            newRecord.creador_id = creador_id || req.user.id_usuario;
            newRecord.prescriptor_id = prescriptor_id || req.user.prescriptor_id;
        }

        // Automatización de Google Drive (para nuevas oportunidades o existentes sin carpeta)
        const hasFolder = existingData?.datos_calculo?.drive_folder_id;
        if (!hasFolder) {
            try {
                const driveResult = await driveService.setupOpportunityFolder(newIdOportunidad, referencia_cliente);
                if (driveResult) {
                    newRecord.datos_calculo.drive_folder_id = driveResult.id;
                    newRecord.datos_calculo.drive_folder_link = driveResult.link;
                }
            } catch (err) {
                console.error('Error al crear carpeta en Drive:', err);
                // No bloqueamos el proceso principal si falla Drive
            }
        } else {
            // Si ya tiene carpeta, mantenemos los IDs originales
            newRecord.datos_calculo.drive_folder_id = existingData.datos_calculo.drive_folder_id;
            newRecord.datos_calculo.drive_folder_link = existingData.datos_calculo.drive_folder_link;
        }

        let resultError;
        if (existingData) {
            const { error } = await supabase.from('oportunidades').update(newRecord).eq('id_oportunidad', newIdOportunidad);
            resultError = error;
        } else {
            const { error } = await supabase.from('oportunidades').insert([newRecord]);
            resultError = error;
        }

        if (resultError) {
            console.error('Error Supabase:', resultError);
            return res.status(500).json({ error: 'Error al guardar.', details: resultError.message });
        }

        res.status(201).json(newRecord);
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
            .select('id, id_oportunidad, ref_catastral, referencia_cliente, prescriptor, demanda_calefaccion, datos_calculo, created_at, creador_id, prescriptor_id')
            .order('created_at', { ascending: false });

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
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// 3. RUTAS ESPECÍFICAS (Deben ir ANTES de las genéricas de abajo)

// Añadir un comentario (POST /api/oportunidades/:id/comentarios)
router.post('/:id/comentarios', async (req, res) => {
    const { id } = req.params;
    const { comentario } = req.body;
    console.log(`[Backend] POST /comentarios para: ${id}`);
    try {
        if (!comentario) return res.status(400).json({ error: 'Comentario vacío.' });
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        const hist = dc.historial || [];
        hist.push({
            id: Date.now().toString() + '_comment',
            tipo: 'comentario',
            texto: comentario,
            fecha: new Date().toISOString(),
            usuario: 'Administrador'
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
router.patch('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { nuevo_estado } = req.body;
    try {
        const { data: op, error: getErr } = await supabase.from('oportunidades').select('datos_calculo').eq('id_oportunidad', id).single();
        if (getErr || !op) return res.status(404).json({ error: 'No encontrada.' });

        const dc = op.datos_calculo || {};
        dc.estado = nuevo_estado;
        const hist = dc.historial || [];
        hist.push({
            id: Date.now().toString() + '_status',
            estado: nuevo_estado,
            fecha: new Date().toISOString(),
            usuario: 'Administrador'
        });
        dc.historial = hist;

        const { data: upData, error: upErr } = await supabase.from('oportunidades').update({ datos_calculo: dc }).eq('id_oportunidad', id).select();
        if (upErr) return res.status(500).json({ error: 'Error al actualizar.' });

        // --- Automatización de MOVIMIENTO en Drive ---
        const folderId = dc.drive_folder_id;
        if (folderId) {
            console.log(`[StatusUpdate] Detectada carpeta Drive vinculada (${folderId}). Procesando automovimiento...`);
            // Mapa de IDs según el estado (Sacados de la petición del usuario)
            const FOLDER_MAP = {
                'ENVIADA': '1C4XSprT61mOgpW6LSNXwXefwuFRqudjn',
                'ACEPTADA': '1L2Wl9OIOpvmihySZkT09S1FG14Pu3VNy',
                'PTE ENVIAR': process.env.DRIVE_ROOT_FOLDER_ID // Volver a la raíz
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

// Eliminar una (DELETE /api/oportunidades/:id)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('oportunidades')
            .delete()
            .or(`id_oportunidad.eq."${id}",ref_catastral.eq."${id}"`);

        if (error) return res.status(500).json({ error: 'Error al eliminar.' });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error servidor.' });
    }
});

module.exports = router;
