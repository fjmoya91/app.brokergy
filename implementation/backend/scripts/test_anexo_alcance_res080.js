/**
 * test_anexo_alcance_res080.js — el Anexo Fotográfico de un RES080 tiene que ver
 * la ENVOLVENTE del expediente.
 * ---------------------------------------------------------------------------
 * Protege una regresión que costó dos anexos mal generados: `anexoConcepts` pide
 * el checklist con `buildDocChecklist(datos_calculo)`, que cae a los `inputs` y
 * al funnel de la OPORTUNIDAD. Pero en un RES080 lo que se rehabilita (ventanas,
 * cubierta, fachada) lo declara el EXPEDIENTE, en `documentacion.envolvente`.
 *
 * Sin el alcance resuelto, la skill y el MCP veían una lista de apartados
 * DISTINTA de la del modal de la app —que sí lo resolvía— y el anexo salía sin
 * la actuación principal. Medido en 26RES080_44: 5 actuaciones y 10 fotos en vez
 * de 7 y 30; las 20 fotos de ventanas estaban en Drive con su nombre canónico.
 *
 * `syncEnvolventeAndReload` es el punto por el que pasan las DOS vías de la skill
 * (generar y consultar estado), así que es ahí donde se resuelve el alcance.
 *
 * Solo LEE: no genera ningún documento ni escribe en Drive.
 *
 *   node implementation/backend/scripts/test_anexo_alcance_res080.js
 */
require('dotenv').config({ quiet: true });
const supabase = require('./../services/supabaseClient');
const afs = require('../services/anexoFotograficoService');
const ru = require('../services/reformaUploadService');

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`); }
};

/** Los apartados de foto que el Anexo reconoce para un expediente. */
async function conceptosDe(numero) {
    const { data: exp } = await supabase.from('expedientes')
        .select('id, numero_expediente, documentacion, oportunidad_id')
        .eq('numero_expediente', numero).maybeSingle();
    if (!exp) return null;
    const { data: op } = await supabase.from('oportunidades')
        .select('id, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle();
    const dc = await afs.syncEnvolventeAndReload(exp, op);
    return {
        exp, op,
        envolvente: exp.documentacion?.envolvente || {},
        conAlcance: afs.anexoConcepts(dc).map(c => c.key),
        aPelo: ru.buildDocChecklist(op?.datos_calculo || {}).map(s => s.key),
    };
}

(async () => {
    console.log('\n=== ANEXO FOTOGRÁFICO · alcance de la envolvente en un RES080 ===\n');

    // Cualquier RES080 que declare envolvente sirve; se cogen los que hay.
    const { data: candidatos } = await supabase
        .from('expedientes')
        .select('numero_expediente, env:documentacion->envolvente')
        .ilike('numero_expediente', '%RES080%')
        .limit(200);

    const conEnvolvente = (candidatos || []).filter(e => {
        const v = e.env || {};
        return v.sustituye_ventanas === true || v.aislamiento_cubierta === true || v.aislamiento_muros === true;
    });
    check(conEnvolvente.length > 0, `Hay RES080 con envolvente declarada (${conEnvolvente.length})`);

    const MAPA = [
        ['sustituye_ventanas',   'FOTO_VENTANAS_ANTES',  'FOTO_VENTANAS_DESPUES'],
        ['aislamiento_cubierta', 'FOTO_CUBIERTA_ANTES',  'FOTO_CUBIERTA_DESPUES'],
        ['aislamiento_muros',    'FOTO_FACHADA_ANTES',   'FOTO_FACHADA_DESPUES'],
    ];

    let revisados = 0, huecos = 0;
    for (const c of conEnvolvente) {
        const r = await conceptosDe(c.numero_expediente);
        if (!r) continue;
        revisados++;
        const faltan = [];
        for (const [campo, antes, despues] of MAPA) {
            if (r.envolvente[campo] !== true) continue;
            for (const k of [antes, despues]) if (!r.conAlcance.includes(k)) faltan.push(k);
        }
        if (faltan.length) { huecos++; console.log(`  ✗ ${c.numero_expediente}: el Anexo NO pide ${faltan.join(', ')}`); }
    }
    check(huecos === 0,
        `Todos los RES080 con envolvente piden sus apartados en el Anexo (${revisados} revisados)`);

    // El caso concreto que lo destapó, con sus cifras.
    const r44 = await conceptosDe('26RES080_44');
    if (r44) {
        console.log('\n26RES080_44 — el RES080 de ventanas que salía sin ventanas:');
        check(r44.conAlcance.includes('FOTO_VENTANAS_ANTES') && r44.conAlcance.includes('FOTO_VENTANAS_DESPUES'),
            'Con el alcance del expediente, el Anexo pide las ventanas (antes y después)');
        check(!r44.aPelo.includes('FOTO_VENTANAS_ANTES'),
            'Y sin él NO las pedía — que es justo la regresión que esto vigila');

        const { groups } = await afs.collectPhotoGroups(
            await afs.syncEnvolventeAndReload(r44.exp, r44.op));
        const total = groups.reduce((n, g) => n + g.photos.length, 0);
        const ventanas = groups.filter(g => /VENTANAS/.test(g.key)).reduce((n, g) => n + g.photos.length, 0);
        check(ventanas === 20, `Recoge de Drive las 20 fotos de ventanas (${ventanas})`, ventanas);
        check(total >= 30 && groups.length >= 7,
            `Y el anexo entero sale con ${groups.length} actuaciones y ${total} fotos (antes: 5 y 10)`);
    }

    console.log(`\n=== ${ok} bien · ${ko} mal ===\n`);
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('\nLa prueba se ha roto:', e); process.exit(1); });
