// La GUÍA DE TRANSMITANCIAS desde el 08/10/2026: las U y masas que CE3X 3.2 pone
// con «Estimados según antigüedad y zona climática», escritas como «Conocidas».
//
// Sin BD ni red. Comprueba la tabla (contra lo que dijo el oráculo de CE3X), la
// zona NBE, que la calculadora solo la use en las simulaciones NUEVAS, la ficha
// del `.cex` y el guardián del servidor.
//
//   node implementation/backend/scripts/test_guia_transmitancias.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

//: El frontend importa sin extensión (Vite): el mismo resolvedor que test_alta_oportunidad.js.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try { return nextResolve(specifier, context); } catch (e) {
            if (!/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
            for (const suf of ['.js', '.jsx', '/index.js']) {
                try { return nextResolve(specifier + suf, context); } catch { /* siguiente */ }
            }
            throw e;
        }
    },
});

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fe = (p) => import(pathToFileURL(path.join(aqui, '../../frontend/src/features', p)).href);
const T = await fe('calculator/logic/transmitanciasCe3x.js');
const C = await fe('calculator/logic/calculation.js');
const F = await fe('cee-envolvente/logic/fichaCe3x.js');
const { funnelToCalculatorInputs } = await fe('landing/data/funnelToInputs.js');
const require = createRequire(import.meta.url);
const { sellarGuiaTransmitancias } = require('../utils/guiaTransmitancias.js');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const u = (c, o) => T.uCe3x(c, o)?.u;

console.log('La tabla de CE3X 3.2');
t('26RES060_188 (2003, E1): fachada 1,40 · cubierta 0,70 · suelo al aire 0,70 (lo de CE3X en pantalla)', () => {
    assert.equal(u('fachada_aire', { anio: 2003, zona: 'E1' }), 1.4);
    assert.equal(u('cubierta_plana', { anio: 2003, zona: 'E1' }), 0.7);
    assert.equal(u('suelo_aire', { anio: 2003, zona: 'E1' }), 0.7);
    assert.equal(u('particion_vertical', { anio: 2003, zona: 'E1' }), 1.44);
});
t('en D3 la cubierta de 1998-2007 es 0,90 (NBE Y)', () => {
    assert.equal(u('cubierta_plana', { anio: 2003, zona: 'D3' }), 0.9);
});
t('antes de 1980 no depende de la zona; la inclinada es otra', () => {
    for (const zona of ['A3', 'C2', 'E1']) assert.equal(u('fachada_aire', { anio: 1975, zona }), 2.38);
    assert.equal(u('cubierta_plana', { anio: 1975 }), 2.17);
    assert.equal(u('cubierta_inclinada', { anio: 1975 }), 2.63);
    assert.equal(T.uCe3x('fachada_aire', { anio: 1975 }).masa, 168);
});
t('2007-2013 y desde 2014 por la letra de la zona', () => {
    assert.equal(u('fachada_aire', { anio: 2010, zona: 'D1' }), 0.66);
    assert.equal(u('fachada_aire', { anio: 2010, zona: 'D3' }), 0.66);
    assert.equal(u('cubierta_plana', { anio: 2010, zona: 'C4' }), 0.41);
    assert.equal(u('fachada_aire', { anio: 2015, zona: 'E1' }), 0.25);
    assert.equal(u('cubierta_plana', { anio: 2022, zona: 'E1' }), 0.19);
    assert.equal(u('fachada_aire', { periodo: 'CTE 2013', zona: 'alpha2' }), 0.94);
});
t('los periodos son los de la 3.2 (1980 · 1998 · 2007 · 2014 · 2021)', () => {
    assert.deepEqual([1979, 1980, 1997, 1998, 2006, 2007, 2013, 2014, 2020, 2021].map(T.periodoDeAnio),
        ['Anterior', 'NBE-CT-79', 'NBE-CT-79', 'NBE-CT-79_aPartir1998', 'NBE-CT-79_aPartir1998',
         'C.T.E.', 'C.T.E.', 'CTE 2013', 'CTE 2013', 'Apartir2020']);
    assert.equal(T.etiquetaPeriodo('NBE-CT-79_aPartir1998'), '1998 - 2007');
    // la 2.3 escribe cuatro periodos y caen en la misma época
    assert.equal(u('fachada_aire', { periodo: 'NBE-CT-79', zona: 'E1' }), 1.4);
    assert.equal(u('fachada_aire', { periodo: 'Otros', zona: 'E1' }), 0.25);
});
t('la zona NBE de CE3X con la localidad «Otro»', () => {
    assert.deepEqual(['A3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D3', 'E1', 'A1', 'alpha1', 'α3', ''].map(T.zonaNbe),
        ['W', 'W', 'W', 'W', 'Y', 'X', 'Y', 'Y', 'Z', 'V', 'V', 'V', 'Y']);
});

console.log('\nLa calculadora: solo las simulaciones NUEVAS');
t('sin inputs o con la marca: la de CE3X', () => {
    assert.deepEqual(C.getUByYear(2003, 'D3'), { wall: 1.4, roof: 0.9, floor: 1 });
    assert.deepEqual(C.getUByYear(2003, 'D3', { guia_transmitancias: C.GUIA_TRANSMITANCIAS }),
        { wall: 1.4, roof: 0.9, floor: 1 });
});
t('una simulación guardada SIN la marca sigue con la Guía anterior (su bono no se mueve)', () => {
    assert.deepEqual(C.getUByYear(2003, 'D3', { anio: 2003 }), { wall: 1.69, roof: 1.69, floor: 1 });
    assert.deepEqual(C.getUByYear(1970, 'D3', {}), { wall: 1.9, roof: 2.1, floor: 1.1 });
    assert.deepEqual(C.getUByYearGuiaAnterior(2010, 'D3'), { wall: 0.66, roof: 0.45, floor: 0.49 });
});
t('la demanda de una guardada no cambia; la de una nueva sí', () => {
    const base = { zona: 'D3', anio: 1970, superficie: 120, superficieCalefactable: 120, plantas: 1,
                   altura: 2.7, ventanaU: 5, ach: 1, tipo: 'unifamiliar', gla: 12, fachadas: 4,
                   patios: 0, sueloTipo: 'terreno', orientacion: 'S', uMuro: 1.9, uCubierta: 2.1 };
    const vieja = C.calculateDemand(base);
    // a mano con el suelo de la Guía anterior (1,10 en 1960-1978)
    assert.equal(vieja.ua_trans, C.calculateDemand({ ...base, uSueloOverride: 1.1 }).ua_trans);
    const nueva = C.calculateDemand({ ...base, guia_transmitancias: C.GUIA_TRANSMITANCIAS });
    assert.equal(nueva.ua_trans, C.calculateDemand({ ...base, uSueloOverride: 1 }).ua_trans);
});
t('el funnel siembra la marca y las U de CE3X por año Y zona', () => {
    const inputs = funnelToCalculatorInputs({}, { yearBuilt: 2003, zona: 'E1', superficie: 150 }, { mode: 'internal' });
    assert.equal(inputs.guia_transmitancias, C.GUIA_TRANSMITANCIAS);
    assert.equal(inputs.uMuro, 1.4);
    assert.equal(inputs.uCubierta, 0.7);
});

console.log('\nLa ficha del .cex');
t('2003 E1 «1998 - 2007»: U y masas de CE3X, en Conocidas', () => {
    const k = F.transmitancias(2003, 'E1', { normativa: 'NBE-CT-79_aPartir1998' });
    assert.deepEqual([k.fachada.u, k.fachada.masa, k.fachada.modo], [1.4, 200, 'Conocidas']);
    assert.deepEqual([k.cubierta.u, k.cubierta.masa, k.cubierta.forma], [0.7, 344, 'Cubierta plana']);
    assert.deepEqual([k.suelo_aire.u, k.suelo_aire.masa, k.suelo_aire.modo], [0.7, 333, 'Conocidas']);
    assert.deepEqual([k.suelo_terreno.u, k.suelo_terreno.modo], [1, 'Por defecto']);
    assert.deepEqual([k.particion_vertical.u, k.particion_vertical.masa], [1.44, 60]);
    assert.deepEqual([k.particion_superior.u, k.particion_superior.masa, k.particion_superior.tipo_espacio],
        [1.2, 500, 'Otro']);
    assert.deepEqual([k.particion_inferior.u, k.particion_inferior.masa, k.particion_inferior.sentido],
        [1.2, 333, 'horizontal inferior']);
    assert.match(k._de, /Estimados según antigüedad y zona climática.*1998 - 2007, zona E1, zona NBE Z/);
});
t('el periodo que DECLARA el .cex manda sobre el año (lo puesto a mano)', () => {
    assert.equal(F.transmitancias(2003, 'D3', { normativa: 'C.T.E.' }).fachada.u, 0.66);
    assert.equal(F.transmitancias(2003, 'D3').fachada.u, 1.4);
});
t('antes de 1980, hacia abajo y hacia arriba son U distintas', () => {
    const k = F.transmitancias(1970, 'D3', { particionArriba: false });
    assert.equal(k.particion_superior.u, 2.17, 'hacia abajo: garaje');
    assert.equal(k.particion_superior.tipo_espacio, 'Garaje/espacio enterrado');
    assert.equal(k.particion_inferior.u, 2.17);
    assert.equal(F.transmitancias(1970, 'D3').particion_superior.u, 1.7, 'hacia arriba: «Otro»');
});
t('«Particiones» tecleada a mano vale hacia arriba y hacia abajo', () => {
    const k = F.transmitancias(2003, 'E1', { retoques: { particion_superior: 2 } });
    assert.equal(k.particion_superior.u, 2);
    assert.equal(k.particion_inferior.u, 2);
    assert.equal(k._retocadas.length, 1);
});

console.log('\nEl servidor no deja que una anterior estrene la Guía');
t('nueva: se queda la marca; anterior sin marca: se quita; anterior con marca: se queda', () => {
    const marca = () => ({ guia_transmitancias: 'ce3x-3.2' });
    assert.equal(sellarGuiaTransmitancias(marca(), null).guia_transmitancias, 'ce3x-3.2');
    assert.equal(sellarGuiaTransmitancias(marca(), { datos_calculo: { inputs: {} } }).guia_transmitancias,
        undefined);
    assert.equal(sellarGuiaTransmitancias(marca(),
        { datos_calculo: { inputs: { guia_transmitancias: 'CE3X-3.2' } } }).guia_transmitancias, 'ce3x-3.2');
});

console.log(`\n${ok} comprobaciones correctas`);
process.exit(0);
