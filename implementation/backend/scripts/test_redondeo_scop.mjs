#!/usr/bin/env node
/**
 * El SCOP con DOS decimales, igual en la fórmula, en el papel y en la BD.
 *
 *   node implementation/backend/scripts/test_redondeo_scop.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const calc = await import(pathToFileURL(path.join(__dirname,
    '../../frontend/src/features/calculator/logic/calculation.js')).href);
const { redondearScopsInstalacion, redondearScopsInputs } = require('../utils/scopRedondeo');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const { redondeaScop } = calc;

console.log('\n── La mitad sube SIEMPRE, también con decimales binarios ──');
for (const [v, esperado] of [[3.775, 3.78], [5.775, 5.78], [4.125, 4.13], [4.017, 4.02], [3.338, 3.34],
    [3.628, 3.63], [4.375, 4.38], [1.005, 1.01], ['4,125', 4.13], ['3.775', 3.78], [6, 6], [4.62, 4.62]]) {
    ok(redondeaScop(v) === esperado, `${JSON.stringify(v)} → ${esperado} (da ${redondeaScop(v)})`);
}
ok((3.775).toFixed(2) === '3.77', '…que es justo lo que toFixed(2) hace mal (3.775 → "3.77")');
ok(Number.isNaN(redondeaScop('')) && Number.isNaN(redondeaScop(null === null ? 'x' : 0)), 'lo que no es un número → NaN');

console.log('\n── Del catálogo sale con dos decimales ──');
ok(calc.getScopAcsFromModel({ scop_dhw_calido: '3.775' }, 'D3') === 3.78, 'SCOP_dhw 3,775 del catálogo → 3,78');
ok(calc.getScopFromModel({ scop_cal_calido_35: '4.625', scop_cal_calido_55: '3.4' }, 'D3', 35) === 4.63, 'SCOP 4,625 → 4,63');

console.log('\n── La FÓRMULA calcula con el SCOP del papel ──');
const base = { q_net_heating: 20000, dacs: 2731.4, boilerEff: 0.79, changeAcs: true };
const a = calc.calculateSavings({ ...base, scopHeating: 4.017, scopAcs: 3.775 });
const b = calc.calculateSavings({ ...base, scopHeating: 4.02, scopAcs: 3.78 });
ok(JSON.stringify(a) === JSON.stringify(b), 'calculateSavings(4,017 · 3,775) = calculateSavings(4,02 · 3,78)');
const t1 = calc.calculateTerciario({ q_net_heating: 20000, dacs: 5000, boilerEff: 0.8, scopHeating: 4.125, scopAcs: 3.338, changeAcs: true });
const t2 = calc.calculateTerciario({ q_net_heating: 20000, dacs: 5000, boilerEff: 0.8, scopHeating: 4.13, scopAcs: 3.34, changeAcs: true });
ok(JSON.stringify(t1) === JSON.stringify(t2), 'calculateTerciario igual');
const sinScop = calc.calculateSavings({ ...base });
ok(Number.isFinite(sinScop?.savingsKwh ?? 0), 'sin SCOP se usan los valores por defecto, como antes');

console.log('\n── Se GUARDA con dos decimales, sin cambiar el tipo ──');
const inst = await redondearScopsInstalacion({
    aerotermia_cal: { scop: 4.017, scop_propio: '4.125', scop_temporada: 'calido', equipos_extra: [{ scop: 3.775 }, { modelo: 'X' }] },
    aerotermia_acs: { scop: '3.338' },
    piscina: { scop: 2.875 },
    otra: { scop: 9.999 },
});
ok(inst.aerotermia_cal.scop === 4.02, 'número → número (4,017 → 4,02)');
ok(inst.aerotermia_cal.scop_propio === '4.13', 'texto → texto ("4.125" → "4.13")');
ok(inst.aerotermia_cal.scop_temporada === 'calido', 'scop_temporada no se toca');
ok(inst.aerotermia_cal.equipos_extra[0].scop === 3.78 && inst.aerotermia_cal.equipos_extra[1].modelo === 'X', 'equipos en cascada');
ok(inst.aerotermia_acs.scop === '3.34' && inst.piscina.scop === 2.88, 'ACS y piscina');
ok(inst.otra.scop === 9.999, 'lo que no es un SCOP de la instalación no se toca');
const inp = await redondearScopsInputs({ scopHeating: '4.375', scopAcs: 3.628, zona: 'D3', scopAcsX: 1.111 });
ok(inp.scopHeating === '4.38' && inp.scopAcs === 3.63 && inp.scopAcsX === 1.111, 'inputs de la oportunidad');
ok((await redondearScopsInputs({ scopHeating: '' })).scopHeating === '', 'un campo vacío se queda vacío');

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
