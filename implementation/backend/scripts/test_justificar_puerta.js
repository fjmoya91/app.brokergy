// La puerta «¿La obra está finalizada?» del Convenio que contesta `justificar.js anexos`.
//   node scripts/test_justificar_puerta.js
const assert = require('assert');
const { respuestaPuertaConvenio, POST_SOLO_LECTURA } = require('./justificar');

let fallos = 0;
const caso = (n, fn) => { try { fn(); console.log(`  ✓ ${n}`); } catch (e) { fallos++; console.log(`  ✗ ${n}\n    ${e.message}`); } };
const f = (extra = {}) => ({ numero_factura: '1', fecha_factura: '2026-10-01', concepto: 'Instalación de bomba de calor', ...extra });

caso('sin facturas → en obra', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [] }).terminada, false));
caso('con una factura normal → terminada', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [f()] }).terminada, true));
caso('una factura ANTICIPO (regla 93) → en obra', () => {
    const r = respuestaPuertaConvenio({ facturas: [f(), f({ numero_factura: '2', motivo_no_inicio: 'ANTICIPO' })] });
    assert.strictEqual(r.terminada, false);
    assert.ok(r.avisos.some(a => /ANTICIPO/.test(a)));
});
caso('una factura MATERIAL → en obra', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [f({ motivo_no_inicio: 'MATERIAL' })] }).terminada, false));
caso('«1ª CERTIFICACIÓN» sin marcar (26RES060_136) → en obra, con aviso', () => {
    const r = respuestaPuertaConvenio({ facturas: [f({ concepto: '1ª CERTIFICACIÓN: INSTALACIÓN DE SUELO RADIANTE Y REFRESCANTE' })] });
    assert.strictEqual(r.terminada, false);
    assert.ok(r.avisos.some(a => /certificación parcial/.test(a)));
});
caso('«Certificación final» sí cierra la obra', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [f({ concepto: 'Certificación final de la obra' })] }).terminada, true));
caso('«anticipo» / «a cuenta» en el concepto → en obra', () => {
    assert.strictEqual(respuestaPuertaConvenio({ facturas: [f({ concepto: 'Anticipo 30 %' })] }).terminada, false);
    assert.strictEqual(respuestaPuertaConvenio({ facturas: [f({ concepto: 'Pago a cuenta de la instalación' })] }).terminada, false);
});
caso('--obra-en-curso manda sobre las facturas', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [f()] }, { obraEnCurso: true }).terminada, false));
caso('--obra-terminada manda sobre la duda', () => assert.strictEqual(respuestaPuertaConvenio({ facturas: [f({ motivo_no_inicio: 'ANTICIPO' })] }, { obraTerminada: true }).terminada, true));
caso('las dos opciones a la vez es un error', () => assert.throws(() => respuestaPuertaConvenio({}, { obraEnCurso: true, obraTerminada: true })));
caso('avisa de la respuesta ya guardada en el expediente', () => {
    const r = respuestaPuertaConvenio({ facturas: [f()], anexo_cesion_obra_finalizada: true });
    assert.ok(r.avisos.some(a => /anexo_cesion_obra_finalizada/.test(a)));
});
caso('en seco solo pasa el render del PDF entre los POST', () => assert.deepStrictEqual([...POST_SOLO_LECTURA], ['/api/pdf/generate']));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exitCode = fallos ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 200).unref();
