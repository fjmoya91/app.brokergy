// Pasa a ENVIADA las oportunidades cuya propuesta YA salió bien pero que siguen
// en LEAD / PTE ENVIAR / EN CURSO porque solo le llegó al instalador o partner.
// Hasta el 2026-10-14 solo contaba el cliente (26RES060_OP295 y otras 17).
//
//   node scripts/enviadas_solo_instalador.js            → en seco: lista lo que cambiaría
//   node scripts/enviadas_solo_instalador.js --aplicar  → lo cambia
//
// Va por `PATCH /api/oportunidades/:id/estado` del backend que esté arrancado
// (x-internal-key): es la ruta que además mueve la carpeta de Drive a
// «02. SIMULACION ENVIADA» y deja la línea en el historial. ⚠️ Local escribe en
// la Supabase y el Drive de PRODUCCIÓN.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { entregaPropuesta } = require('../utils/entregaPropuesta');

const APLICAR = process.argv.includes('--aplicar');
const API = `http://127.0.0.1:${process.env.PORT || 3000}/api`;
const SIN_ENVIAR = ['LEAD', 'PTE ENVIAR', 'EN CURSO'];

(async () => {
    const { data, error } = await supabase
        .from('oportunidades')
        .select('id_oportunidad, referencia_cliente, estado:datos_calculo->>estado, versiones:datos_calculo->propuesta_versiones')
        .not('datos_calculo->propuesta_versiones', 'is', null);
    if (error) throw error;

    const casos = (data || [])
        .filter(o => SIN_ENVIAR.includes(o.estado))
        .map(o => ({ ...o, entrega: entregaPropuesta(o.versiones) }))
        .filter(o => o.entrega && (o.entrega.cliente || o.entrega.instalador || o.entrega.otro))
        .sort((a, b) => a.id_oportunidad.localeCompare(b.id_oportunidad));

    console.log(`${casos.length} oportunidad(es) con la propuesta entregada y sin ENVIADA${APLICAR ? '' : ' (EN SECO)'}:`);
    for (const o of casos) {
        const a = [...o.entrega.nombres.cliente.map(n => `cliente ${n}`), ...o.entrega.nombres.instalador.map(n => `instalador ${n}`), ...o.entrega.nombres.otro.map(n => `otro ${n}`)];
        console.log(`  ${o.id_oportunidad.padEnd(16)} ${String(o.estado).padEnd(10)} ${o.referencia_cliente || ''}  →  ${a.join(', ')}`);
    }
    if (!APLICAR) { console.log('\nEn seco. Para cambiarlas: --aplicar (con el backend arrancado).'); return; }

    let ok = 0;
    for (const o of casos) {
        try {
            await axios.patch(`${API}/oportunidades/${encodeURIComponent(o.id_oportunidad)}/estado`,
                { nuevo_estado: 'ENVIADA', porEnvio: true, usuario: 'Sistema (propuesta ya enviada al instalador)' },
                { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' }, timeout: 60000 });
            ok++;
            console.log(`  ✓ ${o.id_oportunidad}`);
        } catch (e) {
            console.log(`  ✗ ${o.id_oportunidad}: ${e.response?.data?.error || e.message}`);
        }
    }
    console.log(`\n${ok}/${casos.length} pasadas a ENVIADA.`);
})().catch(e => { console.error(e); process.exit(1); });
