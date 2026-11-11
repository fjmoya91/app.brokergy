// ============================================================================
// backfill_via_fm.mjs — la vía del FACTOR MULTIPLICADOR frente a la vigente, en
// las oportunidades guardadas ANTES de que el guardado la escribiera.
//
//   node implementation/backend/scripts/backfill_via_fm.mjs                    (en seco)
//   node implementation/backend/scripts/backfill_via_fm.mjs --solo 26RES060_OP301,26RES060_OP12
//   node implementation/backend/scripts/backfill_via_fm.mjs --precio-fm 110   (SOLO MIRAR: ¿y si la vía FM fuera a 110 €/MWh en todas?)
//
// El precio de la vía FM es el de cada oportunidad (`caePriceClientFm`, que solo teclea
// ADMIN; sin teclear, el general), como hace la calculadora.
//   node implementation/backend/scripts/backfill_via_fm.mjs --informe ruta.json
//   node implementation/backend/scripts/backfill_via_fm.mjs --escribir [--forzar]
//
// EN SECO POR DEFECTO: local escribe en la Supabase de PRODUCCIÓN.
//
// Qué hace:
//  1. OPORTUNIDADES — recalcula la vía FM con el motor PUBLICADO (logic/res060fc.js,
//     BOE-A-2026-23367) desde lo guardado, con `viaFmDesdeDatosCalculo` (logic/viaFm.js):
//     las mismas entradas y valores por defecto que la calculadora. El € sale de las
//     reglas guardadas en `result.financials` (el bono es lineal en los MWh; se
//     comprueba aquí rehaciendo el bono VIGENTE y contando cuántos casan).
//     Se piden SOLO los campos que hacen falta (regla 22), nunca `datos_calculo` entero.
//  2. EXPEDIENTES RES060/RES093 con CEE — SOLO MIDE, no escribe nada. Recalcula las
//     dos vías con lo del expediente (CEE inicial/final, η de la caldera, SCOP del
//     equipo, fechas de la obra y tramitación), espejo de `computeExpedienteFinancialsNode`
//     y del bloque FM de ExpedienteDetailView. Dice cuántos se podrían pedir por FM y
//     cuántos ganarían.
//
// Con `--escribir` guarda el resumen en `datos_calculo.via_fm` con la RPC
// `oportunidades_set_via_fm` (scripts/oportunidad_set_via_fm.sql): solo esa clave,
// sin mover `updated_at`, y sin pisar uno que ya exista (salvo `--forzar`).
// ============================================================================
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
const { acsComputaAhorro } = require('../utils/aerotermiaUnits');

const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { viaFmDesdeDatosCalculo, bonoConKwh, VIA_FM_VERSION } = await front('calculator/logic/viaFm.js');
const { calculateRes060FM, contextoCalderaFc, tramiteFc, esEmisorAireAire, FM_CUPO_KWH } = await front('calculator/logic/res060fc.js');
const calc = await front('calculator/logic/calculation.js');
const { calcCifo } = await front('expedientes/logic/calcCifo.js');
const { resolveDacs } = await front('expedientes/logic/demandaAcs.js');
const { entradasFmExpediente } = await front('expedientes/logic/fmExpediente.js');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ESCRIBIR = process.argv.includes('--escribir');
const FORZAR = process.argv.includes('--forzar');
const PRECIO_FM = arg('--precio-fm') != null ? Number(arg('--precio-fm')) : null;
const INFORME = arg('--informe');
const SOLO = arg('--solo') ? new Set(arg('--solo').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) : null;
const HOY = new Date().toISOString().slice(0, 10);

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('es-ES');
const n1 = (v) => (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))}`;

// ─── 1. OPORTUNIDADES ────────────────────────────────────────────────────────
// Campos CONCRETOS (regla 22). `->` y no `->>`: así los booleanos y números llegan
// con su tipo (`isParticular === false` decide el IVA del bono).
const I = (k) => `i_${k}:datos_calculo->inputs->${k}`;
const CEE = (fase, k) => `${fase}_${k}:datos_calculo->inputs->${fase === 'ci' ? 'xmlDemandData' : 'xmlDemandDataFinal'}->${k}`;
const CEE_K = ['demandaCalefaccion', 'superficieHabitable', 'emisionesLetra', 'epnrLetra'];
// RES080_FM: lo que `calculateRes080FM` lee del CEE y del RES080 vigente guardado.
const CEE_K080 = ['demandaRefrigeracion', 'energiaFinalVectores'];
const RES080_K = ['totalEnergiaInicialAno', 'totalEnergiaFinalAno', 'ahorroEnergiaFinalTotal',
    'superficieFinalAplicada', 'superficieAplicada',
    'energiaCalefInicial', 'energiaAcsInicial', 'energiaRefInicial',
    'energiaCalefFinal', 'energiaAcsFinal', 'energiaRefFinal'];
const FIN_K = ['caeBonus', 'finalPriceClient', 'legalizationCost', 'isParticular', 'includeIVA'];
const SELECT_OP = [
    'id, id_oportunidad, ficha, created_at',
    'estado:datos_calculo->>estado', 'origen:datos_calculo->>origen',
    'dc_anio:datos_calculo->anio', 'dc_zona:datos_calculo->zona', 'dc_surface:datos_calculo->surface',
    'via_actual:datos_calculo->via_fm',
    ...['provincia', 'provinceCode', 'anio', 'tipo', 'tipoInmueble', 'zona', 'manualSuperficie',
        'superficieCalefactable', 'superficie', 'boilerEff', 'boilerId', 'boilerHeatingType', 'fuelType',
        'scopHeating', 'scopAcs', 'changeAcs', 'changeHeating', 'sector', 'isReforma', 'comparativaReforma', 'hibridacion',
        // El precio general y el de la vía FM (`caePriceClientFm`, sin teclear = el general).
        'caePriceClient', 'caePriceClientFm',
        // RES080_FM (solo reforma): los kWh tecleados de los dos CEE simulados.
        'efSimBC', 'efSimRest',
        // La cifra PRUDENTE (11/11/2026): la potencia de la bomba (solo cuenta la del
        // catálogo, `aerothermiaModel`), la temporada del SCOP para sus horas, y lo de
        // la hibridación que `entradasFmClima` lee como la calculadora.
        'potenciaBomba', 'aerothermiaModel', 'scopTemporada', 'potenciaCaldera', 'hibridacionMetodo'].map(I),
    'i_placa_comb:datos_calculo->inputs->placa_caldera->combustible',
    ...CEE_K.map(k => CEE('ci', k)), ...CEE_K.map(k => CEE('cf', k)),
    ...CEE_K080.map(k => CEE('ci', k)), ...CEE_K080.map(k => CEE('cf', k)),
    ...RES080_K.map(k => `r080_${k}:datos_calculo->result->res080->${k}`),
    ...FIN_K.map(k => `f080_${k}:datos_calculo->result->financialsRes080->${k}`),
    'r_kwh:datos_calculo->result->savings->savingsKwh',
    'r_bono:datos_calculo->result->financials->caeBonus',
    'r_precio:datos_calculo->result->financials->finalPriceClient',
    'r_legal:datos_calculo->result->financials->legalizationCost',
    'r_part:datos_calculo->result->financials->isParticular',
    'r_iva:datos_calculo->result->financials->includeIVA',
    'r_qnet:datos_calculo->result->Q_net',
    'r_hyb_cov:datos_calculo->result->hybridization->coverage',
    'r_hyb_ref:datos_calculo->result->hybridization->refPower',
    'r_hyb_cb:datos_calculo->result->hybridization->cb',
    'r_fm_sup:datos_calculo->result->res060fc->superficie',
    'r_fm_cae_guardado:datos_calculo->result->res060fc->cae',
].join(', ');

const ops = [];
for (let desde = 0; ; desde += 200) {
    const { data, error } = await supabase.from('oportunidades').select(SELECT_OP)
        .order('created_at', { ascending: true }).range(desde, desde + 199);
    if (error) { console.error('No se pudieron leer las oportunidades:', error.message); process.exit(1); }
    ops.push(...(data || []));
    if (!data || data.length < 200) break;
}

const ceeDe = (o, f) => {
    const c = Object.fromEntries([...CEE_K, ...CEE_K080].map(k => [k, o[`${f}_${k}`]]));
    return (c.demandaCalefaccion != null || c.superficieHabitable != null) ? c : null;
};
function datosCalculoDe(o) {
    const inputs = {};
    for (const k of Object.keys(o)) if (k.startsWith('i_') && o[k] != null) inputs[k.slice(2)] = o[k];
    if (o.i_placa_comb) inputs.placa_caldera = { combustible: o.i_placa_comb };
    delete inputs.placa_comb;
    inputs.xmlDemandData = ceeDe(o, 'ci');
    inputs.xmlDemandDataFinal = ceeDe(o, 'cf');
    const result = {
        ...(o.r_kwh != null ? { savings: { savingsKwh: o.r_kwh } } : {}),
        ...(o.r_bono != null ? { financials: { caeBonus: o.r_bono, finalPriceClient: o.r_precio, legalizationCost: o.r_legal, isParticular: o.r_part, includeIVA: o.r_iva } } : {}),
        Q_net: o.r_qnet,
        hybridization: o.r_hyb_cov != null ? { coverage: o.r_hyb_cov, refPower: o.r_hyb_ref, cb: o.r_hyb_cb } : null,
        res060fc: o.r_fm_sup != null ? { superficie: o.r_fm_sup } : undefined,
    };
    const sub = (p, keys) => {
        const s = {};
        for (const k of keys) if (o[`${p}_${k}`] != null) s[k] = o[`${p}_${k}`];
        return Object.keys(s).length ? s : undefined;
    };
    result.res080 = sub('r080', RES080_K);
    result.financialsRes080 = sub('f080', FIN_K);
    return { anio: o.dc_anio, zona: o.dc_zona, surface: o.dc_surface, inputs, result };
}

const vivas = ops.filter(o => o.origen !== 'migracion_xml' && (!SOLO || SOLO.has(String(o.id_oportunidad).toUpperCase())));
const filas = [];
let rehechas = 0, casan = 0;
for (const o of vivas) {
    const dc = datosCalculoDe(o);
    const fin = dc.result.financials;
    if (fin && dc.result.savings) {
        rehechas++;
        if (Math.abs(bonoConKwh(fin, dc.result.savings.savingsKwh) - (Number(fin.caeBonus) || 0)) < 1) casan++;
    }
    let via = null, fallo = null;
    try { via = viaFmDesdeDatosCalculo(dc, { precioFm: PRECIO_FM, hoy: HOY }); } catch (e) { fallo = e.message; }
    filas.push({ o, via, fallo, ficha: o.ficha, borrador: Number(o.r_fm_cae_guardado) || null });
}

const conVia = filas.filter(f => f.via);
const aplican = conVia.filter(f => f.via.aplica);
const elegibles = aplican.filter(f => f.via.elegible);
const ganan = elegibles.filter(f => f.via.eur_fm - f.via.eur_vigente >= 1);
const pierden = elegibles.filter(f => f.via.eur_fm - f.via.eur_vigente <= -1);
const suma = (l, k) => l.reduce((s, f) => s + (Number(f.via[k]) || 0), 0);
const conCee = elegibles.filter(f => f.via.dcal && f.via.dcal !== 'simulacion');
const ESTADOS_VIVOS = new Set(['LEAD', 'PTE ENVIAR', 'EN CURSO', 'ENVIADA', 'PRE-ACEPTADO']);
const vivasCapt = elegibles.filter(f => ESTADOS_VIVOS.has(String(f.o.estado || '').toUpperCase()));

console.log(`\n══ OPORTUNIDADES ══  (motor ${conVia[0]?.via.normativa || 'FM'} · hoy ${HOY}${PRECIO_FM != null ? ` · vía FM a ${PRECIO_FM} €/MWh` : ' · mismo €/MWh que la vigente'})`);
console.log(`Leídas ${ops.length} (sin las migradas: ${vivas.length}) · con cálculo FM: ${conVia.length} · sin datos para calcular: ${filas.length - conVia.length}${filas.some(f => f.fallo) ? ` (con error: ${filas.filter(f => f.fallo).length})` : ''}`);
console.log(`Comprobación del € — bono VIGENTE rehecho con la regla lineal = guardado: ${casan} de ${rehechas}`);
console.log(`No aplica (terciario): ${conVia.length - aplican.length} · bloqueadas (no se podrían pedir): ${aplican.length - elegibles.length} · elegibles: ${elegibles.length} (con CEE: ${conCee.length}, D_cal estimada: ${elegibles.length - conCee.length})`);
console.log(`De las elegibles: ganan con FM ${ganan.length} · pierden ${pierden.length} · igual ${elegibles.length - ganan.length - pierden.length}`);
console.log(`MWh elegibles  — vigente ${n1(suma(elegibles, 'mwh_vigente'))} · FM ${n1(suma(elegibles, 'mwh_fm'))} · mejor de las dos ${n1(elegibles.reduce((s, f) => s + Math.max(f.via.mwh_vigente, f.via.mwh_fm), 0))}`);
console.log(`Bono elegibles — vigente ${n0(suma(elegibles, 'eur_vigente'))} € · FM ${n0(suma(elegibles, 'eur_fm'))} € · ganancia si se pide por FM solo donde gana: ${sg(ganan.reduce((s, f) => s + f.via.eur_fm - f.via.eur_vigente, 0))} €`);
console.log(`En captación viva (LEAD…PRE-ACEPTADO): ${vivasCapt.length} elegibles · ganan ${vivasCapt.filter(f => f.via.eur_fm - f.via.eur_vigente >= 1).length} · ${sg(vivasCapt.reduce((s, f) => s + Math.max(0, f.via.eur_fm - f.via.eur_vigente), 0))} €`);
console.log(`Cupo de la Resolución: ${n0(FM_CUPO_KWH / 1e6)} GWh — lo nuestro elegible por FM: ${n1(suma(elegibles, 'mwh_fm') / 1000)} GWh/a`);
{
    // La cifra PRUDENTE (sin el ACS supuesto / como hibridación si la bomba no llega).
    const pru = elegibles.filter(f => f.via.eur_fm_prudente != null);
    const tiene = (f, m) => String(f.via.prudente || '').split(',').includes(m);
    const pruEur = elegibles.reduce((s, f) => s + (f.via.eur_fm_prudente ?? f.via.eur_fm), 0);
    console.log(`Prudente: ${pru.length} elegibles con cifra prudente (ACS supuesto ${pru.filter(f => tiene(f, 'acs')).length} · bomba que no llega ${pru.filter(f => tiene(f, 'potencia')).length}) — bono FM ${n0(suma(elegibles, 'eur_fm'))} € → prudente ${n0(pruEur)} € · por debajo de la vigente: ${pru.filter(f => f.via.eur_fm_prudente < f.via.eur_vigente).length}`);
}

const motivos = {};
for (const f of aplican.filter(f => !f.via.elegible)) {
    const m = String(f.via.motivo || '?').replace(/\d{2}\/\d{2}\/\d{4}/g, 'dd/mm/aaaa').slice(0, 110);
    motivos[m] = (motivos[m] || 0) + 1;
}
console.log('\nPor qué no se podrían pedir:');
for (const [m, n] of Object.entries(motivos).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${m}`);

const porFicha = {};
for (const f of elegibles) { const k = f.via.ficha; (porFicha[k] ||= []).push(f); }
console.log('\nElegibles por ficha FM:');
for (const [k, l] of Object.entries(porFicha)) console.log(`  ${k.padEnd(11)} ${String(l.length).padStart(4)} · ganan ${String(l.filter(f => f.via.eur_fm - f.via.eur_vigente >= 1).length).padStart(3)} · vigente ${n1(suma(l, 'mwh_vigente')).padStart(8)} MWh · FM ${n1(suma(l, 'mwh_fm')).padStart(8)} MWh`);

const top = [...elegibles].sort((a, b) => (b.via.eur_fm - b.via.eur_vigente) - (a.via.eur_fm - a.via.eur_vigente));
const linea = (f) => [
    String(f.o.id_oportunidad).padEnd(18), String(f.o.estado || '').padEnd(13), f.via.ficha.padEnd(10),
    `${n1(f.via.mwh_vigente)}`.padStart(7), '→', `${n1(f.via.mwh_fm)} MWh`.padEnd(11),
    `${n0(f.via.eur_vigente)}`.padStart(7), '→', `${n0(f.via.eur_fm)} €`.padEnd(9), sg(f.via.eur_fm - f.via.eur_vigente).padStart(8),
    f.via.ficha === 'RES080_FM' ? (f.via.estimada ? ' ≈ simulados estimados' : ' simulados')
        : f.via.dcal === 'simulacion' ? ' ≈ sin CEE' : ` ${f.via.dcal}`,
].join(' ');
console.log('\nLas que MÁS ganan:');
top.slice(0, 12).forEach(f => console.log('  ' + linea(f)));
console.log('Las que MÁS pierden:');
top.slice(-6).reverse().forEach(f => console.log('  ' + linea(f)));

// Borrador (lo que guardó la calculadora con el motor viejo) frente a la publicada.
const conBorrador = filas.filter(f => f.via && f.borrador);
if (conBorrador.length) {
    const b = conBorrador.reduce((s, f) => s + f.borrador, 0) / 1000;
    const p = conBorrador.reduce((s, f) => s + f.via.mwh_fm, 0);
    console.log(`\nBorrador guardado (FC) frente a la publicada (FM), en las ${conBorrador.length} que tenían cálculo del borrador: ${n1(b)} → ${n1(p)} MWh`);
}

// ─── 2. EXPEDIENTES (solo se mide) ───────────────────────────────────────────
const { BOILER_EFFICIENCIES, calculateSavings, calculateFinancials, calculateHybridization, resolveHybridInputs, CAE_PRECIO_CLIENTE_ANTERIOR } = calc;
const exps = [];
for (let desde = 0; ; desde += 100) {
    const { data, error } = await supabase.from('expedientes')
        .select(`id, numero_expediente, estado, lote_id, oportunidad_id, instalacion, ${CEE_ECO_SELECT},`
            + ' d_pruebas:documentacion->fecha_pruebas_cert_instalacion, d_facturas:documentacion->facturas,'
            + ' d_ini:documentacion->fecha_inicio_cifo_manual, d_fin:documentacion->fecha_fin_cifo_manual')
        .order('numero_expediente', { ascending: true }).range(desde, desde + 99);
    if (error) { console.error('No se pudieron leer los expedientes:', error.message); process.exit(1); }
    exps.push(...(data || []).map(rebuildCee));
    if (!data || data.length < 100) break;
}
const resExp = [];
for (const exp of exps) {
    const num = String(exp.numero_expediente || '');
    if (!/RES060|RES093/.test(num)) continue;
    if (SOLO && !SOLO.has(num.toUpperCase())) continue;
    const cee = exp.cee || {};
    const ceeBase = cee.cee_inicial || cee.cee_final || {};
    const S = parseFloat(ceeBase.superficieHabitable) || 0;
    const q = (parseFloat(ceeBase.demandaCalefaccion) || 0) * S;
    if (!(S > 0 && q > 0)) { resExp.push({ num, exp, nota: 'sin CEE con demanda' }); continue; }
    // `inputs` de UNA oportunidad, sola: la economía lo necesita entero (como precio_cae_sello_pendientes).
    const { data: op } = await supabase.from('oportunidades')
        .select('id, ficha, inputs:datos_calculo->inputs, zona:datos_calculo->zona, anio:datos_calculo->anio').eq('id', exp.oportunidad_id).maybeSingle();
    if (!op) { resExp.push({ num, exp, nota: 'sin oportunidad' }); continue; }
    const opInputs = op.inputs || {};
    const inst = exp.instalacion || {};
    const ficha = num.includes('RES093') ? 'RES093' : 'RES060';
    // Espejo de computeExpedienteFinancialsNode (vía vigente)…
    const dacs = resolveDacs(cee, ceeBase).value;
    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEff = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
    const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
    const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);
    const changeAcs = acsComputaAhorro(inst);
    let hyb = null, cb = 1;
    if (ficha === 'RES093' || inst.hibridacion || opInputs.hibridacion) {
        hyb = calculateHybridization({ demandAnnual: q, zone: op.zona || 'D3', ...resolveHybridInputs(inst, opInputs, op.zona) });
        cb = hyb.cb;
    }
    const sv = calculateSavings({ q_net_heating: q, dacs: inst.cambio_acs !== false ? dacs : 0, boilerEff, scopHeating, scopAcs, cb, changeAcs });
    const ov = inst.economico_override || {};
    const inclCom = ov.include_commission ?? !!opInputs.include_commission;
    const finArgs = {
        presupuesto: ov.presupuesto ?? (parseFloat(inst.presupuesto_final) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
        caePriceClient: ov.cae_client_rate ?? (parseFloat(opInputs.cae_client_rate) || CAE_PRECIO_CLIENTE_ANTERIOR.estandar),
        caePriceSO: ov.cae_so_rate ?? (parseFloat(opInputs.cae_so_rate) || 160),
        caePricePrescriptor: inclCom ? (parseFloat(ov.cae_prescriptor_rate ?? opInputs.cae_prescriptor_rate) || 0) : 0,
        prescriptorMode: ov.cae_prescriptor_mode ?? opInputs.cae_prescriptor_mode ?? 'brokergy',
        discountCertificates: ov.discount_certificates ?? !!opInputs.discount_certificates,
        certificatesCost: ov.certificates_cost ?? opInputs.certificates_cost ?? 250,
        includeLegalization: ov.include_legalization ?? !!opInputs.include_legalization,
        legalizationMode: ov.legalization_mode ?? opInputs.legalization_mode ?? 'client',
        includeIrpf: true,
    };
    const finVig = calculateFinancials({ ...finArgs, savingsKwh: sv.savingsKwh });
    // …y la vía FM con las MISMAS variables, como el bloque FM de ExpedienteDetailView.
    const fechas = calcCifo({ fecha_pruebas_cert_instalacion: exp.d_pruebas, facturas: exp.d_facturas || [], fecha_inicio_cifo_manual: exp.d_ini, fecha_fin_cifo_manual: exp.d_fin });
    const fm = calculateRes060FM({
        provinciaCode: opInputs.provincia || opInputs.provinceCode,
        anio: opInputs.anio || op.anio,
        tipo: opInputs.tipo || (opInputs.housing_type === 'flat' ? 'piso' : 'unifamiliar'),
        bloque: String(opInputs.tipoInmueble || '').toLowerCase() === 'bloque',
        zona: op.zona || opInputs.zona || cee.cee_inicial?.zonaClimatica,
        superficie: S, boilerEff, boilerId: boilerEffId, scopHeating, scopAcs, changeAcs,
        changeHeating: inst.cambio_calefaccion !== false, qCalefaccion: q,
        ceeFinal: cee.cee_final, ceeInicial: cee.cee_inicial,
        hibridacion: hyb ? { coverage: hyb.coverage, refPower: hyb.refPower, cb: hyb.cb } : null,
        contexto: {
            ...contextoCalderaFc(opInputs, boilerEffId), ceeFinal: cee.cee_final,
            inicioObra: fechas.inicio, finObra: fechas.fin,
            tramite: tramiteFc(exp.estado, exp.lote_id), aireAire: esEmisorAireAire(inst.tipo_emisor), hoy: HOY,
        },
        // Como el detalle: η del ACS existente, potencia de la bomba y su temporada.
        ...entradasFmExpediente({ inst, opInputs, calcInputs: opInputs, zona: op.zona || opInputs.zona, boilerEffValue: boilerEff }),
    });
    if (!fm) { resExp.push({ num, exp, nota: 'el motor FM no da cifra' }); continue; }
    const finFm = calculateFinancials({ ...finArgs, ...(PRECIO_FM != null ? { caePriceClient: PRECIO_FM } : {}), savingsKwh: fm.cae });
    const finPru = fm.prudente ? calculateFinancials({ ...finArgs, ...(PRECIO_FM != null ? { caePriceClient: PRECIO_FM } : {}), savingsKwh: fm.prudente.cae }) : null;
    const bloquea = (fm.avisos || []).find(a => a.tono === 'bloquea');
    resExp.push({
        num, exp, ficha: fm.ficha, kwhVig: sv.savingsKwh, kwhFm: fm.cae, eurVig: finVig.caeBonus, eurFm: finFm.caeBonus,
        elegible: fm.elegible !== false, motivo: bloquea?.texto || null, dcal: fm.dcalFuente, inicio: fechas.inicio,
        ...(finPru ? { kwhPru: fm.prudente.cae, eurPru: finPru.caeBonus, prudente: fm.prudente.motivos.join(',') } : {}),
        ...(fm.potencia?.noCubre ? { potenciaPct: Math.round(fm.potencia.cobertura * 100) } : {}),
    });
}
const eCal = resExp.filter(r => r.kwhFm != null);
const eEle = eCal.filter(r => r.elegible);
const eGan = eEle.filter(r => r.eurFm - r.eurVig >= 1);
console.log(`\n══ EXPEDIENTES RES060/RES093 ══  (solo se mide)`);
console.log(`Con CEE y cálculo: ${eCal.length} · sin CEE con demanda u oportunidad: ${resExp.length - eCal.length}`);
console.log(`Se podrían pedir por FM: ${eEle.length} · ganan ${eGan.length} · ${sg(eGan.reduce((s, r) => s + r.eurFm - r.eurVig, 0))} €`);
console.log(`MWh de todos los calculados — vigente ${n1(eCal.reduce((s, r) => s + r.kwhVig, 0) / 1000)} · FM ${n1(eCal.reduce((s, r) => s + r.kwhFm, 0) / 1000)}`);
{
    const ePru = eEle.filter(r => r.eurPru != null);
    console.log(`Prudente: ${ePru.length} elegibles con cifra prudente (bomba que no llega ${ePru.filter(r => r.potenciaPct != null).length}) — bono FM ${n0(eEle.reduce((s, r) => s + r.eurFm, 0))} € → prudente ${n0(eEle.reduce((s, r) => s + (r.eurPru ?? r.eurFm), 0))} € · por debajo de la vigente: ${ePru.filter(r => r.eurPru < r.eurVig).length}`);
}
const eMot = {};
for (const r of eCal.filter(r => !r.elegible)) { const m = String(r.motivo || '?').replace(/\d{2}\/\d{2}\/\d{4}/g, 'dd/mm/aaaa').slice(0, 110); eMot[m] = (eMot[m] || 0) + 1; }
console.log('Por qué no:');
for (const [m, n] of Object.entries(eMot).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${m}`);
if (eEle.length) {
    console.log('Los elegibles:');
    for (const r of [...eEle].sort((a, b) => (b.eurFm - b.eurVig) - (a.eurFm - a.eurVig))) {
        console.log(`  ${r.num.padEnd(15)} ${String(r.exp.estado || '').slice(0, 22).padEnd(23)} ${r.ficha.padEnd(10)} ${n1(r.kwhVig / 1000).padStart(7)} → ${n1(r.kwhFm / 1000).padEnd(7)} MWh  ${n0(r.eurVig).padStart(7)} → ${n0(r.eurFm).padEnd(7)} €  ${sg(r.eurFm - r.eurVig).padStart(8)}  inicio ${r.inicio || '—'}`);
    }
}

if (INFORME) {
    fs.writeFileSync(INFORME, JSON.stringify({
        hoy: HOY, precio_fm: PRECIO_FM,
        oportunidades: filas.filter(f => f.via).map(f => ({ id_oportunidad: f.o.id_oportunidad, estado: f.o.estado, ...f.via })),
        expedientes: resExp.map(({ exp, ...r }) => ({ ...r, estado: exp.estado, lote: !!exp.lote_id })),
    }, null, 1));
    console.log(`\nInforme completo: ${INFORME}`);
}

// ─── 3. ESCRIBIR ─────────────────────────────────────────────────────────────
const aEscribir = conVia.filter(f => FORZAR || !f.o.via_actual);
if (!ESCRIBIR) {
    console.log(`\nEN SECO: no se ha escrito nada. Con --escribir se guardaría via_fm (v${VIA_FM_VERSION}) en ${aEscribir.length} oportunidades${FORZAR ? ' (forzando)' : ' que aún no lo tienen'}.`);
    process.exit(0);
}
if (PRECIO_FM != null) { console.error('\n--precio-fm es para MIRAR: no se escribe con otro precio.'); process.exit(1); }
let escritas = 0;
for (let i = 0; i < aEscribir.length; i += 100) {
    const lote = aEscribir.slice(i, i + 100).map(f => ({ id: f.o.id, via: f.via }));
    const { data, error } = await supabase.rpc('oportunidades_set_via_fm', { p_filas: lote, p_forzar: FORZAR });
    if (error) {
        console.error(`\nNo se pudo escribir (¿falta aplicar scripts/oportunidad_set_via_fm.sql?): ${error.message}`);
        process.exit(1);
    }
    escritas += Number(data) || 0;
}
console.log(`\nEscrito via_fm en ${escritas} oportunidades (de ${aEscribir.length} candidatas).`);
