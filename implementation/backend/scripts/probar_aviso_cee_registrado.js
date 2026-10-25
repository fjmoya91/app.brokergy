// Previsualiza (EN SECO, no envía nada) el aviso de «CEE INICIAL presentado» de
// uno o varios expedientes: lo que falta de la obra y los textos al cliente y al
// instalador, tal como saldrían (ceeRegistradoAviso).
//   node scripts/probar_aviso_cee_registrado.js 26RES060_245 [26RES080_90 …]
//   node scripts/probar_aviso_cee_registrado.js --muestra   (uno de cada ficha, recientes)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const reformaUploadService = require('../services/reformaUploadService');
const aviso = require('../services/ceeRegistradoAviso');

async function uno(numero) {
    const { data: exp } = await supabase.from('expedientes')
        .select('id, numero_expediente, oportunidad_id, cliente_id, cee, seguimiento')
        .eq('numero_expediente', numero).maybeSingle();
    if (!exp) { console.log(`\n### ${numero}: no existe`); return; }
    // En seco de verdad: sin token de subida no se crea uno (ensureUploadLink escribiría).
    if (!(await reformaUploadService.uploadLinkSiExiste(exp.oportunidad_id))) {
        console.log(`\n### ${numero}: sin enlace de subida todavía (no se crea en seco)`); return;
    }
    const pend = await aviso.pendientesObra(exp.oportunidad_id);
    const nom = (xs) => (xs || []).map(s => s.key).join(', ') || '—';
    console.log(`\n### ${numero} · ficha ${pend?.ficha || '?'} · CEE inicial ${exp.seguimiento?.cee_inicial || '—'}`);
    if (!pend) { console.log('  pendientesObra = null → lista de siempre'); }
    else console.log(`  ya tenemos: ${nom(pend.tenemos)}\n  falta ANTES: ${nom(pend.antes)}\n  falta DESPUÉS: ${nom(pend.despues)}`);
    const r = await aviso.notifyCeeInicialRegistrado(exp, { preview: true });
    if (!r.ok) { console.log('  preview falló:', r.reason); return; }
    console.log('\n--- CLIENTE ---\n' + r.preview.CLIENTE + '\n\n--- INSTALADOR ---\n' + r.preview.PARTNER);
}

(async () => {
    let nums = process.argv.slice(2).filter(a => !a.startsWith('--'));
    if (process.argv.includes('--muestra')) {
        for (const f of ['RES060', 'RES080', 'RES093']) {
            const { data } = await supabase.from('expedientes').select('numero_expediente')
                .like('numero_expediente', `26${f}%`).order('created_at', { ascending: false }).limit(1);
            if (data?.[0]) nums.push(data[0].numero_expediente);
        }
    }
    for (const n of nums) await uno(n);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
