// ============================================================================
// catalogo.cjs — busca en el catálogo de AEROTERMIA (solo lectura), como haría
// una persona con el desplegable: por marca, por un trozo del modelo y por
// potencia. Para casar lo que dice un presupuesto («CARRIER MONOBLOC 12KW») con
// su fila del catálogo antes de caer en la aerotermia genérica.
//
//   node -r seco.cjs catalogo.cjs '{"marca":"CARRIER","texto":"30AWH","potencia_kw":12}'
// ============================================================================
const path = require('path');
const BACK = path.resolve(__dirname, '..', '..', 'implementation', 'backend');
const sb = require(path.join(BACK, 'services', 'supabaseClient'));

const COLS = 'id, marca, modelo_comercial, modelo_conjunto, potencia_calefaccion, refrigerante, '
    + 'scop_cal_calido_35, scop_cal_calido_55, scop_cal_medio_35, scop_cal_medio_55, litros_acs, is_validated';

(async () => {
    const q = JSON.parse(process.argv[2] || '{}');
    let r = sb.from('aerotermia').select(COLS).limit(40);
    if (q.marca) r = r.ilike('marca', `%${q.marca}%`);
    if (q.texto) r = r.or(`modelo_comercial.ilike.%${q.texto}%,modelo_conjunto.ilike.%${q.texto}%`);
    if (q.potencia_kw) r = r.gte('potencia_calefaccion', Number(q.potencia_kw) - 1.5).lte('potencia_calefaccion', Number(q.potencia_kw) + 1.5);
    const { data, error } = await r.order('id');
    if (error) throw new Error(error.message);
    if (!data.length) { console.log('Ninguna fila con esos filtros. Prueba solo con la marca.'); return; }
    for (const a of data) {
        console.log(`id ${a.id} · ${a.marca} ${a.modelo_comercial}${a.modelo_conjunto ? ` (${a.modelo_conjunto})` : ''}`
            + ` · ${a.potencia_calefaccion ?? '?'} kW · ${a.refrigerante || 'refrig. ?'}`
            + ` · SCOP cálido 35/55 ${a.scop_cal_calido_35 ?? '—'}/${a.scop_cal_calido_55 ?? '—'}`
            + ` · medio 35/55 ${a.scop_cal_medio_35 ?? '—'}/${a.scop_cal_medio_55 ?? '—'}`
            + `${a.litros_acs ? ` · ${a.litros_acs} l ACS` : ''} · ${a.is_validated ? 'VALIDADA' : 'sin validar'}`);
    }
})().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
