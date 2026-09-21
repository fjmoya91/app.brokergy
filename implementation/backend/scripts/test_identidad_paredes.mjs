/**
 * El trabajo sigue a la PARED, no a su nombre.
 *
 * EL CASO: 2370310VJ4027S (26RES060_195). El motor numera los cerramientos por
 * el ORDEN en que recorre el contorno de la planta, así que al volver a medir
 * sin el aparcamiento los nombres se reciclan — medido:
 *
 *    FBS1  6,90 m  ->  1,03 m     (otra pared)
 *    FBS2  3,40 m  ->  6,90 m     (la que era FBS1)
 *    FBS3  7,30 m  ->  3,40 m     (la que era FBS2)
 *
 * Como las ventanas, las medidas confirmadas, la U de cada pared, lo
 * reclasificado y la entrada van por ese nombre, el trabajo del certificador
 * saltaba a paredes que no eran. Y en silencio.
 *
 *   node implementation/backend/scripts/test_identidad_paredes.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const { traduccionDeIds, lectorDeIds, mismoTrazado } =
    await import(pathToFileURL(path.join(LOGIC, 'identidadParedes.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const pared = (id, svg, extra = {}) => ({ id, svg, svg_catastro: svg, ...extra });

//: Las coordenadas son las que devuelve el motor de verdad para este edificio.
const ANTES = {
    FBS1: pared('FBS1', [[3.32, 13.43], [9.99, 11.66]]),   // 6,90 m
    FBS2: pared('FBS2', [[11.03, 15.57], [14.19, 14.31]]), // 3,40 m
    FBS3: pared('FBS3', [[14.19, 14.31], [21.08, 11.91]]), // 7,30 m — la del garaje
    FBE1: pared('FBE1', [[21.08, 11.91], [18.42, 1.92]]),  // 10,34 m
    FBO1: pared('FBO1', [[1.92, 8.12], [3.32, 13.43]]),    // 5,49 m
};
const DESPUES = {
    FBS1: pared('FBS1', [[14.19, 14.31], [15.16, 13.97]]), // 1,03 m — NUEVA
    FBS2: pared('FBS2', [[3.32, 13.43], [9.99, 11.66]]),   // la que era FBS1
    FBS3: pared('FBS3', [[11.03, 15.57], [14.19, 14.31]]), // la que era FBS2
    FBE1: pared('FBE1', [[20.29, 8.93], [18.42, 1.92]]),   // 7,26 m — recortada
    FBO1: pared('FBO1', [[1.92, 8.12], [3.32, 13.43]]),    // igual
    PVBS2: pared('PVBS2', [[15.21, 10.28], [20.29, 8.93]]), // partición nueva
};

console.log('\nEL CASO DEL 195');
prueba('el trabajo de cada pared va a la pared, no al nombre reciclado', () => {
    const { traduce } = traduccionDeIds(ANTES, DESPUES);
    assert.equal(traduce.FBS1, 'FBS2');   // la de 6,90 m ahora se llama FBS2
    assert.equal(traduce.FBS2, 'FBS3');   // la de 3,40 m ahora se llama FBS3
});
prueba('la pared que se fue con el garaje NO hereda el trabajo de nadie', () => {
    const { traduce, perdidos } = traduccionDeIds(ANTES, DESPUES);
    assert.equal(traduce.FBS3, undefined);
    assert.deepEqual(perdidos, ['FBS3']);
    // y leerla devuelve null: su trabajo no tiene destino
    assert.equal(lectorDeIds(ANTES, DESPUES)('FBS3'), null);
});
prueba('una pared RECORTADA conserva su nombre y su trabajo', () => {
    // FBE1 pasa de 10,34 a 7,26 m: es la misma fachada, mas corta.
    const id = lectorDeIds(ANTES, DESPUES);
    assert.equal(id('FBE1'), 'FBE1');
});
prueba('lo que no se ha movido no se toca', () => {
    assert.equal(lectorDeIds(ANTES, DESPUES)('FBO1'), 'FBO1');
});

console.log('\nLO QUE NO DEBE TRADUCIRSE');
prueba('sin cambios de geometria la traduccion esta VACIA', () => {
    const { traduce, perdidos } = traduccionDeIds(ANTES, ANTES);
    assert.deepEqual(traduce, {});
    assert.deepEqual(perdidos, []);
});
prueba('al abrir la ventana (sin muros previos) no se traduce nada', () => {
    assert.deepEqual(traduccionDeIds({}, DESPUES), { traduce: {}, perdidos: [] });
});
prueba('una pared MOVIDA a mano no se da por perdida', () => {
    // Se compara el trazado de CATASTRO, no el que movio el certificador: si no,
    // deshacer o volver a medir le borraba el trabajo a la pared desplazada.
    const movida = { FBO1: { ...ANTES.FBO1, svg: [[50, 50], [55, 55]] } };
    const { traduce, perdidos } = traduccionDeIds(movida, DESPUES);
    assert.deepEqual(traduce, {});
    assert.deepEqual(perdidos, []);
});
prueba('una pared DIBUJADA por el certificador no entra en el reparto', () => {
    const conDibujada = { ...ANTES, P1X1: { id: 'P1X1', subtipo: 'DIBUJADA',
                                            svg: [[20.5, 12.1], [31.0, 16.1]] } };
    const { traduce, perdidos } = traduccionDeIds(conDibujada, DESPUES);
    assert.equal(traduce.P1X1, undefined);
    assert.ok(!perdidos.includes('P1X1'));
});
prueba('con dos candidatas iguales no se elige ninguna', () => {
    const dos = { A: pared('A', [[0, 0], [1, 0]]) };
    const gemelas = { X: pared('X', [[0, 0], [1, 0]]), Y: pared('Y', [[0, 0], [1, 0]]) };
    const { traduce, perdidos } = traduccionDeIds(dos, gemelas);
    assert.deepEqual(traduce, {});
    assert.deepEqual(perdidos, ['A']);
});

console.log('\nEL TRAZADO');
prueba('da igual en que sentido se haya recorrido', () => {
    assert.equal(mismoTrazado([[0, 0], [1, 1]], [[1, 1], [0, 0]]), true);
});
prueba('dos paredes distintas no son la misma', () => {
    assert.equal(mismoTrazado([[0, 0], [1, 1]], [[0, 0], [2, 2]]), false);
});
prueba('el redondeo del JSON no las separa', () => {
    assert.equal(mismoTrazado([[0, 0], [1, 1]], [[0.004, 0], [1, 1.004]]), true);
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
