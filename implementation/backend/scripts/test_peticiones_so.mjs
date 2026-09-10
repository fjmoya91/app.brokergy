#!/usr/bin/env node
/**
 * Qué le pediría HOY la app al Sujeto Obligado sobre los lotes que hay, sin
 * enviar nada ni tocar la base de datos.
 *
 *   node scripts/test_peticiones_so.mjs            (todos los lotes)
 *   node scripts/test_peticiones_so.mjs BORRADOR   (solo un estado)
 *
 * Es el gemelo en consola del botón del cuadro de mando: se pide con los MISMOS
 * datos y la MISMA función (`peticionesAplicables`), así que si aquí no sale, en
 * la pantalla tampoco — y al revés.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');

const { peticionesAplicables, peticionesDisponibles } = await import(
    pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/peticionesSo.js')).href);

const estado = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

let q = supabase.from('lotes').select('*').order('codigo');
if (estado) q = q.eq('estado', estado);
const { data: lotes, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

// El S.O. de cada lote, que es de donde salen el destinatario y el saludo.
for (const l of lotes) {
    if (!l.sujeto_obligado_id) continue;
    const { data: so } = await supabase.from('prescriptores')
        .select('razon_social, acronimo, email, tlf, nombre_responsable, contactos_notificacion')
        .eq('id_empresa', l.sujeto_obligado_id).maybeSingle();
    l.sujeto_obligado = so || null;
}

console.log(`\n${lotes.length} lotes${estado ? ` en ${estado}` : ''}\n`);
for (const l of lotes) {
    const o = (l.documentos_so || []).find(d => d?.key === 'oferta_verificacion');
    const f = (l.documentos_so || []).find(d => d?.key === 'factura_verificador');
    console.log(`  ${l.codigo.padEnd(16)} ${String(l.estado).padEnd(30)}`
        + ` oferta=${!o ? 'no' : (o.signed_link ? 'FIRMADA' : (o.sent_at ? 'enviada' : 'subida'))}`
        + `  factura=${!f ? 'no' : (f.pagado_at ? 'PAGADA' : (f.pago_solicitado_at ? 'reclamada' : 'subida'))}`);
}

// --simular-ofertas: mete una oferta FICTICIA en los lotes que aún no la tienen y
// están en su fase, para ver el correo que saldría ANTES de subir ninguna. No
// escribe nada: solo toca la copia en memoria.
if (process.argv.includes('--simular-ofertas')) {
    for (const l of lotes) {
        if (l.estado !== 'PTE. OFERTA VERIFICADOR') continue;
        if ((l.documentos_so || []).some(d => d?.key === 'oferta_verificacion')) continue;
        l.documentos_so = [...(l.documentos_so || []), {
            key: 'oferta_verificacion',
            file_name: `3. Oferta de verificación ${l.codigo}.pdf`,
            draft_file_id: 'SIMULADO',
        }];
    }
    console.log('  (simulando la oferta subida en los lotes de PTE. OFERTA VERIFICADOR)');
}

// `resumen` solo alimenta las cifras del correo del pago; aquí basta con lo que hay.
const resumen = { ahorroGwh: 0, ahorroSoTotal: 0 };
const todas = peticionesDisponibles(lotes, resumen);
const aplicables = peticionesAplicables(lotes, resumen);

console.log(`\n──────── PETICIONES ────────`);
for (const p of todas) {
    if (!p.aplicable) { console.log(`\n· ${p.id}: NO se ofrece — ${p.bloqueo}`); continue; }
    console.log(`\n✉ ${p.etiqueta}   [${p.id}]`);
    console.log(`   ${p.titulo}`);
    console.log(`   asunto: ${p.asunto}`);
    if (p.nota) console.log(`   nota:   ${p.nota}`);
    console.log(`   adjunta ${p.docs.length}:`);
    p.docs.forEach(d => console.log(`      · ${d.label}${d.detail ? `  (${d.detail})` : ''}`));
    if (p.fuera) console.log(`   ⚠ fuera: ${p.fuera.resumen} — ${p.fuera.aviso}`);
    console.log('   ── mensaje ──');
    console.log(p.mensaje({ saludo: 'Buenos días Jesús,' }).split('\n').map(x => `   ${x}`).join('\n'));
}
console.log(`\nBotones que se pintarían: ${aplicables.length}\n`);
