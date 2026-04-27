const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase
        .from('expedientes')
        .select('numero_expediente, correlativo')
        .like('numero_expediente', '26%')
        .order('correlativo', { ascending: false });
        
    if (error) {
        console.error(error);
        return;
    }
    console.log('All 26 Expedientes:', data);
}

check();
