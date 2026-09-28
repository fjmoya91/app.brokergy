/**
 * El LIENZO se mueve al volver a medir, y lo guardado tiene que moverse con él.
 *
 * EL CASO — 26RES080_85 (CL Sol 20, Campo de Criptana, 28/09/2026). El
 * certificador dibujó la pared del garaje en la planta baja, quitó un almacén,
 * y la pared apareció siete metros al oeste de donde la había dibujado: «las
 * paredes iban a la mierda, las ventanas desaparecían».
 *
 * El motor encuadra el lienzo en lo que dibuja (`x − minx + margen`), así que
 * al quitar un cuerpo cambia el origen de TODAS las coordenadas del plano. Las
 * cifras de aquí son las que devuelve el motor de verdad para esa casa: la
 * geometría entera (`BASE`) y sin los dos almacenes (`SIN_ALMACENES`).
 *
 *   node implementation/backend/scripts/test_lienzo_movil.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const cargar = f => import(pathToFileURL(path.join(LOGIC, f)).href);
const { deltaLienzo, trasladarTrabajo, trasladarMuros, aplicarTrabajo, zonasValidas } =
    await cargar('trabajoGuardado.js');
const { traduccionDeIds, solape } = await cargar('identidadParedes.js');
const { lienzoAMundo } = await cargar('geometriaPlano.js');

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const BBOX = [488734.21, 4361660.84, 488810.8, 4361723.02];
const REF_BASE = lienzoAMundo({ bbox: BBOX, en_el_lienzo: { x: -33.89, y: -21.02 } });
const REF_SIN = lienzoAMundo({ bbox: BBOX, en_el_lienzo: { x: -44.78, y: -28.47 } });

const pared = (id, svg, planta = 'PB') => ({ id, planta, svg, svg_catastro: svg });
//: Planta baja con los dos almacenes dentro (16 paredes; aquí las de la casa).
const BASE = {
    FBNO1: pared('FBNO1', [[16.46, 12.69], [13.47, 14.99]]),   // 3,77 al patio
    FBSO3: pared('FBSO3', [[13.47, 14.99], [16.03, 18.61]]),   // 4,43 al patio
    FBNO2: pared('FBNO2', [[16.03, 18.61], [12.52, 21.3]]),    // 4,42 al patio
    FBSE2: pared('FBSE2', [[17.83, 23.29], [28.83, 15.68]]),   // 13,38 a la calle
    MBS2: pared('MBS2', [[12.52, 21.3], [17.83, 23.29]]),      // 5,67 medianera
    MBNE1: pared('MBNE1', [[21.88, 10.26], [20.58, 9.25]]),    // 1,65
    MBNE4: pared('MBNE4', [[28.83, 15.68], [21.88, 10.26]]),   // 8,81
    FBSO2: pared('FBSO2', [[13.83, 9.62], [16.46, 12.69]]),    // del almacén
};
//: La misma planta sin los almacenes: otro encuadre y otros nombres.
const SIN_ALMACENES = {
    FBNO2: pared('FBNO2', [[5.57, 5.24], [2.58, 7.54]]),
    FBSO1: pared('FBSO1', [[2.58, 7.54], [5.14, 11.16]]),
    FBNO3: pared('FBNO3', [[5.14, 11.16], [1.63, 13.85]]),
    FBSE1: pared('FBSE1', [[6.94, 15.84], [17.94, 8.23]]),
    MBS1: pared('MBS1', [[1.63, 13.85], [6.94, 15.84]]),
    MBNE1: pared('MBNE1', [[17.94, 8.23], [9.69, 1.8]]),       // 1,65 + 8,81 fundidas
    MBNE2: pared('MBNE2', [[9.69, 1.8], [9.48, 1.63]]),
    FBNO1: pared('FBNO1', [[9.48, 1.63], [9.3, 1.8]]),
    PVBNO1: pared('PVBNO1', [[9.3, 1.8], [5.57, 5.24]]),       // contra el almacén
};

console.log('\nCUÁNTO SE MUEVE');
prueba('la traslación sale de las dos georreferencias', () => {
    const d = deltaLienzo(REF_BASE, REF_SIN);
    assert.ok(Math.abs(d[0] + 10.89) < 0.01 && Math.abs(d[1] + 7.45) < 0.01, JSON.stringify(d));
});
prueba('la fachada de la calle, que no cambia, cae en el mismo sitio', () => {
    const [m] = Object.values(trasladarMuros({ FBSE2: BASE.FBSE2 }, deltaLienzo(REF_BASE, REF_SIN)));
    assert.deepEqual(m.svg_catastro, SIN_ALMACENES.FBSE1.svg);
});
prueba('sin nada que mover no se mueve nada (ni por redondeo)', () => {
    assert.equal(deltaLienzo(REF_SIN, { ...REF_SIN }), null);
    assert.equal(deltaLienzo(null, REF_SIN), null);
});

console.log('\nLO GUARDADO EN EL LIENZO VIAJA CON ÉL');
//: La pared del garaje tal y como la dibujó el certificador (en la BASE).
const PBX2 = { id: 'PBX2', planta: 'PB', nivel: 0, tipo: 'PARTICION_VERTICAL',
               subtipo: 'DIBUJADA', alto: 2.8, svg: [[16.03, 18.61], [20.32, 21.6]] };
prueba('la pared dibujada sigue en el mismo sitio del EDIFICIO', () => {
    const g = trasladarTrabajo({ paredes: { dibujadas: [PBX2], movidas: {} } },
                               deltaLienzo(REF_BASE, REF_SIN));
    const aMundo = (ref, [x, y]) => [+(x + ref.dx).toFixed(2), +(ref.y0 - y).toFixed(2)];
    assert.deepEqual(g.paredes.dibujadas[0].svg.map(p => aMundo(REF_SIN, p)),
                     PBX2.svg.map(p => aMundo(REF_BASE, p)));
});
prueba('las paredes movidas y el polígono de la cubierta, también', () => {
    const d = deltaLienzo(REF_BASE, REF_SIN);
    const g = trasladarTrabajo({ paredes: { movidas: { FBSE2: [[1, 1], [2, 2]] }, dibujadas: [] },
                                 cubierta_reforma: { PB: { poligono: [[0, 0], [1, 0], [1, 1]] },
                                                     P1: { entera: true } } }, d);
    assert.deepEqual(g.paredes.movidas.FBSE2[0], [+(1 + d[0]).toFixed(2), +(1 + d[1]).toFixed(2)]);
    assert.equal(g.cubierta_reforma.PB.poligono.length, 3);
    assert.deepEqual(g.cubierta_reforma.P1, { entera: true });
});
prueba('lo que va en el MUNDO no se toca: contorno y zonas', () => {
    const zonas = [{ nivel: 0, poligono: [[488785.9, 4361678.7], [1, 2], [3, 4]] }];
    const recorte = { poligono: [[5, 5], [6, 6], [7, 5]] };
    const g = trasladarTrabajo({ zonas_fuera: zonas, recorte_vivienda: recorte },
                               deltaLienzo(REF_BASE, REF_SIN));
    assert.equal(g.zonas_fuera, zonas);
    assert.equal(g.recorte_vivienda, recorte);
});

console.log('\nLA IDENTIDAD DE LAS PAREDES, EN EL MISMO LIENZO');
prueba('sin trasladar, no casaba ninguna (el fallo)', () => {
    const { traduce } = traduccionDeIds(BASE, SIN_ALMACENES);
    assert.equal(traduce.FBNO1, undefined);
});
prueba('trasladando, cada pared encuentra la suya aunque cambie de nombre', () => {
    const viejos = trasladarMuros(BASE, deltaLienzo(REF_BASE, REF_SIN));
    const { traduce } = traduccionDeIds(viejos, SIN_ALMACENES);
    assert.equal(traduce.FBNO1, 'FBNO2');     // la del patio de 3,77
    assert.equal(traduce.FBSO3, 'FBSO1');
    assert.equal(traduce.FBNO2, 'FBNO3');
    assert.equal(traduce.FBSE2, 'FBSE1');     // la de la calle
    assert.equal(traduce.MBS2, 'MBS1');
});
prueba('dos tramos que se funden llevan su trabajo a la pared que queda', () => {
    const viejos = trasladarMuros(BASE, deltaLienzo(REF_BASE, REF_SIN));
    const { traduce, perdidos } = traduccionDeIds(viejos, SIN_ALMACENES);
    assert.equal(traduce.MBNE4, 'MBNE1');
    assert.ok(!perdidos.includes('MBNE4'));
});
prueba('la pared del almacén quitado se da por perdida (y se avisa aparte)', () => {
    const viejos = trasladarMuros(BASE, deltaLienzo(REF_BASE, REF_SIN));
    const { perdidos } = traduccionDeIds(viejos, SIN_ALMACENES);
    assert.ok(perdidos.includes('FBSO2'));
});

console.log('\nLA PARED RECORTADA Y RENOMBRADA');
prueba('la fachada de la calle recortada por el garaje comparte el 78 %', () => {
    const calle = [[6.94, 15.84], [17.94, 8.23]];
    const recortada = [[9.32, 14.19], [17.94, 8.23]];
    assert.ok(Math.abs(solape(calle, recortada) - 10.48 / 13.38) < 0.01);
});
prueba('recortada Y con otro nombre, sigue siendo ella', () => {
    const antes = { FBSE1: pared('FBSE1', [[6.94, 15.84], [17.94, 8.23]]) };
    const despues = { FBSE3: pared('FBSE3', [[9.32, 14.19], [17.94, 8.23]]),
                      PVBSO1: pared('PVBSO1', [[5.14, 11.16], [9.32, 14.19]]) };
    const { traduce, perdidos } = traduccionDeIds(antes, despues);
    assert.equal(traduce.FBSE1, 'FBSE3');
    assert.deepEqual(perdidos, []);
});
prueba('una paralela a medio metro no es la misma pared', () => {
    assert.equal(solape([[0, 0], [10, 0]], [[0, 0.5], [10, 0.5]]), 0);
});
prueba('en otra planta no se busca', () => {
    const antes = { F1SE1: pared('F1SE1', [[6.94, 15.84], [17.94, 8.23]], 'P1') };
    const despues = { FBSE3: pared('FBSE3', [[9.32, 14.19], [17.94, 8.23]], 'PB') };
    assert.deepEqual(traduccionDeIds(antes, despues).perdidos, ['F1SE1']);
});

console.log('\nDOS PLANTAS, UNA ENCIMA DE OTRA');
prueba('la fachada recortada de la BAJA no se va a la de la PRIMERA', () => {
    // Las dos fachadas a la calle tienen el MISMO trazado en planta. Al restar
    // el garaje, la de la baja se recorta; la de la primera sigue igual. Sin
    // mirar la planta, el trabajo de la baja acababa en F1SE1.
    const calle = [[6.94, 15.84], [17.94, 8.23]];
    const antes = { FBSE1: pared('FBSE1', calle, 'PB'), F1SE1: pared('F1SE1', calle, 'P1') };
    const despues = { FBSE1: pared('FBSE1', [[9.32, 14.19], [17.94, 8.23]], 'PB'),
                      F1SE1: pared('F1SE1', calle, 'P1') };
    const { traduce, perdidos } = traduccionDeIds(antes, despues);
    assert.equal(traduce.FBSE1, undefined);      // se queda en la suya, recortada
    assert.deepEqual(perdidos, []);
});

console.log('\nAL APLICAR EL TRABAJO');
const piezas = {
    paredDibujada: d => ({ ...d, dibujada: true, huecos: [] }),
    rescatarHueco: h => h, medirPared: () => ({}),
};
prueba('dos paredes que acaban en una SUMAN sus huecos', () => {
    const nuevo = { MBNE1: { id: 'MBNE1', huecos: [] } };
    const g = { huecos: { MBNE1: [{ nombre: 'V1' }], MBNE4: [{ nombre: 'V2' }] } };
    const traduce = { MBNE4: 'MBNE1' };
    aplicarTrabajo(nuevo, g, k => traduce[k] || k, piezas);
    assert.deepEqual(nuevo.MBNE1.huecos.map(h => h.nombre).sort(), ['V1', 'V2']);
});
prueba('las zonas guardadas vuelven, y las que no sirven no', () => {
    const r = aplicarTrabajo({}, { zonas_fuera: [
        { nivel: 0, poligono: [[0, 0], [1, 0], [1, 1]], uso: 'GARAJE' },
        { nivel: 'x', poligono: [[0, 0], [1, 0], [1, 1]] },
        { nivel: 1, poligono: [[0, 0]] }] }, k => k, piezas);
    assert.equal(r.zonasFuera.length, 1);
    assert.equal(zonasValidas(null).length, 0);
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
