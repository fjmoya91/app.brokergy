#!/usr/bin/env node
/**
 * RES080_FM (rehabilitación profunda con factor multiplicador sobre la parte de la
 * bomba, BOE-A-2026-23367 págs. 20–22): el motor `calculateRes080FM`.
 *
 *   node implementation/backend/scripts/test_res080fm.mjs
 */
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logic = (f) => pathToFileURL(path.join(__dirname, '../../frontend/src/features/calculator/logic', f)).href;
const { calculateRes080FM, efDeCee, usosDeCee, FICHA_RES080_FM } = await import(logic('res080fm.js'));
const { FM_NORMATIVA } = await import(logic('res060fc.js'));

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const cerca = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const tiene = (r, tono, trozo) => (r.avisos || []).some((a) => a.tono === tono && a.texto.includes(trozo));

// CEE parseados mínimos: gasóleo → aerotermia, la demanda de calefacción baja de 150 a 90.
const vec = (nombre, esElectrico, calefaccion, acs = 0, refrigeracion = 0) =>
    ({ nombre, vectorXml: nombre, esElectrico, calefaccion, acs, refrigeracion, iluminacion: 0, global: calefaccion + acs + refrigeracion });
const CEE_I = { superficieHabitable: 100, demandaCalefaccion: 150, demandaRefrigeracion: 0,
    energiaFinalVectores: { gasoleo: vec('GasoleoC', false, 200, 25) } };
const CEE_F = { superficieHabitable: 100, demandaCalefaccion: 90, demandaRefrigeracion: 0,
    energiaFinalVectores: { elec: vec('ElectricidadPeninsular', true, 30, 8) } };
// El RES080 vigente: 225 → 38 kWh/m² × 100 m².
const RES080 = { totalEnergiaInicialAno: 22500, totalEnergiaFinalAno: 3800, ahorroEnergiaFinalTotal: 18700, superficieFinalAplicada: 100 };
const BASE = { res080: RES080, ceeInicial: CEE_I, ceeFinal: CEE_F, tipo: 'unifamiliar', contexto: { hoy: '2026-11-09' } };
const calc = (extra = {}) => calculateRes080FM({ ...BASE, ...extra, contexto: { ...BASE.contexto, ...(extra.contexto || {}) } });

console.log('\n── La fórmula LITERAL: (EF_i − EF_f) · (f_M·EF_simBC + EF_simRest) / (EF_simBC + EF_simRest) ──');
{
    // El ejemplo de la FAQ (consulta 4): 19.000 · 35.000/26.000 = 25.577; por ahorros, 31.667.
    const r = calculateRes080FM({
        res080: { totalEnergiaInicialAno: 25000, totalEnergiaFinalAno: 6000, ahorroEnergiaFinalTotal: 19000, superficieFinalAplicada: 100 },
        efSimBC: 9000, efSimRest: 17000, tipo: 'unifamiliar', contexto: { hoy: '2026-11-09' },
    });
    ok(cerca(r.cae, 25577), `ejemplo de la FAQ: 25.577 kWh (da ${Math.round(r.cae)})`);
    ok(cerca(r.factor, 35000 / 26000, 1e-9), 'cociente 35.000 / 26.000 = 1,346');
    ok(cerca(r.caeAhorros, 31667), `ponderando con ahorros, solo de referencia: 31.667 (da ${Math.round(r.caeAhorros)})`);
    ok(r.ficha === FICHA_RES080_FM && r.ficha === 'RES080_FM' && r.normativa === FM_NORMATIVA && r.fm === 2, 'RES080_FM, f_M 2, con la norma');
    ok(r.simBCFuente === 'kwh' && r.simRestFuente === 'kwh' && !r.estimada, 'los kWh tecleados no son una estimación');
    ok(tiene(r, 'info', 'Fórmula literal'), 'dice que es literal y da la referencia');
    ok(r.cae >= 19000 && r.cae <= 2 * 19000, 'nunca baja del ahorro vigente ni pasa de f_M veces');
}

console.log('\n── f_M por tipología ──');
{
    const k = { res080: { totalEnergiaInicialAno: 20000, totalEnergiaFinalAno: 5000, ahorroEnergiaFinalTotal: 15000 }, efSimBC: 10000, efSimRest: 10000, contexto: { hoy: '2026-11-09' } };
    ok(cerca(calculateRes080FM({ ...k, tipo: 'unifamiliar' }).cae, 15000 * 1.5), 'unifamiliar: f_M 2 (cociente 1,5 con pesos iguales)');
    ok(cerca(calculateRes080FM({ ...k, tipo: 'piso' }).cae, 15000 * 1.75), 'piso: f_M 2,5');
    ok(cerca(calculateRes080FM({ ...k, tipo: 'piso', bloque: true }).cae, 15000 * 2), 'centralizado: f_M 3');
    ok(calculateRes080FM({ ...k, tipo: 'HILERA' }).fm === 2, 'adosada = unifamiliar, en mayúsculas también');
}

console.log('\n── Los CEE simulados: el CEE manda, después los kWh; sin ellos, ESTIMADOS ──');
{
    const simBC = { superficieHabitable: 100, energiaFinalVectores: { elec: vec('ElectricidadPeninsular', true, 50, 8) } };
    const simRest = { superficieHabitable: 100, energiaFinalVectores: { g: vec('GasoleoC', false, 120, 25) } };
    const r = calc({ ceeSimBC: simBC, ceeSimRest: simRest, efSimBC: 1, efSimRest: 1 });
    ok(r.simBCFuente === 'cee' && cerca(r.efSimBC, 5800) && cerca(r.efSimRest, 14500), 'con los dos CEE: 5.800 y 14.500 kWh (sus EF × S)');
    ok(cerca(r.cae, 18700 * (2 * 5800 + 14500) / (5800 + 14500)), 'y la fórmula con ellos');
    ok(!r.estimada && !tiene(r, 'aviso', 'Faltan los CEE simulados'), 'sin aviso de que faltan');
    ok(efDeCee(simBC) === 5800 && usosDeCee(CEE_I).calOtros === 200, 'efDeCee / usosDeCee');

    const e = calc();
    // Bomba sola: 30·150/90 + 8 = 58 → 5.800; resto solo: 200·90/150 + 25 = 145 → 14.500.
    ok(e.estimada && cerca(e.efSimBC, 5800) && cerca(e.efSimRest, 14500), `estimados: bomba con la demanda del previo 5.800, envolvente con la caldera del previo 14.500 (dan ${Math.round(e.efSimBC)} / ${Math.round(e.efSimRest)})`);
    ok(tiene(e, 'aviso', 'Faltan los CEE simulados') && tiene(e, 'aviso', 'EF_simBC') && tiene(e, 'aviso', 'EF_simRest'), 'y avisa de que faltan los dos');
    ok(e.elegible === true && e.cae > 18700, 'estimada, pero elegible y con cifra');

    const medio = calc({ efSimBC: 5800 });
    ok(medio.estimada && medio.simBCFuente === 'kwh' && !tiene(medio, 'aviso', 'EF_simBC,') && tiene(medio, 'aviso', 'EF_simRest'), 'con uno solo, avisa del que falta');

    const sinDemanda = calc({ ceeInicial: { ...CEE_I, demandaCalefaccion: null } });
    ok(sinDemanda.sinSimulados && sinDemanda.cae === 0 && tiene(sinDemanda, 'aviso', 'no se pueden estimar'), 'sin demanda no se estima: cifra 0 y lo dice');
    // Sin vectores, con lo que el RES080 reconstruyó por uso.
    const porUso = calc({
        ceeInicial: { demandaCalefaccion: 150 }, ceeFinal: { demandaCalefaccion: 90 },
        res080: { ...RES080, energiaCalefInicial: 200, energiaAcsInicial: 25, energiaRefInicial: 0, energiaCalefFinal: 30, energiaAcsFinal: 8, energiaRefFinal: 0 },
    });
    ok(porUso.estimada && cerca(porUso.efSimBC, 5800), 'sin <EnergiaFinalVectores>, con la energía por uso del RES080 vigente');
}

console.log('\n── Requisito: envolvente Y sustitución de caldera por bomba ──');
{
    const sinEnv = calc({ ceeFinal: { ...CEE_F, demandaCalefaccion: 150 } });
    ok(sinEnv.envolvente === false && !sinEnv.elegible && tiene(sinEnv, 'bloquea', 'envolvente'), 'sin bajar la demanda: bloquea (va por la RES060_FM)');
    const sinBomba = calc({ ceeFinal: { ...CEE_F, energiaFinalVectores: { g: vec('GasNatural', false, 120, 20) } } });
    ok(sinBomba.cambioGenerador === false && !sinBomba.elegible, 'el posterior sigue con caldera: bloquea');
    const yaBomba = calc({ ceeInicial: { ...CEE_I, energiaFinalVectores: { e: vec('ElectricidadPeninsular', true, 60, 10) } } });
    ok(yaBomba.cambioGenerador === false && !yaBomba.elegible, 'el previo ya era eléctrico: bloquea');
    const pellets = calc({ ceeInicial: { ...CEE_I, energiaFinalVectores: { b: vec('BiomasaPellet', false, 200, 25) } } });
    ok(pellets.solido && !pellets.elegible && tiene(pellets, 'bloquea', 'SÓLIDO'), 'biomasa en el previo: siempre por la vigente');
    ok(!calc({ contexto: { solido: true } }).elegible, 'sólido por la fila de la caldera también');
    ok(!calc({ contexto: { sinCalefaccion: true } }).elegible, 'sin caldera: bloquea');
    const sinVec = calc({ ceeInicial: { demandaCalefaccion: 150 }, ceeFinal: { demandaCalefaccion: 90 }, efSimBC: 5800, efSimRest: 14500 });
    ok(sinVec.cambioGenerador == null && sinVec.elegible && tiene(sinVec, 'aviso', 'pase de la caldera a la bomba'), 'sin vectores no se puede comprobar el cambio: aviso, no bloqueo');
}

console.log('\n── Plazos y tramitación (los mismos que la RES060_FM) ──');
{
    ok(!calc({ contexto: { inicioObra: '2026-02-01' } }).elegible, 'obra empezada antes del 22/03/2026: bloquea');
    ok(!calc({ contexto: { finObra: '2027-12-15' } }).elegible, 'factura desde el 01/12/2027: bloquea');
    ok(calc({ contexto: { finObra: '2027-12-15', comunidad: true } }).elegible, 'comunidad de propietarios: hasta el 01/01/2028');
    ok(!calc({ contexto: { tramite: 'presentado' } }).elegible, 'ya presentado: bloquea');
    const v = calc({ contexto: { tramite: 'verificacion' } });
    ok(v.elegible && tiene(v, 'aviso', 'verificación'), 'en verificación: aviso');
    ok(!calc({ contexto: { hoy: '2028-01-02' } }).elegible, 'fuera de plazo: bloquea');
    ok(calculateRes080FM({ res080: null }) === null, 'sin RES080, null');
    const cero = calc({ res080: { totalEnergiaInicialAno: 1000, totalEnergiaFinalAno: 1200, ahorroEnergiaFinalTotal: 0 } });
    ok(cero.cae === 0 && !cero.elegible, 'sin ahorro vigente no hay nada que multiplicar');
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
