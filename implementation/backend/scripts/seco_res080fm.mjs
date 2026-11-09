// ============================================================================
// seco_res080fm.mjs — la vía RES080_FM frente a la RES080 vigente, en los
// expedientes RES080 con los dos CEE y en las oportunidades de reforma con los
// dos .xml. SOLO LEE: no escribe nada en ninguna parte.
//
//   node implementation/backend/scripts/seco_res080fm.mjs
//   node implementation/backend/scripts/seco_res080fm.mjs --solo 26RES080_90,26RES080_95
//   node implementation/backend/scripts/seco_res080fm.mjs --informe ruta.json
//
// La cifra vigente es la del Económico del expediente (`computeExpedienteFinancialsNode`:
// `calculateRes080` con los CEE guardados y el precio sellado de la reforma); la FM,
// `calculateRes080FM` con esos mismos CEE. Sin CEE simulados (aún no los hay en
// ninguno) se ESTIMAN: la cifra es «≈».
// ============================================================================
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocal = path.join(__dirname, '../.env');
// En un worktree el .env no está: el del checkout principal.
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : path.join(__dirname, '../../../../../../implementation/backend/.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');

const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { calculateRes080FM } = await front('calculator/logic/res080fm.js');
const { tramiteFc, contextoCalderaFc } = await front('calculator/logic/res060fc.js');
const { calculateRes080, calculateFinancials, CAE_PRECIO_CLIENTE_ANTERIOR } = await front('calculator/logic/calculation.js');
const { calcCifo } = await front('expedientes/logic/calcCifo.js');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SOLO = arg('--solo') ? new Set(arg('--solo').split(',').map((s) => s.trim().toUpperCase())) : null;
const INFORME = arg('--informe');
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('es-ES');
const n1 = (v) => (Number(v) || 0).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n3 = (v) => (Number(v) || 0).toLocaleString('es-ES', { maximumFractionDigits: 3, minimumFractionDigits: 3 });

const ESTADOS_FIN = ['FINALIZADO', 'RECHAZADO'];
const exps = [];
for (let desde = 0; ; desde += 100) {
    const { data, error } = await supabase.from('expedientes')
        .select(`id, numero_expediente, estado, lote_id, oportunidad_id, inst_eco:instalacion->economico_override, inst_pres:instalacion->presupuesto_final, ${CEE_ECO_SELECT},`
            + ' d_pruebas:documentacion->fecha_pruebas_cert_instalacion, d_facturas:documentacion->facturas,'
            + ' d_ini:documentacion->fecha_inicio_cifo_manual, d_fin:documentacion->fecha_fin_cifo_manual')
        .ilike('numero_expediente', '%RES080%')
        .order('numero_expediente', { ascending: true }).range(desde, desde + 99);
    if (error) { console.error('No se pudieron leer los expedientes:', error.message); process.exit(1); }
    exps.push(...(data || []).map(rebuildCee));
    if (!data || data.length < 100) break;
}

const filas = [];
for (const exp of exps) {
    const num = String(exp.numero_expediente || '');
    if (SOLO && !SOLO.has(num.toUpperCase())) continue;
    const cee = exp.cee || {};
    if (!cee.cee_inicial || !cee.cee_final) { filas.push({ num, estado: exp.estado, nota: 'sin los dos CEE' }); continue; }
    const { data: op } = await supabase.from('oportunidades')
        .select('id, inputs:datos_calculo->inputs').eq('id', exp.oportunidad_id).maybeSingle();
    const opInputs = op?.inputs || {};
    const res080 = calculateRes080({
        xmlInicial: cee.cee_inicial, xmlFinal: cee.cee_final,
        combAcsInicial: cee.comb_acs_inicial, combAcsFinal: cee.comb_acs_final,
        combCalefaccionInicial: cee.comb_cal_inicial, combCalefaccionFinal: cee.comb_cal_final,
        combRefrigeracionInicial: cee.comb_ref_inicial, combRefrigeracionFinal: cee.comb_ref_final,
        superficieCustom: cee.superficie_custom,
    });
    if (!res080) { filas.push({ num, estado: exp.estado, nota: 'sin RES080' }); continue; }
    const ov = exp.inst_eco || {};
    const finArgs = {
        presupuesto: ov.presupuesto ?? (parseFloat(exp.inst_pres) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
        caePriceClient: ov.cae_client_rate ?? (parseFloat(opInputs.cae_client_rate_res080) || parseFloat(opInputs.cae_client_rate) || CAE_PRECIO_CLIENTE_ANTERIOR.res080),
        caePriceSO: ov.cae_so_rate ?? 140,
        includeIrpf: true,
    };
    const fechas = calcCifo({ fecha_pruebas_cert_instalacion: exp.d_pruebas, facturas: exp.d_facturas || [], fecha_inicio_cifo_manual: exp.d_ini, fecha_fin_cifo_manual: exp.d_fin });
    const fm = calculateRes080FM({
        res080, ceeInicial: cee.cee_inicial, ceeFinal: cee.cee_final,
        tipo: opInputs.tipo || (opInputs.housing_type === 'flat' ? 'piso' : 'unifamiliar'),
        bloque: String(opInputs.tipoInmueble || '').toLowerCase() === 'bloque',
        contexto: {
            ...contextoCalderaFc(opInputs),
            inicioObra: fechas?.inicio || null, finObra: fechas?.fin || null,
            tramite: tramiteFc(exp.estado, exp.lote_id),
        },
    });
    const vig = calculateFinancials({ ...finArgs, savingsKwh: res080.ahorroEnergiaFinalTotal });
    const conFm = fm.cae > 0 ? calculateFinancials({ ...finArgs, savingsKwh: fm.cae }) : null;
    filas.push({
        num, estado: exp.estado, cerrado: ESTADOS_FIN.includes(String(exp.estado || '').toUpperCase()),
        tipologia: fm.tipologiaLabel, fM: fm.fm,
        mwh_vig: res080.ahorroEnergiaFinalTotal / 1000, mwh_fm: fm.cae / 1000,
        eur_vig: vig.caeBonus, eur_fm: conFm?.caeBonus ?? 0, precio: finArgs.caePriceClient,
        ef_i: fm.efI, ef_f: fm.efF, sim_bc: fm.efSimBC, sim_rest: fm.efSimRest, factor: fm.factor,
        mwh_ahorros: (fm.caeAhorros || 0) / 1000,
        dcal: `${n1(fm.dcalInicial)}→${n1(fm.dcalFinal)}`,
        estimada: fm.estimada, elegible: fm.elegible,
        bloquea: fm.avisos.filter((a) => a.tono === 'bloquea').map((a) => a.texto),
        avisos: fm.avisos.filter((a) => a.tono === 'aviso').map((a) => a.texto.slice(0, 90)),
    });
}

const calc = filas.filter((f) => f.mwh_vig != null);
console.log(`\nExpedientes RES080: ${exps.length} · con los dos CEE y cálculo: ${calc.length} · sin: ${filas.length - calc.length}`);
console.log('\nnº                estado                     tipo  f_M  vig MWh  FM MWh  cociente  (ahorros)  vig €     FM €    +€      D_cal i→f      elegible');
for (const f of calc) {
    const motivo = f.elegible ? '' : `  ✗ ${String(f.bloquea[0] || '').slice(0, 70)}`;
    console.log(`${f.num.padEnd(17)} ${String(f.estado).slice(0, 26).padEnd(26)} ${String(f.tipologia).slice(0, 5).padEnd(5)} ${String(f.fM).padStart(3)}  ${n1(f.mwh_vig).padStart(7)}  ${(f.estimada ? '≈' : ' ') + n1(f.mwh_fm).padStart(6)}  ${f.factor ? n3(f.factor) : '  —  '}     ${n1(f.mwh_ahorros).padStart(6)}  ${n0(f.eur_vig).padStart(7)}  ${n0(f.eur_fm).padStart(7)}  ${n0(f.eur_fm - f.eur_vig).padStart(6)}  ${f.dcal.padEnd(13)}  ${f.elegible ? 'sí' : 'no'}${motivo}`);
}
const eleg = calc.filter((f) => f.elegible && f.mwh_fm > 0);
const vivos = eleg.filter((f) => !f.cerrado);
const sum = (a, k) => a.reduce((s, f) => s + (Number(f[k]) || 0), 0);
console.log(`\nElegibles con cifra: ${eleg.length} · ${n1(sum(eleg, 'mwh_vig'))} → ${n1(sum(eleg, 'mwh_fm'))} MWh · ${n0(sum(eleg, 'eur_vig'))} → ${n0(sum(eleg, 'eur_fm'))} € (+${n0(sum(eleg, 'eur_fm') - sum(eleg, 'eur_vig'))} €)`);
console.log(`  de ellos sin finalizar: ${vivos.length} · +${n0(sum(vivos, 'eur_fm') - sum(vivos, 'eur_vig'))} €`);
const motivos = {};
for (const f of calc.filter((x) => !x.elegible)) { const m = String(f.bloquea[0] || '').slice(0, 60); motivos[m] = (motivos[m] || 0) + 1; }
console.log('No elegibles por motivo:', motivos);
if (INFORME) { fs.writeFileSync(INFORME, JSON.stringify(filas, null, 2)); console.log(`Informe: ${INFORME}`); }
