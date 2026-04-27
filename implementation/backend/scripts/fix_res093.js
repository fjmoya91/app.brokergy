const supabase = require('../services/supabaseClient');

async function fix() {
    // 1. Fix 26RES093_1 -> correlativo 1
    const { error: err1 } = await supabase
        .from('expedientes')
        .update({ correlativo: 1 })
        .eq('numero_expediente', '26RES093_1');
    
    if (err1) console.error('Error fixing _1:', err1);
    else console.log('Fixed 26RES093_1 to correlativo 1');

    // 2. Fix 26RES093_2 -> correlativo 2
    const { error: err2 } = await supabase
        .from('expedientes')
        .update({ correlativo: 2 })
        .eq('numero_expediente', '26RES093_2');
    
    if (err2) console.error('Error fixing _2:', err2);
    else console.log('Fixed 26RES093_2 to correlativo 2');
}

fix();
