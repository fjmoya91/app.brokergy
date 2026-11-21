// La SUPERFICIE CALEFACTADA no baja de la ÚTIL sin confirmarlo (la ayuda baja).
// Sin BD ni red: el módulo puro de la calculadora.
//
//   node implementation/backend/scripts/test_superficie_calefaccion.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const { m2, supCalefPorDebajo, confirmacionSupCalef, confirmacionVigente } = await import(
    pathToFileURL(path.join(aqui, '../../frontend/src/features/calculator/logic/superficieCalefaccion.js')).href
);

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('Los m² del formulario');
t('número, «120», «1.250,5» y «120,» (a medio teclear)', () => {
    assert.equal(m2(120), 120);
    assert.equal(m2('120'), 120);
    assert.equal(m2('1.250,5'), 1250.5);
    assert.equal(m2('120,'), 120);
    assert.equal(m2(''), null);
    assert.equal(m2(null), null);
});

console.log('¿Por debajo de la útil?');
t('100 calefactados con 120 útiles: sí', () => assert.equal(supCalefPorDebajo(120, 100), true));
t('igual o más (la planta «almacén» sumada): no', () => {
    assert.equal(supCalefPorDebajo(120, 120), false);
    assert.equal(supCalefPorDebajo(120, 165), false);
});
t('medio m² de redondeo no salta', () => assert.equal(supCalefPorDebajo(120.4, 120), false));
t('sin uno de los dos datos, no se juzga', () => {
    assert.equal(supCalefPorDebajo('', 100), false);
    assert.equal(supCalefPorDebajo(120, ''), false);
});

console.log('Lo confirmado');
const conf = confirmacionSupCalef({ util: 120, calef: 100, usuario: { nombre: 'Pepe', razon_social: 'INSTALACIONES X', rol: 'instalador' }, ahora: new Date('2026-11-16T10:00:00Z') });
t('guarda los dos valores, quién, su empresa y cuándo', () => {
    assert.deepEqual(conf, { util: 120, calef: 100, por: 'Pepe', empresa: 'INSTALACIONES X', rol: 'INSTALADOR', at: '2026-11-16T10:00:00.000Z' });
});
t('vale mientras los metros sean los mismos', () => {
    assert.equal(confirmacionVigente(conf, 120, 100), true);
    assert.equal(confirmacionVigente(conf, 120, 90), false, 'otra cifra se vuelve a confirmar');
    assert.equal(confirmacionVigente(conf, 120, 130), false, 'por encima ya no hay nada que confirmar');
    assert.equal(confirmacionVigente(null, 120, 100), false);
});

console.log(`\n${ok} pruebas OK`);
