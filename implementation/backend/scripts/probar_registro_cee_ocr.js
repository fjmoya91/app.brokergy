/**
 * Prueba el lector de la FECHA DE REGISTRO del CEE contra un justificante REAL, sin
 * pasar por la app y SIN escribir nada.
 *
 *   node scripts/probar_registro_cee_ocr.js <driveFileId|ruta.pdf> [numero_expediente]
 *
 * Con el número de expediente enseña además la fecha que hoy consta en la app: es
 * lo que hay que mirar para saber si un expediente quedó sellado con el día de la
 * subida en vez de con el del papel.
 */
require('dotenv').config();
const fs = require('fs');
const supabase = require('../services/supabaseClient');
const { leerJustificanteRegistro, resolverFechaRegistro } = require('../services/registroCeeOcrService');

const esES = (f) => (f ? String(f).split('-').reverse().join('/') : '—');

(async () => {
    const [, , origen, numExpediente] = process.argv;
    if (!origen) {
        console.error('Uso: node scripts/probar_registro_cee_ocr.js <driveFileId|ruta.pdf> [numero_expediente]');
        process.exit(1);
    }

    let buffer;
    if (fs.existsSync(origen)) {
        buffer = fs.readFileSync(origen);
    } else {
        const driveService = require('../services/driveService');
        buffer = await driveService.getFileContent(origen);
        if (!buffer) { console.error('No se pudo descargar el fichero de Drive.'); process.exit(1); }
    }
    console.log(`PDF: ${(buffer.length / 1024).toFixed(0)} KB`);

    const t0 = Date.now();
    const lectura = await leerJustificanteRegistro(buffer);
    console.log(`\nLeído en ${((Date.now() - t0) / 1000).toFixed(1)}s (${lectura.paginas_leidas ?? '?'} pág. enviadas)`);
    console.log(`  Nº de registro : ${lectura.numero_registro || '—'}`);
    console.log(`  Fecha (modelo) : ${esES(lectura.fecha_registro)}`);
    console.log(`  Frase citada   : ${lectura.frase || '—'}`);

    // Lo que de verdad se sellaría: la frase manda sobre el campo aislado.
    const resuelta = await resolverFechaRegistro(buffer);
    console.log(`\n  → SE SELLARÍA  : ${esES(resuelta.fecha)}  (${resuelta.origen})`);
    if (resuelta.aviso) console.log(`  ⚠ ${resuelta.aviso}`);

    if (!numExpediente) return;

    const { data: exp } = await supabase
        .from('expedientes')
        .select('numero_expediente, documentacion, seguimiento')
        .eq('numero_expediente', numExpediente)
        .maybeSingle();
    if (!exp) { console.error(`\nNo existe el expediente ${numExpediente}.`); return; }

    console.log(`\n${exp.numero_expediente} — lo que consta hoy en la app:`);
    for (const fase of ['inicial', 'final']) {
        const f = exp.documentacion?.[`fecha_registro_cee_${fase}`];
        const sub = exp.seguimiento?.[`cee_${fase}`];
        console.log(`  CEE ${fase.padEnd(7)} : ${esES(f)}   (subestado ${sub || '—'})`);
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
