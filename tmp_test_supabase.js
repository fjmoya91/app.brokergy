const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'implementation/backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
    const id = '26RES060_OP11';
    console.log('Testing update for ID:', id);

    try {
        // 1. Get
        const { data: op, error: getError } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id_oportunidad', id)
            .single();

        if (getError) {
            console.error('Get Error:', getError);
            return;
        }

        console.log('Current data:', JSON.stringify(op, null, 2));

        const datos_calculo = op.datos_calculo || {};
        const historial = datos_calculo.historial || [];

        historial.push({
            id: Date.now().toString() + '_test',
            tipo: 'comentario',
            texto: 'Test from script',
            fecha: new Date().toISOString(),
            usuario: 'Script'
        });
        datos_calculo.historial = historial;

        // 2. Update
        const { data: updatedData, error: updateError } = await supabase
            .from('oportunidades')
            .update({ datos_calculo })
            .eq('id_oportunidad', id)
            .select();

        if (updateError) {
            console.error('Update Error:', updateError);
            return;
        }

        console.log('Updated data:', JSON.stringify(updatedData, null, 2));
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testUpdate();
