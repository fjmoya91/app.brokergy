// Por la vía FM, el SCOP de CALEFACCIÓN es el del clima de la ZONA aunque la vigente
// se haya declarado en medio (logic/climaFm.js). Caso real: 26RES093_8 (D3, 12 kW).
// node implementation/backend/scripts/test_clima_fm.mjs
import { entradasFmClima } from '../../frontend/src/features/calculator/logic/climaFm.js';
import { calculateRes060FM } from '../../frontend/src/features/calculator/logic/res060fc.js';
import { calculateHybridization } from '../../frontend/src/features/calculator/logic/calculation.js';

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

const S = 123;
const dcal = 270.69;
const demanda = dcal * S;
const hybIn = { method: 'demanda', heatPumpPower: 12, boilerPower: 27.8 };
const hMedio = calculateHybridization({ demandAnnual: demanda, zone: 'D3', ...hybIn, climateSeason: 'medio' });
const hib = { coverage: hMedio.coverage, refPower: hMedio.refPower, cb: hMedio.cb };
const base = {
    provinciaCode: '13', anio: 1968, tipo: 'unifamiliar', zona: 'D3', superficie: S,
    boilerEff: 0.79, boilerId: 'oil_post98', scopAcs: 3.59, changeAcs: true,
    ceeFinal: { demandaCalefaccion: dcal, superficieHabitable: S },
};
const fmCon = (e) => calculateRes060FM({ ...base, scopHeating: e.scopHeating, hibridacion: e.hibridacion, contexto: { climaFm: e.clima } });

// 1) Medio elegido en zona cálida → FM en cálido.
const inst = { hibridacion: true, scop_clima: 'MEDIO' };
const e = entradasFmClima({ src: inst, zona: 'D3', scopHeating: 3.46, hibridacion: hib, hybridInputs: hybIn, demandAnnual: demanda, scopCalido: 4.34 });
ok(e.scopHeating === 4.34 && e.clima?.ajustado, 'medio en D3 → SCOP FM 4,34');
ok(Math.abs(e.hibridacion.cb - 0.785) < 0.002, `C_b con horas cálidas ≈ 0,785 (${e.hibridacion.cb})`);
const r = fmCon(e);
ok(Math.abs(r.cae / 1000 - 56.22) < 0.05, `26RES093_8 por la FM: 56,22 MWh (${(r.cae / 1000).toFixed(2)})`);
ok(r.avisos.some((a) => a.tono === 'info' && /clima CÁLIDO/.test(a.texto)), 'lo dice en los avisos');
const rMedio = calculateRes060FM({ ...base, scopHeating: 3.46, hibridacion: hib });
ok(Math.abs(rMedio.cae / 1000 - 63.92) < 0.05, `sin el ajuste salía 63,92 (${(rMedio.cae / 1000).toFixed(2)})`);

// 2) Sin medio elegido, o en E1, o sin hibridación: no cambia nada.
ok(entradasFmClima({ src: { hibridacion: true }, zona: 'D3', scopHeating: 4.34, hibridacion: hib }).clima === null, 'sin elegir medio → igual');
ok(entradasFmClima({ src: inst, zona: 'E1', scopHeating: 3.46, hibridacion: hib, scopCalido: 4.34 }).clima === null, 'E1 (ya es medio) → igual');
ok(entradasFmClima({ src: { hibridacion: false, scop_clima: 'medio' }, zona: 'D3', scopHeating: 3.46 }).clima === null, 'sin hibridación → igual');

// 3) Sin SCOP cálido conocido → se queda en medio y AVISA.
const sin = entradasFmClima({ src: inst, zona: 'D3', scopHeating: 3.46, hibridacion: hib, hybridInputs: hybIn, demandAnnual: demanda });
ok(sin.scopHeating === 3.46 && sin.clima?.sinCalido, 'sin SCOP cálido → medio + marca');
ok(fmCon(sin).avisos.some((a) => a.tono === 'aviso' && /no hay SCOP cálido/.test(a.texto)), 'y el aviso lo dice');

// 4) Con modelo del catálogo sin columna cálida no se afirma el cálido.
const modeloSoloMedio = { id: 1, scop_cal_medio_55: 3.46, scop_cal_medio_35: 4.5 };
ok(entradasFmClima({ src: inst, zona: 'D3', scopHeating: 3.46, hibridacion: hib, hybridInputs: hybIn, demandAnnual: demanda, modelo: modeloSoloMedio, temp: 55 }).clima?.sinCalido, 'catálogo sin cálido → no inventa');

console.log(fallos ? `\n${fallos} fallo(s)` : '\n✓ todo correcto');
process.exit(fallos ? 1 : 0);
