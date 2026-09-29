#!/usr/bin/env node
/**
 * Lee un PRESUPUESTO ya adjuntado a una oportunidad y enseña qué se escribiría en
 * "Datos Económicos" (logic/presupuestoLeido.js) — SIN escribir nada.
 *
 *   node scripts/probar_presupuesto_leido.js 26RES060_OP118              (hueco Aerotermia)
 *   node scripts/probar_presupuesto_leido.js 26RES080_OP40 VENTANAS      (otro hueco)
 *   node scripts/probar_presupuesto_leido.js ./presupuesto.pdf [HUECO]   (un PDF del disco)
 *
 * Es el mismo lector que usa la propuesta al adjuntarlo (`facturaOcrService` +
 * `importesDocumento`, igual que `POST /api/factura-ocr/extract`). Solo lee:
 * ni Supabase ni Drive se tocan. Cuesta una lectura (~0,002 €).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const facturaOcrService = require('../services/facturaOcrService');
const { importesDocumento } = require('../routes/facturaOcr');

const arg = process.argv[2];
const HUECO = String(process.argv[3] || 'AEROTERMIA').toUpperCase();
if (!arg) {
    console.error('Uso: node scripts/probar_presupuesto_leido.js <id oportunidad | ruta a un PDF>');
    process.exit(1);
}

const BUDGET = HUECO === 'AEROTERMIA'
    ? 'PRESUPUESTO DE LA INSTALACIÓN.pdf'
    : `PRESUPUESTO DE LA INSTALACIÓN_${HUECO}.pdf`;

(async () => {
    const { lecturaAPresupuesto } = await import(pathToFileURL(path.resolve(__dirname,
        '../../frontend/src/features/calculator/logic/presupuestoLeido.js')).href);

    let pdf, inputs = {};
    if (fs.existsSync(arg)) {
        pdf = fs.readFileSync(arg);
    } else {
        const { data: op, error } = await supabase
            .from('oportunidades')
            .select('id_oportunidad, inputs:datos_calculo->inputs, drive:datos_calculo->drive_folder_id')
            .eq('id_oportunidad', arg)
            .maybeSingle();
        if (error || !op) { console.error(`No existe la oportunidad «${arg}».`); process.exit(1); }
        inputs = op.inputs || {};
        if (!op.drive) { console.error('La oportunidad no tiene carpeta de Drive.'); process.exit(1); }
        const carpeta = await driveService.findSubfolderByName(op.drive, '0. PRESUPUESTO');
        const fileId = carpeta ? await driveService.findFileByName(carpeta, BUDGET) : null;
        if (!fileId) { console.error(`No hay «${BUDGET}» en 0. PRESUPUESTO.`); process.exit(1); }
        pdf = await driveService.getFileContent(fileId);
    }

    const t0 = Date.now();
    const ocr = await facturaOcrService.extractFacturaFromPdf(pdf);
    const imp = importesDocumento(ocr);
    const doc = {
        numero_factura: ocr.numero_factura || '', fecha_factura: ocr.fecha_factura || null,
        importe_sin_iva: imp.sinIva, importe_total: imp.conIva, iva_pct: imp.ivaPct, iva_estimado: imp.ivaEstimado,
        emisor_nombre: ocr.emisor?.nombre || null,
    };
    console.log(`Leído en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    console.log('Documento:', doc);
    console.log('\nLíneas por partida (sin IVA):');
    for (const l of ocr.lineas || []) console.log(`  ${String(l.partida || '—').padEnd(12)} ${String(l.importe_total ?? '—').padStart(10)}  ${String(l.descripcion || '').slice(0, 70)}`);

    console.log('\nSimulación:', {
        titularType: inputs.titularType || 'particular', includeIVA: !!inputs.includeIVA,
        presupuesto: inputs.presupuesto, presupuestoEstimado: !!inputs.presupuestoEstimado,
        presupuestoFotovoltaica: inputs.presupuestoFotovoltaica || 0,
        presupuestoEnvolvente: inputs.presupuestoEnvolvente || 0,
    });

    const r = lecturaAPresupuesto({ doc, ocr }, inputs, { hueco: HUECO });
    console.log('\n→', r.titular);
    for (const a of r.avisos || []) console.log('  ⚠', a);
    if (r.patch) console.log('\nSe escribiría en inputs:', r.patch);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
