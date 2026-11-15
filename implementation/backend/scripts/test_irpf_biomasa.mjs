// Biomasa → la deducción del IRPF exige placas solares; el CAE no (2026-10-10).
// Fuente única: frontend/src/features/calculator/logic/irpfBiomasa.js
//   node implementation/backend/scripts/test_irpf_biomasa.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const FRONT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'frontend', 'src');
const m = await import(pathToFileURL(path.join(FRONT, 'features/calculator/logic/irpfBiomasa.js')).href);

const casos = [
    // [descripción, inputs, opts, esperado]
    ['pellets sin placas', { boilerId: 'solid_auto', fuelType: 'pellets' }, {}, true],
    ['leña sin placas', { boilerId: 'solid_man_cal', fuelType: 'lena' }, {}, true],
    ['carbón', { boilerId: 'solid_auto', fuelType: 'carbon', boilerHeatingType: 'Carbon' }, {}, false],
    ['desplegable en carbón pero el funnel dice biomasa', { boilerId: 'solid_auto', fuelType: 'carbon', boilerHeatingType: 'BIOMASA' }, {}, true],
    ['desplegable en carbón pero la placa dice biomasa', { boilerId: 'solid_auto', fuelType: 'carbon', placa_caldera: { combustible: 'biomasa' } }, {}, true],
    ['pellets con placas ya puestas', { boilerId: 'solid_auto', fuelType: 'pellets', fotovoltaica: { estado: 'si' } }, {}, false],
    ['pellets con placas en el futuro (no cuenta)', { boilerId: 'solid_auto', fuelType: 'pellets', fotovoltaica: { estado: 'futuro' } }, {}, true],
    ['pellets con placas en esta obra', { boilerId: 'solid_auto', fuelType: 'pellets', presupuestoFotovoltaica: 4000 }, {}, false],
    ['pellets sin deducción en juego (empresa)', { boilerId: 'solid_auto', fuelType: 'pellets' }, { conIrpf: false }, false],
    ['gasóleo', { boilerId: 'oil_post98', fuelType: 'gasoleo' }, {}, false],
    ['gas', { boilerId: 'gas_post98_auto', fuelType: 'gas_natural' }, {}, false],
    ['sin inputs', null, {}, false],
    // Lo ELEGIDO en «¿Carbón o biomasa?» manda sobre el funnel y la placa (26RES060_OP403).
    ['elegido carbón aunque la placa y el funnel digan biomasa', { boilerId: 'solid_man_no_cal', fuelType: 'carbon', combustibleSolido: 'carbon', boilerHeatingType: 'BIOMASA', placa_caldera: { combustible: 'biomasa' } }, {}, false],
    ['elegido carbón aunque fuelType se quedara en pellets', { boilerId: 'solid_man_no_cal', fuelType: 'pellets', combustibleSolido: 'carbon' }, {}, false],
    ['elegida leña aunque fuelType diga carbón', { boilerId: 'solid_man_cal', fuelType: 'carbon', combustibleSolido: 'lena' }, {}, true],
    ['elegido algo raro → se ignora y decide fuelType', { boilerId: 'solid_auto', fuelType: 'pellets', combustibleSolido: 'turba' }, {}, true],
    ['elegido carbón con una fila de gas → no cuenta', { boilerId: 'gas_post98_auto', fuelType: 'gas_natural', combustibleSolido: 'lena' }, {}, false],
];
for (const [d, inp, o, esp] of casos) {
    assert.equal(m.avisarIrpfBiomasa(inp, o), esp, d);
}
// El aviso dice las DOS cosas: el requisito del IRPF y que el CAE sí.
const linea = m.lineaIrpfBiomasa();
assert.match(linea, /placas solares fotovoltaicas/);
assert.match(linea, /Bono Energético CAE NO se ve afectado/);
assert.match(linea, /primaria no renovable/);
assert.equal(m.combustibleSolidoElegido({ combustibleSolido: 'CARBON' }), 'carbon');
assert.equal(m.combustibleSolidoElegido({}), null);
assert.deepEqual(m.COMBUSTIBLES_SOLIDOS.map(x => x.id), ['carbon', 'lena', 'pellets']);
console.log(`✓ irpfBiomasa: ${casos.length} casos + texto + elegido`);
