// De la PLACA leída a la caldera de la simulación («Nueva simulación», paso de las
// fotos de la caldera). Sin BD ni red: el módulo puro del formulario.
//
//   node implementation/backend/scripts/test_caldera_desde_placa.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/landing/data/calderaDesdePlaca.js')).href);
const { calderaDesdePlaca, inputsDesdeCalderaPlaca, placaCalderaParaInputs, potenciaDeLaPlaca, edadDesdeAnio, condensacionSupuesta } = mod;

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('La fila de rendimiento la decide el AÑO DE LA PLACA (regla 99)');
t('gasóleo de 2003 sin condensación: ≥ 1998, no «anterior a 1985»', () => {
    const c = calderaDesdePlaca({ combustible: 'gasoleo', anio: 2003, condensacion: 'no' });
    assert.equal(c.boilerId, 'oil_post98');
    assert.equal(c.boilerEff, 0.79);
    assert.equal(c.funnel.edad_caldera, '>20');
});
t('gasóleo de 1990 → de 1985 a 1997', () => assert.equal(calderaDesdePlaca({ combustible: 'gasoleo', anio: 1990, condensacion: 'no' }).boilerId, 'oil_85_97'));
t('gasóleo de 1980 → anterior a 1985', () => assert.equal(calderaDesdePlaca({ combustible: 'gasoleo', anio: 1980, condensacion: 'no' }).boilerId, 'oil_pre85'));
t('gas sin año ni condensación → la más reciente de su tipo', () => {
    const c = calderaDesdePlaca({ combustible: 'gas_natural', anio: null, condensacion: 'no' });
    assert.equal(c.boilerId, 'gas_post98_auto');
    assert.match(c.porque, /más reciente/);
});
t('gas de 1995 → anterior a 1998, mural', () => assert.equal(calderaDesdePlaca({ combustible: 'gas_natural', anio: 1995, condensacion: 'no' }).boilerId, 'gas_pre98_mural'));
t('gas de 1975 → anterior a 1979', () => assert.equal(calderaDesdePlaca({ combustible: 'gas_natural', anio: 1975, condensacion: 'no' }).boilerId, 'gas_pre79'));
t('gas de condensación de 2012 → ≥ 1998, condensación', () => assert.equal(calderaDesdePlaca({ combustible: 'gas_natural', anio: 2012, condensacion: 'si' }).boilerId, 'gas_post98_cond_auto'));

console.log('La condensación: la dice quien la ve; si no lo sabe, el modelo o el año');
t('«no lo sé» con una placa de 2018 → condensación (ecodiseño)', () => assert.equal(condensacionSupuesta({ condensacion: 'no_se', anio: 2018 }), 'si'));
t('«no lo sé» con una placa de 2010 → sin condensación', () => assert.equal(condensacionSupuesta({ condensacion: 'no_se', anio: 2010 }), 'no'));
t('el modelo «THEMA CONDENS F25» → condensación', () => assert.equal(condensacionSupuesta({ condensacion: 'no_se', modelo: 'THEMA CONDENS F25' }), 'si'));
t('lo que dice quien la ve manda sobre el año', () => assert.equal(condensacionSupuesta({ condensacion: 'no', anio: 2020 }), 'no'));

console.log('La edad del funnel sale del año');
t('2020 → <10 · 2010 → 10-20 · 1999 → >20 · sin año → no_se', () => {
    const hoy = new Date('2026-11-16');
    assert.equal(edadDesdeAnio(2020, hoy), '<10');
    assert.equal(edadDesdeAnio(2010, hoy), '10-20');
    assert.equal(edadDesdeAnio(1999, hoy), '>20');
    assert.equal(edadDesdeAnio(null, hoy), 'no_se');
});

console.log('Lo que cambia en los inputs');
t('propano: GLP y el ACS de la misma caldera, en propano', () => {
    const caldera = calderaDesdePlaca({ combustible: 'glp', anio: 2008, condensacion: 'no' });
    const i = inputsDesdeCalderaPlaca({ caldera, placa: { potencia_kw: 24 } }, { boiler_acs_type: 'misma_caldera' });
    assert.equal(i.fuelType, 'glp');
    assert.equal(i.boilerHeatingType, 'Propano');
    assert.equal(i.boilerAcsType, 'Propano');
    assert.equal(i.potenciaCaldera, 24);
    assert.equal(i.boilerId, 'gas_post98_auto');
});
t('carbón queda ELEGIDO como en el desplegable (aviso del IRPF de biomasa)', () => {
    const i = inputsDesdeCalderaPlaca({ caldera: calderaDesdePlaca({ combustible: 'carbon', anio: 1990 }), placa: null });
    assert.equal(i.combustibleSolido, 'carbon');
    assert.equal(i.fuelType, 'carbon');
    assert.equal(i.placa_caldera, undefined);
});
t('sin caldera confirmada no se toca nada', () => assert.deepEqual(inputsDesdeCalderaPlaca({}), {}));

console.log('La potencia y la placa guardada');
t('policombustible: la del combustible confirmado; tecleada, manda', () => {
    const lectura = { potencia_kw: null, potencias_por_combustible: { gas_natural: 23.3, gasoleo: 23.3, carbon: 15.3 } };
    assert.equal(potenciaDeLaPlaca(lectura, 'pellets'), 15.3);
    assert.equal(potenciaDeLaPlaca(lectura, 'gasoleo'), 23.3);
    assert.equal(potenciaDeLaPlaca(lectura, null), null);
    assert.equal(potenciaDeLaPlaca(lectura, 'gasoleo', '20,5'), 20.5);
});
t('la placa guarda lo leído, lo confirmado y el veredicto; el combustible leído va aparte', () => {
    const p = placaCalderaParaInputs({
        leido: { marca: 'ROCA', modelo: 'P-30-4', numero_serie: 'X1', serie_dudosa: true, anio: null, combustible: 'gasoleo' },
        veredicto: { estado: 'ok' },
    }, { combustible: 'pellets', potenciaKw: 15.3, anio: '1996' });
    assert.equal(p.combustible, 'biomasa');
    assert.equal(p.combustible_leido, 'gasoleo');
    assert.equal(p.serie_dudosa, true);
    assert.equal(p.anio, 1996);
    assert.equal(p.anio_tecleado, true);
    assert.equal(p.veredicto, 'ok');
    assert.equal(p.origen, 'nueva_simulacion');
});

console.log(`\n${ok} pruebas OK`);
