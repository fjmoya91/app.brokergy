// Prueba del botón «Clima del SCOP» de la hibridación (2026-10-21, 26RES060_122):
// con el clima MEDIO elegido, el SCOP de calefacción, su temporada y el SCOP_dhw
// salen del medio aunque la zona sea cálida; sin hibridación, lo de siempre.
//   node implementation/backend/scripts/test_clima_scop.mjs
import {
    climaScopForzado, scopsParaClima, getScopFromModel, getScopSeason, getScopAcsFromModel,
    calculateHybridization, CLIMA_SCOP,
} from '../../frontend/src/features/calculator/logic/calculation.js';

let fallos = 0;
const ok = (cond, txt) => { console.log(`  ${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallos++; };

// SH MASTER 14 (catálogo 134) y un termo con su η_wh de EPREL (Haier HP200M7-F9).
const sh = { scop_cal_calido_35: 6.42, scop_cal_calido_55: 4.58, scop_cal_medio_35: 4.9, scop_cal_medio_55: 3.85 };
const termo = { eta_acs_calida: 146, eta_acs_media: 135, scop_dhw_calido: 3.63, scop_dhw_medio: 3.63, cop_a7_55: 3.26 };

console.log('Solo cuenta con la hibridación activa');
ok(climaScopForzado({ hibridacion: true, scopClima: 'medio' }) === 'medio', 'oportunidad: hibridación + medio → medio');
ok(climaScopForzado({ hibridacion: true, scop_clima: 'MEDIO' }) === 'medio', 'expediente en MAYÚSCULAS (normalizeData) → medio');
ok(climaScopForzado({ hibridacion: false, scopClima: 'medio' }) === null, 'sin hibridación → lo de siempre');
ok(climaScopForzado({ hibridacion: true }) === null, 'sin elegir → lo de siempre');

console.log('Sin clima elegido no cambia NADA');
ok(getScopFromModel(sh, 'D3', 55) === 4.58 && getScopSeason(sh, 'D3', 55) === 'calido', 'D3 a 55 °C: 4,58 cálido');
ok(getScopFromModel(sh, 'E1', 55) === 3.85, 'E1 sigue siendo el medio');

console.log('Con el MEDIO, todo sale del medio');
const m = scopsParaClima({ modelo: sh, modeloAcs: termo, zona: 'D3', temp: 55, metodoAcs: 'conjunto', clima: CLIMA_SCOP.MEDIO });
ok(m.scopHeating === 3.85 && m.scopTemporada === 'medio', 'calefacción 3,85 y temporada medio');
ok(m.scopAcs === 3.38, 'ACS por Anexo IV con el η_wh del medio: 2,5 · 135 % = 3,375 → 3,38');
const c = scopsParaClima({ modelo: sh, modeloAcs: termo, zona: 'D3', temp: 55, metodoAcs: 'conjunto' });
ok(c.scopAcs === 3.65, 'y en cálido el del cálido: 2,5 · 146 % = 3,65');
ok(getScopAcsFromModel(termo, 'D3', 'independiente', 'medio') === getScopAcsFromModel(termo, 'D3', 'independiente'),
   'el Anexo VI no cambia: su F_c es de la ZONA');

console.log('El C_b sigue la temporada (26RES060_122: 47.413 kWh, 12 kW)');
const cb = (t) => calculateHybridization({ demandAnnual: 260.51 * 182, zone: 'D3', method: 'demanda', heatPumpPower: 12, climateSeason: t }).cb;
ok(Math.abs(cb('medio') - 0.821) < 0.001, `medio → C_b ${(cb('medio') * 100).toFixed(2)} %`);
ok(Math.abs(cb('calido') - 0.6233) < 0.001, `cálido → C_b ${(cb('calido') * 100).toFixed(2)} %`);

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo correcto');
process.exit(fallos ? 1 : 0);
