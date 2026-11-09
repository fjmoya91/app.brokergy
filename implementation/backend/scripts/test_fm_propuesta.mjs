// La hoja del FACTOR MULTIPLICADOR de la propuesta (calculator/logic/fmPropuesta.js)
// y el párrafo del mensaje (avisoFc.js) en RES060, RES09x y RES080.
// node implementation/backend/scripts/test_fm_propuesta.mjs
import { fmPropuesta, textosHojaFm, fichaVigenteDe } from '../../frontend/src/features/calculator/logic/fmPropuesta.js';
import { estadoFc, lineaFactorCorreccion } from '../../frontend/src/features/calculator/logic/avisoFc.js';
import { esVulnerableFm } from '../../frontend/src/features/calculator/logic/viaFm.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

const fm060 = { ficha: 'RES060_FM', cae: 50000, elegible: true, avisos: [] };
const fm093 = { ficha: 'RES093_FM', cae: 56220, elegible: true, avisos: [] };
const fm080 = { ficha: 'RES080_FM', cae: 90000, elegible: true, estimada: true, avisos: [] };
const aero = (fc) => ({ res060fc: fc, financials: { caeBonus: 3603 }, financialsRes060FC: { caeBonus: 6184 } });
const reforma = { res080fm: fm080, financialsRes080: { caeBonus: 8000 }, financialsRes080FM: { caeBonus: 11500 } };

// 1) Aerotermia sola (RES060): una opción, la de la RES060_FM.
let d = fmPropuesta(aero(fm060), { tipo: 'unifamiliar', zona: 'C3' });
ok(d.procede && d.opciones.length === 1 && d.principal.ficha === 'RES060_FM', 'RES060: una opción con la RES060_FM');
ok(d.principal.actual === 3603 && d.principal.fm === 6184 && d.principal.extra === 2581, 'RES060: 3.603 → 6.184 (+2.581)');
let t = textosHojaFm(d);
ok(t.titular === '6.184 €', 'titular con la cifra FM');
ok(t.calendario.length === 5 && t.calendario[1].cuando === '15/01/2027', 'calendario: se pide desde el 15/01/2027');
ok(t.calendario[2].cuando === 'Antes del 01/12/2027', 'facturas antes del 01/12/2027');
ok(!t.requisitos.some((r) => /F o G/.test(r.t)), 'zona C: sin el aviso F/G');
ok(t.riesgos.some((r) => /3\.603 €/.test(r)) && /3\.603 €/.test(t.decision), 'la cifra firme se repite en riesgos y decisión');
ok(/página 2/.test(t.linea(d.principal)), 'línea de la portada remite a la página 2');

// 2) Hibridación en D (RES093): la RES093_FM, requisito en paralelo y F/G.
d = fmPropuesta(aero(fm093), { tipo: 'unifamiliar', zona: 'D3' });
t = textosHojaFm(d);
ok(d.hibridacion && d.principal.fichaVigente === 'RES093', 'RES093: hibridación, vigente RES093');
ok(t.requisitos.some((r) => /paralelo/.test(r.t)) && !t.requisitos.some((r) => /F o G/.test(r.t)), 'RES093 en D: paralelo y SIN el documento F/G');
ok(t.requisitos.some((r) => /boletín de baja tensión y/.test(r.d)), 'RES093: el boletín de BT, sin condición');
ok(textosHojaFm(fmPropuesta(aero(fm060), { tipo: 'unifamiliar', zona: 'D3' })).requisitos.some((r) => /F o G/.test(r.t)), 'RES060 en D: con el documento F/G');

// 3) Solo reforma (RES080): la RES080_FM, estimada, nunca la RES060_FM.
const soloRef = { isReforma: true, comparativaReforma: false, tipo: 'unifamiliar', zona: 'D2' };
d = fmPropuesta({ ...reforma, ...aero(fm060) }, soloRef);
ok(d.opciones.length === 1 && d.principal.ficha === 'RES080_FM', 'solo reforma: RES080_FM, sin la RES060_FM');
t = textosHojaFm(d);
ok(t.titular === 'unos 11.500 €' && /simulados/.test(t.riesgos[0]), 'RES080 estimada: «unos» y el riesgo lo dice');
ok(t.requisitos.some((r) => /cuatro certificados/.test(r.d)) && !t.requisitos.some((r) => /F o G/.test(r.t)), 'RES080: cuatro CEE; F/G solo con aerotermia');
ok(!t.requisitos.some((r) => /IRPF|mantenimiento/.test(r.d)), 'RES080: sin cláusula del IRPF ni oferta de mantenimiento');
const e080 = estadoFc({ ...reforma }, soloRef);
ok(e080.procede && e080.ficha === 'RES080_FM' && e080.estimada, 'estadoFc de una solo reforma: RES080_FM');
const msg = lineaFactorCorreccion({ ...e080, actual: e080.actual, fc: e080.fc });
ok(/de la reforma/.test(msg) && /estimación/.test(msg) && /rehabilitación/.test(msg), 'el mensaje habla de la reforma y de la estimación');

// 4) Comparativa aerotermia + reforma: las dos opciones, principal la mayor.
d = fmPropuesta({ ...reforma, ...aero(fm060) }, { isReforma: true, tipo: 'piso', zona: 'C2' });
ok(d.opciones.length === 2 && d.principal.clave === 'reforma', 'dos opciones: aerotermia y reforma; principal la mayor');
ok(d.opciones[0].titulo === 'Opción 1: Aerotermia', 'con su título');

// 5) No sube o lo impide algo: no hay hoja.
d = fmPropuesta({ res060fc: fm060, financials: { caeBonus: 7000 }, financialsRes060FC: { caeBonus: 6184 } }, {});
ok(!d.procede && /NO sube/.test(d.motivo) && textosHojaFm(d) === null, 'si el FM no sube: sin hoja y con motivo');
const bloq = { ...fm060, elegible: false, avisos: [{ tono: 'bloquea', texto: 'Caldera de biomasa' }] };
ok(!fmPropuesta(aero(bloq), {}).procede, 'si algo lo impide: sin hoja');
ok(fichaVigenteDe('RES091_FM') === 'RES093' && fichaVigenteDe('RES080_FM') === 'RES080', 'ficha vigente de cada FM');

// 6) Consumidor vulnerable (09/11/2026): ficha -S, × 1,5, tarjeta y cifra sin acreditarlo.
const bonoLuz = (fn) => ({ bono_social: { respuesta: 'electrico', tipo: 'vulnerable', familia_numerosa: fn } });
ok(esVulnerableFm({ confirmacion_cliente: bonoLuz(false) }) === true, 'vulnerable: bono de la luz y no familia numerosa, declarado al aceptar');
ok(esVulnerableFm({ confirmacion_cliente: bonoLuz(true) }) === false, 'familia numerosa con el bono de vulnerable: NO (falta la renta)');
ok(esVulnerableFm({ vulnerable: false, confirmacion_cliente: bonoLuz(false) }) === false, 'el «No» del equipo manda sobre lo declarado');
ok(esVulnerableFm({ vulnerable: true }) === true && esVulnerableFm({}) === false, 'el «Sí» del equipo basta; sin nada, no');
const fm060S = { ficha: 'RES060_FM-S', cae: 75000, elegible: true, avisos: [] };
const aeroS = { res060fc: fm060S, financials: { caeBonus: 3603 }, financialsRes060FC: { caeBonus: 7500, finalPriceClient: 100, isParticular: true, legalizationCost: 0 } };
const eS = estadoFc(aeroS, {});
ok(eS.procede && eS.vulnerable === true, 'estadoFc: la ficha -S es vulnerable');
d = fmPropuesta(aeroS, { tipo: 'unifamiliar', zona: 'D3' });
t = textosHojaFm(d);
ok(d.vulnerable && d.principal.sinVulnerable === 5000, 'sin acreditarlo: 75.000 / 1,5 kWh a 100 €/MWh = 5.000 €');
ok(/por 3 la cifra actual/.test(t.noDoble) && /por 3/.test(t.noDoble), 'unifamiliar vulnerable: «por 3» y la intro lo dice');
ok(t.requisitos.some((r) => /vulnerable/.test(r.t) && /Anexo B/.test(r.d) && /unos 5\.000 €/.test(r.d)), 'tarjeta del consumidor vulnerable con la cifra sin acreditarlo');
ok(!textosHojaFm(fmPropuesta(aero(fm060), { zona: 'D3' })).requisitos.some((r) => /vulnerable/.test(r.t)), 'sin vulnerable: sin tarjeta');
const mS = lineaFactorCorreccion({ ...eS, hoja: true });
ok(/1,5 de consumidor vulnerable/.test(mS) && /página 2/.test(mS), 'mensaje: dice el × 1,5 y remite a la página 2');
ok(!/vulnerable|página 2/.test(lineaFactorCorreccion({ actual: 1000, fc: 4000 })), 'sin vulnerable ni hoja: el párrafo de siempre');

// 7) La siembra del expediente con el conmutador de la oportunidad.
const { semillaBonoSocial } = require('../services/expedienteService.js');
const sOp = await semillaBonoSocial(null, 'RES060', { vulnerableOp: true });
ok(sOp.via_fm?.vulnerable === true && /equipo/.test(sOp.via_fm.por), 'el Sí de la oportunidad siembra vulnerable en el expediente');
const sNo = await semillaBonoSocial(bonoLuz(false), 'RES060', { vulnerableOp: false });
ok(!sNo.via_fm && sNo.subvenciones?.bono_social, 'el No de la oportunidad no siembra el × 1,5 (el Anexo I sí)');
ok(!(await semillaBonoSocial(null, 'RES080', { vulnerableOp: true })).via_fm, 'RES080: nunca -S');

console.log(fallos ? `\n${fallos} fallo(s)` : '\n✓ todo correcto');
process.exit(fallos ? 1 : 0);
