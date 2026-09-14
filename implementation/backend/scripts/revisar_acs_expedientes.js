// ============================================================================
// revisar_acs_expedientes.js — qué expedientes declaran hoy un SCOP de ACS que
// el catálogo no sostiene.
//
//   node implementation/backend/scripts/revisar_acs_expedientes.js
//
// SOLO LEE. No escribe ni propone escribir nada, y es deliberado: sobre estas
// cifras se ha calculado el ahorro de expedientes que pueden estar ya firmados,
// presentados o cobrados, y corregirlas en bloque movería el CAE de un lote
// entero. Lo que hace falta aquí es la lista para decidir uno a uno.
//
// Las tres cosas que mira, por orden de gravedad:
//
//   1. SCOP_dhw CLONADO del de calefacción. Cuando `misma_aerotermia_acs` está
//      en true, el nodo de ACS es una copia exacta del de calefacción, así que
//      lo que se declara como SCOP en ACS es el SCOP en CALEFACCIÓN. La misma
//      bomba rinde bastante menos calentando agua a 55-60°, así que ese número
//      sobreestima el ahorro. Es el fallo que cierra de raíz el autorrelleno del
//      conjunto (ver logic/acsCatalogo.js), pero solo para lo que se toque de
//      ahora en adelante.
//
//   2. Modelo de ACS SIN datos en el catálogo. `getScopAcsFromModel` cae a un
//      3,0 por defecto cuando el modelo no declara nada, y ese 3,0 no lo
//      justifica ningún documento ante el verificador.
//
//   3. Conjunto con un equipo de ACS DISTINTO. El de calefacción ya trae el
//      depósito dentro: o el segundo equipo sobra, o el conjunto no era tal.
// ============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const esConjunto = (m) => !!(m && m.deposito_acs_incluido);
const tieneDatoAcs = (m) => !!(m && (num(m.scop_dhw_calido) || num(m.scop_dhw_medio)
    || num(m.eta_acs_calida) || num(m.eta_acs_media) || num(m.cop_a7_55)));

(async () => {
    const { data: cat, error: e1 } = await supabase
        .from('aerotermia')
        .select('id, marca, modelo_comercial, deposito_acs_incluido, scop_dhw_calido, scop_dhw_medio, eta_acs_calida, eta_acs_media, cop_a7_55');
    if (e1) { console.error('No se pudo leer el catálogo:', e1.message); process.exitCode = 1; return; }
    const porId = new Map(cat.map(m => [String(m.id).toLowerCase(), m]));

    const { data: exps, error: e2 } = await supabase
        .from('expedientes')
        .select('numero_expediente, estado, instalacion')
        .order('numero_expediente');
    if (e2) { console.error('No se pudieron leer los expedientes:', e2.message); process.exitCode = 1; return; }

    const clonados = [], sinDatos = [], conjuntoDoble = [];

    for (const e of exps) {
        const inst = e.instalacion || {};
        if (String(inst.cambio_acs).toLowerCase() === 'false' || inst.cambio_acs === false) continue;
        const cal = inst.aerotermia_cal || {};
        const acs = inst.aerotermia_acs || {};
        const modCal = porId.get(String(cal.aerotermia_db_id || '').toLowerCase());
        const modAcs = porId.get(String(acs.aerotermia_db_id || '').toLowerCase());
        const misma = inst.misma_aerotermia_acs === true || String(inst.misma_aerotermia_acs).toLowerCase() === 'true';
        const fila = { exp: e.numero_expediente, estado: e.estado };

        if (misma && num(cal.scop)) {
            const propio = modCal && (num(modCal.scop_dhw_calido) || num(modCal.scop_dhw_medio));
            clonados.push({ ...fila,
                declarado: num(cal.scop),
                catalogo: propio || null,
                equipo: modCal ? `${modCal.marca} ${modCal.modelo_comercial}` : '—' });
        }

        if (modAcs && !tieneDatoAcs(modAcs)) {
            sinDatos.push({ ...fila, declarado: num(acs.scop),
                equipo: `${modAcs.marca} ${modAcs.modelo_comercial}` });
        }

        if (!misma && esConjunto(modCal) && modAcs && String(modAcs.id) !== String(modCal.id)) {
            conjuntoDoble.push({ ...fila,
                conjunto: `${modCal.marca} ${modCal.modelo_comercial}`,
                acs: `${modAcs.marca} ${modAcs.modelo_comercial}` });
        }
    }

    const tabla = (titulo, filas, cols) => {
        console.log(`\n${titulo} — ${filas.length}`);
        if (!filas.length) { console.log('  (ninguno)'); return; }
        filas.forEach(f => console.log('  · ' + cols.map(c => `${c[0]}: ${f[c[1]] ?? '—'}`).join(' · ')));
    };

    tabla('1. SCOP en ACS copiado del de CALEFACCIÓN', clonados,
        [['expte', 'exp'], ['declarado', 'declarado'], ['catálogo dice', 'catalogo'], ['equipo', 'equipo']]);
    tabla('2. Modelo de ACS sin ningún dato en el catálogo (cae al 3,0 por defecto)', sinDatos,
        [['expte', 'exp'], ['declarado', 'declarado'], ['equipo', 'equipo']]);
    tabla('3. Conjunto en calefacción y OTRO equipo declarado en ACS', conjuntoDoble,
        [['expte', 'exp'], ['conjunto', 'conjunto'], ['ACS', 'acs']]);

    console.log(`\nRevisados ${exps.length} expedientes. Este script NO escribe nada:`);
    console.log('cada caso se corrige desde su ficha, mirando qué se firmó y qué se presentó.\n');
})();
