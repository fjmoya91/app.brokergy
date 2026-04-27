const supabase = require('../services/supabaseClient');

async function check() {
    console.log("--- PRESCRIPTORES ---");
    const { data: pres } = await supabase.from('prescriptores').select('*').limit(1);
    if (pres && pres.length > 0) {
        console.log(Object.keys(pres[0]));
    }
    
    console.log("--- DISTRIBUIDORES_INSTALADORES ---");
    const { data: rel, error } = await supabase.from('distribuidor_instalador').select('*').limit(1);
    if (error) {
        console.log("Table 'distribuidor_instalador' does not exist or error:", error.message);
    } else {
        console.log("Table 'distribuidor_instalador' exists.");
    }
    
    console.log("--- OPORTUNIDADES ---");
    const { data: op } = await supabase.from('oportunidades').select('*').limit(1);
    if (op && op.length > 0) {
        console.log(Object.keys(op[0]));
    }
}

check();
