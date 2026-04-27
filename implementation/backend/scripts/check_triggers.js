const supabase = require('../services/supabaseClient');

async function check() {
    const { data, error } = await supabase.rpc('get_triggers');
    // If RPC doesn't exist, try querying pg_trigger
    const { data: triggers, error: err2 } = await supabase.from('pg_trigger').select('*').limit(0);
    console.log('Triggers found:', triggers);
}

check();
