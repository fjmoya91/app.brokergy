// Lo que el ordenador le cuenta al MÓVIL tras un ajuste del croquis:
// las zonas (del mundo al lienzo del teléfono) y las PAREDES NUEVAS (del
// lienzo nuevo del ordenador al del teléfono). Ver `logic/croquisMovilPuente.js`.
//
//   node implementation/backend/scripts/test_croquis_movil_puente.mjs

import assert from 'assert';
import { respuestaParaElMovil } from '../../frontend/src/features/cee-envolvente/logic/croquisMovilPuente.js';

let fallos = 0;
function prueba(nombre, fn) {
    try { fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

console.log('croquisMovilPuente');

// El teléfono abrió la sesión con el lienzo A; al volver a medir, el ordenador
// quedó en el lienzo B (re-encuadrado 3 m a la izquierda y 2 m más arriba).
const marcoMovil = { dx: 491950, y0: 4331712 };
const marcoNuevo = { dx: 491953, y0: 4331710 };
// Un punto del MUNDO y dónde cae en cada lienzo.
const X = 491980, Y = 4331690;
const enMovil = [X - marcoMovil.dx, marcoMovil.y0 - Y];   // [30, 22]
const enNuevo = [X - marcoNuevo.dx, marcoNuevo.y0 - Y];   // [27, 20]

prueba('las paredes nuevas se trasladan al lienzo del teléfono', () => {
    const r = respuestaParaElMovil({
        ok: true, texto: 'ok', lineas: ['Garaje 121 m²'],
        zonasMundo: [],
        muros: [{ tipo: 'FACHADA', svg: [enNuevo, [enNuevo[0] + 5, enNuevo[1]]] }],
        marcoNuevo,
    }, marcoMovil);
    assert.strictEqual(r.remedido, true);
    assert.deepStrictEqual(r.muros[0].svg[0], enMovil);
    assert.deepStrictEqual(r.muros[0].svg[1], [enMovil[0] + 5, enMovil[1]]);
    assert.strictEqual(r.muros[0].tipo, 'FACHADA');
});

prueba('las zonas del mundo caen en el mismo sitio que las paredes', () => {
    const r = respuestaParaElMovil({
        ok: true, zonasMundo: [{ uso: 'GARAJE', poligono: [[X, Y], [X + 4, Y], [X + 4, Y - 3]] }],
        muros: [{ tipo: 'FACHADA', svg: [enNuevo, [enNuevo[0] + 4, enNuevo[1]]] }], marcoNuevo,
    }, marcoMovil);
    assert.deepStrictEqual(r.zonas[0].lienzo[0], r.muros[0].svg[0]);
    assert.deepStrictEqual(r.zonas[0].lienzo[1], r.muros[0].svg[1]);
});

prueba('sin re-encuadre, las paredes van tal cual', () => {
    const r = respuestaParaElMovil({ ok: true, zonasMundo: [], marcoNuevo: marcoMovil,
                                     muros: [{ tipo: 'X', svg: [[1, 2], [3, 4]] }] }, marcoMovil);
    assert.deepStrictEqual(r.muros[0].svg, [[1, 2], [3, 4]]);
});

prueba('un ajuste sin ninguna zona sigue contando que se ha vuelto a medir', () => {
    const r = respuestaParaElMovil({ ok: false, texto: 'nada', zonasMundo: [], marcoNuevo,
                                     muros: [{ tipo: 'X', svg: [[0, 0], [1, 0]] }] }, marcoMovil);
    assert.strictEqual(r.remedido, true);
    assert.deepStrictEqual(r.zonas, []);
    assert.strictEqual(r.ok, false);
});

prueba('si NO se ha vuelto a medir (fallo), no se afirma nada de la planta', () => {
    const r = respuestaParaElMovil({ ok: false, texto: 'No se ha podido ajustar' }, marcoMovil);
    assert.strictEqual(r.remedido, undefined);
    assert.strictEqual(r.muros, undefined);
    assert.strictEqual(r.zonas, undefined);
});

prueba('lo interno del ordenador no viaja al teléfono', () => {
    const r = respuestaParaElMovil({ ok: true, zonasMundo: [], muros: [], marcoNuevo }, marcoMovil);
    assert.ok(!('zonasMundo' in r) && !('marcoNuevo' in r));
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
