const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase
        .from('aerotermia')
        .select('marca, logo_marca')
        .not('logo_marca', 'is', null)
        .limit(10);
    
    if (error) console.error(error);
    else {
        console.log('Logos found:', data.length);
        data.forEach(d => console.log(d.marca, d.logo_marca ? d.logo_marca.substring(0, 30) + '...' : 'null'));
    }
}
check();
