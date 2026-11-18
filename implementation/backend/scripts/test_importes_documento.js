// Los DOS importes de un presupuesto o factura leídos por el OCR
// (`importesDocumento`, routes/facturaOcr.js). Sin llamar al OCR.
//
//   node implementation/backend/scripts/test_importes_documento.js
//
// Caso que lo motiva: 26RES060_OP424 (18/11/2026), «TOTAL PRESUPUESTO 5.900 € ·
// Nota: Este presupuesto NO incluye IVA». Cuando el modelo dejaba los 5.900 en
// `total` sin base, salían como lo que se paga y la propuesta perdía el 21 %.
const assert = require('assert');
const { importesDocumento } = require('../routes/facturaOcr');

let fallos = 0;
const t = (nombre, fn) => {
    try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
};
const ocr = (totales, lineas = []) => ({ totales, lineas });

console.log('importesDocumento');

t('solo un total y «NO incluye IVA» → ese total es la BASE', () => {
    const r = importesDocumento(ocr({ base_imponible: null, total: 5900, iva_incluido: false }));
    assert.deepEqual(r, { sinIva: 5900, conIva: 7139, ivaPct: 21, ivaEstimado: true });
});

t('lo mismo si el modelo lo pone de base', () => {
    const r = importesDocumento(ocr({ base_imponible: 5900, total: null, iva_incluido: false }));
    assert.equal(r.sinIva, 5900);
    assert.equal(r.conIva, 7139);
});

t('lo mismo si pone el mismo importe en base y en total', () => {
    const r = importesDocumento(ocr({ base_imponible: 5900, total: 5900, iva_incluido: false }));
    assert.equal(r.conIva, 7139);
});

t('«+ IVA 10 %» → al tipo declarado, sin estimar', () => {
    const r = importesDocumento(ocr({ total: 10000, iva_pct: 10, iva_incluido: false }));
    assert.deepEqual(r, { sinIva: 10000, conIva: 11000, ivaPct: 10, ivaEstimado: false });
});

t('solo un total y NADA dicho del IVA → sigue siendo lo que se paga (como antes)', () => {
    const r = importesDocumento(ocr({ total: 12100 }));
    assert.equal(r.conIva, 12100);
    assert.equal(r.sinIva, 10000);
    assert.equal(r.ivaEstimado, true);
});

t('«IVA incluido» → el total es lo que se paga', () => {
    const r = importesDocumento(ocr({ total: 12100, iva_incluido: true }));
    assert.equal(r.conIva, 12100);
});

t('con base y total escritos mandan ellos aunque diga «+ IVA»', () => {
    const r = importesDocumento(ocr({ base_imponible: 10000, total: 12100, iva_incluido: false }));
    assert.deepEqual(r, { sinIva: 10000, conIva: 12100, ivaPct: 21, ivaEstimado: false });
});

t('con la cuota escrita manda la cuota', () => {
    const r = importesDocumento(ocr({ base_imponible: 10000, iva_importe: 1000, iva_incluido: false }));
    assert.equal(r.conIva, 11000);
});

t('base sola (suma de líneas) sin decir nada → se estima el 21 % (como antes)', () => {
    const r = importesDocumento(ocr({}, [{ importe_total: 4000 }, { importe_total: 1000 }]));
    assert.deepEqual(r, { sinIva: 5000, conIva: 6050, ivaPct: 21, ivaEstimado: true });
});

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
