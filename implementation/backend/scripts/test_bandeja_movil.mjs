// La BANDEJA DE SALIDA del croquis móvil: lo puro (`logic/bandejaMovil.js`).
//
//   node implementation/backend/scripts/test_bandeja_movil.mjs
//
// Sin navegador: lo de IndexedDB y el service worker se comprueban en el banco
// de pruebas con la app construida. Aquí, lo que decide qué se hace con lo que
// se encuentra en el teléfono y cómo se dice.

import assert from 'node:assert/strict';
import { esTransitorio, haceCuanto, pedir, recuperarTrazos, repartirLocal, textoPendiente, nuevoIdLocal }
    from '../../frontend/src/features/cee-envolvente/logic/bandejaMovil.js';

let fallos = 0;
async function prueba(nombre, fn) {
    try { await fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}

console.log('bandejaMovil');

await prueba('lo que NO es la app (nginx caído, un proxy) se reintenta como falta de red', () => {
    for (const s of [0, 408, 502, 503, 504]) assert.equal(esTransitorio(s), true, String(s));
    for (const s of [200, 400, 404, 409, 410, 429, 500]) assert.equal(esTransitorio(s), false, String(s));
});

await prueba('pedir(): sin red, con plazo agotado o con un 503 lanza SinRed; un 410 vuelve tal cual', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
        await assert.rejects(pedir('/x'), (e) => e.sinRed === true);
        globalThis.fetch = (_u, o) => new Promise((_res, rej) => {
            o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })));
        });
        await assert.rejects(pedir('/x', {}, { plazo: 30 }), (e) => e.sinRed === true);
        globalThis.fetch = async () => new Response('', { status: 503 });
        await assert.rejects(pedir('/x'), (e) => e.sinRed === true);
        globalThis.fetch = async () => new Response('{"error":"no"}', { status: 410 });
        assert.equal((await pedir('/x')).status, 410);
    } finally {
        globalThis.fetch = original;
    }
});

await prueba('un id por envío, distinto cada vez y con el formato que admite el servidor', () => {
    const a = nuevoIdLocal('fo'), b = nuevoIdLocal('fo');
    assert.notEqual(a, b);
    for (const id of [a, b, nuevoIdLocal('aj'), nuevoIdLocal()]) assert.match(id, /^[A-Za-z0-9_-]{6,48}$/);
});

await prueba('lo guardado de ESTE enlace se sigue; lo de OTRO con cosas sin mandar se ofrece', () => {
    const t = [{ uso: 'GARAJE', pts: [[0, 0], [4, 0], [4, 4]] }];
    assert.deepEqual(repartirLocal({ token: 'A', trazos: t, sinEnviar: true }, 'A'),
                     { propio: { token: 'A', trazos: t, sinEnviar: true }, rescate: null });
    assert.deepEqual(repartirLocal({ token: 'A', trazos: t, sinEnviar: true }, 'B').rescate.token, 'A');
    // De otro enlace pero ya mandado, o vacío: no hay nada que rescatar.
    assert.deepEqual(repartirLocal({ token: 'A', trazos: t, sinEnviar: false }, 'B'), { propio: null, rescate: null });
    assert.deepEqual(repartirLocal({ token: 'A', trazos: [], sinEnviar: true }, 'B'), { propio: null, rescate: null });
    assert.deepEqual(repartirLocal(null, 'B'), { propio: null, rescate: null });
});

await prueba('lo rescatado se lleva al lienzo NUEVO (el motor re-encuadra al volver a medir)', () => {
    const t = [{ uso: 'PORCHE', pts: [[1, 1], [5, 1], [5, 3]] }];
    // El lienzo nuevo empieza 2 m más al oeste y 1 m más al norte que el viejo.
    const viejo = { dx: 500000, y0: 4300030 }, nuevo = { dx: 499998, y0: 4300031 };
    const r = recuperarTrazos(t, viejo, nuevo);
    assert.deepEqual(r[0].pts, [[3, 2], [7, 2], [7, 4]]);
    assert.equal(r[0].uso, 'PORCHE');
    // Mismo punto del MUNDO antes y después.
    const mundo = ([x, y], m) => [x + m.dx, m.y0 - y];
    assert.deepEqual(mundo(t[0].pts[0], viejo), mundo(r[0].pts[0], nuevo));
    // Sin los dos marcos no se sabe: se deja igual.
    assert.deepEqual(recuperarTrazos(t, null, nuevo), t);
    assert.deepEqual(recuperarTrazos(t, viejo, viejo), t);
});

await prueba('lo pendiente se dice en una línea, en castellano', () => {
    assert.equal(textoPendiente({}), '');
    assert.equal(textoPendiente({ zonas: 1 }), '1 zona pintada');
    assert.equal(textoPendiente({ zonas: 2, fotos: 3 }), '2 zonas pintadas y 3 fotos');
    assert.equal(textoPendiente({ zonas: 2, fotos: 1, ajuste: true }), '2 zonas pintadas, 1 foto y el ajuste a Catastro');
    assert.equal(textoPendiente({ huecos: 1 }), '1 pared con ventanas por poner');
    assert.equal(textoPendiente({ lecturas: 2 }), '2 fotos por contar');
});

await prueba('cuánto lleva algo esperando', () => {
    const ahora = Date.UTC(2026, 8, 30, 12);
    assert.equal(haceCuanto(ahora - 20_000, ahora), 'hace un momento');
    assert.equal(haceCuanto(ahora - 40 * 60_000, ahora), 'hace 40 min');
    assert.equal(haceCuanto(ahora - 3 * 3600_000, ahora), 'hace 3 h');
    assert.equal(haceCuanto(ahora - 3 * 86_400_000, ahora), 'hace 3 días');
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
