#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Sella el Nº DE ACTUACIÓN (E1-E5) de un lote cuya solicitud YA salió.
 *
 * Desde el 2026-09-09 el número se sella al enviar la solicitud por API, con el
 * orden en que las actuaciones se declaran al verificador. Los lotes que se
 * enviaron ANTES no lo tienen, y sin él no se puede armar ningún paquete: es lo
 * que rotula cada fichero del ZIP ("E3-3-1 - …").
 *
 * De dónde sale el orden: de la secuencia de FICHAS que se le mandaron a firmar
 * al S.O. (`documentos_so`), que es la misma lista con la que se construyó la
 * solicitud. Comprobado contra los cuatro PDF de solicitud reales (LOTE-2025-005,
 * -006, LOTE-2026-007 y -008): el orden coincide actuación por actuación, y
 * coincide además con el que el informe de verificación acabó asignando en los
 * cuatro lotes que ya tienen dictamen favorable.
 *
 * Aun así se ENSEÑA antes de escribir, porque el número que manda de verdad es el
 * que se ve en beCAE: si allí sale otro, se pasa a mano con `--orden`.
 *
 *   node scripts/sellar_orden_actuacion.js LOTE-2026-008
 *   node scripts/sellar_orden_actuacion.js LOTE-2026-008 --execute
 *   node scripts/sellar_orden_actuacion.js LOTE-2026-008 --orden=26RES060_152,26RES080_47,… --execute
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const { aplicarOrdenActuacion } = require('../services/loteVerificados');

const norm = (x) => String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

(async () => {
    const codigo = process.argv.slice(2).find(a => !a.startsWith('--'));
    const ejecutar = process.argv.includes('--execute');
    const manual = (process.argv.find(a => a.startsWith('--orden=')) || '').replace('--orden=', '');
    if (!codigo) {
        console.error('Uso: node scripts/sellar_orden_actuacion.js <CÓDIGO DE LOTE> [--execute] [--orden=exp1,exp2,…]');
        process.exit(1);
    }

    const { data: lote } = await supabase.from('lotes')
        .select('id, codigo, estado, documentos_so, verificacion_api').eq('codigo', codigo).maybeSingle();
    if (!lote) { console.error(`No existe el lote "${codigo}".`); process.exit(1); }

    const { data: exps } = await supabase.from('expedientes')
        .select('id, numero_expediente, instalacion').eq('lote_id', lote.id);
    if (!exps || !exps.length) { console.error('El lote no tiene expedientes.'); process.exit(1); }

    console.log(`\n📦 ${lote.codigo} · ${lote.estado}`);
    const api = lote.verificacion_api || {};
    console.log(`   solicitud ${api.num_solicitud || '—'} · enviada ${String(api.enviado_at || '').slice(0, 10) || '—'}`);

    // 1. El orden. Manda `--orden` si se da; si no, el de las fichas del envío al
    //    S.O.; y si el lote guarda ya el orden declarado por API, ése es el bueno.
    let secuencia;
    let fuente;
    if (manual) {
        secuencia = manual.split(',').map(s => s.trim()).filter(Boolean);
        fuente = 'lo que has escrito en --orden';
    } else if (Array.isArray(api.orden_actuaciones) && api.orden_actuaciones.length) {
        secuencia = api.orden_actuaciones.slice().sort((a, b) => a.n - b.n).map(o => o.numero_expediente);
        fuente = 'el orden declarado al verificador por API (sellado en el envío)';
    } else {
        const idsFicha = (Array.isArray(lote.documentos_so) ? lote.documentos_so : [])
            .filter(d => d && typeof d.key === 'string' && d.key.startsWith('ficha_'))
            .map(d => d.key.slice('ficha_'.length));
        secuencia = idsFicha.map(id => (exps.find(e => e.id === id) || {}).numero_expediente).filter(Boolean);
        fuente = 'la secuencia de fichas que se mandó a firmar al S.O.';
    }
    if (!secuencia.length) { console.error('No se ha podido deducir ningún orden.'); process.exit(1); }
    console.log(`   orden según ${fuente}\n`);

    // 2. Emparejar y enseñar.
    const filas = [];
    let problemas = 0;
    secuencia.forEach((num, i) => {
        const exp = exps.find(e => norm(e.numero_expediente) === norm(num));
        const previo = Number(exp?.instalacion?.verificacion?.orden_actuacion) || null;
        const marca = !exp ? '⛔ no está en este lote'
            : (previo === i + 1 ? '· ya sellado'
                : (previo ? `⚠ ya tenía E${previo} — NO se pisa` : '➜ se sella'));
        if (!exp || (previo && previo !== i + 1)) problemas++;
        console.log(`   E${i + 1}  ${num}  ${marca}`);
        if (exp) filas.push({ expediente_id: exp.id, orden: i + 1 });
    });
    const sinOrden = exps.filter(e => !secuencia.some(n => norm(n) === norm(e.numero_expediente)));
    for (const e of sinOrden) { console.log(`   --  ${e.numero_expediente}  ⛔ sin número de actuación`); problemas++; }

    console.log(`\n   Compruébalo contra beCAE antes de aplicarlo.`);
    if (!ejecutar) { console.log('\n(en seco — repite con --execute)\n'); process.exit(problemas ? 1 : 0); }

    const aplicados = await aplicarOrdenActuacion(filas, { soloSiFalta: true, origen: 'SOLICITUD_API' });
    console.log(`\n✅ ${aplicados.length} sellados: ${aplicados.map(a => `E${a.orden} ${a.numero_expediente}`).join(' · ') || '—'}`);
    for (const d of (aplicados.discrepancias || [])) {
        console.log(`⚠  ${d.numero_expediente} conserva E${d.previo} (la solicitud dice E${d.orden})`);
    }
    console.log('');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
