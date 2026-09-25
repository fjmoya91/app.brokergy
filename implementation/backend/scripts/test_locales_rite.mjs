// Estancias de la Memoria RITE: propuesta, reparto de m² y lo que se guarda.
// node implementation/backend/scripts/test_locales_rite.mjs
import assert from 'node:assert/strict';
import {
    proponerLocales, resolverLocales, paraGuardar, estadoInicial,
    sumarLocal, restarLocal, fijarM2, anadirPlanta, contar, MAX_LOCALES,
} from '../../frontend/src/features/expedientes/logic/localesRite.js';

const cuenta = (e) => e.plantas.flatMap(p => p.locales).reduce((m, l) => (m[l.tipo] = (m[l.tipo] || 0) + 1, m), {});

// 1 · Una planta de 70 m²: 2 dormitorios, 1 baño, todo abajo.
let e = proponerLocales({ superficie: 70, plantas: 1 });
assert.equal(e.plantas.length, 1);
assert.deepEqual(cuenta(e), { salon: 1, cocina: 1, recibidor: 1, distribuidor: 1, dormitorio: 2, bano: 1 });

// 2 · Dos plantas de 150 m²: día abajo (con un dormitorio, son 4), noche arriba.
e = proponerLocales({ superficie: 150, plantas: 2 });
assert.equal(contar(e.plantas[0], 'dormitorio'), 1);
assert.equal(contar(e.plantas[1], 'dormitorio'), 3);
assert.equal(contar(e.plantas[1], 'bano'), 2);
assert.equal(contar(e.plantas[0], 'aseo'), 1);

// 3 · El reparto suma exactamente la superficie, y numera solo lo repetido.
let r = resolverLocales(e, 150);
assert.equal(r.asignado, 150);
const nombres = r.plantas.flatMap(p => p.locales.map(l => l.nombre));
assert.ok(nombres.includes('SALON-COMEDOR') && nombres.includes('DORMITORIO 4') && nombres.includes('ASEO'));
assert.ok(!nombres.includes('COCINA 1'));

// 4 · Un m² tecleado se respeta y el resto se ajusta; vaciarlo vuelve a auto.
let e2 = fijarM2(e, 0, 0, 40);                  // salón a 40
r = resolverLocales(e2, 150);
assert.equal(r.plantas[0].locales[0].m2, 40);
assert.equal(r.asignado, 150);
r = resolverLocales(fijarM2(e2, 0, 0, null), 150);
assert.equal(r.plantas[0].locales[0].manual, false);

// 5 · Añadir y quitar por planta.
let e3 = sumarLocal(e, 1, 'aseo');
assert.equal(contar(e3.plantas[1], 'aseo'), 1);
e3 = restarLocal(e3, 1, 'dormitorio');
assert.equal(contar(e3.plantas[1], 'dormitorio'), 2);
e3 = anadirPlanta(e3);
assert.equal(e3.plantas.at(-1).planta, '2');

// 6 · Más de 25 estancias → aviso.
let big = { plantas: [{ planta: '0', locales: Array.from({ length: MAX_LOCALES + 1 }, () => ({ tipo: 'dormitorio' })) }] };
assert.ok(resolverLocales(big, 300).avisos.some(a => a.includes('25')));

// 7 · Lo guardado (aunque venga en MAYÚSCULAS) se vuelve a abrir tal cual.
const g = paraGuardar(resolverLocales(e2, 150));
const upper = JSON.parse(JSON.stringify(g).replace(/"tipo":"(\w+)"/g, (_, t) => `"tipo":"${t.toUpperCase()}"`));
const reabierto = estadoInicial({ guardado: upper, superficie: 150, plantas: 2 });
assert.deepEqual(cuenta(reabierto), cuenta(e2));
assert.equal(reabierto.plantas[0].locales[0].m2, 40);

console.log('✓ localesRite: 7 bloques OK');
