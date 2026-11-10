#!/usr/bin/env node
/**
 * η_ACS — el ACS existente con su PROPIO rendimiento (CAE-1991, 10/11/2026).
 *
 *   AE_TOTAL = F_P · [ D_CAL·S·(1/η_i − 1/SCOP) + D_ACS·(1/η_ACS − 1/SCOP_dhw) ]
 *
 *   node implementation/backend/scripts/test_eta_acs_existente.mjs
 */
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { calculateSavings, etaAcsExistente, acsExistenteEsTermoElectrico } = await front('calculator/logic/calculation.js');
const { acsExistenteDelCee, proponerTermoAcs } = await front('expedientes/logic/acsExistenteCee.js');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

console.log('\n── El caso de Marwen: 26RES060_168 ──');
// FP 1 · DCAL 334,18 · S 83,00 · DACS 2185,12 · ηi 0,79 · ηACS 1,00 · SCOP 4,30 · SCOPdhw 3,34
const base168 = { q_net_heating: 334.18 * 83, dacs: 2185.12, boilerEff: 0.79, scopHeating: 4.30, scopAcs: 3.34, changeAcs: true };
const con = calculateSavings({ ...base168, acsEff: 1.0 }).savingsKwh;
const sin = calculateSavings(base168).savingsKwh;
ok(Math.round(con) === 30190, `con el termo a 1,00 → 30.190 kWh/año (da ${con.toFixed(2)})`);
ok(cerca(con, 28659.60 + 1530.89, 0.02), 'calefacción 28.659,60 + ACS 1.530,89');
ok(Math.round(sin) === 30771, `con la η única de la caldera salía 30.771 (da ${sin.toFixed(2)})`);

console.log('\n── Sin η_ACS, o con la de la caldera, todo da lo de antes ──');
for (const caso of [
    { q_net_heating: 20000, dacs: 2700, boilerEff: 0.65, scopHeating: 3.8, scopAcs: 2.9, changeAcs: true },
    { q_net_heating: 15000, dacs: 2100, boilerEff: 0.70, scopHeating: 4.3, scopAcs: 3.1, changeAcs: false },
    { q_net_heating: 30000, dacs: 2500, boilerEff: 0.83, scopHeating: 4.1, scopAcs: 3.0, changeAcs: true, cb: 0.9 },
]) {
    const a = calculateSavings(caso).savingsKwh;
    const b = calculateSavings({ ...caso, acsEff: caso.boilerEff }).savingsKwh;
    const c = calculateSavings({ ...caso, acsEff: undefined }).savingsKwh;
    ok(a === b && a === c, `η ${caso.boilerEff}, changeAcs ${caso.changeAcs}: ${a.toFixed(2)} igual con y sin acsEff`);
}
const fuera = { q_net_heating: 15000, dacs: 2100, boilerEff: 0.70, scopHeating: 4.3, scopAcs: 3.1, changeAcs: false };
ok(calculateSavings(fuera).savingsKwh === calculateSavings({ ...fuera, acsEff: 1 }).savingsKwh,
    'con el ACS fuera del alcance el término se cancela: η_ACS no mueve nada');

console.log('\n── etaAcsExistente ──');
const cal = { rendimiento_id: 'oil_post98' };
ok(etaAcsExistente({ misma_caldera_acs: true, caldera_antigua_cal: cal, caldera_antigua_acs: { rendimiento_id: 'electric' } }, 0.79).value === 0.79,
    'misma caldera → η_ACS = η_i aunque el nodo de ACS diga otra cosa');
ok(etaAcsExistente({ caldera_antigua_cal: cal }, 0.79).value === 0.79, 'sin el flag (expedientes viejos) → η_i');
const t = etaAcsExistente({ misma_caldera_acs: false, caldera_antigua_cal: cal, caldera_antigua_acs: { rendimiento_id: 'electric' } }, 0.79);
ok(t.value === 1 && t.propio, 'termo eléctrico → 1,00 y propio');
ok(etaAcsExistente({ misma_caldera_acs: false, caldera_antigua_cal: cal, caldera_antigua_acs: {} }, 0.79).value === 0.79, 'ACS propio sin fila → η_i (no se inventa)');
ok(etaAcsExistente({ misma_caldera_acs: false, caldera_antigua_cal: cal, caldera_antigua_acs: { rendimiento_id: 'sin_calefaccion' } }, 0.79).value === 0.79, '«sin calefacción» no es un equipo de ACS → η_i');
const igual = etaAcsExistente({ misma_caldera_acs: false, caldera_antigua_cal: cal, caldera_antigua_acs: { rendimiento_id: 'oil_post98' } }, 0.79);
ok(igual.value === 0.79 && !igual.propio, 'misma fila en los dos → no es «propio» (el CIFO no lo imprime aparte)');
ok(acsExistenteEsTermoElectrico({ misma_caldera_acs: false, caldera_antigua_acs: { rendimiento_id: 'electric' } }), 'acsExistenteEsTermoElectrico');

console.log('\n── El CEE inicial propone el termo ──');
const ceeTermo = { combustibleACS: 'ELECTRICIDAD PENINSULAR', rendimientoACS: 100 };
ok(acsExistenteDelCee(ceeTermo, null).termo, 'combustible eléctrico al 100 % → termo');
ok(!acsExistenteDelCee({ combustibleACS: 'GASOLEO CALEFACCIÓN', rendimientoACS: 79 }, null).termo, 'gasóleo → no');
ok(!acsExistenteDelCee({ combustibleACS: 'ELECTRICIDAD PENINSULAR', rendimientoACS: 300 }, null).termo, 'eléctrico al 300 % (bomba de calor) → no');
const xml = (instalaciones) => `<DatosEnergeticosDelEdificio><InstalacionesTermicas><InstalacionesACS>${instalaciones}</InstalacionesACS></InstalacionesTermicas></DatosEnergeticosDelEdificio>`;
const inst = (nombre, tipo, vector, eta) => `<Instalacion><Nombre>${nombre}</Nombre><Tipo>${tipo}</Tipo><VectorEnergetico>${vector}</VectorEnergetico><RendimientoEstacional>${eta}</RendimientoEstacional></Instalacion>`;
const soloTermo = acsExistenteDelCee(ceeTermo, xml(inst('Termo', 'Efecto Joule', 'ElectricidadPeninsular', '1.00')));
ok(soloTermo.termo && soloTermo.fuente === 'xml', 'XML con un «Efecto Joule» → termo, leído del XML');
const dos = acsExistenteDelCee(ceeTermo, xml(inst('Termo', 'Efecto Joule', 'ElectricidadPeninsular', '1.00') + inst('Caldera', 'Caldera Estándar', 'GasoleoC', '0.79')));
ok(dos.dosSistemas && !dos.termo, 'XML con termo y caldera → dos sistemas, se avisa y no se propone');
ok(proponerTermoAcs({ cambio_acs: true, misma_caldera_acs: true }, { termo: true }), 'se propone si aún sale de la caldera');
ok(!proponerTermoAcs({ cambio_acs: true, misma_caldera_acs: false, caldera_antigua_acs: { rendimiento_id: 'electric' } }, { termo: true }), 'no se propone si ya está declarado');
ok(!proponerTermoAcs({ cambio_acs: false }, { termo: true }), 'no se propone con el ACS fuera del alcance');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
