// ============================================================================
// test_medidas_aislamiento.mjs — las medidas de aislamiento del CEE final
// (`frontend/.../cee-envolvente/logic/medidasAislamiento.js`).
//
//   node implementation/backend/scripts/test_medidas_aislamiento.mjs
//
// Vigila lo que no se ve en pantalla y rompe el .cex:
//   · que NINGÚN texto lleve un carácter fuera de latin-1 (una λ o una raya
//     larga tumban la escritura del fichero entero);
//   · que la U resultante sea la cuenta de CE3X, 1/(1/U + e/λ);
//   · que una medianera no se aísle y que sin cerramientos no se ofrezca.
// ============================================================================
import assert from 'node:assert/strict';
import { medidaAislamiento, SOLUCIONES_AISLAMIENTO, uConAislante }
    from '../../frontend/src/features/cee-envolvente/logic/medidasAislamiento.js';

let n = 0;
const ok = (msg) => { n += 1; console.log(`✓ ${msg}`); };

const CERR = [
    { nombre: 'FBN1 CALLE', tipo: 'Fachada', superficie: 30, u: 0.66 },
    { nombre: 'FBS1 PATIO', tipo: 'Fachada', superficie: 20, u: 0.66 },
    { nombre: 'MBE1', tipo: 'Medianera', superficie: 25, u: 0 },
    { nombre: 'CUB1 CUBIERTA', tipo: 'Cubierta', superficie: 186.56, u: 0.45 },
];

// 1. Todos los textos caben en latin-1.
for (const [elemento, sols] of Object.entries(SOLUCIONES_AISLAMIENTO)) {
    for (const s of sols) {
        const m = medidaAislamiento({ elemento, solucion: s.id, cerramientos: CERR });
        for (const t of [m.datos.nombre, m.datos.caracteristicas, m.datos.otros_datos, m.datos.aislamiento[0].nombre]) {
            const malo = [...t].find((c) => c.codePointAt(0) > 0xff);
            assert.equal(malo, undefined, `${elemento}/${s.id}: «${malo}» no cabe en un .cex`);
        }
    }
}
ok('ningún texto de ninguna solución se sale de latin-1');

// 2. La U es la de CE3X y el texto dice las dos.
const cub = medidaAislamiento({ elemento: 'cubierta', solucion: 'lana_forjado', espesorCm: 12, cerramientos: CERR });
assert.ok(Math.abs(cub.u_despues[0] - uConAislante(0.45, 0.035, 0.12)) < 1e-12);
assert.equal(cub.u_despues[0].toFixed(3), '0.177');
assert.match(cub.datos.caracteristicas, /pasa de U = 0,45 a 0,18 W\/m²·K/);
assert.match(cub.datos.caracteristicas, /12 cm de espesor y conductividad térmica de 0,035 W\/m·K/);
assert.deepEqual(cub.datos.aislamiento[0], {
    nombre: 'AISLAMIENTO CUBIERTA', elementos: ['cubierta'], modo: 'lambda',
    lambda: 0.035, espesor: 0.12, exterior: true });
ok('cubierta: U 0,45 → 0,18 con 12 cm de lana mineral, y el texto lo dice');

// 3. La fachada no incluye la medianera; cambiar la solución cambia el texto.
const fach = medidaAislamiento({ elemento: 'fachada', solucion: 'trasdosado', espesorCm: 6, cerramientos: CERR });
assert.deepEqual(fach.cerramientos, ['FBN1 CALLE', 'FBS1 PATIO']);
assert.equal(fach.superficie, 50);
assert.match(fach.datos.caracteristicas, /trasdosado autoportante/);
assert.equal(fach.datos.aislamiento[0].exterior, false);
ok('fachada: sin la medianera, y el trasdosado es por el interior');

// 4. Sin cerramientos de ese tipo, no se ofrece.
const nada = medidaAislamiento({ elemento: 'cubierta', cerramientos: CERR.filter((c) => c.tipo !== 'Cubierta') });
assert.equal(nada.disponible, false);
assert.equal(nada.datos, null);
ok('sin cubierta no hay medida de cubierta');

console.log(`\n${n} comprobaciones correctas`);
