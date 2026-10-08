// Pruebas de utils/seriesEquipos.js — el aviso de nº de serie repetido.
//   node implementation/backend/scripts/test_series_repetidas.js
const assert = require('assert');
const { normSerie, esSerieComparable, seriesDeInstalacion, seriesCruzadasEnExpediente, cruzarSeries } = require('../utils/seriesEquipos');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

t('normaliza espacios, guiones y minúsculas', () => {
    assert.strictEqual(normSerie(' in2601309004-053 '), 'IN2601309004053');
    assert.strictEqual(normSerie('S/N:1KK018 038JAP'), 'SN1KK018038JAP');
});

t('los marcadores de «no hay serie» no se comparan', () => {
    for (const v of ['NO LEGIBLE', 'No legible (placa quemada)', 'ilegible', 'SIN PLACA', 'N/A', 'S/N', '-', '0000', 'XXXXXX', 'Desconocido', 'pendiente', '']) {
        assert.strictEqual(esSerieComparable(v), false, v);
    }
    assert.strictEqual(esSerieComparable('0905326219'), true);
    assert.strictEqual(esSerieComparable('8D00260116160057'), true);
});

t('saca caldera, aerotermia (ud. 1, interior, cascada), ACS aparte y piscina', () => {
    const s = seriesDeInstalacion({
        caldera_antigua_cal: { numero_serie: 'CAL-111' },
        misma_caldera_acs: false,
        caldera_antigua_acs: { numero_serie: 'TERMO222' },
        aerotermia_cal: { numero_serie: 'EXT333', numero_serie_ud_interior: 'INT444', equipos_extra: [{ numero_serie: 'EXT555' }] },
        aerotermia_acs: { numero_serie: 'EXT333' }, // clon del de calefacción
        piscina: { activa: true, equipo: { numero_serie: 'PISC666' } },
    });
    assert.deepStrictEqual(s.map(x => x.norm), ['CAL111', 'TERMO222', 'EXT333', 'INT444', 'EXT555', 'PISC666']);
    assert.strictEqual(s.find(x => x.norm === 'EXT333').etiqueta, 'Aerotermia nueva · Ud. 1');
});

t('con misma_caldera_acs el nodo de ACS no cuenta; sin generador, la caldera tampoco', () => {
    const s = seriesDeInstalacion({
        caldera_antigua_cal: { numero_serie: 'RESTO999', rendimiento_id: 'sin_calefaccion' },
        misma_caldera_acs: true,
        caldera_antigua_acs: { numero_serie: 'RESTO888' },
        piscina: { activa: false, equipo: { numero_serie: 'PISC666' } },
    });
    assert.deepStrictEqual(s, []);
});

t('lee la clave antigua n_serie_ext', () => {
    assert.strictEqual(seriesDeInstalacion({ aerotermia_cal: { n_serie_ext: 'ABC12345' } })[0].norm, 'ABC12345');
});

t('cruza con otros expedientes, sin contarse a sí mismo', () => {
    const propias = seriesDeInstalacion({ caldera_antigua_cal: { numero_serie: 'cal 111' }, aerotermia_cal: { numero_serie: 'EXT-333' } });
    const otros = [
        { id: 'yo', numero_expediente: '26RES060_1', series: seriesDeInstalacion({ caldera_antigua_cal: { numero_serie: 'CAL111' } }) },
        { id: 'b', numero_expediente: '26RES060_20', estado: 'DOC. COMPLETA', series: seriesDeInstalacion({ caldera_antigua_cal: { numero_serie: 'CAL111' } }) },
        { id: 'c', numero_expediente: '26RES060_3', series: seriesDeInstalacion({ aerotermia_cal: { numero_serie: 'EXT333' }, aerotermia_acs: { numero_serie: 'EXT333' } }) },
        { id: 'd', numero_expediente: '26RES060_4', series: seriesDeInstalacion({ caldera_antigua_cal: { numero_serie: 'NO LEGIBLE' } }) },
    ];
    const r = cruzarSeries(propias, otros, 'yo');
    assert.strictEqual(r.length, 2);
    assert.deepStrictEqual(r[0].en.map(e => e.numero_expediente), ['26RES060_20']);
    assert.strictEqual(r[0].en[0].estado, 'DOC. COMPLETA');
    // El clon de ACS del otro expediente es la misma máquina: una sola etiqueta.
    assert.deepStrictEqual(r[1].en[0].etiquetas, ['Aerotermia nueva']);
});

t('una serie que es a la vez de la caldera y de la aerotermia se marca como cruzada', () => {
    const s = seriesDeInstalacion({ caldera_antigua_cal: { numero_serie: 'X12345' }, aerotermia_cal: { numero_serie: 'x-12345' } });
    const c = seriesCruzadasEnExpediente(s);
    assert.strictEqual(c.length, 1);
    assert.deepStrictEqual(c[0].etiquetas, ['Caldera existente', 'Aerotermia nueva']);
});

console.log(`\n${ok} pruebas OK`);
