#!/usr/bin/env node
/**
 * Rellena `lotes.registro_miteco` de los lotes ya presentados al MITECO leyendo su
 * justificante (slot `justificante_miteco` del lote, en Drive).
 *
 *   node scripts/rellenar_registro_miteco.js            (en seco: dice qué escribiría)
 *   node scripts/rellenar_registro_miteco.js --aplicar  (escribe)
 *
 * `--forzar CODIGO=REGAGE…` pone un número a mano cuando el justificante guardado no
 * es el de la presentación vigente (LOTE-2025-002 se volvió a presentar el 09/10/2026
 * y en la app sigue el justificante del 02/09). Solo se escribe en lotes SIN número
 * o con uno distinto; cada cambio deja su línea en el historial.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const { leerRegage } = require('../utils/regageJustificante');
const driveService = require('../services/driveService');

const APLICAR = process.argv.includes('--aplicar');
const forzados = new Map(process.argv.slice(2)
    .flatMap((a, i, arr) => (a === '--forzar' ? [arr[i + 1]] : []))
    .filter(Boolean).map(s => s.split('=')));

(async () => {
    const { data: lotes, error } = await supabase.from('lotes')
        .select('id, codigo, estado, registro_miteco, documentos_so, historial').order('codigo');
    if (error) throw error;
    for (const l of lotes) {
        const just = (l.documentos_so || []).find(d => d?.key === 'justificante_miteco');
        if (!just && !forzados.has(l.codigo)) continue;
        let leido = null;
        if (just?.draft_file_id) {
            const buf = await driveService.getFileContent(just.draft_file_id);
            if (buf) leido = leerRegage(buf);
            else console.warn(`${l.codigo}: no se pudo bajar el justificante de Drive`);
        }
        const nuevo = forzados.get(l.codigo) || leido;
        const linea = `${l.codigo.padEnd(14)} ${String(l.estado).padEnd(28)} justificante: ${leido || '—'}`
            + `${forzados.has(l.codigo) ? `  · a mano: ${nuevo}` : ''}  · ahora: ${l.registro_miteco || '—'}`;
        if (!nuevo || nuevo === l.registro_miteco) { console.log(`  ${linea}`); continue; }
        console.log(`→ ${linea}`);
        if (!APLICAR) continue;
        const historial = [...(l.historial || []), {
            id: `${Date.now()}_registro_miteco`, tipo: 'sistema',
            texto: `Nº de registro MITECO ${l.registro_miteco ? `${l.registro_miteco} → ` : ''}${nuevo}`
                + `${forzados.has(l.codigo) ? ' (puesto a mano: presentación vigente).' : ' (leído del justificante).'}`,
            fecha: new Date().toISOString(), usuario: 'script rellenar_registro_miteco',
        }];
        const { error: e2 } = await supabase.from('lotes')
            .update({ registro_miteco: nuevo, historial, updated_at: new Date().toISOString() }).eq('id', l.id);
        if (e2) throw e2;
    }
    console.log(APLICAR ? '\nEscrito.' : '\nEN SECO: no se ha escrito nada (→ = lo que cambiaría). Repite con --aplicar.');
})().catch(e => { console.error(e.message); process.exit(1); });
