const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

// Registrar una nueva oportunidad (POST /api/oportunidades)
router.post('/', async (req, res) => {
    try {
        const { id_oportunidad, ref_catastral, prescriptor, referencia_cliente, demanda_calefaccion, datos_calculo } = req.body;

        if (!ref_catastral) {
            return res.status(400).json({ error: 'La referencia catastral es obligatoria.' });
        }

        // Comprobamos si ya existe por ID recibido o por referencia catastral (esto previene fallos con RC='MANUAL')
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
            // Buscar el mayor número de ID existente para evitar duplicados
            const { data: allIds, error: idsError } = await supabase
                .from('oportunidades')
                .select('id_oportunidad');

            let nextNum = 1;
            if (!idsError && allIds && allIds.length > 0) {
                const nums = allIds
                    .map(r => {
                        const matchNew = r.id_oportunidad?.match(/RES060_OP(\d+)$/);
                        const matchOld = r.id_oportunidad?.match(/^OP_(\d+)$/);
                        const numStr = matchNew ? matchNew[1] : (matchOld ? matchOld[1] : null);
                        return numStr ? parseInt(numStr, 10) : 0;
                    })
                    .filter(n => !isNaN(n));
                if (nums.length > 0) {
                    nextNum = Math.max(...nums) + 1;
                } else {
                    nextNum = allIds.length + 1;
                }
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
                estado: 'PTE ENVIAR',
                fecha: new Date().toISOString(),
                usuario: 'Sistema'
            });
        }

        const datosCalculoFinal = datos_calculo || {};
        datosCalculoFinal.estado = estadoActual;
        datosCalculoFinal.historial = historial;

        const newRecord = {
            id_oportunidad: newIdOportunidad,
            ref_catastral,
            prescriptor: prescriptor || 'BROKERGY',
            referencia_cliente: referencia_cliente || null,
            demanda_calefaccion: demanda_calefaccion || null,
            datos_calculo: datosCalculoFinal
        };

        let resultError;

        if (existingData) {
            // Update — usar nombre distinto a 'res' para no sobreescribir el response de Express
            const dbResult = await supabase
                .from('oportunidades')
                .update(newRecord)
                .eq('id_oportunidad', newIdOportunidad)
                .select();

            resultError = dbResult.error;
        } else {
            // Insert — usar nombre distinto a 'res' para no sobreescribir el response de Express
            const dbResult = await supabase
                .from('oportunidades')
                .insert([newRecord])
                .select();

            resultError = dbResult.error;
        }

        if (resultError) {
            console.error('Error insertando/actualizando en Supabase:', resultError);
            return res.status(500).json({ error: 'Error interno al guardar la oportunidad.', details: resultError.message });
        }

        res.status(201).json(newRecord);

    } catch (error) {
        console.error('Error no manejado en POST /oportunidades:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Obtener la lista de oportunidades (GET /api/oportunidades) - Para el panel de Admin
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, ref_catastral, referencia_cliente, prescriptor, demanda_calefaccion, datos_calculo, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error consultando Supabase:', error);
            return res.status(500).json({ error: 'Error al recuperar las oportunidades.', details: error.message });
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error no manejado en GET /oportunidades:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Eliminar una oportunidad por su RC (DELETE /api/oportunidades/:rc)
router.delete('/:rc', async (req, res) => {
    try {
        const rc = req.params.rc;
        const { error } = await supabase
            .from('oportunidades')
            .delete()
            .eq('ref_catastral', rc);

        if (error) {
            console.error('Error eliminando oportunidad por RC:', error);
            return res.status(500).json({ error: 'Error interno al eliminar la oportunidad.' });
        }

        res.status(200).json({ success: true, message: 'Oportunidad eliminada correctamente.' });
    } catch (error) {
        console.error('Error no manejado en DELETE /oportunidades/:rc:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Obtener una oportunidad por su RC (GET /api/oportunidades/:rc)
router.get('/:rc', async (req, res) => {
    try {
        const rc = req.params.rc;
        const { data, error } = await supabase
            .from('oportunidades')
            .select('*')
            .eq('ref_catastral', rc)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 es not found en Supabase (single)
            console.error('Error consultando oportunidad por RC:', error);
            return res.status(500).json({ error: 'Error interno.' });
        }

        if (!data) {
            return res.status(404).json({ error: 'No encontrada.' });
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error no manejado en GET /oportunidades/:rc:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Actualizar el estado de una oportunidad (PATCH /api/oportunidades/:id/estado)
router.patch('/:id/estado', async (req, res) => {
    try {
        const id = req.params.id;
        const { nuevo_estado } = req.body;

        if (!nuevo_estado) {
            return res.status(400).json({ error: 'El nuevo_estado es obligatorio.' });
        }

        // 1. Obtener la oportunidad actual
        const { data: oportunidad, error: getError } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .single();

        if (getError) {
            console.error('Error obteniendo oportunidad para actualizar estado:', getError);
            return res.status(500).json({ error: 'Error interno obteniendo oportunidad.' });
        }

        if (!oportunidad) {
            return res.status(404).json({ error: 'Oportunidad no encontrada.' });
        }

        const datos_calculo = oportunidad.datos_calculo || {};
        const historial = datos_calculo.historial || [];

        // 2. Modificar estado e historial
        datos_calculo.estado = nuevo_estado;
        historial.push({
            estado: nuevo_estado,
            fecha: new Date().toISOString(),
            usuario: 'Administrador' // En un futuro se podría extraer del token/auth
        });
        datos_calculo.historial = historial;

        // 3. Actualizar en Supabase
        const { data: updatedData, error: updateError } = await supabase
            .from('oportunidades')
            .update({ datos_calculo })
            .eq('id_oportunidad', id)
            .select();

        if (updateError) {
            console.error('Error actualizando estado en Supabase:', updateError);
            return res.status(500).json({ error: 'Error interno actualizando estado.' });
        }

        res.status(200).json({ success: true, estado: nuevo_estado, data: updatedData[0] });

    } catch (error) {
        console.error('Error no manejado en PATCH /oportunidades/:id/estado:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar el historial de una oportunidad (DELETE /api/oportunidades/:id/historial)
router.delete('/:id/historial', async (req, res) => {
    try {
        const id = req.params.id;

        // 1. Obtener la oportunidad actual
        const { data: oportunidad, error: getError } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .single();

        if (getError) {
            console.error('Error obteniendo oportunidad para borrar historial:', getError);
            return res.status(500).json({ error: 'Error interno obteniendo oportunidad.' });
        }

        if (!oportunidad) {
            return res.status(404).json({ error: 'Oportunidad no encontrada.' });
        }

        const datos_calculo = oportunidad.datos_calculo || {};

        // 2. Limpiar el historial
        datos_calculo.historial = [];

        // 3. Actualizar en Supabase
        const { data: updatedData, error: updateError } = await supabase
            .from('oportunidades')
            .update({ datos_calculo })
            .eq('id_oportunidad', id)
            .select();

        if (updateError) {
            console.error('Error borrando historial en Supabase:', updateError);
            return res.status(500).json({ error: 'Error interno borrando historial.' });
        }

        res.status(200).json({ success: true, message: 'Historial borrado correctamente.', data: updatedData[0] });

    } catch (error) {
        console.error('Error no manejado en DELETE /oportunidades/:id/historial:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

module.exports = router;
