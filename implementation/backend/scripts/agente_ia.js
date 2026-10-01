#!/usr/bin/env node
// ============================================================================
// agente_ia.js — el AGENTE IA, un certificador más (ver services/agenteIa.js).
//
// Lo usan las skills `generar-cee-inicial` y `generar-cee-final`:
//
//   node scripts/agente_ia.js cola
//        Lo que tiene encargado el agente y no ha terminado (y lo que dejó hecho
//        y espera revisión). Responde a «¿está hecho el CEE de X?».
//
//   node scripts/agente_ia.js empezar <clave> [--fase inicial|final] [--reasignar]
//        Al EMPEZAR: pone «AGENTE IA» en la barra de certificadores (si no hay
//        técnico; si lo hay, solo con --reasignar) y la fase pasa a «en trabajo».
//
//   node scripts/agente_ia.js terminar <clave> [--fase …] [--fichero-link URL]
//        [--fichero-nombre NOMBRE] [--carpeta-link URL] [--sin-aviso]
//        Al TERMINAR por otro camino (los dos generadores ya lo hacen solos al
//        escribir): «pendiente de revisión» y aviso por WhatsApp + email.
//
//   node scripts/agente_ia.js estado <clave>
//        Quién es el certificador y qué consta del agente en ese CEE.
//
// <clave> = nº del expediente (26RES060_186), de un CEE directo (2026CEE_55) o de
// una oportunidad (26RES060_OP246); el negocio se deduce del formato y se puede
// forzar con --origen cae|cee|op.
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const supabase = require('../services/supabaseClient');
const agenteIa = require('../services/agenteIa');

const [, , ORDEN, ...RESTO] = process.argv;
const POS = RESTO.filter(a => !a.startsWith('--'));
function opt(nombre) {
    const i = RESTO.findIndex(a => a === `--${nombre}` || a.startsWith(`--${nombre}=`));
    if (i < 0) return null;
    const a = RESTO[i];
    if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
    const sig = RESTO[i + 1];
    return sig && !sig.startsWith('--') ? sig : true;
}

/** De qué negocio es la clave. Mismo criterio que cee_inicial.js. */
function negocioDe(clave) {
    const o = opt('origen');
    if (o && o !== true) return o;
    if (/_OP\d+$/i.test(clave)) return 'op';
    if (/^\d{4}CEE_\d+$/i.test(clave)) return 'cee';
    return 'cae';
}
const faseOpt = () => agenteIa.normFase(opt('fase') === true ? 'inicial' : (opt('fase') || 'inicial'));
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

async function cola() {
    const filas = await agenteIa.cola();
    if (!filas.length) {
        console.log('\nEl AGENTE IA no tiene nada encargado ni pendiente de revisar.');
        return;
    }
    console.log(`\nAGENTE IA · ${filas.length} CEE\n`);
    for (const f of filas) {
        console.log(`  ${(f.numero || '').padEnd(15)} ${f.fase.padEnd(8)} ${f.situacion.padEnd(34)}`
            + ` ${f.cliente || '—'}${f.desde ? ` · desde ${fecha(f.desde)}` : ''}${f.fichero ? `\n${' '.repeat(18)}📄 ${f.fichero}` : ''}`);
    }
}

async function empezar() {
    const clave = POS[0];
    if (!clave) throw new Error('Uso: empezar <clave> [--fase inicial|final] [--reasignar]');
    const r = await agenteIa.empezar({ negocio: negocioDe(clave), clave, fase: faseOpt(),
                                       reasignar: RESTO.includes('--reasignar') });
    console.log(`\n${r.numero} · ${faseOpt()} · ${r.delAgente ? 'encargo del AGENTE IA' : `técnico: ${r.humano || '—'}`}`);
    for (const c of r.cambios) console.log(`  ✓ ${c}`);
    if (!r.cambios.length && r.delAgente) console.log('  (ya estaba marcado: nada que cambiar)');
    if (r.nota) console.log(`  ⚠ ${r.nota}`);
}

async function terminar() {
    const clave = POS[0];
    if (!clave) throw new Error('Uso: terminar <clave> [--fase …] [--fichero-link URL] [--sin-aviso]');
    const s = (k) => (opt(k) && opt(k) !== true ? opt(k) : undefined);
    const r = await agenteIa.terminar({
        negocio: negocioDe(clave), clave, fase: faseOpt(),
        fichero: { nombre: s('fichero-nombre'), link: s('fichero-link'), carpeta_link: s('carpeta-link') },
        aviso: !RESTO.includes('--sin-aviso'),
    });
    informeTerminar(r);
}

/** Lo que se imprime al terminar; lo comparten los dos generadores. */
function informeTerminar(r) {
    console.log(`\n🤖 AGENTE IA · ${r.numero}${r.reenvio ? ' (actualizado)' : ''}`);
    for (const c of r.cambios || []) console.log(`  ✓ ${c}`);
    if (!r.delAgente && r.humano) console.log(`  · el certificador sigue siendo ${r.humano}: no cambia de fase`);
    if (r.canales?.length) console.log(`  ✓ aviso enviado por ${r.canales.join(' + ')}`);
    else if (r.aviso === null) console.log('  · sin aviso (--sin-aviso)');
    for (const f of r.fallos || []) console.log(`  ✗ ${f}`);
}

async function estado() {
    const clave = POS[0];
    if (!clave) throw new Error('Uso: estado <clave>');
    const negocio = negocioDe(clave);
    if (negocio === 'op') {
        console.log('\nUna OPORTUNIDAD no tiene certificador ni fases: mira `cola` cuando sea expediente.');
        return;
    }
    const tabla = negocio === 'cee' ? 'cee_directos' : 'expedientes';
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(clave);
    const { data: f, error } = await supabase.from(tabla)
        .select('numero_expediente, estado, seguimiento, cert:cee->>certificador_id, agente_ia:cee->agente_ia')
        .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (error) throw new Error(error.message);
    if (!f) throw new Error(`No encuentro ${clave}.`);
    const ag = await agenteIa.agente();
    let tecnico = '— sin asignar';
    if (f.cert) {
        const { data: p } = await supabase.from('prescriptores')
            .select('razon_social, es_agente_ia').eq('id_empresa', f.cert).maybeSingle();
        tecnico = p?.es_agente_ia ? '🤖 AGENTE IA' : (p?.razon_social || f.cert);
    }
    console.log(`\n${f.numero_expediente} · ${f.estado}`);
    console.log(`  certificador: ${tecnico}${ag ? '' : '  (⚠ no existe la ficha del AGENTE IA)'}`);
    for (const fase of ['inicial', 'final']) {
        const k = fase === 'final' ? 'cee_final' : 'cee_inicial';
        const s = f.agente_ia?.[fase];
        console.log(`  ${fase.padEnd(8)} ${String(f.seguimiento?.[k] || '—').padEnd(16)}`
            + (s ? ` agente: ${s.estado}${s.terminado_at ? ` el ${fecha(s.terminado_at)}` : s.empezado_at ? ` desde ${fecha(s.empezado_at)}` : ''}`
                 + `${s.fichero ? ` · ${s.fichero}` : ''}` : ''));
    }
}

const ORDENES = { cola, empezar, terminar, estado };

if (require.main === module) {
    (async () => {
        const f = ORDENES[ORDEN];
        if (!f) {
            console.log(`Órdenes: ${Object.keys(ORDENES).join(' · ')}\nVer la cabecera de este fichero.`);
            process.exit(1);
        }
        await f();
        process.exit(0);
    })().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}

module.exports = { informeTerminar };
