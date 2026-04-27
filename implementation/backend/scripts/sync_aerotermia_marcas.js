const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function syncBrands() {
    console.log('--- Iniciando sincronización de marcas ---');
    
    // 1. Obtener todas las aerotermias
    const { data: equipos, error: e1 } = await supabase.from('aerotermia').select('marca, logo_marca');
    if (e1) { console.error('Error fetching aerotermia:', e1); return; }
    
    // 2. Extraer marcas únicas y sus logos
    const brandsMap = {};
    equipos.forEach(e => {
        const m = (e.marca || '').trim().toUpperCase();
        if (!m) return;
        if (!brandsMap[m]) {
            brandsMap[m] = { nombre: m, logo: e.logo_marca };
        } else if (!brandsMap[m].logo && e.logo_marca) {
            brandsMap[m].logo = e.logo_marca;
        }
    });
    
    const brandsList = Object.values(brandsMap);
    console.log(`Encontradas ${brandsList.length} marcas únicas.`);
    
    // 3. Insertar / Actualizar en aerotermia_marcas
    for (const b of brandsList) {
        process.stdout.write(`Sincronizando ${b.nombre}... `);
        const { error: e2 } = await supabase
            .from('aerotermia_marcas')
            .upsert(b, { onConflict: 'nombre' });
        
        if (e2) {
            console.log('ERROR: ' + e2.message);
        } else {
            console.log('OK');
        }
    }
    
    console.log('--- Sincronización finalizada ---');
}

syncBrands();
