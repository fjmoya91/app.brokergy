#!/usr/bin/env node
/**
 * Fichas con FACTOR MULTIPLICADOR (Resolución DGPLACE de 3/11/2026, BOE-A-2026-23367):
 * RES060_FM y las de hibridación en paralelo por zona (RES090_FM…RES094_FM), con sus
 * avisos de elegibilidad. El fichero conserva su nombre de cuando era el borrador (FC).
 *
 *   node implementation/backend/scripts/test_res060fc.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logic = (f) => pathToFileURL(path.join(__dirname, '../../frontend/src/features/calculator/logic', f)).href;
const fmMod = await import(logic('res060fc.js'));
const { estadoFc, lineaFactorCorreccion } = await import(logic('avisoFc.js'));
const {
    calculateRes060FM, calculateRes060FC, cbParaleloFm, cbParaleloFc, provIndex, contextoCalderaFc, tramiteFc,
    plantasEdificioFc, FM_NORMATIVA,
} = fmMod;

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const cerca = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const tiene = (r, tono, trozo) => (r.avisos || []).some((a) => a.tono === tono && a.texto.includes(trozo));

// Ciudad Real, 1995, unifamiliar, D3, gasóleo 85-97 (η 0,70), SCOP 4 / 2,6, con ACS.
// CEE final: D_cal 120 kWh/m², S 150 m². (Anexo IV UNI, Ciudad Real 1981-2007: 96,4.)
const CEE_FINAL = { demandaCalefaccion: 120, superficieHabitable: 150, emisionesLetra: 'B', epnrLetra: 'C' };
const BASE = {
    provinciaCode: '13', anio: 1995, tipo: 'unifamiliar', zona: 'D3', superficie: 140,
    boilerEff: 0.70, boilerId: 'oil_85_97', scopHeating: 4, scopAcs: 2.6, changeAcs: true,
    ceeFinal: CEE_FINAL, contexto: { hoy: '2026-11-08' },
};
const calc = (extra = {}) => calculateRes060FM({ ...BASE, ...extra, contexto: { ...BASE.contexto, ...(extra.contexto || {}) } });

console.log('\n── La fórmula publicada: [D_cal·S·(1/η − 1/SCOP) + D_ACS·(1/η − 1/SCOP_dhw)] · f_M, SIN tope ──');
{
    const r = calc();
    const ahc = 120 * 150 * (1 / 0.7 - 1 / 4);
    const aha = 11 * 150 * (1 / 0.7 - 1 / 2.6);
    ok(cerca(r.ahc, ahc) && cerca(r.aha, aha), `calefacción ${Math.round(ahc)} + ACS ${Math.round(aha)} (D_ACS = 11 × 150 = 1.650)`);
    ok(cerca(r.cae, 2 * (ahc + aha)), `AE = × 2 = ${Math.round(2 * (ahc + aha))} kWh (da ${Math.round(r.cae)})`);
    ok(r.ficha === 'RES060_FM' && r.fm === 2 && r.fc === 2 && r.normativa === FM_NORMATIVA, 'RES060_FM, f_M 2 (y `fc` como alias), con la norma');
    ok(cerca(calc({ cef: 1000 }).cae, r.cae) && r.tope === null && r.limitedByTope === false, 'el CEF ya no corta nada');
    ok(calculateRes060FC === calculateRes060FM && cbParaleloFc('D3', 0.5) === cbParaleloFm('D3', 0.5), 'los nombres del borrador siguen funcionando');
    ok(r.elegible === true, 'el caso base es elegible');
}

console.log('\n── D_cal y S: CEE final → CEE inicial → simulación ──');
{
    const fin = calc({ ceeFinal: { demandaCalefaccion: 110, superficieHabitable: 130 }, ceeInicial: { demandaCalefaccion: 150, superficieHabitable: 150 } });
    ok(fin.dcalFuente === 'cee_final' && fin.dcal === 110 && fin.superficie === 130, 'manda el CEE FINAL (su D_cal y su S)');
    const viaCtx = calc({ ceeFinal: null, contexto: { ceeFinal: { demandaCalefaccion: 110, superficieHabitable: 130 } } });
    ok(viaCtx.dcalFuente === 'cee_final' && viaCtx.dcal === 110, 'también si llega por `contexto.ceeFinal` (como lo pasan la calculadora y el expediente)');
    const ini = calc({ ceeFinal: null, ceeInicial: { demandaCalefaccion: 150, superficieHabitable: 145 } });
    ok(ini.dcalFuente === 'cee_inicial' && ini.dcal === 150 && ini.superficie === 145 && tiene(ini, 'info', 'CEE INICIAL'), 'sin final, el INICIAL, diciéndolo');
    const sim = calc({ ceeFinal: null, qCalefaccion: 140 * 90 });
    ok(sim.dcalFuente === 'simulacion' && cerca(sim.dcal, 90, 0.01) && sim.superficie === 140 && tiene(sim, 'aviso', 'simulación'), 'sin CEE, la de la simulación, marcada');
    const nada = calc({ ceeFinal: null });
    ok(nada.dcalFuente === null && nada.cae > 0 && tiene(nada, 'aviso', 'Sin CEE ni demanda'), 'sin demanda: solo el ACS, y avisándolo');
    ok(calculateRes060FM({ ...BASE, ceeFinal: null, superficie: 0 }) === null, 'sin superficie ni demanda → null');
    const sinS = calc({ ceeFinal: { demandaCalefaccion: 120 } });
    ok(sinS.superficie === 140, 'CEE sin superficie: la de la simulación');
}

console.log('\n── UNIFAMILIAR: D_cal = mín(CEE ; 2 × tabla UNI del Anexo IV) ──');
{
    const alto = calc({ ceeFinal: { demandaCalefaccion: 250, superficieHabitable: 150 } });
    ok(alto.dcalRef === 96.4 && alto.dcalTope === 192.8 && alto.dcal === 192.8 && alto.limitadoPorTabla, 'Ciudad Real 1981-2007: tope 2 × 96,4 = 192,8');
    ok(tiene(alto, 'info', '2 × 96,4'), 'y lo cuenta');
    ok(!calc().limitadoPorTabla, 'por debajo del tope, la del CEE');
    const piso = calc({ tipo: 'PISO', ceeFinal: { demandaCalefaccion: 250, superficieHabitable: 150 } });
    ok(piso.dcal === 250 && piso.dcalTope === null, 'piso: sin tope (las tablas de pisos desaparecen)');
    // La casa de Cuenca de 1930 (820 m², SCOP 4,6) de la revisión del 21/10/2026.
    const cuenca = calculateRes060FM({ provinciaCode: '16', anio: 1930, tipo: 'unifamiliar', zona: 'D2', superficie: 820,
        boilerEff: 0.70, scopHeating: 4.6, scopAcs: 4.6, changeAcs: true, ceeFinal: { demandaCalefaccion: 420, superficieHabitable: 820 } });
    const esperado = 2 * (420 * 820 * (1 / 0.7 - 1 / 4.6) + 11 * 820 * (1 / 0.7 - 1 / 4.6));
    ok(cuenca.dcalTope === 462.4 && cerca(cuenca.cae, esperado, 2), `Cuenca ≤1940 (tope 462,4): ${Math.round(cuenca.cae)} kWh`);
    const canarias = calc({ provinciaCode: 'Santa Cruz de Tenerife', zona: 'B3' });
    ok(canarias.dcalTope === null && tiene(canarias, 'aviso', 'no trae datos'), 'Canarias: sin tabla, sin tope y avisándolo');
    const sinProv = calc({ provinciaCode: 'Narnia' });
    ok(sinProv && sinProv.cae > 0 && tiene(sinProv, 'aviso', 'Falta la provincia'), 'sin provincia válida: calcula, sin tope, y lo avisa');
    const sinAnio = calc({ anio: null });
    ok(sinAnio.anioSupuesto && sinAnio.yearLabel === '1981-2007' && tiene(sinAnio, 'aviso', 'año de construcción'), 'sin año: tope del tramo 1981-2007, avisándolo');
    ok(!tiene(calc({ tipo: 'piso', anio: null }), 'aviso', 'año de construcción'), 'en un piso el año ya no importa');
}

console.log('\n── Tipología: f_M y d_ACS; las plantas del edificio ya no cuentan ──');
{
    const piso = calc({ tipo: 'PISO' });
    ok(piso.clase === 'piso' && piso.fm === 2.5 && piso.dAcsEspecifica === 11, "'PISO' en mayúsculas: f_M 2,5 y d_ACS 11");
    const bloque = calc({ tipo: 'piso', bloque: true });
    ok(bloque.clase === 'bloque' && bloque.fm === 3 && bloque.dacs === 16 * 150, 'bloque (sistema centralizado): f_M 3 y D_ACS 16·S');
    ok(calc({ tipo: 'hilera' }).fm === 2, 'adosada = unifamiliar');
    ok(calc({ tipo: 'piso', plantasEdificio: '4+' }).cae === calc({ tipo: 'piso', plantasEdificio: '1-3' }).cae, '`fcPlantasEdificio` guardado se lee sin romper y no cambia nada');
    ok(plantasEdificioFc(6) === '4+' && plantasEdificioFc('1-3') === '1-3', 'plantasEdificioFc sigue leyendo lo guardado');
    const vul = calc({ vulnerable: true });
    ok(vul.ficha === 'RES060_FM-S' && vul.fm === 3 && cerca(vul.cae, calc().cae * 1.5), 'vulnerable: × 1,5 y ficha -S');
    // Sin ACS en la simulación (Fran, 07/11/2026: «que sea un aviso»): la cifra FM
    // lo suma como si se añadiera, y el aviso dice qué hacer.
    const sinAcs = calc({ changeAcs: false });
    const conAcs = calc();
    ok(sinAcs.acsSupuesto === true && sinAcs.dacs === 11 * 150 && cerca(sinAcs.aha, conAcs.aha) && cerca(sinAcs.cae, conAcs.cae),
        'sin ACS: la vía FM suma D_ACS = 11·S con el SCOP_dhw de la simulación (como si se añadiera)');
    ok(sinAcs.elegible === true && tiene(sinAcs, 'aviso', 'Añade el depósito de ACS') && tiene(sinAcs, 'aviso', 'ya supone que se añade'),
        'y es un AVISO (no bloquea) que dice qué hacer y que la cifra lo supone');
    ok(!conAcs.acsSupuesto && !conAcs.acsSinScop && !tiene(conAcs, 'aviso', 'depósito de ACS'), 'con ACS: ni supuesto ni aviso');
    const sinScop = calc({ changeAcs: false, scopAcs: 0 });
    ok(sinScop.acsSinScop === true && sinScop.aha === 0 && sinScop.dacs === 0 && tiene(sinScop, 'aviso', 'solo la calefacción'),
        'sin ACS ni SCOP_dhw: solo la calefacción, y lo dice');
    const bloqueSinAcs = calc({ tipo: 'piso', bloque: true, changeAcs: false });
    ok(bloqueSinAcs.acsSupuesto && bloqueSinAcs.dacs === 16 * 150, 'bloque sin ACS: el supuesto es 16·S');
    // Bloque que solo cambia el ACS (26RES060_OP190: 7.225 m², contaba 1.704 MWh de calefacción).
    const soloAcs = calc({ tipo: 'piso', bloque: true, changeHeating: false });
    ok(soloAcs.ahc === 0 && soloAcs.dem === 0 && soloAcs.aha > 0 && cerca(soloAcs.cae, soloAcs.aha * 3),
        'bloque con solo el ACS: la calefacción se cancela y queda el ACS × f_M');
    ok(soloAcs.elegible === false && tiene(soloAcs, 'bloquea', 'no cambia la calefacción') && !tiene(soloAcs, 'aviso', 'Y el ACS'),
        'y no entra en el FM (la bomba ha de dar calefacción Y ACS), sin el aviso de «sin ACS»');
    ok(calc({ changeHeating: true }).cae === calc().cae, 'changeHeating por defecto (true): no cambia nada');
}

console.log('\n── Hibridación: la ficha de SU zona, con su C_b (aerotermia o geotermia) ──');
{
    ok(cbParaleloFm('D3', 0.5) === 0.805, 'D, 50 %, aerotermia → 0,805 (tres decimales)');
    ok(cbParaleloFm('D3', 0.5, 'geotermia') === 0.864 && cbParaleloFm('D3', 0.5, 'hidrotérmica') === 0.864, 'D, 50 %, geotermia o hidrotérmica → 0,864');
    ok(cbParaleloFm('D3', 0.15) === 0 && cbParaleloFm('E1', 0.15) === 0, 'D y E: hasta el 15 %, 0');
    ok(cbParaleloFm('E1', 0.17) === 0.144, 'E1, 17 % → interpola del 15 % (0) al 20 % (0,36): 0,144');
    ok(cbParaleloFm('C2', 0.15) === 0.353 && cbParaleloFm('C2', 0.10) === 0, 'C: 10 % → 0; 15 % → 0,353');
    ok(cbParaleloFm('A4', 0.30) === 0.756 && cbParaleloFm('B3', 0.30) === 0.675, 'A y B tienen su propia tabla');
    ok(cbParaleloFm('D3', 1) === 1 && cbParaleloFm('D3', 0.975) === 0.992, 'del 95 al 100 % sube a 1');
    const h = calc({ hibridacion: { coverage: 0.5, refPower: 10, cb: 0.8 } });
    const sinHib = calc();
    ok(h.ficha === 'RES093_FM' && h.zonaCb === 'D1-D3' && h.cb === 0.805, 'D3 → RES093_FM con el C_b de su tabla');
    ok(cerca(h.cae, sinHib.cae * 0.805, 0.5), 'el C_b multiplica el corchete entero');
    ok(calc({ hibridacion: { coverage: 0.5, refPower: 10 }, fuenteBomba: 'geotermia' }).cb === 0.864, 'geotermia: la otra columna');
    ok(calc({ zona: 'C2', hibridacion: { coverage: 0.5, refPower: 10 } }).ficha === 'RES092_FM', 'C2 → RES092_FM');
    const sinPot = calc({ hibridacion: { coverage: 0, refPower: 0, cb: 1 } });
    ok(sinPot.cb === 1 && tiene(sinPot, 'aviso', 'potencias'), 'sin potencias: el C_b de la app y avisándolo');
    const sinZona = calc({ zona: null, hibridacion: { coverage: 0.5, refPower: 10 } });
    ok(sinZona.ficha === 'RES093_FM' && tiene(sinZona, 'aviso', 'zona climática'), 'sin zona: la D y avisándolo');
}

console.log('\n── η: Anexo II publicado; sólido fuera ──');
{
    ok(calc({ boilerId: 'gas_post98_cond_auto', boilerEff: 0.83 }).eta === 0.85, 'gas ≥1998, condensación, encendido auto: 85 % (vigente 83 %)');
    ok(calc({ boilerId: 'gas_pre98_cond', boilerEff: 0.85 }).eta === 0.83, 'gas <1998, condensación: 83 % (vigente 85 %)');
    ok(calc().eta === 0.70, 'el resto, el mismo');
    const solido = calc({ boilerId: 'solid_auto', boilerEff: 0.6 });
    ok(solido.elegible === false && tiene(solido, 'bloquea', 'SÓLIDO'), 'caldera de combustible sólido: no elegible');
    ok(calc({ contexto: { combustible: 'biomasa' } }).elegible === false, 'biomasa por el contexto: tampoco');
    const def = calc({ boilerId: 'default', boilerEff: 0.92 });
    ok(def.etaPorDefecto && tiene(def, 'aviso', 'por defecto'), 'rendimiento por defecto: pide elegir la fila');
}

console.log('\n── Elegibilidad: fechas, tramitación, letra, bomba ──');
{
    const el = (contexto, extra = {}) => calc({ ...extra, contexto });
    ok(el({ sinCalefaccion: true }).elegible === false, 'sin calefacción: no');
    ok(el({ inicioObra: '2026-03-01' }).elegible === false, 'obra iniciada antes del 22/03/2026: no');
    ok(el({ inicioObra: '2026-03-22' }).elegible && el({ inicioObra: '2026-04-10' }).elegible, 'desde el 22/03/2026: sí');
    ok(el({ finObra: '2027-12-05' }).elegible === false && el({ finObra: '2027-11-30' }).elegible, 'facturas hasta el 30/11/2027: sí; de diciembre: no');
    ok(el({ finObra: '2027-12-05', comunidad: true }).elegible && el({ finObra: '2028-01-02', comunidad: true }).elegible === false, 'CC. PP.: hasta el 31/12/2027');
    ok(el({ hoy: '2028-01-01' }).elegible === false && el({ hoy: '2028-02-15', comunidad: true }).elegible, 'presentación hasta el 31/12/2027 (CC. PP.: 28/02/2028)');
    ok(el({ tramite: 'presentado' }).elegible === false, 'ya presentado a MITECO con la ficha vigente: no');
    ok(el({ tramite: 'verificacion' }).elegible && tiene(el({ tramite: 'verificacion' }), 'aviso', 'pierde'), 'en lote o verificación: aviso');
    const g = el({}, { ceeFinal: { ...CEE_FINAL, epnrLetra: 'G' } });
    ok(g.elegible && tiene(g, 'aviso', 'doc. 13'), 'zona D y CEE final con G: ya NO bloquea; aviso con el documento 13');
    ok(!tiene(el({}, { zona: 'C2', ceeFinal: { ...CEE_FINAL, epnrLetra: 'G' } }), 'aviso', 'doc. 13'), 'zona C: la letra no importa');
    ok(!tiene(el({}, { hibridacion: { coverage: 0.5, refPower: 10 }, ceeFinal: { ...CEE_FINAL, epnrLetra: 'G' } }), 'aviso', 'doc. 13'), 'hibridación: su ficha no lo pide');
    ok(tiene(el({}, { ceeFinal: { demandaCalefaccion: 120, superficieHabitable: 150 } }), 'info', 'doc. 13'), 'zona D sin letras: lo recuerda');
    ok(el({ aireAire: true }).elegible === false, 'bomba aire-aire (splits/conductos): no');
    ok(el({}, { zona: 'α3' }).elegible === false, 'clima α: no');
    const elec = el({ combustible: 'electrica' });
    ok(elec.elegible && tiene(elec, 'aviso', 'ELÉCTRICA'), 'caldera eléctrica: duda, no bloqueo');
    ok(tiene(el({}), 'info', '1.287 GWh') && tiene(el({}), 'info', 'RESOLUCIÓN') && tiene(el({}), 'info', 'mantenimiento'), 'cupo, orden de resolución y requisitos, siempre');
    const av = el({ tramite: 'verificacion' }).avisos.map((a) => a.tono);
    ok(av.join(',') === [...av].sort((a, b) => ['bloquea', 'aviso', 'info'].indexOf(a) - ['bloquea', 'aviso', 'info'].indexOf(b)).join(','), 'los avisos van de más a menos grave');
}

console.log('\n── Contexto de la caldera y de la tramitación ──');
{
    ok(contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción' }).sinCalefaccion, "'No tiene Calefacción' → sin calefacción");
    ok(contextoCalderaFc({}, 'sin_calefaccion').sinCalefaccion, "rendimiento 'sin_calefaccion' → sin calefacción");
    ok(contextoCalderaFc({ boilerId: 'electric' }).combustible === 'electrica', 'caldera eléctrica');
    ok(contextoCalderaFc({ fuelType: 'pellets' }).combustible === 'biomasa' && contextoCalderaFc({ fuelType: 'pellets' }).solido, 'pellets → biomasa (sólido)');
    ok(contextoCalderaFc({ boilerHeatingType: 'Gasoil' }).combustible === 'fosil' && !contextoCalderaFc({ boilerHeatingType: 'Gasoil' }).solido, 'gasóleo → fósil, no sólido');
    ok(!contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción' }, 'oil_post98').sinCalefaccion,
        '«No tiene Calefacción» en el tipo con una caldera de gasóleo elegida: manda la caldera (24 oportunidades así)');
    ok(contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción', boilerId: 'default' }).sinCalefaccion, 'sin fila de caldera, el tipo sí cuenta');
    ok(contextoCalderaFc({ boilerHeatingType: 'BIOMASA' }, 'solid_auto').combustible === 'biomasa'
        && contextoCalderaFc({ boilerHeatingType: 'Carbon' }, 'solid_auto').combustible === 'fosil', 'combustible sólido: biomasa o carbón según lo declarado');
    ok(contextoCalderaFc({ boilerHeatingType: 'Carbon' }, 'solid_auto').solido, 'el carbón también es sólido (fuera del Anexo II)');
    ok(!contextoCalderaFc({ boilerHeatingType: 'BIOMASA' }, 'gas_post98').solido, 'una fila de gas manda sobre el tipo «biomasa»');
    ok(tramiteFc('SUBIDO A MITECO') === 'presentado' && tramiteFc('CAE EMITIDO – PTE PAGO BROKERGY') === 'presentado' && tramiteFc('FINALIZADO') === 'presentado', 'subido, emitido o finalizado → presentado');
    ok(tramiteFc('ENVIADO A VERIFICADOR') === 'verificacion' && tramiteFc('PTE FIN EXPTE', 'lote-1') === 'verificacion', 'en verificación o en lote');
    ok(tramiteFc('PTE FIN EXPTE') === null && tramiteFc(null) === null, 'lo demás, nada');
    ok(provIndex('13') === 12 && provIndex('CIUDAD REAL') === 12 && provIndex('A Coruña') === 14 && provIndex('Vizcaya') === 47, 'provincia por código o por nombre');
}

console.log('\n── El aviso de la propuesta no anuncia un FM que no se puede pedir ──');
{
    const fm = calc();
    const result = { res060fc: fm, financials: { caeBonus: 1000 }, financialsRes060FC: { caeBonus: 4000 } };
    ok(estadoFc(result, {}).procede, 'elegible y mayor: procede');
    const no = calc({ contexto: { sinCalefaccion: true } });
    const e = estadoFc({ ...result, res060fc: no }, {});
    ok(!e.procede && e.motivo.includes('no se podría pedir'), 'no elegible: no procede y dice por qué');
    const txt = lineaFactorCorreccion({ actual: 1000, fc: 4000 });
    ok(txt.includes('BOE') && txt.includes('15 de enero de 2027') && txt.includes('no está garantizada') && txt.endsWith('*1.000 €*.') && !txt.includes('consulta pública'),
        'el texto cita el BOE, la fecha de presentación, que no está garantizado y acaba en la cifra firme');
}

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
