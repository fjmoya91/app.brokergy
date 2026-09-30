/**
 * Pruebas de las fotos de VENTANAS ventana por ventana
 * (frontend/src/features/docs/logic/ventanasObra.js) — sin BD ni Drive.
 *
 *   node implementation/backend/scripts/test_ventanas_obra.mjs
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const vo = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/docs/logic/ventanasObra.js')).href);

let ok = 0;
function prueba(nombre, fn) {
    try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('\nids y nombres');
prueba('V1…V99 son ventanas; lo demás no', () => {
    assert.strictEqual(vo.numeroVentana('V3'), 3);
    assert.strictEqual(vo.numeroVentana('v12'), 12);
    for (const malo of ['V0', 'V100', '3', 'X3', '', null, 'V1; drop']) assert.strictEqual(vo.numeroVentana(malo), null, String(malo));
});
prueba('sanear: id canónico, nombre limpio y con tope', () => {
    assert.deepStrictEqual(vo.sanearVentana('v2', '  Cocina  '), { ventana: 'V2', ventana_nombre: 'Cocina' });
    assert.deepStrictEqual(vo.sanearVentana('V2', ''), { ventana: 'V2', ventana_nombre: null });
    assert.strictEqual(vo.sanearVentana('V2', '<b>x</b>\u0007').ventana_nombre, 'bx/b');
    assert.strictEqual(vo.sanearVentana('V2', 'a'.repeat(80)).ventana_nombre.length, 40);
    assert.strictEqual(vo.sanearVentana('nada', 'Cocina'), null);
});
prueba('rótulo', () => {
    assert.strictEqual(vo.rotuloVentana('V2', 'Cocina'), 'Ventana 2 · Cocina');
    assert.strictEqual(vo.rotuloVentana('V2', null), 'Ventana 2');
    assert.strictEqual(vo.rotuloVentana(null), 'Sin ventana asignada');
});
prueba('solo los dos apartados de ventanas van por ventana', () => {
    assert.ok(vo.esPorVentana('FOTO_VENTANAS_ANTES') && vo.esPorVentana('FOTO_VENTANAS_DESPUES'));
    assert.ok(!vo.esPorVentana('FOTO_CUBIERTA_ANTES') && !vo.esPorVentana('toString'));
    assert.strictEqual(vo.pareja('FOTO_VENTANAS_ANTES'), 'FOTO_VENTANAS_DESPUES');
});

console.log('\nagrupar las fotos por ventana');
const antes = [
    { name: 'FOTO_VENTANAS_ANTES_1.jpg', ventana: 'V1', ventana_nombre: 'Salón', at: '2026-09-01T10:00:00Z' },
    { name: 'FOTO_VENTANAS_ANTES_2.jpg', ventana: 'V2', ventana_nombre: null, at: '2026-09-01T10:01:00Z' },
    { name: 'FOTO_VENTANAS_ANTES_3.jpg', ventana: 'V1', ventana_nombre: 'Salón', at: '2026-09-01T10:02:00Z' },
    { name: 'FOTO_VENTANAS_ANTES_4.jpg' },            // de antes de esto: sin ventana
];
const despues = [
    { name: 'FOTO_VENTANAS_DESPUES_1.jpg', ventana: 'V2', ventana_nombre: 'Cocina', at: '2026-09-20T10:00:00Z' },
];
const { ventanas, sinVentana } = vo.ventanasDe(antes, despues);
prueba('una tarjeta por ventana, en su orden', () => assert.deepStrictEqual(ventanas.map(v => v.id), ['V1', 'V2']));
prueba('cada ventana con sus fotos de antes y de después', () => {
    assert.strictEqual(ventanas[0].antes.length, 2);
    assert.strictEqual(ventanas[1].antes.length, 1);
    assert.strictEqual(ventanas[1].despues.length, 1);
});
prueba('el nombre vigente es el más reciente, venga del apartado que venga', () =>
    assert.strictEqual(ventanas[1].nombre, 'Cocina'));
prueba('lo que no dice de qué ventana es, aparte (nunca escondido)', () =>
    assert.deepStrictEqual(sinVentana.antes.map(i => i.name), ['FOTO_VENTANAS_ANTES_4.jpg']));
prueba('una ventana añadida en pantalla aparece aunque no tenga foto', () => {
    const r = vo.ventanasDe(antes, despues, [{ id: 'V3', nombre: 'Baño' }]);
    assert.deepStrictEqual(r.ventanas.map(v => v.id), ['V1', 'V2', 'V3']);
    assert.strictEqual(r.ventanas[2].nombre, 'Baño');
});
prueba('la siguiente ventana nunca reutiliza un número', () => {
    assert.strictEqual(vo.siguienteId(ventanas), 'V3');
    assert.strictEqual(vo.siguienteId([{ id: 'V1', n: 1 }, { id: 'V5', n: 5 }]), 'V6');
    assert.strictEqual(vo.siguienteId([]), 'V1');
});
prueba('subir todas a la vez: números seguidos tras las que ya tienen foto', () => {
    assert.deepStrictEqual(vo.idsParaTanda(ventanas, 3), ['V3', 'V4', 'V5']);
    // una ventana añadida en pantalla y vacía la ocupa la primera foto de la tanda
    const conBorrador = vo.ventanasDe(antes, despues, [{ id: 'V3' }]).ventanas;
    assert.deepStrictEqual(vo.idsParaTanda(conBorrador, 2), ['V3', 'V4']);
    assert.deepStrictEqual(vo.idsParaTanda([], 2), ['V1', 'V2']);
});
prueba('el después está hecho cuando TODAS las ventanas tienen su foto nueva', () => {
    assert.deepStrictEqual(vo.progresoDespues(ventanas), { total: 2, hechas: 1, faltan: 1 });
    const todas = vo.ventanasDe(antes, [...despues, { name: 'x', ventana: 'V1' }]).ventanas;
    assert.strictEqual(vo.progresoDespues(todas).faltan, 0);
});

console.log('\nAnexo Fotográfico: rotuladas y en orden de ventana');
const nombres = vo.nombresDeVentanas(antes, despues);
prueba('los nombres salen de los DOS apartados', () => assert.deepStrictEqual(nombres, { V1: 'Salón', V2: 'Cocina' }));
const ord = vo.ordenarPorVentana([
    { name: 'a', ventana: 'V2' }, { name: 'b' }, { name: 'c', ventana: 'V1' }, { name: 'd', ventana: 'V1' },
], nombres);
prueba('ventana 1, ventana 2… y lo que no tiene ventana al final', () =>
    assert.deepStrictEqual(ord.map(p => p.name), ['c', 'd', 'a', 'b']));
prueba('mismo rótulo en el antes y en el después, numerando las repetidas', () => {
    assert.deepStrictEqual(ord.map(p => p.rotulo), ['Ventana 1 · Salón', 'Ventana 1 · Salón (2)', 'Ventana 2 · Cocina', null]);
});

console.log(`\n${ok} pruebas correctas${process.exitCode ? ' · HAY FALLOS' : ''}\n`);
