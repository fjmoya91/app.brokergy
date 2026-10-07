#!/usr/bin/env node
/**
 * Prueba lo DETERMINISTA de «las placas, también en la app»:
 *
 *   1. El contraste de la placa de la caldera (año y combustible) con la fila de
 *      rendimiento del expediente: solo AVISA, y con un año de margen.
 *   2. `placasInstalacion.proponerPlacas` — la lógica del botón «Leer placas»,
 *      que ahora usa también la skill `generar-cee-inicial`: solo HUECOS,
 *      conflictos a la vista, nº de serie dudoso fuera, `potencia_caldera` y la
 *      caldera de ACS rellenadas a la vez, y nada escrito en `simular`.
 *
 * Sin escribir nada: las lecturas son SOLO de caldera, así que no se consulta el
 * catálogo (eso lo cubre `test_placa_equipo.js`).
 *
 *   node implementation/backend/scripts/test_placas_instalacion.js
 */
require('dotenv').config({ quiet: true });
const { contrastarPlacaConRendimiento } = require('../utils/combustibleCaldera');

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}, salió ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

(async () => {
    console.log('\n1. La placa frente a la fila de rendimiento');
    const n = (id, l) => contrastarPlacaConRendimiento(id, l).length;
    comprueba('1990 + gasóleo frente a «Gasóleo, de 1985 a 1997» → cuadra', n('oil_85_97', { anio: 1990, combustible: 'gasoleo' }), 0);
    comprueba('1995 frente a «Gasóleo, ≥ 1998» → avisa', n('oil_post98', { anio: 1995 }), 1);
    comprueba('1997 frente a «≥ 1998» → cuadra (un año de margen)', n('oil_post98', { anio: 1997 }), 0);
    comprueba('1999 frente a «de 1985 a 1997» → avisa', n('oil_85_97', { anio: 1999 }), 1);
    comprueba('gas natural frente a una fila de gasóleo → avisa', n('oil_85_97', { combustible: 'gas_natural' }), 1);
    comprueba('GLP frente a una fila de gas → cuadra (misma fila del Anexo VIII)', n('gas_post98_auto', { combustible: 'glp' }), 0);
    comprueba('pellets frente a sólidos → cuadra', n('solid_auto', { anio: 2012, combustible: 'pellets' }), 0);
    comprueba('año y combustible mal a la vez → dos avisos', n('gas_post98_auto', { anio: 1980, combustible: 'gasoleo' }), 2);
    comprueba('sin fila declarada → nada que comparar', n('', { anio: 1980 }), 0);
    comprueba('«Por defecto» → nada que comparar', n('default', { anio: 1980, combustible: 'gasoleo' }), 0);
    comprueba('una fila sin años (condensación) no se contrasta por año', n('oil_cond', { anio: 1970 }), 0);
    const txt = contrastarPlacaConRendimiento('oil_post98', { anio: 1995 }, 'Gasóleo, ≥ 1998, sin condensación')[0] || '';
    comprueba('el aviso nombra la fila por su rótulo', /«Gasóleo, ≥ 1998, sin condensación»/.test(txt), true);

    console.log('\n2. proponerPlacas (lógica del botón «Leer placas»)');
    const { proponerPlacas } = require('../services/placasInstalacion');
    const caldera = {
        leido: { marca: 'FERROLI', modelo: 'NGL 30', numero_serie: '1HGCE03B', anio: 1990, combustible: 'gasoleo' },
        potencia_kw: 35, fotos: [], avisos: [],
    };
    const equipos = { unidades: {}, fotos: [], avisos: [], sin_fotos: true };
    const vacia = {
        caldera_antigua_cal: { tipo: 'CALDERA', rendimiento_id: 'oil_85_97', marca: '', modelo: '', numero_serie: '' },
        caldera_antigua_acs: { tipo: 'CALDERA', rendimiento_id: 'oil_85_97', marca: '', modelo: '' },
        misma_caldera_acs: true, potencia_caldera: 0,
    };

    // a) Todo hueco → se proponen los cuatro datos; en simular no se escribe.
    const a = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera, equipos, simular: true });
    comprueba('propone marca, modelo, nº de serie y potencia',
        a.propuesta.map(p => p.campo), ['marca', 'modelo', 'numero_serie', 'potencia_caldera_kw']);
    comprueba('simular: compone la instalación', !!a.instalacion, true);
    comprueba('simular: no escribe nada (escrito vacío)', a.escrito, []);
    comprueba('potencia_caldera_kw y potencia_caldera, el MISMO número',
        [a.instalacion.potencia_caldera_kw, a.instalacion.potencia_caldera], [35, 35]);
    comprueba('la caldera de ACS se rellena a la vez (misma caldera)', a.instalacion.caldera_antigua_acs.marca, 'FERROLI');
    comprueba('la fila de rendimiento NO se toca', a.instalacion.caldera_antigua_cal.rendimiento_id, 'oil_85_97');
    comprueba('el año y el combustible cuadran con la fila → sin aviso de rendimiento',
        a.avisos.filter(x => /rendimiento declarado/.test(x)).length, 0);
    comprueba('la huella guarda de dónde sale', a.instalacion.placas_ocr.caldera.marca, 'FERROLI');

    // b) Lo escrito por una persona no se pisa: sale como conflicto.
    const escrita = { ...vacia, caldera_antigua_cal: { ...vacia.caldera_antigua_cal, marca: 'ROCA' }, potencia_caldera_kw: 24 };
    const b = await proponerPlacas({ exp: { id: 'x', instalacion: escrita }, caldera, equipos, simular: true });
    comprueba('marca y potencia distintas → conflicto, no propuesta',
        b.conflictos.map(c => c.campo).sort(), ['marca', 'potencia_caldera_kw']);
    comprueba('lo escrito sigue en la instalación compuesta', b.instalacion.caldera_antigua_cal.marca, 'ROCA');
    comprueba('una potencia ya puesta no se cambia por la de la placa', b.instalacion.potencia_caldera_kw, 24);

    // c) Un cero no es una potencia puesta.
    const cero = { ...vacia, potencia_caldera_kw: 0 };
    const c = await proponerPlacas({ exp: { id: 'x', instalacion: cero }, caldera, equipos, simular: true });
    comprueba('potencia a 0 → se rellena', c.propuesta.some(p => p.campo === 'potencia_caldera_kw'), true);

    // d) Un nº de serie DUDOSO no se escribe solo.
    const dud = { ...caldera, leido: { ...caldera.leido, serie_dudosa: true,
        serie_alternativas: [{ serie: '1HGCE03B/002899' }, { serie: '1HGCE03B/002B99' }] } };
    const d = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera: dud, equipos, simular: true });
    comprueba('serie dudosa → a «dudosos», no a la propuesta',
        [d.propuesta.some(p => p.campo === 'numero_serie'), d.dudosos.length], [false, 1]);

    // e) La placa contradice la fila → avisa (y no la toca).
    const e = await proponerPlacas({ exp: { id: 'x', instalacion: vacia },
        caldera: { ...caldera, leido: { ...caldera.leido, anio: 2010 } }, equipos, simular: true });
    comprueba('placa de 2010 con fila «de 1985 a 1997» → un aviso',
        e.avisos.filter(x => /rendimiento declarado/.test(x)).length, 1);

    // f) Sin `aplicar` ni `simular`: solo la propuesta.
    const f = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera, equipos });
    comprueba('sin aplicar ni simular → no compone nada', f.instalacion, null);

    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
