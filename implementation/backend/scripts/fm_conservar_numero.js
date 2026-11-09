#!/usr/bin/env node
/**
 * fm_conservar_numero.js — Devuelve a cada expediente de la vía FM el CORRELATIVO que
 * tenía en la vigente (Fran, 09/11/2026: las dos vías comparten el contador de la
 * ficha y cambiar de vía conserva el número).
 *
 * Con la serie propia del 07/11/2026 el 26RES060_227 pasó a 26RES060FM_1. Este script
 * lee en el historial de cada `26RES0x0FM_N` el «<viejo> pasa a <actual>» de su paso
 * a la vía FM y lo renumera a `numeroEnOtraVia(<viejo>, true)` (26RES060FM_227):
 * número y correlativo, una línea en el historial y la carpeta de Drive enderezada
 * por `syncExpedienteFolder`, como hace `cambiarViaFm`.
 *
 * EN SECO por defecto (local = PRODUCCIÓN). Escribe solo con --escribir.
 *   node scripts/fm_conservar_numero.js
 *   node scripts/fm_conservar_numero.js --escribir
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const supabase = require('../services/supabaseClient');
const { esNumeroFm, numeroEnOtraVia } = require('../utils/fichas');

const ESCRIBIR = process.argv.includes('--escribir');

function numeroDeOrigen(exp) {
    const hist = Array.isArray(exp.documentacion?.historial) ? exp.documentacion.historial : [];
    const re = new RegExp(`(\\d{2}RES0(?:60|80|93)_\\d+) pasa a ${exp.numero_expediente}\\b`, 'i');
    for (let i = hist.length - 1; i >= 0; i--) {
        const m = String(hist[i]?.texto || '').match(re);
        if (m) return m[1].toUpperCase();
    }
    return null;
}

(async () => {
    const { data, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, correlativo, estado, lote_id, oportunidad_id, documentacion')
        .like('numero_expediente', '%FM\\_%');
    if (error) { console.error('No se pudo leer:', error.message); process.exit(1); }
    const fms = (data || []).filter((e) => esNumeroFm(e.numero_expediente));
    console.log(`${fms.length} expediente(s) de la vía FM.`);
    let cambios = 0;
    for (const exp of fms) {
        const origen = numeroDeOrigen(exp);
        if (!origen) { console.log(`  · ${exp.numero_expediente}: nació FM (sin paso en el historial) → se queda.`); continue; }
        const destino = numeroEnOtraVia(origen, true);
        if (!destino || destino.numero === exp.numero_expediente) { console.log(`  · ${exp.numero_expediente}: ya conserva su número (${origen}).`); continue; }
        if (exp.lote_id) { console.log(`  ✗ ${exp.numero_expediente}: está en un lote, no se toca.`); continue; }
        const { data: ocupado } = await supabase.from('expedientes').select('id').eq('numero_expediente', destino.numero).neq('id', exp.id).limit(1);
        if (ocupado?.length) { console.log(`  ✗ ${exp.numero_expediente}: ${destino.numero} ya lo tiene otro expediente.`); continue; }
        cambios++;
        console.log(`  → ${exp.numero_expediente} (era ${origen}) pasa a ${destino.numero} · correlativo ${exp.correlativo} → ${destino.correlativo} · ${exp.estado}`);
        if (!ESCRIBIR) continue;

        const { error: upErr } = await supabase.from('expedientes')
            .update({ numero_expediente: destino.numero, correlativo: destino.correlativo, updated_at: new Date().toISOString() })
            .eq('id', exp.id).eq('numero_expediente', exp.numero_expediente);
        if (upErr) { console.error(`    ✗ no se pudo renumerar: ${upErr.message}`); continue; }
        const entrada = {
            id: `${Date.now()}_via_fm_numero`, tipo: 'sistema', fecha: new Date().toISOString(), usuario: 'Sistema',
            texto: `Numeración de la vía FM: ${exp.numero_expediente} pasa a ${destino.numero} (conserva el número que tenía como ${origen}; las dos vías comparten contador desde el 09/11/2026).`,
        };
        const { error: hErr } = await supabase.rpc('merge_expediente_doc_json', { p_expediente_id: exp.id, p_field: 'historial', p_value: [entrada] });
        if (hErr) console.warn(`    ⚠ historial: ${hErr.message}`);
        try {
            await require('../services/expedienteFolderSync').syncExpedienteFolder(exp.id, { motivo: 'la vía FM conserva el número' });
            console.log('    ✓ carpeta de Drive enderezada');
        } catch (e) { console.warn(`    ⚠ carpeta de Drive: ${e.message}`); }
    }
    console.log(ESCRIBIR ? `\nHecho: ${cambios} renumerado(s).` : `\nEN SECO: no se ha escrito nada. Con --escribir se renumerarían ${cambios}.`);
    process.exit(0);
})();
