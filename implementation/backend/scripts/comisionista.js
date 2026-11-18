// ─── Comisionistas por script: alta y marcar obras ───────────────────────────
// EN SECO por defecto (local escribe en la Supabase de PRODUCCIÓN). Con
// --escribir, escribe. Desde implementation/backend:
//
//   node scripts/comisionista.js listar
//   node scripts/comisionista.js alta --nombre JUANMA --tlf 600000000 --cargo INGENIERO \
//        --empresa 153578c1-eea5-4b73-8325-dfdf8026d5bc [--notas "…"] [--escribir]
//   node scripts/comisionista.js marcar <comisionista_id|NOMBRE> 26RES060_OP308 [26RES060_OP25 …] [--escribir]
//
// «marcar» NO pisa un comisionista distinto ya puesto (lo dice y lo salta).
// Ver docs/conocimiento/oportunidades/el-comisionista-de-una-oportunidad.md
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const { normalizarComisionista } = require('../utils/comisionista');

const args = process.argv.slice(2);
const escribir = args.includes('--escribir');
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const posicionales = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--escribir'));
const SECO = escribir ? '' : '  [EN SECO — nada escrito; repite con --escribir]';

async function listar() {
    const { data, error } = await supabase.from('comisionistas').select('id, nombre, cargo, tlf, prescriptor_id, activo').order('nombre');
    if (error) throw error;
    const { data: ops } = await supabase.from('oportunidades').select('id_oportunidad, comisionista_id').not('comisionista_id', 'is', null);
    for (const c of data || []) {
        const suyas = (ops || []).filter(o => o.comisionista_id === c.id).map(o => o.id_oportunidad);
        console.log(`${c.id}  ${c.nombre}${c.cargo ? ` (${c.cargo})` : ''}  ${c.tlf || ''}  → ${suyas.length} obra(s): ${suyas.join(', ')}`);
    }
    if (!data?.length) console.log('(ningún comisionista)');
}

async function alta() {
    const { fila, error } = normalizarComisionista({
        nombre: opt('nombre'), tlf: opt('tlf'), cargo: opt('cargo'), email: opt('email'),
        notas: opt('notas'), prescriptor_id: opt('empresa') || null,
    }, { alta: true, admin: false });
    if (error) throw new Error(error);
    const { data: ya } = await supabase.from('comisionistas').select('id, nombre, tlf').or(
        [`nombre.eq.${fila.nombre}`, fila.tlf ? `tlf.eq.${fila.tlf}` : null].filter(Boolean).join(','));
    if (ya?.length) {
        console.log('Ya existe:', ya.map(c => `${c.id} ${c.nombre} ${c.tlf || ''}`).join(' | '));
        return;
    }
    if (fila.prescriptor_id) {
        const { data: p } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', fila.prescriptor_id).maybeSingle();
        if (!p) throw new Error(`No existe el partner ${fila.prescriptor_id}`);
        console.log(`Empresa: ${p.razon_social}`);
    }
    console.log('Alta:', fila, SECO);
    if (!escribir) return;
    const { data, error: insErr } = await supabase.from('comisionistas').insert([fila]).select('id, nombre').single();
    if (insErr) throw insErr;
    console.log(`✓ Dado de alta: ${data.id} ${data.nombre}`);
}

async function marcar() {
    const [, quien, ...ids] = posicionales;
    if (!quien || !ids.length) throw new Error('Uso: marcar <comisionista_id|NOMBRE> <OP> [<OP>…]');
    const q = /^[0-9a-f-]{36}$/i.test(quien)
        ? supabase.from('comisionistas').select('id, nombre').eq('id', quien)
        : supabase.from('comisionistas').select('id, nombre').eq('nombre', quien.toUpperCase());
    const { data: personas, error } = await q;
    if (error) throw error;
    if (personas?.length !== 1) throw new Error(`Comisionista «${quien}»: ${personas?.length || 0} coincidencias`);
    const c = personas[0];
    for (const id of ids) {
        const { data: op } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, referencia_cliente, prescriptor, comisionista_id').eq('id_oportunidad', id).maybeSingle();
        if (!op) { console.log(`✗ ${id}: no existe`); continue; }
        if (op.comisionista_id === c.id) { console.log(`= ${id} (${op.referencia_cliente}): ya es de ${c.nombre}`); continue; }
        if (op.comisionista_id) { console.log(`! ${id}: ya tiene OTRO comisionista (${op.comisionista_id}) — no se toca`); continue; }
        console.log(`→ ${id} (${op.referencia_cliente} · partner ${op.prescriptor}) pasa a ${c.nombre}${SECO}`);
        if (!escribir) continue;
        const { error: upErr } = await supabase.from('oportunidades').update({ comisionista_id: c.id }).eq('id', op.id).is('comisionista_id', null);
        if (upErr) console.log(`✗ ${id}: ${upErr.message}`); else console.log(`✓ ${id} marcada`);
    }
}

const cmd = posicionales[0];
({ listar, alta, marcar }[cmd] || (async () => { console.log('Órdenes: listar · alta · marcar'); }))()
    .then(() => process.exit(0))
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
