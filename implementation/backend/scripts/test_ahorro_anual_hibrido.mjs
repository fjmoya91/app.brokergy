#!/usr/bin/env node
/**
 * El ahorro anual en € (lo que la propuesta enseña con `includeAnnualSavings`)
 * reparte el consumo nuevo por VECTOR: la bomba a precio de luz, lo que sigue
 * quemando la caldera (calefacción 1 − C_b, y el ACS si no cambia) a precio de
 * su combustible. Caso que lo destapó: 26RES060_OP310 (19/10/2026).
 *
 *   node implementation/backend/scripts/test_ahorro_anual_hibrido.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const calc = await import(pathToFileURL(path.join(__dirname,
    '../../frontend/src/features/calculator/logic/calculation.js')).href);
const { calculateAnnualSavingsTheoretical: teorico, calculateAnnualSavingsFromSpending: gasto, FUEL_PRICES } = calc;

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const cerca = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const eur = v => `${v.toFixed(2)} €`;

// La fórmula de ANTES, tal cual estaba: todo el consumo nuevo a precio de luz.
function antes({ demandaCalefaccion, demandaACS, boilerEff, scopCalefaccion, scopACS, fuelType, changeACS, cb }) {
    const pf = FUEL_PRICES[fuelType].price, pe = FUEL_PRICES.electricidad.price;
    const actual = (demandaCalefaccion + demandaACS) / boilerEff * pf;
    const nuevo = ((demandaCalefaccion * cb / scopCalefaccion) + (demandaCalefaccion * (1 - cb) / boilerEff)
        + demandaACS / (changeACS ? scopACS : boilerEff)) * pe;
    return actual - nuevo;
}

console.log('\n── 26RES060_OP310: gasóleo, hibridación C_b ≈ 0,43 ──');
// Lo guardado en la oportunidad (datos_calculo.result.annualSavings, 19/10/2026):
const guardado = { consumoActual: 95095.24873138411, consumoNuevo: 60933.69391191835, ahorroAnual: -2944.9353001697855 };
const eta = 0.79, scop = 4, scopAcs = 3, dacs = 2731.4;
const Q = guardado.consumoActual * eta - dacs;                       // 72.393,85 kWh
const cb = (Q / eta - (guardado.consumoNuevo - dacs / scopAcs)) / (Q / eta - Q / scop);
const op310 = { demandaCalefaccion: Q, demandaACS: dacs, boilerEff: eta, scopCalefaccion: scop,
    scopACS: scopAcs, fuelType: 'gasoleo', changeACS: true, cb };
ok(cerca(Q, 72394, 1) && cerca(cb, 0.43, 0.005), `datos: Q_net ${Q.toFixed(0)} kWh · C_b ${cb.toFixed(4)}`);
ok(cerca(antes(op310), guardado.ahorroAnual, 0.01), `la fórmula de antes reproduce lo guardado: ${eur(antes(op310))}`);

const r = teorico(op310);
const elecEsperada = Q * cb / scop + dacs / scopAcs;
const fuelEsperado = Q * (1 - cb) / eta;
ok(cerca(r.consumoElectricoNuevo, elecEsperada, 0.01), `electricidad: calefacción C_b/SCOP + ACS/SCOP_acs = ${r.consumoElectricoNuevo.toFixed(0)} kWh`);
ok(cerca(r.consumoCombustibleNuevo, fuelEsperado, 0.01), `gasóleo que sigue quemando la caldera: (1 − C_b)/η = ${r.consumoCombustibleNuevo.toFixed(0)} kWh`);
ok(cerca(r.costeNuevo, elecEsperada * 0.22 + fuelEsperado * 0.11, 0.01), `coste nuevo = luz × 0,22 + gasóleo × 0,11 = ${eur(r.costeNuevo)}`);
ok(cerca(r.ahorroAnual, 2802, 1), `ahorro anual ${eur(r.ahorroAnual)} (antes ${eur(guardado.ahorroAnual)})`);
ok(r.ahorroAnual > 0, 'una hibridación con SCOP 4 sobre gasóleo AHORRA');
ok(cerca(r.consumoNuevo, r.consumoElectricoNuevo + r.consumoCombustibleNuevo, 1e-6), 'consumoNuevo = electricidad + combustible');

console.log('\n── C_b = 1 con el ACS dentro: idéntico a antes ──');
for (const [fuelType, q, e] of [['gasoleo', 18000, 0.79], ['gas_natural', 12500, 0.92], ['glp', 9000, 0.85], ['pellets', 22000, 0.7]]) {
    const p = { demandaCalefaccion: q, demandaACS: dacs, boilerEff: e, scopCalefaccion: 4.2, scopACS: 3.1, fuelType, changeACS: true, cb: 1 };
    const n = teorico(p).ahorroAnual, v = antes(p);
    ok(Math.abs(n - v) < 1e-9, `${fuelType}: ${eur(n)} = ${eur(v)}`);
    ok(teorico(p).consumoCombustibleNuevo === 0, `${fuelType}: sin combustible nuevo`);
}

console.log('\n── El ACS que NO cambia se queda en la caldera, a precio de su combustible ──');
const sinAcs = { demandaCalefaccion: 18000, demandaACS: dacs, boilerEff: 0.79, scopCalefaccion: 4, scopACS: 3, fuelType: 'gasoleo', changeACS: false, cb: 1 };
const soloCal = teorico({ ...sinAcs, demandaACS: 0 });
const conAcsFuera = teorico(sinAcs);
ok(cerca(conAcsFuera.ahorroAnual, soloCal.ahorroAnual, 1e-6),
    `el ACS fuera de la obra se cancela: ${eur(conAcsFuera.ahorroAnual)} = solo calefacción ${eur(soloCal.ahorroAnual)}`);
ok(conAcsFuera.ahorroAnual > antes(sinAcs),
    `antes ese ACS se cobraba a precio de luz: ${eur(antes(sinAcs))}`);

console.log('\n── Hibridación con el ACS fuera: la caldera quema (1 − C_b) de la calefacción y TODO el ACS ──');
const h = teorico({ ...sinAcs, cb: 0.6 });
ok(cerca(h.consumoCombustibleNuevo, 18000 * 0.4 / 0.79 + dacs / 0.79, 1e-6), `combustible ${h.consumoCombustibleNuevo.toFixed(0)} kWh`);
ok(cerca(h.consumoElectricoNuevo, 18000 * 0.6 / 4, 1e-6), `electricidad ${h.consumoElectricoNuevo.toFixed(0)} kWh`);
ok(cerca(h.ahorroAnual, 18000 * 0.6 * (0.11 / 0.79 - 0.22 / 4), 1e-6), `solo ahorra la parte que pasa a la bomba: ${eur(h.ahorroAnual)}`);

console.log('\n── Modo «gasto real»: el C_b reparte igual ──');
const g1 = gasto({ gastoAnual: 3000, fuelType: 'gasoleo', boilerEff: 0.79, scopCalefaccion: 4, cb: 1 });
const g43 = gasto({ gastoAnual: 3000, fuelType: 'gasoleo', boilerEff: 0.79, scopCalefaccion: 4, cb: 0.43 });
ok(cerca(g43.ahorroAnual, g1.ahorroAnual * 0.43, 1e-6), `con C_b 0,43 ahorra el 43 % de la sustitución: ${eur(g43.ahorroAnual)} de ${eur(g1.ahorroAnual)}`);
ok(g43.ahorroAnual > 0, 'y sigue siendo positivo');

console.log(fallos ? `\n✗ ${fallos} fallo(s)\n` : '\n✓ todo bien\n');
process.exit(fallos ? 1 : 0);
