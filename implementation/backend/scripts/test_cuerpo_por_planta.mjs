/**
 * Un cuerpo del edificio se deja fuera POR PLANTA — lo que ve la pantalla.
 *
 * El caso: 2370310VJ4027S (26RES060_195). Un garaje adosado con vivienda
 * encima es UN BuildingPart de DOS plantas, y Catastro solo declara
 * APARCAMIENTO en la baja. Marcarlo «fuera» en las dos le quitaba a la planta
 * primera su superficie y sus fachadas reales a la calle; pintarlo ahí como
 * «NO CUENTA» es lo que llevó a apartar a mano una fachada de verdad.
 *
 *   node implementation/backend/scripts/test_cuerpo_por_planta.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');

const { cuerposDeLaPlanta, sobraEn, dondeSobra, dondeSigue, nombreDeNivel } =
    await import(pathToFileURL(path.join(LOGIC, 'cuerposEnvolvente.js')).href);
const { particionArriba } =
    await import(pathToFileURL(path.join(LOGIC, 'fichaCe3x.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try {
        fn();
        ok += 1;
        console.log(`  ✓ ${nombre}`);
    } catch (e) {
        console.error(`  ✗ ${nombre}\n    ${e.message}`);
        process.exitCode = 1;
    }
};

//: Tal y como lo manda el motor: el prisma ocupa las dos plantas y solo sobra
//: en la baja, porque es la única en la que Catastro dice APARCAMIENTO.
const GARAJE = {
    id: 'part3', superficie: 19.05, niveles: [0, 1], niveles_fuera: [0],
    habitable: false, construccion: { uso: 'APARCAMIENTO', nivel: 0, habitable: false },
};
//: Un almacén exento: una sola planta, sobra entera.
const ALMACEN = {
    id: 'part2', superficie: 14.04, niveles: [0], niveles_fuera: [0],
    habitable: false, construccion: { uso: 'ALMACEN', nivel: 0, habitable: false },
};
const CASA = {
    id: 'part1', superficie: 116.13, niveles: [0, 1], niveles_fuera: [0, 1],
    habitable: true, construccion: { uso: 'VIVIENDA', nivel: 0, habitable: true },
};

console.log('\nEN QUÉ PLANTA SOBRA');
prueba('el garaje sobra en la baja y NO en la primera', () => {
    assert.equal(sobraEn(GARAJE, 0), true);
    assert.equal(sobraEn(GARAJE, 1), false);
});
prueba('sin `niveles_fuera` sobra en todas (motor antiguo o cuerpo sin casar)', () => {
    assert.equal(sobraEn({ id: 'x', niveles: [0, 1] }, 0), true);
    assert.equal(sobraEn({ id: 'x', niveles: [0, 1] }, 1), true);
});

console.log('\nLO QUE SE PINTA EN CADA PLANTA');
prueba('quitado el garaje, en la baja es «NO CUENTA» y en la primera NO', () => {
    const fuera = { ...GARAJE, fuera: true };
    assert.equal(cuerposDeLaPlanta([fuera], 0)[0].fueraAqui, true);
    assert.equal(cuerposDeLaPlanta([fuera], 1)[0].fueraAqui, false);
});
prueba('sin quitarlo, solo se propone en la planta donde no es vivienda', () => {
    assert.equal(cuerposDeLaPlanta([GARAJE], 0)[0].sospechosoAqui, true);
    assert.equal(cuerposDeLaPlanta([GARAJE], 1)[0].sospechosoAqui, false);
});
prueba('un cuerpo ya quitado no se propone otra vez', () => {
    const fuera = { ...GARAJE, fuera: true };
    assert.equal(cuerposDeLaPlanta([fuera], 0)[0].sospechosoAqui, false);
});
prueba('un cuerpo que no llega a esta planta no se dibuja', () => {
    assert.deepEqual(cuerposDeLaPlanta([ALMACEN], 1), []);
    assert.equal(cuerposDeLaPlanta([ALMACEN], 0).length, 1);
});
prueba('no se toca el original: la marca es de ESTA planta', () => {
    const fuera = { ...GARAJE, fuera: true };
    cuerposDeLaPlanta([fuera], 1);
    assert.equal(fuera.fueraAqui, undefined);
});

console.log('\nCÓMO SE DICE');
prueba('se dice la planta cuando el cuerpo NO sale entero', () => {
    assert.equal(dondeSobra(GARAJE), 'la planta baja');
    assert.equal(dondeSigue(GARAJE), 'la planta 1');
});
prueba('no se dice nada cuando sale de todas: no hay nada que matizar', () => {
    assert.equal(dondeSobra(ALMACEN), '');
    assert.equal(dondeSobra(CASA), '');
    assert.equal(dondeSigue(ALMACEN), '');
});
prueba('los nombres son los mismos que dice el motor', () => {
    assert.equal(nombreDeNivel(0), 'la planta baja');
    assert.equal(nombreDeNivel(2), 'la planta 2');
    assert.equal(nombreDeNivel(-1), 'el sótano 1');
});

console.log('\nDÓNDE ESTÁ EL ESPACIO NO HABITABLE (lo que va al .cex)');
const ph = (subtipo, nivel) => ({
    tipo: 'PARTICION_INTERIOR_HORIZONTAL', subtipo, nivel,
});
prueba('una vivienda de dos plantas NO tiene un garaje debajo', () => {
    // Antes se deducía de los niveles y esto daba `false`: el .cex de CUALQUIER
    // vivienda de dos plantas salía declarando «Garaje/espacio enterrado».
    const g = { elementos: [ph('ENTRE_PLANTAS', 0), ph('ENTRE_PLANTAS', 1)] };
    assert.equal(particionArriba(g), true);
});
prueba('con el garaje debajo, la partición va hacia ABAJO', () => {
    const g = { elementos: [ph('ENTRE_PLANTAS', 0),
                            ph('ESPACIO_NO_HABITABLE_INFERIOR', 1)] };
    assert.equal(particionArriba(g), false);
});
prueba('con un trastero encima, hacia ARRIBA', () => {
    assert.equal(particionArriba({ elementos: [ph('ESPACIO_NO_HABITABLE_SUPERIOR', 0)] }),
                 true);
});
prueba('sin particiones no se afirma nada raro', () => {
    assert.equal(particionArriba({ elementos: [] }), true);
    assert.equal(particionArriba({}), true);
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
