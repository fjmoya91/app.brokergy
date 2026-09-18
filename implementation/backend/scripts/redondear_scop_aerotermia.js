/**
 * redondear_scop_aerotermia.js — Redondea a 2 DECIMALES los seis campos SCOP del
 * catálogo `aerotermia`. En seco por defecto; escribe con `--execute`.
 *
 *   node implementation/backend/scripts/redondear_scop_aerotermia.js [--execute]
 *
 * POR QUÉ: algunos equipos tienen su SCOP tecleado con 3 decimales (a mano, o
 * arrastrado de un catálogo importado con más precisión de la que declara la
 * ficha del fabricante) — visto en Johnson MANANTIAL150RPLUSB, SCOP_dhw = 4,017.
 * El resto de la app ya redondea a 2 en cuanto lo CALCULA (`getScopAcsFromModel`,
 * `resolveScop` en calculation.js) y el POST/PUT del catálogo ya redondea al
 * ESCRIBIR (routes/aerotermia.js); esto es lo único que faltaba: lo que YA está
 * en la base de datos con más precisión de la que nunca debió tener.
 *
 * No se toca `cop_a7_55`: es un COP, no un SCOP, y no lo pidió el usuario.
 */
require('dotenv').config();
const supabase = require('../services/supabaseClient');

const EXECUTE = process.argv.includes('--execute');

const CAMPOS = [
    'scop_cal_calido_35', 'scop_cal_calido_55',
    'scop_cal_medio_35', 'scop_cal_medio_55',
    'scop_dhw_calido', 'scop_dhw_medio',
];

const round2 = (v) => Math.round(v * 100) / 100;

(async () => {
    const { data: cat, error } = await supabase
        .from('aerotermia')
        .select(`id,marca,modelo_comercial,${CAMPOS.join(',')}`);
    if (error) throw error;

    const cambios = [];
    for (const r of cat) {
        const update = {};
        const detalle = [];
        for (const campo of CAMPOS) {
            const v = r[campo];
            if (v === null || v === undefined) continue;
            const redondeado = round2(Number(v));
            // Comparación en CRUDO, no con una tolerancia: lo que se busca es
            // exactamente el sobrante de decimales que `.toFixed`/`Math.round`
            // se comen, no una diferencia de medición.
            if (String(v) !== String(redondeado)) {
                update[campo] = redondeado;
                detalle.push(`${campo}: ${v} -> ${redondeado}`);
            }
        }
        if (Object.keys(update).length) {
            cambios.push({ id: r.id, titulo: `${r.marca} · ${r.modelo_comercial}`, detalle, update });
        }
    }

    if (!cambios.length) { console.log('Nada que redondear.'); process.exit(0); }

    console.log(`\n${EXECUTE ? 'APLICANDO' : 'EN SECO (usa --execute para escribir)'} — ${cambios.length} filas\n`);
    for (const c of cambios) {
        console.log(`  id ${String(c.id).padEnd(4)} ${c.titulo}`);
        c.detalle.forEach(d => console.log(`        ${d}`));
    }

    if (!EXECUTE) { console.log('\nNada escrito.'); process.exit(0); }

    let escritas = 0;
    for (const c of cambios) {
        const { error: e } = await supabase.from('aerotermia').update(c.update).eq('id', c.id);
        if (e) console.error(`  ! id ${c.id}: ${e.message}`);
        else escritas++;
    }
    console.log(`\nHecho: ${escritas} de ${cambios.length} filas redondeadas.`);
    process.exit(0);
})();
