const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase
        .from('expedientes')
        .select('numero_expediente, correlativo')
        .like('numero_expediente', '26RES060_%')
        .order('correlativo', { ascending: false })
        .limit(5);
        
    if (error) {
        console.error(error);
        return;
    }
    console.log('RES060 Expedientes:', data);
}

check();
