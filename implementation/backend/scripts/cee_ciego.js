#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// El CEE «A CIEGAS» de las oportunidades, desde el PC (CE3X 3.2 es de Windows).
// La cifra va APARTE: no cambia nada de lo que se ofrece. Diseño y medidas:
// docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md
//
//   node scripts/cee_ciego.js calcular <id_oportunidad> [--escribir] [--forzar]
//       Una oportunidad. Sin --escribir, en seco: dice qué guardaría.
//   node scripts/cee_ciego.js pendientes
//       Las de captación viva que piden su cifra (nueva o con la huella cambiada).
//   node scripts/cee_ciego.js barrer [--escribir] [--max=5]
//       Las pendientes, en serie y con pausa (Catastro, reglas 15-17).
//   node scripts/cee_ciego.js contraste
//       Las que ya tienen CEE inicial real: real ÷ ciega y real ÷ calculadora.
//
// Solo escribe `datos_calculo.estimacion_ciega`, y solo con --escribir. Nada a Drive.
// ─────────────────────────────────────────────────────────────────────────────
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config({ quiet: true });
const supabase = require('../services/supabaseClient');
const ceeCiego = require('../services/cee/ceeCiego');

const [orden, ...resto] = process.argv.slice(2);
const flag = (f) => resto.includes(f);
const opt = (k, def) => { const a = resto.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const miles = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const eur = (n) => `${miles(n)} €`;
const dec = (n) => (n == null ? '—' : String(n).replace('.', ','));
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

function linea(r) {
    if (r.omitido && !r.estimacion) return `${r.id_oportunidad}: no entra — ${r.omitido}`;
    const e = r.estimacion;
    const señal = e.ratio > 1.3 ? '  ⚠ SE QUEDA CORTA: hacer el CEE antes de enviarla' : '';
    return [
        `${r.id_oportunidad}${r.omitido ? ` (${r.omitido})` : ''}`,
        `  a ciegas: ${dec(e.demanda_ciega)} kWh/m²·año × ${dec(e.superficie)} m² (simulada ${dec(e.superficie_simulada)} m²) · ${e.huecos} huecos`
            + `${e.cuerpos_fuera ? ` · ${e.cuerpos_fuera} cuerpo(s) fuera` : ''}`,
        `  ahorro ${miles(e.ahorro_kwh)} kWh/año · bono ${eur(e.bono)} · prudente (×${dec(e.coef)}) ${eur(e.bono_prudente)}`,
        `  calculadora: ahorro ${miles(e.ahorro_calculadora)} kWh/año · bono ${eur(e.bono_calculadora)} · ratio ${dec(e.ratio)}${señal}`,
        `  ${e.valida ? 'válida' : `NO válida: ${e.motivo_no_valida}`}${e.avisos ? ` · ${e.avisos}` : ''}`,
        r.escrito ? '  ✓ guardada en la oportunidad' : '  (en seco: no se ha guardado nada)',
    ].join('\n');
}

async function contraste() {
    const { data: ops, error } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, q_ciega:datos_calculo->estimacion_ciega->>q_ciega, '
            + 'q_calc:datos_calculo->estimacion_ciega->>q_calculadora, valida:datos_calculo->estimacion_ciega->>valida')
        .not('datos_calculo->estimacion_ciega', 'is', null);
    if (error) throw error;
    if (!ops?.length) { console.log('Ninguna oportunidad tiene aún cifra a ciegas.'); return; }
    const { data: exps, error: e2 } = await supabase.from('expedientes')
        .select('oportunidad_id, numero_expediente, dem:cee->cee_inicial->>demandaCalefaccion, sup:cee->cee_inicial->>superficieHabitable')
        .in('oportunidad_id', ops.map(o => o.id));
    if (e2) throw e2;
    const porOp = new Map((exps || []).map(x => [x.oportunidad_id, x]));
    const filas = [];
    for (const o of ops) {
        const x = porOp.get(o.id);
        const real = x && Number(x.dem) * Number(x.sup);
        if (!(real > 0)) continue;
        filas.push({ op: o.id_oportunidad, exp: x.numero_expediente, valida: o.valida === 'true',
            ciega: real / Number(o.q_ciega), calc: Number(o.q_calc) > 0 ? real / Number(o.q_calc) : null });
    }
    console.log(`${ops.length} con cifra a ciegas · ${filas.length} con CEE inicial real\n`);
    for (const f of filas) {
        console.log(`${f.op.padEnd(16)} ${f.exp.padEnd(14)} real÷ciega ${f.ciega.toFixed(2)} · real÷calculadora ${f.calc ? f.calc.toFixed(2) : '—'}${f.valida ? '' : ' (superficie sin confirmar)'}`);
    }
    const stats = (l) => {
        const v = l.filter(Number.isFinite).sort((a, b) => a - b);
        if (!v.length) return '—';
        const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(2);
        return `n ${v.length} · min ${v[0].toFixed(2)} · P10 ${q(0.1)} · mediana ${q(0.5)} · P90 ${q(0.9)} · por debajo de 1: ${v.filter(x => x < 1).length}`;
    };
    if (filas.length) {
        console.log(`\nreal ÷ ciega:        ${stats(filas.map(f => f.ciega))}`);
        console.log(`real ÷ calculadora:  ${stats(filas.map(f => f.calc))}`);
    }
}

(async () => {
    if (orden === 'calcular') {
        const clave = resto.find(a => !a.startsWith('--'));
        if (!clave) throw new Error('Dime la oportunidad: node scripts/cee_ciego.js calcular 26RES060_OP307');
        console.log(linea(await ceeCiego.calcularCiega(clave, { escribir: flag('--escribir'), forzar: flag('--forzar') })));
    } else if (orden === 'pendientes') {
        const l = await ceeCiego.pendientes();
        console.log(l.length ? l.map(o => `${o.id_oportunidad}${o.rehacer ? ' (rehacer: cambió la huella)' : ''}`).join('\n') : 'Ninguna pendiente.');
    } else if (orden === 'barrer') {
        const max = Number(opt('max', 5));
        const l = (await ceeCiego.pendientes()).slice(0, max);
        for (const o of l) {
            try { console.log(linea(await ceeCiego.calcularCiega(o.id, { escribir: flag('--escribir') }))); }
            catch (e) { console.log(`${o.id_oportunidad}: ✗ ${e.message}`); }
            await dormir(4000);
        }
    } else if (orden === 'contraste') {
        await contraste();
    } else {
        console.log('Órdenes: calcular <op> [--escribir] [--forzar] · pendientes · barrer [--escribir] [--max=5] · contraste');
    }
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
