/**
 * La PIZARRA del plano de la envolvente: qué entiende la app de cada trazo.
 *
 * Una casa de 10 × 8 m en el lienzo (la Y crece hacia el SUR): muros
 * exteriores al norte, este y sur —este último con una ventana— y una
 * medianera al oeste. Se le dibuja encima con cada lápiz, a mano alzada (con
 * temblor), y se comprueba lo que sale.
 *
 *   node implementation/backend/scripts/test_pizarra.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const P = await import(pathToFileURL(path.join(LOGIC, 'pizarra.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};
const cerca = (a, b, tol = 0.06, que = '') => assert.ok(Math.abs(a - b) <= tol, `${que} ${a} ≠ ${b}`);

const V1 = { uid: 'v1', nombre: 'V1', tipo: 'ventana', ancho: 1.2, alto: 1.2, pos: 0.5, estado: 'medido' };
const casa = () => [
    { id: 'FBN1', tipo: 'FACHADA', svg: [[0, 0], [10, 0]], huecos: [] },
    { id: 'FBE1', tipo: 'FACHADA', svg: [[10, 0], [10, 8]], huecos: [] },
    { id: 'FBS1', tipo: 'FACHADA', svg: [[10, 8], [0, 8]], huecos: [V1] },
    { id: 'MBO1', tipo: 'MEDIANERA', svg: [[0, 8], [0, 0]], huecos: [] },
];

/** Un trazo a mano: de a a b pasando por los puntos dados, con temblor. */
const mano = (...vertices) => {
    const pts = [];
    for (let i = 1; i < vertices.length; i++) {
        const [ax, ay] = vertices[i - 1], [bx, by] = vertices[i];
        const n = 20;
        for (let k = 0; k <= n; k++) {
            if (i > 1 && k === 0) continue;
            const t = k / n;
            const tiembla = 0.05 * Math.sin(k * 1.7 + i);
            pts.push([ax + (bx - ax) * t + tiembla, ay + (by - ay) * t - tiembla]);
        }
    }
    return pts;
};
const di = (pts, herramienta, muros = casa()) => P.interpretarTrazo({ pts, herramienta, muros, tam: 0.5, iman: 1.1 });

console.log('\nPAREDES');
prueba('un TOQUE con «Muro exterior» sobre la medianera la cambia', () => {
    const r = di([[0.15, 4]], 'FACHADA');
    assert.equal(r.accion, 'reclasificar');
    assert.equal(r.id, 'MBO1');
    assert.equal(r.tipo, 'FACHADA');
});
prueba('REPASAR una pared que ya está la cambia, no dibuja otra encima', () => {
    const r = di(mano([0.1, 7.6], [0.15, 0.5]), 'PARTICION_VERTICAL');
    assert.equal(r.accion, 'reclasificar');
    assert.equal(r.id, 'MBO1');
    assert.equal(r.tipo, 'PARTICION_VERTICAL');
});
prueba('un tabique a mano alzada sale RECTO y de pared a pared', () => {
    const r = di(mano([5, 0.4], [5.25, 7.5]), 'PARTICION_VERTICAL');
    assert.equal(r.accion, 'paredes');
    assert.equal(r.tramos.length, 1);
    const [[ax, ay], [bx, by]] = r.tramos[0];
    cerca(ax, bx, 0.02, 'recto en x:');
    cerca(ay, 0, 0.06, 'arranca en el muro norte:');
    cerca(by, 8, 0.06, 'muere en el muro sur:');
});
prueba('un arrastre RÁPIDO (tres puntos alineados) es UNA pared, no dos', () => {
    const r = di([[7, 2.2], [7.12, 6.5], [7.25, 10.8]], 'PARTICION_VERTICAL');
    assert.equal(r.accion, 'paredes');
    assert.equal(r.tramos.length, 1, JSON.stringify(r.tramos));
});
prueba('un trazo en L son DOS paredes que comparten la esquina', () => {
    const r = di(mano([2, 0.3], [2.1, 4], [0.4, 4.1]), 'PARTICION_VERTICAL');
    assert.equal(r.accion, 'paredes');
    assert.equal(r.tramos.length, 2, JSON.stringify(r.tramos));
    const [t1, t2] = r.tramos;
    assert.deepEqual(t1[1], t2[0], 'comparten el quiebro');
    cerca(t1[0][1], 0, 0.06, 'el primero arranca en el norte:');
    cerca(t1[0][0], t1[1][0], 0.02, 'el primero es vertical:');
    cerca(t2[0][1], t2[1][1], 0.02, 'el segundo es horizontal:');
    cerca(t2[1][0], 0, 0.06, 'y muere en la medianera:');
});
prueba('una raya de nada no es una pared', () => {
    const r = di([[3, 3], [3.05, 3.02], [3.08, 3.05]], 'PARTICION_VERTICAL');
    assert.ok(r.error, JSON.stringify(r));
});
prueba('la ESCUADRA del edificio también vale girada 20°', () => {
    const g = (20 * Math.PI) / 180;
    const rot = ([x, y]) => [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g)];
    const muros = casa().map(m => ({ ...m, svg: m.svg.map(rot) }));
    const dom = P.direccionDominante(muros);
    const grados = ((dom * 180) / Math.PI + 90) % 90;
    cerca(grados, 20, 0.5, 'dominante:');
    const r = di(mano(rot([5, 0.4]), rot([5.3, 7.5])), 'PARTICION_VERTICAL', muros);
    assert.equal(r.accion, 'paredes');
    const [[ax, ay], [bx, by]] = r.tramos[0];
    const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    cerca(((ang % 90) + 90) % 90, 20, 0.6, 'enderezado a la escuadra:');
});

console.log('\nVENTANAS Y PUERTAS');
prueba('una ventana se pone en SU muro, con el ancho de la raya', () => {
    const r = di(mano([3, 8.25], [4.5, 8.2]), 'ventana');
    assert.equal(r.accion, 'hueco');
    assert.equal(r.id, 'FBS1');
    assert.equal(r.tipo, 'ventana');
    cerca(r.ancho, 1.5, 0.1, 'ancho:');
    // FBS1 va de x=10 a x=0: el centro (x=3,75) está a 6,25 m de su arranque.
    cerca(r.pos, 0.625, 0.02, 'posición:');
});
prueba('un TOQUE pone una ventana de 1,30 m', () => {
    const r = di([[6, -0.2]], 'ventana');
    assert.equal(r.accion, 'hueco');
    assert.equal(r.id, 'FBN1');
    assert.equal(r.ancho, 1.3);
    cerca(r.pos, 0.6, 0.01, 'posición:');
});
prueba('una puerta por toque sale de 0,90 m', () => {
    const r = di([[10.2, 2]], 'puerta');
    assert.equal(r.accion, 'hueco');
    assert.equal(r.id, 'FBE1');
    assert.equal(r.ancho, 0.9);
});
prueba('en una MEDIANERA no se puede poner una ventana, y se dice por qué', () => {
    const r = di(mano([-0.2, 3], [-0.2, 4.5]), 'ventana');
    assert.ok(r.error);
    assert.match(r.error, /muro exterior/);
});
prueba('una ventana lejos de cualquier pared se pide encima de su pared', () => {
    const r = di(mano([4, 3], [5, 3]), 'ventana');
    assert.ok(r.error);
});
prueba('el ancho no puede pasar del 90 % de la pared', () => {
    const muros = casa().map(m => (m.id === 'FBE1' ? { ...m, svg: [[10, 0], [10, 1.5]] } : m));
    const r = di(mano([10.2, -0.5], [10.2, 2.5]), 'ventana', muros);
    assert.equal(r.accion, 'hueco');
    assert.equal(r.id, 'FBE1');
    assert.ok(r.ancho <= 1.35, `ancho ${r.ancho}`);
});

console.log('\nGOMA');
prueba('la goma sobre la ventana la quita (y no la pared)', () => {
    const r = di(mano([5.2, 7.5], [4.8, 8.5]), 'goma');
    assert.equal(r.accion, 'borrar');
    assert.equal(r.huecos.length, 1);
    assert.equal(r.huecos[0].uid, 'v1');
    assert.deepEqual(r.paredes, []);
});
prueba('la goma sobre una pared DIBUJADA la quita', () => {
    const muros = [...casa(), { id: 'PBX1', tipo: 'PARTICION_VERTICAL', dibujada: true, svg: [[5, 0], [5, 8]], huecos: [] }];
    const r = di(mano([4.5, 3], [5.5, 3.2]), 'goma', muros);
    assert.equal(r.accion, 'borrar');
    assert.deepEqual(r.paredes, ['PBX1']);
});
prueba('un toque de goma en una pared de Catastro la señala (la vista la aparta)', () => {
    const r = di([[10.1, 6]], 'goma');
    assert.equal(r.accion, 'borrar');
    assert.deepEqual(r.paredes, ['FBE1']);
});
prueba('lo que ya está apartado no se vuelve a «borrar»', () => {
    const muros = casa().map(m => (m.id === 'FBE1' ? { ...m, excluida: true } : m));
    const r = di([[10.1, 6]], 'goma', muros);
    assert.ok(r.error);
});

console.log('\nRUMBO DE UNA PARED NUEVA');
prueba('una pared al norte de la planta mira al NORTE', () => {
    assert.equal(P.rumboHaciaFuera([[0, 0], [10, 0]], [5, 4]), 'N');
});
prueba('al este, al ESTE; al sur, al SUR; al oeste, al OESTE', () => {
    assert.equal(P.rumboHaciaFuera([[10, 0], [10, 8]], [5, 4]), 'E');
    assert.equal(P.rumboHaciaFuera([[10, 8], [0, 8]], [5, 4]), 'S');
    assert.equal(P.rumboHaciaFuera([[0, 8], [0, 0]], [5, 4]), 'O');
});
prueba('el centro de la planta no cuenta las paredes dibujadas', () => {
    const c = P.centroDePlanta([...casa(), { id: 'X', dibujada: true, svg: [[100, 100], [101, 100]] }]);
    cerca(c[0], 5, 0.01); cerca(c[1], 4, 0.01);
});

console.log(`\n${ok} pruebas bien${process.exitCode ? ' — ALGUNA HA FALLADO' : ''}.\n`);
