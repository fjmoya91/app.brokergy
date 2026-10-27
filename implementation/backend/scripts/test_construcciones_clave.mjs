// Dos construcciones de Catastro con el MISMO código (regla 50).
//
// 26RES080_OP85 (RC 9053305VJ9395S0001BM): la VIVIENDA de 28 m² y la piscina
// DEPORTIVO de 22 m² son las dos `1/00/01`. Con la selección por código a secas,
// marcar la vivienda arrastraba la piscina y la planta baja del `.cex` salía con
// 176 m² en vez de 154. El motor (`aplicar_seleccion`) lo cubre
// `tests/test_construcciones.py`; esto, el lado de la app.
//
//   node implementation/backend/scripts/test_construcciones_clave.mjs
import assert from 'node:assert/strict';
import { claveConstruccion, desgloseConstrucciones, resolverElegidas, usoClave }
    from '../../frontend/src/utils/construcciones.js';

const OP85 = [
    { uso: 'VIVIENDA', codigo: '1/00/01', cuenta: true, planta: '00', superficie: 28 },
    { uso: 'APARCAMIENTO', codigo: '1/00/02', cuenta: true, planta: '00', superficie: 81 },
    { uso: 'ALMACEN', codigo: '1/00/03', cuenta: true, planta: '00', superficie: 45 },
    { uso: 'DEPORTIVO', codigo: '1/00/01', cuenta: false, planta: '00', superficie: 22 },
    { uso: 'VIVIENDA', codigo: '1/01/01', cuenta: true, planta: '01', superficie: 124 },
];

// La receta del USO es la de `_uso_clave` del motor.
assert.equal(usoClave(' Almacén  general '), 'ALMACEN GENERAL');

// Solo lleva el uso el código que se repite.
assert.equal(claveConstruccion(OP85[0], OP85), '1/00/01#VIVIENDA');
assert.equal(claveConstruccion(OP85[3], OP85), '1/00/01#DEPORTIVO');
assert.equal(claveConstruccion(OP85[1], OP85), '1/00/02');
// La que trae el motor (`clave`) manda.
assert.equal(claveConstruccion({ codigo: '1/00/01', clave: 'X' }, OP85), 'X');

// Lo GUARDADO antes (códigos sueltos) se resuelve con su desglose: fuera la piscina.
assert.deepEqual(
    resolverElegidas(['1/00/01', '1/00/02', '1/00/03', '1/01/01'], OP85),
    ['1/00/01#VIVIENDA', '1/00/02', '1/00/03', '1/01/01']);
// Si cuentan todas las del código, se queda suelto (igual que antes).
const ambas = OP85.map(c => ({ ...c, cuenta: true }));
assert.deepEqual(resolverElegidas(['1/00/01'], ambas), ['1/00/01']);
// Sin desglose no hay con qué resolver: tal cual.
assert.deepEqual(resolverElegidas(['1/00/01'], null), ['1/00/01']);
assert.equal(resolverElegidas(null, OP85), null);

// La ficha técnica guarda ya la clave con uso.
const detalle = [
    { code: '1/00/01', originalType: 'VIVIENDA', floor: '00', surface: 28 },
    { code: '1/00/01', originalType: 'DEPORTIVO', floor: '00', surface: 22 },
    { code: '1/01/01', originalType: 'VIVIENDA', floor: '01', surface: 124 },
];
assert.deepEqual(desgloseConstrucciones(detalle, [0, 2]).construcciones_elegidas,
                 ['1/00/01#VIVIENDA', '1/01/01']);

console.log('OK · test_construcciones_clave');
