const supabase = require('../services/supabaseClient');

async function normalizeOpportunities() {
    console.log('--- Iniciando normalización de oportunidades en Supabase ---');

    const { data: rows, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, datos_calculo');

    if (error) {
        console.error('Error leyendo oportunidades:', error);
        return;
    }

    console.log(`Procesando ${rows.length} oportunidades...`);
    let updatedCount = 0;

    for (const row of rows) {
        try {
            let datos = row.datos_calculo || {};
            let changed = false;

            // 1. Asegurar isPersistent: true
            if (!datos.inputs) datos.inputs = {};
            if (datos.inputs.isPersistent !== true) {
                datos.inputs.isPersistent = true;
                changed = true;
            }

            // 2. Normalizar superficieCalefactada
            // Nota: El campo en el front es superficieCalefactable (con 'b') o superficieCalefactada?
            // En CalculatorView.jsx vi: base.superficieCalefactable = base.superficie;
            const superficie = Number(datos.inputs.superficie || datos.inputs.constructionSurface || 0);
            if (superficie > 0 && (!datos.inputs.superficieCalefactable || Number(datos.inputs.superficieCalefactable) === 0)) {
                datos.inputs.superficieCalefactable = superficie;
                changed = true;
            }
            
            // Asegurar que el campo a nivel raíz de datos_calculo también tenga el flag
            if (datos.isPersistent !== true) {
                datos.isPersistent = true;
                changed = true;
            }

            if (changed) {
                const { error: updateError } = await supabase
                    .from('oportunidades')
                    .update({ datos_calculo: datos })
                    .eq('id', row.id);

                if (updateError) {
                    console.error(`Error actualizando OP ${row.id_oportunidad}:`, updateError);
                } else {
                    updatedCount++;
                }
            }
        } catch (e) {
            console.error(`Error procesando OP ${row.id_oportunidad}:`, e);
        }
    }

    console.log(`Normalización completada. ${updatedCount} registros actualizados.`);
}

normalizeOpportunities();
