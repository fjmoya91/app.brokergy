// El CEE «A CIEGAS» de la oportunidad: va APARTE y no mueve nada de lo ofrecido.
//   node implementation/backend/scripts/test_cee_ciego.mjs
// Sin BD, sin motor y sin CE3X: solo la lógica (quién entra, huella, señal,
// guardado, partner) y que el resultado de la calculadora sale IDÉNTICO.
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require('../utils/esmSinExtension');
const FRONT = path.join(AQUI, '../../frontend/src');
const esm = f => import(pathToFileURL(path.join(FRONT, f)).href);

const ec = await esm('features/calculator/logic/estimacionCiega.js');
const { computeFullCalculatorResult } = await esm('features/landing/data/landingCalculation.js');
const { conservarCiega, sinCiegaParaPartner } = require('../utils/estimacionCiega.js');
const { demandaDelXml } = require('../services/cee/ceeCiego.js');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

// Una unifamiliar de 2017 como la 26RES060_OP307 (sin datos personales).
const base = {
    rc: '0000000AA0000A0001AA', anio: 2017, tipo: 'unifamiliar', zona: 'D3', superficie: 216, superficieCalefactable: 216,
    provincia: '13', municipio: 'MIGUELTURRA', patios: 0,
    plantas: 3, altura: 2.7, fachadas: 4, gla: 12, ach: 0.63, uMuro: 0.27, uCubierta: 0.22, ventanaU: 1.4,
    boilerId: 'gas_post98_auto', boilerEff: 0.73, fuelType: 'gas_natural', boilerHeatingType: 'Gas', boilerAcsType: 'Gas',
    emitterType: 'radiadores_convencionales', scopHeating: 4, scopAcs: 3, changeAcs: true, dacs: 2731.4,
    demandMode: 'estimated', isReforma: false, reformaType: 'none', presupuesto: 8500, caePriceClient: 100, caePriceSO: 160,
    participation: 100, numOwners: 1, titularType: 'particular', includeIrpf: true, orientacion: 'media', subtipo: 'intermedio',
    sueloTipo: 'terreno', potenciaBomba: 12, savingsMode: 'real', guia_transmitancias: 'ce3x-3.2', calibracion_demanda: '2026-10',
    construcciones_elegidas: ['1/02/01', '1/00/01', '1/01/01'],
};

// ── Quién entra ──────────────────────────────────────────────────────────────
ok(ec.motivoNoElegible({ ficha: 'RES060', inputs: base, estado: 'LEAD' }) === null, 'una unifamiliar RES060 en captación viva entra');
ok(ec.motivoNoElegible({ ficha: 'RES093', inputs: base, estado: 'EN CURSO' }) === null, 'una hibridación RES093 también');
ok(!!ec.motivoNoElegible({ ficha: 'RES080', inputs: base, estado: 'LEAD' }), 'un RES080 no');
ok(!!ec.motivoNoElegible({ ficha: 'RES060', inputs: { ...base, tipo: 'piso' }, estado: 'LEAD' }), 'un piso no (de momento)');
ok(!!ec.motivoNoElegible({ ficha: 'RES060', inputs: { ...base, cee_previo: { origen: 'brokergy' } }, estado: 'LEAD' }), 'con un CEE en la simulación no');
ok(!!ec.motivoNoElegible({ ficha: 'RES060', inputs: base, estado: 'ENVIADA' }), 'una ENVIADA no (solo captación viva)');
ok(!!ec.motivoNoElegible({ ficha: 'RES060', inputs: { ...base, rc: '' }, estado: 'LEAD' }), 'sin referencia catastral no');

// ── Huella ───────────────────────────────────────────────────────────────────
const h = ec.huellaCiega(base);
ok(h === ec.huellaCiega({ ...base, construcciones_elegidas: ['1/00/01', '1/01/01', '1/02/01'] }), 'la huella no depende del orden de las construcciones');
ok(h === ec.huellaCiega({ ...base, presupuesto: 20000, caePriceClient: 90 }), 'ni del presupuesto ni del precio');
ok(h !== ec.huellaCiega({ ...base, superficieCalefactable: 200 }), 'cambia con la superficie');
ok(h !== ec.huellaCiega({ ...base, boilerId: 'gasoleo_pre98' }), 'cambia con la caldera');
ok(h !== ec.huellaCiega({ ...base, construcciones_elegidas: ['1/00/01'] }), 'cambia con las construcciones');

// ── Superficie confirmada ────────────────────────────────────────────────────
const conf = { m2: 216, construcciones: ec.construccionesClave(base), por: 'PRUEBA', at: '2026-10-26T10:00:00Z' };
ok(!!ec.superficieConfirmadaVigente({ ...base, superficie_confirmada: conf }), 'la confirmación vale con los mismos m² y construcciones');
ok(!ec.superficieConfirmadaVigente({ ...base, superficieCalefactable: 230, superficie_confirmada: conf }), 'se cae si cambian los m²');
ok(!ec.superficieConfirmadaVigente({ ...base, construcciones_elegidas: ['1/00/01'], superficie_confirmada: conf }), 'se cae si cambian las construcciones');

// ── La cifra ofrecida NO se mueve ────────────────────────────────────────────
const limpio = JSON.stringify(computeFullCalculatorResult({ ...base }));
ok(computeFullCalculatorResult({ ...base }).savings.savingsKwh > 0, 'la calculadora da un ahorro con estos inputs (si no, lo de abajo no prueba nada)');
const conMarca = JSON.stringify(computeFullCalculatorResult({ ...base, superficie_confirmada: conf }));
ok(limpio === conMarca, 'el resultado de la calculadora es IDÉNTICO con la superficie confirmada en inputs');
const copia = ec.inputsConDemandaCiega(base, { demanda: 155.1, superficie: 216 });
ok(base.demandMode === 'estimated' && base.manualDemand === undefined, 'la copia a ciegas no toca los inputs de la oportunidad');
const rCiega = computeFullCalculatorResult(copia);
const rCalc = computeFullCalculatorResult(base);
ok(rCiega.savings.savingsKwh > rCalc.savings.savingsKwh, `con la demanda a ciegas sale otro ahorro (${Math.round(rCiega.savings.savingsKwh)} frente a ${Math.round(rCalc.savings.savingsKwh)} kWh)`);
ok(JSON.stringify(computeFullCalculatorResult({ ...base })) === limpio, 'y calcularla no cambia el resultado de la oportunidad');

// ── Señal ────────────────────────────────────────────────────────────────────
const est = { ahorro_kwh: 40341, huella: ec.huellaCiega(base) };
const l1 = ec.lecturaCiega(est, { inputs: base, ahorroCalculadora: 12714 });
ok(l1.estado === 'ok' && l1.seQuedaCorta === true, `ratio ${l1.ratio.toFixed(2)} > 1,3 → «se queda corta»`);
const l2 = ec.lecturaCiega(est, { inputs: base, ahorroCalculadora: 35000 });
ok(l2.seQuedaCorta === false, 'ratio 1,15 → sin señal');
ok(ec.lecturaCiega(est, { inputs: { ...base, superficieCalefactable: 180 }, ahorroCalculadora: 12714 }).estado === 'desactualizada',
    'con otros m² la cifra sale «desactualizada»');
ok(ec.lecturaCiega(null, { inputs: base, ahorroCalculadora: 1 }).estado === 'sin', 'sin cifra: «sin»');
const est216 = { ...est, superficie: 216.04 };
ok(ec.lecturaCiega(est216, { inputs: base, ahorroCalculadora: 12714 }).noValida === 'superficie sin confirmar', 'sin confirmar: «sin validar»');
ok(ec.lecturaCiega(est216, { inputs: { ...base, superficie_confirmada: conf }, ahorroCalculadora: 12714 }).noValida === null,
    'al confirmar, vale en el acto (no espera a que el PC la rehaga)');
ok(!!ec.motivoNoValida({ superficie: 240 }, conf), 'si el motor mide más de un 5 % distinto de lo confirmado, no vale');

// ── Guardado de la calculadora ───────────────────────────────────────────────
const bd = { datos_calculo: { estimacion_ciega: { bono: 4034 }, inputs: { ...base, superficie_confirmada: conf } } };
const dc1 = await conservarCiega({ inputs: { ...base, superficie_confirmada: { m2: 999 } }, estimacion_ciega: { bono: 1 } }, bd);
ok(dc1.estimacion_ciega.bono === 4034, 'el guardado conserva la cifra a ciegas de la BD (no la del navegador)');
ok(dc1.inputs.superficie_confirmada === conf, 'y la confirmación de la BD, no la que manda el navegador');
const dc2 = await conservarCiega({ inputs: { ...base, superficieCalefactable: 230 } }, bd);
ok(dc2.inputs.superficie_confirmada === undefined, 'al cambiar los m² la confirmación se cae');
const dc3 = await conservarCiega({ inputs: { ...base }, estimacion_ciega: { bono: 1 } }, null);
ok(dc3.estimacion_ciega === undefined, 'una oportunidad nueva no estrena cifra a ciegas desde el navegador');

// ── Partner ──────────────────────────────────────────────────────────────────
const fila = { id: 'x', datos_calculo: { estado: 'LEAD', estimacion_ciega: { bono: 4034 } } };
ok(sinCiegaParaPartner(fila, false).datos_calculo.estimacion_ciega === undefined, 'a un partner no se le devuelve');
ok(sinCiegaParaPartner(fila, true).datos_calculo.estimacion_ciega.bono === 4034, 'al equipo sí');

// ── XML ──────────────────────────────────────────────────────────────────────
const xml = '<DatosEnergeticosDelEdificio><SuperficieUtil>216.04</SuperficieUtil><Indicadores><Demanda><Cal>155.14</Cal><Acs>9.2</Acs></Demanda></Indicadores>'
    + '<MedidasDeMejora><Demanda><Cal>12.0</Cal></Demanda></MedidasDeMejora></DatosEnergeticosDelEdificio>';
const d = demandaDelXml(xml);
ok(d.cal === 155.14 && d.sup === 216.04, 'del XML se lee la demanda del EDIFICIO, no la de la medida');
ok(demandaDelXml(xml.toUpperCase().replace(/<(\/?)([A-Z]+)>/g, (m) => m)).cal === 155.14, 'también con las etiquetas en MAYÚSCULAS');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
