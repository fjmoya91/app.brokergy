/**
 * La hoja «Tu bono CAE en la Renta» SUELTA, en PDF: para el cliente (o su
 * gestor) que pide «el justificante de la resolución» del bono CAE. Explica que
 * el bono no se resta de la deducción por la obra y que su justificante es la
 * carta de pago. Solo LEE: no guarda en Drive, no escribe en la BD, no envía.
 *
 *   node scripts/hoja_bono_cae.js                 # genérica, sin datos de nadie
 *   node scripts/hoja_bono_cae.js 26RES060_187    # con su bono cobrado y su carta de pago
 *
 * Deja el PDF en tmp/. En un expediente CAE la misma hoja va ya como hoja 2 de
 * la guía de la Renta (logic/guiaIrpf.js).
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const guiaIrpf = require('../services/guiaIrpfService');

(async () => {
    const numero = process.argv[2] || null;
    const { buffer, filename, cae } = await guiaIrpf.pdfHojaBonoCae(numero);
    if (numero) {
        console.log(cae?.importe
            ? `${numero}: bono cobrado ${cae.importe} € · ${cae.fechaPago || 'sin fecha'} · carta ${cae.carta || '(sin carta de pago todavía)'} · impuesto aprox. ${cae.impuesto} €`
            : `${numero}: sin bono cobrado todavía → la hoja va sin cifras`);
    }
    const out = path.join(__dirname, '../../../tmp', filename);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buffer);
    console.log(`PDF → ${out}`);
    process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
