const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
    const { data, error } = await supabase.from('config').select('*').limit(1);
    if (error) {
        console.log('Tabla config no existe o inaccesible:', error.message);
    } else {
        console.log('Tabla config existe:', data);
    }
}

checkConfig();
