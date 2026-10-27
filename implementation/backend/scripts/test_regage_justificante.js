#!/usr/bin/env node
/**
 * El nº de registro (REGAGE…) del justificante del MITECO se lee del PDF.
 *
 *   node scripts/test_regage_justificante.js [justificante.pdf …]
 *
 * Sin argumentos, prueba casos sintéticos (texto en claro, comprimido, dos números).
 * Con PDF, dice qué número sale de cada uno (solo lee).
 */
const fs = require('fs');
const zlib = require('zlib');
const assert = require('assert');
const { leerRegage, regagesDePdf } = require('../utils/regageJustificante');

const pdf = (...streams) => Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    ...streams.flatMap(s => [Buffer.from('1 0 obj\n<<>>\nstream\n'), s, Buffer.from('\nendstream\nendobj\n')]),
    Buffer.from('%%EOF'),
]);

// En claro, y con la letra del medio como venga.
assert.strictEqual(leerRegage(pdf(Buffer.from('(Numero de registro: REGAGE26e00088163268) Tj'))), 'REGAGE26e00088163268');
assert.strictEqual(leerRegage(pdf(Buffer.from('regage26E00088163268'))), 'REGAGE26e00088163268');
// Comprimido con Flate (como lo sirve la sede).
assert.strictEqual(leerRegage(pdf(zlib.deflateSync(Buffer.from('BT (REGAGE26e00091699648) Tj ET')))), 'REGAGE26e00091699648');
// Repetido (cabecera y cuerpo) es UNO.
assert.strictEqual(leerRegage(pdf(Buffer.from('REGAGE26e00088167025'), zlib.deflateSync(Buffer.from('REGAGE26e00088167025')))), 'REGAGE26e00088167025');
// Dos números distintos: no se adivina.
assert.deepStrictEqual(regagesDePdf(pdf(Buffer.from('REGAGE26e00088167025 REGAGE26e00088168779'))).length, 2);
assert.strictEqual(leerRegage(pdf(Buffer.from('REGAGE26e00088167025 REGAGE26e00088168779'))), null);
// Sin número, o la palabra suelta.
assert.strictEqual(leerRegage(pdf(Buffer.from('Registro General REGAGE'))), null);
assert.strictEqual(leerRegage(Buffer.alloc(0)), null);
assert.strictEqual(leerRegage(null), null);

console.log('✓ casos sintéticos');

for (const f of process.argv.slice(2)) {
    console.log(`${f.split(/[\\/]/).pop()}: ${leerRegage(fs.readFileSync(f)) || '—'}`);
}
