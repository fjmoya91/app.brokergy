// DELIMITAR LA VIVIENDA desde el MÓVIL: lo geométrico (imán, cierre, del
// lienzo del teléfono al mundo y vuelta) y lo que se le cuenta al teléfono
// después (`logic/contornoMovil.js`, `logic/croquisMovilPuente.js`).
//
//   node implementation/backend/scripts/test_contorno_movil.mjs

import assert from 'assert';
import { cierraContorno, contornoAlMundo, contraParaReclasificar, lineasResumen, mundoAlContorno,
         pegarVerticeContorno, resumenParedes } from '../../frontend/src/features/cee-envolvente/logic/contornoMovil.js';
import { planoParaElMovil, respuestaParaElMovil } from '../../frontend/src/features/cee-envolvente/logic/croquisMovilPuente.js';
import { TIPOS_PARED } from '../../frontend/src/features/cee-envolvente/logic/tiposPared.js';

let fallos = 0;
function prueba(nombre, fn) {
    try { fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

console.log('contornoMovil');

// Una hilera de adosados de 30 m: la fachada a la calle y la del patio.
const MUROS = [
    { id: 'FBS1', svg: [[0, 0], [30, 0]], tipo: 'FACHADA', largo: 30 },
    { id: 'FBN1', svg: [[0, 10], [30, 10]], tipo: 'FACHADA', largo: 30 },
    { id: 'MBO1', svg: [[0, 0], [0, 10]], tipo: 'MEDIANERA', largo: 10 },
    { id: 'MBE1', svg: [[30, 0], [30, 10]], tipo: 'PARTICION_INTERIOR_VERTICAL', largo: 10 },
];

prueba('el imán pega a la ESQUINA antes que a la pared', () => {
    const r = pegarVerticeContorno(MUROS, [0.4, 0.3], 1);
    assert.deepStrictEqual(r, { p: [0, 0], pegado: 'esquina' });
});

prueba('sin esquina cerca, a la PARED más cercana (la línea con la casa de al lado)', () => {
    // A mitad de la fachada: ahí acaba esta casa y empieza la de al lado.
    const r = pegarVerticeContorno(MUROS, [12.3, 0.6], 1);
    assert.deepStrictEqual(r, { p: [12.3, 0], pegado: 'pared' });
});

prueba('fuera del radio, el punto se queda donde se toca (la calle, el jardín)', () => {
    const r = pegarVerticeContorno(MUROS, [12.3, -4.2], 1);
    assert.deepStrictEqual(r, { p: [12.3, -4.2], pegado: null });
});

prueba('tocar la PRIMERA esquina cierra, pero solo con tres o más', () => {
    const pts = [[12, 0], [20, 0], [20, 10]];
    assert.strictEqual(cierraContorno(pts, [12.2, 0.1], 0.5), true);
    assert.strictEqual(cierraContorno(pts.slice(0, 2), [12.2, 0.1], 0.5), false);
    assert.strictEqual(cierraContorno(pts, [15, 5], 0.5), false);
});

prueba('del lienzo del teléfono al MUNDO y de vuelta, sin perder nada', () => {
    const marco = { dx: 491950, y0: 4331712 };
    const pts = [[12, 0], [20, 0], [20, 10], [12, 10]];
    const mundo = contornoAlMundo(pts, marco);
    assert.deepStrictEqual(mundo[0], [491962, 4331712]);
    assert.deepStrictEqual(mundoAlContorno(mundo, marco), pts);
    assert.strictEqual(contornoAlMundo(pts, null), null);
});

prueba('el resumen cuenta por tipo de VERDAD (lo del motor traducido) y salta lo apartado', () => {
    const r = resumenParedes([...MUROS, { id: 'X', svg: [[0, 0], [1, 0]], tipo: 'FACHADA', excluida: true }]);
    const de = Object.fromEntries(r.map(f => [f.tipo, f]));
    assert.strictEqual(de.FACHADA.n, 2);
    assert.strictEqual(de.FACHADA.largo, 60);
    assert.strictEqual(de.MEDIANERA.n, 1);
    assert.strictEqual(de.PARTICION_VERTICAL.n, 1);        // PARTICION_INTERIOR_VERTICAL del motor
    assert.deepStrictEqual(lineasResumen(r),
        ['2 fachadas · 60,0 m', '1 medianera · 10,0 m', '1 partición a un local · 10,0 m']);
    // Sin largo, se mide el trazo.
    assert.strictEqual(resumenParedes([{ svg: [[0, 0], [3, 4]], tipo: 'FACHADA' }])[0].largo, 5);
});

prueba('decir lo MISMO que Catastro es volver a lo de Catastro', () => {
    assert.strictEqual(contraParaReclasificar(MUROS[0], 'FACHADA'), null);
    assert.strictEqual(contraParaReclasificar(MUROS[0], 'MEDIANERA'), 'MEDIANERA');
    // La partición del motor (nombre largo) también se reconoce como la suya.
    assert.strictEqual(contraParaReclasificar(MUROS[3], 'PARTICION_VERTICAL'), null);
    assert.strictEqual(contraParaReclasificar(MUROS[0], 'PATIO'), undefined);
    assert.deepStrictEqual(TIPOS_PARED.map(t => t.id), ['FACHADA', 'MEDIANERA', 'PARTICION_VERTICAL']);
});

console.log('croquisMovilPuente — la vivienda');

const marcoMovil = { dx: 491950, y0: 4331712 };
const marcoNuevo = { dx: 491953, y0: 4331710 };   // el motor re-encuadró al recortar
const X = 491980, Y = 4331690;
const enMovil = [X - marcoMovil.dx, marcoMovil.y0 - Y];
const enNuevo = [X - marcoNuevo.dx, marcoNuevo.y0 - Y];

prueba('la respuesta de delimitar lleva el contorno en el lienzo del teléfono', () => {
    const r = respuestaParaElMovil({
        ok: true, tipo: 'vivienda', texto: 'Vivienda delimitada.',
        zonasMundo: [], recorteMundo: [[X, Y], [X + 6, Y], [X + 6, Y - 16]],
        muros: [{ id: 'MBO1', tipo: 'MEDIANERA', svg: [enNuevo, [enNuevo[0], enNuevo[1] + 16]] }],
        marcoNuevo,
    }, marcoMovil);
    assert.strictEqual(r.tipo, 'vivienda');
    assert.strictEqual(r.remedido, true);
    assert.deepStrictEqual(r.recorte[0], enMovil);
    // Las paredes nuevas caen en el MISMO sitio que el contorno.
    assert.deepStrictEqual(r.muros[0].svg[0], enMovil);
    assert.ok(!('recorteMundo' in r));
});

prueba('quitar el contorno: recorte a null (y sin la clave, no se dice nada)', () => {
    const quitado = respuestaParaElMovil({ ok: true, tipo: 'vivienda', zonasMundo: [], recorteMundo: null }, marcoMovil);
    assert.strictEqual(quitado.recorte, null);
    const croquis = respuestaParaElMovil({ ok: true, zonasMundo: [] }, marcoMovil);
    assert.ok(!('recorte' in croquis));
});

prueba('la planta entera, cuando se vuelve a medir desde el ordenador', () => {
    const p = planoParaElMovil({
        muros: [{ id: 'FBS1', tipo: 'FACHADA', svg: [enNuevo, [enNuevo[0] + 6, enNuevo[1]]] }],
        zonasMundo: [{ uso: 'GARAJE', poligono: [[X, Y], [X + 3, Y], [X + 3, Y - 3]] }],
        recorteMundo: [[X, Y], [X + 6, Y], [X + 6, Y - 16]],
        propuesta: [{ uso: 'PORCHE', pts: [enNuevo, [enNuevo[0] + 1, enNuevo[1]], [enNuevo[0] + 1, enNuevo[1] + 1]] }],
    }, marcoNuevo, marcoMovil);
    assert.deepStrictEqual(p.muros[0].svg[0], enMovil);
    assert.deepStrictEqual(p.zonas[0].lienzo[0], enMovil);
    assert.deepStrictEqual(p.recorte[0], enMovil);
    assert.deepStrictEqual(p.propuesta[0].pts[0], enMovil);
    assert.strictEqual(planoParaElMovil({}, null, marcoMovil), null);
    assert.strictEqual(planoParaElMovil({ recorteMundo: null }, marcoNuevo, marcoMovil).recorte, null);
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
