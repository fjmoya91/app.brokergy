// Prueba del SCOP_dhw del TERCIARIO con depósito independiente (2026-11-04).
// TER100 Anexo IV Caso 3 y TER173 Anexo II: sin COP a A7/W65, SCOP_dhw =
// COP A7/W55 × 0,9 (factor ÚNICO, acumulación a 60 °C). En residencial sigue el
// F_c por zona del Anexo VI RES060. Y el CIFO imprime el MISMO factor.
//   node implementation/backend/scripts/test_scop_acs_terciario.mjs
import {
    getScopAcsFromModel, scopsParaClima, fcAcsIndependiente, FC_ACS_TERCIARIO_W55,
} from '../../frontend/src/features/calculator/logic/calculation.js';
import { scopAcsAnexoViHtml } from '../../frontend/src/features/expedientes/logic/cifoDoc.js';

let fallos = 0;
const ok = (cond, txt) => { console.log(`  ${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallos++; };

const aurum160 = { cop_a7_55: 2.85 };   // Johnson AURUM160VMT/YMT R290 (catálogo 129 / 471)
const confort12 = { cop_a7_55: 3.0 };   // 25TER100_2 (catálogo 60)

console.log('Residencial: F_c por zona (Anexo VI RES060), sin cambios');
ok(getScopAcsFromModel(aurum160, 'D3', 'independiente') === 3.17, 'D3: 2,85 × 1,113 = 3,172 → 3,17');
ok(getScopAcsFromModel(confort12, 'D3', 'independiente') === 3.34, 'D3: 3,00 × 1,113 = 3,339 → 3,34');
ok(getScopAcsFromModel(aurum160, 'B4', 'independiente') === 3.5, 'B4: 2,85 × 1,228 = 3,4998 → 3,50');
ok(fcAcsIndependiente('E1') === 1.056, 'E1 → 1,056');

console.log('Terciario: COP A7/W55 × 0,9, en cualquier zona');
ok(FC_ACS_TERCIARIO_W55 === 0.9, 'el factor único es 0,9');
ok(getScopAcsFromModel(aurum160, 'D3', 'independiente', null, { terciario: true }) === 2.57, 'D3: 2,85 × 0,9 = 2,565 → 2,57');
ok(getScopAcsFromModel(aurum160, 'B4', 'independiente', null, { terciario: true }) === 2.57, 'B4: el mismo 2,57 (no depende de la zona)');
ok(getScopAcsFromModel(confort12, 'D3', 'independiente', null, { terciario: true }) === 2.7, '25TER100_2: 3,00 × 0,9 = 2,70');
ok(getScopAcsFromModel({ cop_a7_55: 2.78 }, 'D3', 'independiente', null, { terciario: true }) === 2.5, '26TER100_3: 2,78 × 0,9 = 2,502 → 2,50');

console.log('El terciario solo cambia el método independiente');
const conjunto = { eta_acs_calida: 146, eta_acs_media: 135, scop_dhw_calido: 3.63, scop_dhw_medio: 3.63, cop_a7_55: 3.26 };
ok(getScopAcsFromModel(conjunto, 'D3', 'conjunto', null, { terciario: true }) === getScopAcsFromModel(conjunto, 'D3', 'conjunto'), 'conjunto (Anexo IV) igual');
ok(getScopAcsFromModel(conjunto, 'D3', 'ficha', null, { terciario: true }) === getScopAcsFromModel(conjunto, 'D3', 'ficha'), 'ficha igual');

console.log('scopsParaClima lo propaga (botón «Clima del SCOP» de la TER173)');
ok(scopsParaClima({ modeloAcs: aurum160, zona: 'D3', metodoAcs: 'independiente', terciario: true }).scopAcs === 2.57, 'terciario → 2,57');
ok(scopsParaClima({ modeloAcs: aurum160, zona: 'D3', metodoAcs: 'independiente' }).scopAcs === 3.17, 'residencial → 3,17');

console.log('El CIFO imprime el factor con el que se ha calculado');
const base = { zoneStr: 'D3', zoneLabel: 'Cálido', acsFtUrl: null, anexoRef: 'Anexo IV de la ficha TER100' };
const htmlTer = scopAcsAnexoViHtml({ ...base, scopAcsRaw: 2.57, scopAcsStr: '2,57', terciario: true });
ok(htmlTer.includes('= 2,86 × 0,900 = 2,57') || htmlTer.includes('= 2,86 × 0,900'), 'terciario: COP × 0,900');
ok(htmlTer.includes('factor único'), 'terciario: dice «factor único»');
ok(!htmlTer.includes('1,113'), 'terciario: no aparece el F_c de zona');
const htmlRes = scopAcsAnexoViHtml({ ...base, scopAcsRaw: 3.17, scopAcsStr: '3,17' });
ok(htmlRes.includes('× 1,113 = 3,17'), 'residencial: COP × 1,113');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
