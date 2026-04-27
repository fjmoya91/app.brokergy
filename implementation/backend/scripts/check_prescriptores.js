const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase.from('prescriptores').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    console.log('Columns:', Object.keys(data[0] || {}));
}

check();
