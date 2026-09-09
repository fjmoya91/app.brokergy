#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee las firmas electrónicas de un PDF y dice QUIÉN firma. No escribe nada, no
 * llama a ningún servicio de pago: todo sale del propio fichero.
 *
 *   node scripts/probar_firmas_pdf.js <driveFileId | ruta.pdf> [más ids…]
 *   node scripts/probar_firmas_pdf.js --lote LOTE-2026-004
 *
 * Con `--lote` barre los firmados que el S.O. ya devolvió en ese lote (Anexo I y
 * fichas) y contrasta cada uno con el representante legal que consta en su ficha:
 * es la comprobación que hace la app al soltar los ficheros.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const { leerFirmasPdf, firmanteCoincide } = require('../utils/firmasPdf');

const driveIdDe = (link) => {
    const m = String(link || '').match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(link || '').match(/[-\w]{25,}/);
    return m ? (m[1] || m[0]) : null;
};

function pinta(nombre, buffer, esperado) {
    const r = leerFirmasPdf(buffer);
    console.log(`\n📄 ${nombre}  (${(buffer.length / 1024).toFixed(0)} KB)`);
    if (!r.esPdf) { console.log('   ✗ no es un PDF'); return r; }
    if (!r.firmada) { console.log('   ✗ SIN firma electrónica'); r.avisos.forEach(a => console.log('   ⚠ ' + a)); return r; }
    console.log(`   ${r.n} firma(s):`);
    for (const f of r.firmantes) {
        console.log(`     · ${f.nombre || '(sin nombre)'}${f.nif ? ` · ${f.nif}` : ''}`);
        console.log(`       ${[f.organizacion, f.subfiltro, f.fecha].filter(Boolean).join(' · ')}`);
        if (f.cn && f.cn !== f.nombre) console.log(`       CN: ${f.cn}`);
    }
    r.avisos.forEach(a => console.log('   ⚠ ' + a));
    if (esperado) {
        for (const e of esperado) {
            const hit = r.firmantes.map(f => firmanteCoincide(f, e)).find(x => x.coincide);
            console.log(`   ${hit ? '✅' : '⛔'} se esperaba a ${e.nombre}${e.nif ? ` (${e.nif})` : ''}`
                + (hit ? ` — coincide por ${hit.por}` : ''));
        }
    }
    return r;
}

async function porLote(codigo) {
    const supabase = require('../services/supabaseClient');
    const driveService = require('../services/driveService');
    const { data: lote } = await supabase.from('lotes')
        .select('id, codigo, documentos_so, sujeto_obligado_id').eq('codigo', codigo).maybeSingle();
    if (!lote) { console.error(`No existe el lote ${codigo}`); return; }

    const { data: so } = lote.sujeto_obligado_id
        ? await supabase.from('prescriptores')
            .select('razon_social, cif, nombre_responsable, apellidos_responsable, nif_responsable, representante_distinto, representante_nombre, representante_apellidos, representante_dni')
            .eq('id_empresa', lote.sujeto_obligado_id).maybeSingle()
        : { data: null };

    const rep = so?.representante_distinto
        ? { nombre: [so.representante_nombre, so.representante_apellidos].filter(Boolean).join(' '), nif: so.representante_dni }
        : { nombre: [so?.nombre_responsable, so?.apellidos_responsable].filter(Boolean).join(' '), nif: so?.nif_responsable };
    console.log(`\n🏢 ${so?.razon_social || '(sin S.O.)'} · representante: ${rep.nombre || '—'}${rep.nif ? ` (${rep.nif})` : ''}`);

    const firmados = (lote.documentos_so || []).filter(d => d?.signed_link);
    if (!firmados.length) { console.log('Este lote no tiene ningún documento firmado registrado.'); return; }

    for (const d of firmados) {
        const id = d.signed_file_id || driveIdDe(d.signed_link);
        if (!id) continue;
        let buf = null;
        try { buf = await driveService.getFileContent(id); } catch (e) { console.log(`\n📄 ${d.label}: no se pudo bajar (${e.message})`); continue; }
        // El Anexo I lo firman DOS: el S.O. y Brokergy.
        const esperado = d.key === 'anexo_i'
            ? [rep, { nombre: 'FRANCISCO JAVIER MOYA LÓPEZ', nif: '06282551D' }]
            : [rep];
        pinta(`${d.label} — ${d.file_name}`, buf, esperado.filter(e => e.nombre || e.nif));
    }
}

(async () => {
    const args = process.argv.slice(2);
    if (args[0] === '--lote') { await porLote(args[1]); return; }
    if (!args.length) { console.error('Uso: node scripts/probar_firmas_pdf.js <driveFileId|ruta.pdf>… | --lote <CODIGO>'); process.exit(1); }
    for (const a of args) {
        if (fs.existsSync(a)) { pinta(path.basename(a), fs.readFileSync(a)); continue; }
        const driveService = require('../services/driveService');
        const buf = await driveService.getFileContent(driveIdDe(a) || a);
        pinta(a, buf);
    }
    console.log('');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
