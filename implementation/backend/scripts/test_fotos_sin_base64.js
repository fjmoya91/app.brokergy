// Regla 21: en `documentacion.photo_attachments` no ENTRA base64 (fotosSinBase64).
//   node scripts/test_fotos_sin_base64.js
const assert = require('assert');
const { fotosSinBase64 } = require('../utils/normalization');

const B64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg';
let fallos = 0;
const caso = (n, fn) => { try { fn(); console.log(`  ✓ ${n}`); } catch (e) { fallos++; console.log(`  ✗ ${n}\n    ${e.message}`); } };

caso('el alta del expediente no copia el base64 de la oportunidad (hueco fijo viejo)', () => {
    const r = fotosSinBase64([{ id: 'caldera_anterior', label: 'Foto', file: { name: 'a.jpg', data: B64 }, required: true }]);
    assert.deepStrictEqual(r[0].file, { name: 'a.jpg' });
    assert.strictEqual(r[0].label, 'Foto');
});
caso('una foto de Drive pierde el base64 y conserva nombre y driveId', () => {
    const r = fotosSinBase64([{ id: 'drive_x.jpg', file: { name: 'x.jpg', driveId: 'abc', data: B64 } }]);
    assert.deepStrictEqual(r[0].file, { name: 'x.jpg', driveId: 'abc' });
});
caso('un base64 NUEVO con id manual tampoco entra', () => {
    const r = fotosSinBase64([{ id: 'custom_1', file: { name: 'c.jpg', data: B64 } }], []);
    assert.strictEqual(r[0].file.data, undefined);
});
caso('lo YA guardado con el mismo id se respeta (única copia, hasta subirlo a Drive)', () => {
    const previa = [{ id: 'placa_caldera_anterior', file: { name: 'p.jpg', data: B64 } }];
    const r = fotosSinBase64([{ id: 'placa_caldera_anterior', file: { name: 'p.jpg', data: B64 } }], previa);
    assert.strictEqual(r[0].file.data, B64);
    const otro = fotosSinBase64([{ id: 'placa_caldera_anterior', file: { name: 'p.jpg', data: `${B64}OTRO` } }], previa);
    assert.strictEqual(otro[0].file.data, B64, 'un base64 distinto no sustituye al guardado');
});
caso('un base64 en MAYÚSCULAS (corrupto) sale siempre, aunque estuviera guardado', () => {
    const corrupto = 'DATA:IMAGE/JPEG;BASE64,/9J/4AAQ';
    const r = fotosSinBase64([{ id: 'caldera_anterior', file: { name: 'A.JPG', data: corrupto } }],
        [{ id: 'caldera_anterior', file: { name: 'A.JPG', data: corrupto } }]);
    assert.strictEqual(r[0].file.data, undefined);
});
caso('una foto de Drive guardada con base64 no se considera legado', () => {
    const r = fotosSinBase64([{ id: 'drive_x.jpg', file: { name: 'x.jpg', data: B64 } }],
        [{ id: 'drive_x.jpg', file: { name: 'x.jpg', data: B64 } }]);
    assert.strictEqual(r[0].file.data, undefined);
});
caso('huecos vacíos, null y lo que no es lista pasan tal cual', () => {
    assert.deepStrictEqual(fotosSinBase64([{ id: 'slot_A', file: null }, null]), [{ id: 'slot_A', file: null }, null]);
    assert.strictEqual(fotosSinBase64(null), null);
    assert.strictEqual(fotosSinBase64(undefined), undefined);
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exitCode = fallos ? 1 : 0;
