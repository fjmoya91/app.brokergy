// ============================================================================
// precio_cae_sello_pendientes.mjs — las oportunidades NUEVAS que nacieron SIN el
// sello del precio CAE (`datos_calculo.inputs.cae_client_rate`, utils/precioCae.js).
//
//   node implementation/backend/scripts/precio_cae_sello_pendientes.mjs              (en seco)
//   node implementation/backend/scripts/precio_cae_sello_pendientes.mjs --escribir
//   node implementation/backend/scripts/precio_cae_sello_pendientes.mjs --escribir --solo 26RES060_OP301,26RES060_239
//   node implementation/backend/scripts/precio_cae_sello_pendientes.mjs --desde 2026-09-09
//
// EN SECO POR DEFECTO: local escribe en la Supabase de PRODUCCIÓN.
//
// Por qué existe: del 09/09 al 20/10/2026 el sello solo se escribía en el
// guardado de la calculadora (POST /oportunidades), y toda alta pasa antes por
// `createLead`, que no lo ponía; el guardado ya encontraba la fila y, sin sello,
// no podía estrenarlo. 140 de 141 oportunidades nacieron sin él y sus expedientes
// calculan a 95 €/MWh (60 en RES080) con la propuesta hecha a su `caePriceClient`.
//
// Qué lista, por oportunidad creada desde `--desde` (09/09/2026, el día que nació
// el sello) sin `cae_client_rate`:
//   · su precio de la propuesta (`caePriceClient`), estado y origen;
//   · si tiene EXPEDIENTE: su estado, lote, el bono que calcula HOY y el que daría
//     con el sello (`computeExpedienteFinancialsNode`, la misma economía que el
//     portal y el panel), y si tiene el CIFO, el Anexo I o el Convenio FIRMADOS.
//     Con `economico_override.cae_client_rate` el sello no mueve nada (manda el
//     override). Sin CEE el panel hereda la economía de la propuesta guardada,
//     que ya se hizo a su precio: el sello no cambia nada hasta que llegue el CEE.
//     El Anexo I y el Convenio IMPRIMEN `caePriceClient` (`getClientCaeRate`), así
//     que lo firmado ya lleva el precio de la propuesta: el sello alinea el panel
//     con lo firmado, no al revés.
//
// Con `--escribir`, pone el sello (= su `caePriceClient`) con la RPC atómica
// `oportunidad_merge_inputs`: solo toca `inputs`, no pisa el resto de
// `datos_calculo`. Nada más.
// ============================================================================
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
const { computeExpedienteFinancialsNode } = require('../services/expedienteFinancialsNode');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ESCRIBIR = process.argv.includes('--escribir');
const DESDE = arg('--desde') || '2026-09-09';
const SOLO = arg('--solo') ? new Set(arg('--solo').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) : null;

const eur = (v) => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const firmado = (v) => typeof v === 'string' && v.trim() !== '';

// 1. Las oportunidades nuevas sin sello (campos CONCRETOS: regla 22).
const { data: ops, error } = await supabase
    .from('oportunidades')
    .select('id, id_oportunidad, ficha, created_at, estado:datos_calculo->>estado, origen:datos_calculo->>origen,'
        + ' precio:datos_calculo->inputs->>caePriceClient, sello:datos_calculo->inputs->>cae_client_rate')
    .gte('created_at', DESDE)
    .order('created_at', { ascending: true });
if (error) { console.error('No se pudieron leer las oportunidades:', error.message); process.exit(1); }

const sinSello = ops.filter(o => o.sello == null);
console.log(`Oportunidades creadas desde ${DESDE}: ${ops.length} · con sello: ${ops.length - sinSello.length} · SIN sello: ${sinSello.length}`);

// 2. Sus expedientes, por lotes (un `.in()` largo revienta las cabeceras).
const expPorOp = new Map();
const ids = sinSello.map(o => o.id);
for (let i = 0; i < ids.length; i += 40) {
    const { data, error: e } = await supabase
        .from('expedientes')
        .select(`id, numero_expediente, estado, lote_id, oportunidad_id, instalacion, ${CEE_ECO_SELECT},`
            + ' cifo:documentacion->>cert_cifo_signed_link, anexo_i:documentacion->>anexo_i_signed_link,'
            + ' cesion:documentacion->>anexo_cesion_signed_link')
        .in('oportunidad_id', ids.slice(i, i + 40));
    if (e) { console.error('No se pudieron leer los expedientes:', e.message); process.exit(1); }
    for (const x of data || []) expPorOp.set(x.oportunidad_id, rebuildCee(x));
}

// 3. Bono de hoy frente al bono con el sello.
const filas = [];
for (const o of sinSello) {
    const exp = expPorOp.get(o.id) || null;
    if (SOLO && !SOLO.has(o.id_oportunidad.toUpperCase()) && !(exp && SOLO.has(String(exp.numero_expediente).toUpperCase()))) continue;
    const precio = parseFloat(o.precio) || null;
    const f = { op: o, exp, precio, hoy: null, sellado: null, nota: '' };
    if (!precio) f.nota = 'sin caePriceClient: no hay qué sellar';
    if (exp && precio) {
        const override = exp.instalacion?.economico_override?.cae_client_rate;
        // `inputs` de UNA oportunidad, sola: aquí sí hace falta entero para la economía.
        const { data: opFull, error: e } = await supabase.from('oportunidades')
            .select('id, ficha, datos_calculo->inputs, datos_calculo->zona').eq('id', o.id).single();
        if (e) { f.nota = `no se pudo leer la oportunidad: ${e.message}`; filas.push(f); continue; }
        const opHoy = { ficha: opFull.ficha, datos_calculo: { inputs: opFull.inputs || {}, zona: opFull.zona } };
        const opSellada = { ...opHoy, datos_calculo: { ...opHoy.datos_calculo, inputs: { ...opHoy.datos_calculo.inputs, cae_client_rate: precio } } };
        const hoy = await computeExpedienteFinancialsNode(exp, opHoy);
        const sel = await computeExpedienteFinancialsNode(exp, opSellada);
        f.hoy = hoy.cae; f.sellado = sel.cae; f.ficha = hoy.ficha;
        if (override != null && override !== '') f.nota = `override ${override} €/MWh: manda él, el sello no cambia nada`;
        else if (hoy.cae == null) f.nota = 'sin CEE: hereda la propuesta guardada (ya a su precio)';
    }
    filas.push(f);
}

const conExp = filas.filter(f => f.exp);
const sinExp = filas.filter(f => !f.exp);

console.log(`\n── CON EXPEDIENTE (${conExp.length}) ─────────────────────────────────────────────`);
console.log('expediente        oportunidad        estado                      €/MWh   bono hoy   con sello    dif.   firmado            nota');
let sumaDif = 0, suben = 0, bajan = 0, firmados = 0;
for (const f of conExp.sort((a, b) => String(a.exp.numero_expediente).localeCompare(String(b.exp.numero_expediente)))) {
    const dif = (f.hoy != null && f.sellado != null) ? f.sellado - f.hoy : null;
    if (dif != null && !f.nota) { sumaDif += dif; if (dif > 0.005) suben++; else if (dif < -0.005) bajan++; }
    const fir = [firmado(f.exp.cifo) && 'CIFO', firmado(f.exp.anexo_i) && 'Anexo I', firmado(f.exp.cesion) && 'Convenio'].filter(Boolean);
    if (fir.length) firmados++;
    console.log([
        String(f.exp.numero_expediente).padEnd(17), f.op.id_oportunidad.padEnd(18),
        String(f.exp.estado || '').slice(0, 26).padEnd(27), String(f.precio ?? '—').padStart(5),
        eur(f.hoy).padStart(10), eur(f.sellado).padStart(11), (dif == null ? '—' : (dif >= 0 ? '+' : '') + eur(dif)).padStart(9),
        '  ' + (fir.join('+') || '—').padEnd(18) + (f.exp.lote_id ? ' [LOTE]' : ''), f.nota,
    ].join(' '));
}
console.log(`\nCon CEE y sin override: ${suben} suben, ${bajan} bajan · diferencia total ${sumaDif >= 0 ? '+' : ''}${eur(sumaDif)} € · con algo firmado: ${firmados}`);

console.log(`\n── SIN EXPEDIENTE (${sinExp.length}) — aún no calculan nada: el sello solo evita que al aceptarse calculen al respaldo ──`);
const porEstado = {};
for (const f of sinExp) { const k = f.op.estado || '(sin estado)'; (porEstado[k] ||= []).push(f); }
for (const [estado, lista] of Object.entries(porEstado)) {
    const precios = {};
    for (const f of lista) precios[f.precio ?? '—'] = (precios[f.precio ?? '—'] || 0) + 1;
    console.log(`  ${estado.padEnd(14)} ${String(lista.length).padStart(3)}  · precios: ${Object.entries(precios).map(([p, n]) => `${p}×${n}`).join(', ')}`);
}

if (!ESCRIBIR) {
    console.log('\nEN SECO: no se ha escrito nada. Con --escribir se sellan las listadas (con --solo, solo esas).');
    process.exit(0);
}

let hechas = 0;
for (const f of filas) {
    if (!f.precio) continue;
    const { error: e } = await supabase.rpc('oportunidad_merge_inputs', { p_id: f.op.id, p_patch: { cae_client_rate: f.precio } });
    if (e) { console.error(`✗ ${f.op.id_oportunidad}: ${e.message}`); continue; }
    hechas++;
}
console.log(`\n✓ Selladas ${hechas} oportunidades.`);
