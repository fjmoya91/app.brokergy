const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'expedientes' });
    // If RPC doesn't exist, try a simple select
    const { data: cols, error: err2 } = await supabase.from('expedientes').select('*').limit(0);
    console.log('Columns found:', Object.keys(cols?.[0] || {}));
}

check();
