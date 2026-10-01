// Qué pared hay bajo el dedo en el croquis móvil (modo FOTOS).
// Ver `frontend/src/features/cee-envolvente/logic/fotoMovil.js`.
//
//   node implementation/backend/scripts/test_foto_movil.mjs

import assert from 'assert';
import { distanciaAPared, mitadDePared, paredEnPunto }
    from '../../frontend/src/features/cee-envolvente/logic/fotoMovil.js';

let fallos = 0;
function prueba(nombre, fn) {
    try { fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

console.log('fotoMovil');

const MUROS = [
    { id: 'FBN1', svg: [[0, 0], [10, 0]] },
    { id: 'FBE1', svg: [[10, 0], [10, 8]] },
    { id: 'MBS1', svg: [[10, 8], [0, 8]] },
    { svg: [[0, 8], [0, 0]] },                       // sin id: no se puede elegir
];

prueba('la distancia a una pared es la del punto más cercano del tramo', () => {
    assert.strictEqual(distanciaAPared([5, 2], [[0, 0], [10, 0]]), 2);
    assert.strictEqual(distanciaAPared([-3, 4], [[0, 0], [10, 0]]), 5);   // más allá del extremo
});

prueba('un toque cerca elige la pared más próxima', () => {
    assert.strictEqual(paredEnPunto(MUROS, [5, 0.4], 1), 'FBN1');
    assert.strictEqual(paredEnPunto(MUROS, [9.7, 0.5], 1), 'FBE1');   // en la esquina gana la más cercana
});

prueba('un toque lejos de todas no elige ninguna', () => {
    assert.strictEqual(paredEnPunto(MUROS, [5, 4], 1), null);
});

prueba('una pared sin id no se puede elegir', () => {
    assert.strictEqual(paredEnPunto(MUROS, [0.2, 4], 1), null);
});

prueba('el distintivo va a mitad del RECORRIDO, también en una pared quebrada', () => {
    assert.deepStrictEqual(mitadDePared([[0, 0], [10, 0]]), [5, 0]);
    assert.deepStrictEqual(mitadDePared([[0, 0], [4, 0], [4, 6]]), [4, 1]);
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
