#!/usr/bin/env node
// Baja a una carpeta local los ficheros de «{ronda}. REQUERIMIENTO» de un lote, para subirlos
// al portal del verificador (Marwen no admite contestar inexactitudes por API).
// Solo LEE de Drive. Avisa de lo que no debería estar en una carpeta plana lista para subir
// (subcarpetas, .txt, piezas sin _v1, ni escrito firmado) y propone tandas de < 10 MB.
//
//   node implementation/backend/scripts/bajar_requerimiento_lote.js LOTE-2026-016 [--ronda 1] [--destino <dir>]
//
// Ver docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const drive = require('../services/driveService');
const supabase = require('../services/supabaseClient');

const FOLDER = 'application/vnd.google-apps.folder';
const TANDA_MAX = 9.5 * 1024 * 1024;

function arg(nombre, def) {
    const i = process.argv.indexOf(nombre);
    return i > -1 ? process.argv[i + 1] : def;
}

(async () => {
    const codigo = process.argv[2];
    if (!codigo || codigo.startsWith('--')) throw new Error('Uso: bajar_requerimiento_lote.js <LOTE-AAAA-NNN> [--ronda N] [--destino dir]');
    const ronda = arg('--ronda', '1');
    const destino = path.resolve(arg('--destino', path.join(process.cwd(), 'scratch', 'requerimiento', `${codigo}-r${ronda}`)));

    const { data: lote, error } = await supabase.from('lotes').select('codigo, drive_folder_id').eq('codigo', codigo).single();
    if (error || !lote) throw new Error(`No encuentro el lote ${codigo}`);
    const carpeta = await drive.findSubfolderByName(lote.drive_folder_id, `${ronda}. REQUERIMIENTO`);
    if (!carpeta) throw new Error(`${codigo} no tiene la carpeta «${ronda}. REQUERIMIENTO»`);

    const ficheros = await drive.listFiles(carpeta);
    const avisos = [];
    const pdfs = [];
    for (const f of ficheros) {
        if (f.mimeType === FOLDER) { avisos.push(`subcarpeta «${f.name}»: la carpeta debe ir PLANA`); continue; }
        if (/\.txt$/i.test(f.name)) { avisos.push(`«${f.name}» es un borrador .txt: no se sube`); continue; }
        pdfs.push(f);
    }
    const escrito = pdfs.filter(f => /CONTESTACION/i.test(f.name));
    if (!escrito.length) avisos.push('no hay escrito de contestación');
    else if (!escrito.some(f => /_fdo\.pdf$/i.test(f.name))) avisos.push('el escrito de contestación no está firmado (_fdo)');
    for (const f of pdfs) if (!/CONTESTACION/i.test(f.name) && !/_v\d+(_fdo)?\.pdf$/i.test(f.name)) avisos.push(`«${f.name}» no lleva sufijo _v{n} (ni _v{n}_fdo)`);

    fs.mkdirSync(destino, { recursive: true });
    // El escrito primero, luego por nombre (E1-…, E2-…)
    pdfs.sort((a, b) => (/CONTESTACION/i.test(b.name) - /CONTESTACION/i.test(a.name)) || a.name.localeCompare(b.name));
    const bajados = [];
    for (const f of pdfs) {
        const buf = await drive.getFileContent(f.id);
        if (!buf) throw new Error(`No se pudo bajar «${f.name}»`);
        const ruta = path.join(destino, f.name);
        fs.writeFileSync(ruta, buf);
        bajados.push({ nombre: f.name, ruta, bytes: buf.length });
    }

    const tandas = [];
    let actual = [], peso = 0;
    for (const b of bajados) {
        if (b.bytes > TANDA_MAX) avisos.push(`«${b.nombre}» pesa ${(b.bytes / 1048576).toFixed(1)} MB: va solo y puede no caber en una subida`);
        if (actual.length && peso + b.bytes > TANDA_MAX) { tandas.push(actual); actual = []; peso = 0; }
        actual.push(b.ruta); peso += b.bytes;
    }
    if (actual.length) tandas.push(actual);

    const total = bajados.reduce((s, b) => s + b.bytes, 0);
    console.log(JSON.stringify({ lote: codigo, ronda: Number(ronda), destino, n: bajados.length, total_mb: +(total / 1048576).toFixed(1),
        ficheros: bajados.map(b => `${(b.bytes / 1024).toFixed(0)} KB  ${b.nombre}`), tandas, avisos }, null, 2));
})().then(() => process.exit(0)).catch(e => { console.error('ERROR', e.message); process.exit(1); });
