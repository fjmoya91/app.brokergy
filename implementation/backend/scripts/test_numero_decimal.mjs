/**
 * La coma y el punto valen igual al teclear una medida.
 *
 * EL CASO: en el ancho de una ventana, un `<input type="number">` devuelve
 * CADENA VACÍA mientras lo escrito no sea un número completo, y `Number('')`
 * es 0. Medido en el Chrome del certificador (locale español), tecleando:
 *
 *     «2,2»   -> "2.2"   correcto
 *     «2.2»   -> pasa por «2.» y ahí devuelve ""  -> 0
 *     «2,»    -> "2"        (se come la coma)
 *     borrar  -> ""         -> 0
 *
 * Y como tocar una medida la da por CONFIRMADA, ese 0 quedaba marcado como
 * medida buena: una ventana de 0 m² que va al certificado.
 *
 *   node implementation/backend/scripts/test_numero_decimal.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { aNumero, aTexto } = await import(pathToFileURL(
    path.join(AQUI, '../../frontend/src/utils/numeroDecimal.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('\nLA COMA Y EL PUNTO SON LO MISMO');
prueba('2,2 y 2.2 dan el mismo número', () => {
    assert.equal(aNumero('2,2'), 2.2);
    assert.equal(aNumero('2.2'), 2.2);
});
prueba('también con el cero delante', () => {
    assert.equal(aNumero('0,85'), 0.85);
    assert.equal(aNumero('0.85'), 0.85);
});
prueba('y un número entero', () => {
    assert.equal(aNumero('3'), 3);
});

console.log('\nMIENTRAS SE ESCRIBE');
prueba('«2,» y «2.» valen 2, no 0 — que es lo que rompía el campo', () => {
    assert.equal(aNumero('2,'), 2);
    assert.equal(aNumero('2.'), 2);
});
prueba('«,5» y «.5» son medio metro', () => {
    assert.equal(aNumero(',5'), 0.5);
    assert.equal(aNumero('.5'), 0.5);
});
prueba('los espacios de más no estorban', () => {
    assert.equal(aNumero(' 1,25 '), 1.25);
});

console.log('\nLO QUE NO ES UN NÚMERO NO VALE 0');
prueba('el campo vacío no dice ningún número', () => {
    // `null` NO es 0: de esta diferencia depende que borrar un campo para
    // reescribirlo no meta un cero marcado como medida confirmada.
    assert.equal(aNumero(''), null);
    assert.equal(aNumero('   '), null);
    assert.equal(aNumero(null), null);
    assert.equal(aNumero(undefined), null);
});
prueba('un separador suelto tampoco', () => {
    assert.equal(aNumero(','), null);
    assert.equal(aNumero('.'), null);
    assert.equal(aNumero('-'), null);
});
prueba('ni letras, ni dos separadores, ni miles', () => {
    assert.equal(aNumero('abc'), null);
    assert.equal(aNumero('2,2,2'), null);
    assert.equal(aNumero('1.234,5'), null);
    assert.equal(aNumero('2 m'), null);
});
prueba('un número ya hecho pasa tal cual', () => {
    assert.equal(aNumero(1.3), 1.3);
    assert.equal(aNumero(0), 0);
    assert.equal(aNumero(NaN), null);
});

console.log('\nCÓMO SE ESCRIBE DE VUELTA');
prueba('en castellano, con COMA', () => {
    assert.equal(aTexto(2.2), '2,2');
    assert.equal(aTexto(0.05), '0,05');
});
prueba('sin rellenar decimales: «1,3», no «1,30»', () => {
    // El campo se está editando, y los ceros de más obligan a borrarlos antes
    // de poder teclear.
    assert.equal(aTexto(1.3), '1,3');
    assert.equal(aTexto(3), '3');
});
prueba('sin número, campo vacío', () => {
    assert.equal(aTexto(null), '');
    assert.equal(aTexto(''), '');
    assert.equal(aTexto(undefined), '');
});
prueba('ida y vuelta: lo que se teclea es lo que se vuelve a leer', () => {
    for (const t of ['2,2', '0,85', '12', '1,05']) {
        assert.equal(aTexto(aNumero(t)), t.replace('.', ','));
    }
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
