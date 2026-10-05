#!/usr/bin/env node
// ============================================================================
// test_cobertura_generadores.mjs — qué parte de cada demanda cubre cada generador
// del CEE, y el SISTEMA POR DEFECTO de CE3X (coberturaGeneradores.js).
//
// Datos: los de 26RES080_78, sin nada del cliente. Estufa de pellets declarada al
// 40 % de la calefacción (η 0,39) y el 60 % restante, gas natural por defecto de
// CE3X (η 0,92); refrigeración sin equipo → máquina frigorífica por defecto (2,0).
// El mismo .cex pasado a CE3X 3.1 escribe ese gas como «Caldera estándar (sistema
// ficticio)» con las mismas cifras: se prueba con un XML v2.0 y uno v3.0 mínimos.
//
//   node implementation/backend/scripts/test_cobertura_generadores.mjs
// ============================================================================
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/calculator/logic/');
const { coberturaPorGenerador, leerGeneradoresDeTexto, vectorCanonico } = await import(pathToFileURL(LOGIC + 'coberturaGeneradores.js').href);
const { calculateRes080SimplificadoFromXml, calculateRes080 } = await import(pathToFileURL(LOGIC + 'calculation.js').href);

let mal = 0;
const bien = (ok, txt, extra) => { console.log(`  ${ok ? '✓' : '✗'} ${txt}${!ok && extra ? `  — ${extra}` : ''}`); if (!ok) mal++; };
const cerca = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;

const XML_V20 = `<DatosEnergeticosDelEdificio><IdentificacionEdificio></IdentificacionEdificio>
<InstalacionesTermicas><GeneradoresDeCalefaccion><Generador><Tipo>Caldera Estándar</Tipo>
<VectorEnergetico>BiomasaPellete</VectorEnergetico><Nombre>ESTUFA PELLETS</Nombre><RendimientoEstacional>0.39</RendimientoEstacional>
</Generador></GeneradoresDeCalefaccion><InstalacionesACS><Instalacion><Tipo>Efecto Joule</Tipo>
<VectorEnergetico>ElectricidadPeninsular</VectorEnergetico><Nombre>TERMO</Nombre><RendimientoEstacional>1.00</RendimientoEstacional>
</Instalacion></InstalacionesACS></InstalacionesTermicas></DatosEnergeticosDelEdificio>`;

const XML_V30 = `<DatosEnergeticosDelEdificio version="3.0"><DatosEdificio></DatosEdificio><Modelo><Sistemas>
<Generador><Servicio>CAL</Servicio><Tipo>CalderaConvencional</Tipo><VectorEnergetico>BIOMASADENSIFICADA</VectorEnergetico><Nombre>ESTUFA PELLETS</Nombre><RendimientoEstacional>0.39</RendimientoEstacional></Generador>
<Generador><Servicio>CAL</Servicio><EsFicticio/><Tipo>CalderaConvencional</Tipo><VectorEnergetico>GASNATURAL</VectorEnergetico><Nombre>Caldera estándar (sistema ficticio)</Nombre><RendimientoEstacional>0.92</RendimientoEstacional></Generador>
<Generador><Servicio>REF</Servicio><EsFicticio/><Tipo>ExpansionDirectaAireAire</Tipo><VectorEnergetico>ELECTRICIDAD</VectorEnergetico><Nombre>Máquina frigorífica (sistema ficticio)</Nombre><RendimientoEstacional>2.00</RendimientoEstacional></Generador>
<Generador><Servicio>ACS</Servicio><Tipo>CalderaElectrica</Tipo><VectorEnergetico>ELECTRICIDAD</VectorEnergetico><Nombre>TERMO</Nombre><RendimientoEstacional>1.00</RendimientoEstacional></Generador>
</Sistemas></Modelo><Indicadores></Indicadores></DatosEnergeticosDelEdificio>`;

const vec = (nombre, vectorXml, cal, acs, ref) => ({ nombre, vectorXml, calefaccion: cal, acs, refrigeracion: ref, global: cal + acs + ref, esElectrico: /electric/i.test(nombre) });
const VECTORES = {
    a: vec('GAS NATURAL', 'GASNATURAL', 121.92, 0, 0),
    b: vec('Electricidad peninsular', 'ElectricidadPeninsular', 0, 18.43, 6.34),
    c: vec('BIOMASA DENSIFICADA (PELETS)', 'BIOMASAPELLET', 190.76, 0, 0),
};
const DEMANDA = { cal: 186.94, acs: 18.43, ref: 12.68 };
const fila = (cob, srv, porDefecto) => cob.servicios.find((s) => s.key === srv).filas.find((f) => f.porDefecto === porDefecto);

console.log('\nA) Los generadores, leídos del texto (v2.0, v3.0 y en MAYÚSCULAS como en la BD)');
for (const [nombre, xml] of [['v2.0', XML_V20], ['v2.0 MAYÚS', XML_V20.toUpperCase()], ['v3.0', XML_V30], ['v3.0 MAYÚS', XML_V30.toUpperCase()]]) {
    const g = leerGeneradoresDeTexto(xml);
    const estufa = g.find((x) => x.servicios.includes('cal') && !x.ficticio);
    bien(estufa?.vector === 'Biomasa densificada (pelets)' && estufa?.eta === 0.39, `${nombre}: estufa de pellets al 39 %`);
    if (nombre.startsWith('v3.0')) bien(g.filter((x) => x.ficticio).length === 2, `${nombre}: dos sistemas ficticios (calefacción y refrigeración)`);
}
bien(vectorCanonico('BIOMASAPELLETE') === 'Biomasa densificada (pelets)' && vectorCanonico('GASOLEOC') === 'Gasoleo Calefacción'
    && vectorCanonico('CARBÓN') === 'Carbón' && vectorCanonico('ELECTRICIDAD') === 'Electricidad peninsular', 'vectorCanonico entiende las cuatro formas de escribir un vector');

console.log('\nB) La cobertura: 40 % la estufa, 60 % el gas natural por defecto de CE3X');
for (const [nombre, xml] of [['v2.0 (sin ficticios en el XML)', XML_V20.toUpperCase()], ['v3.0 (con <EsFicticio/>)', XML_V30]]) {
    const c = coberturaPorGenerador({ vectores: VECTORES, demanda: DEMANDA, generadores: leerGeneradoresDeTexto(xml) });
    const est = fila(c, 'cal', false); const gas = fila(c, 'cal', true); const frio = fila(c, 'ref', true);
    bien(cerca(est.pct, 0.40, 0.005), `${nombre}: estufa ${Math.round(est.pct * 100)} %`);
    bien(cerca(gas.pct, 0.60, 0.005) && gas.vector === 'Gas Natural', `${nombre}: gas natural por defecto ${Math.round(gas.pct * 100)} %`);
    bien(cerca(gas.eta, 0.92, 0.01), `${nombre}: el rendimiento del gas por defecto sale 0,92 (${gas.eta?.toFixed(3)})`);
    bien(cerca(frio.pct, 1) && cerca(frio.eta, 2, 0.01), `${nombre}: la refrigeración, 100 % máquina frigorífica por defecto`);
    bien(gas.generador === 'Sistema ficticio por defecto · Caldera estándar de gas natural', `${nombre}: «${gas.generador}»`);
    bien(frio.generador === 'Sistema ficticio por defecto · Máquina frigorífica', `${nombre}: «${frio.generador}»`);
    bien(c.hayPorDefecto && c.servicios.every((s) => s.cuadra), `${nombre}: cada servicio suma el 100 %`);
}

console.log('\nC) Un sistema por defecto que COMPARTE vector con un generador declarado');
{
    // Caldera de gas declarada al 40 % (η 0,80) + el gas por defecto (0,92) en el 60 %.
    const E = 186.94 * 0.4 / 0.8 + 186.94 * 0.6 / 0.92;
    const c = coberturaPorGenerador({
        vectores: { a: vec('Gas Natural', 'GasNatural', E, 0, 0) }, demanda: { cal: 186.94 },
        generadores: [{ servicios: ['cal'], nombre: 'CALDERA GAS', vector: 'GasNatural', eta: 0.8 }],
    });
    const r = fila(c, 'cal', false); const d = fila(c, 'cal', true);
    bien(cerca(r.pct, 0.40) && cerca(d?.pct ?? 0, 0.60), `se separan: caldera ${Math.round(r.pct * 100)} % + por defecto ${Math.round((d?.pct ?? 0) * 100)} %`);
}

console.log('\nD) El ahorro y la fila «otros combustibles» del cálculo por vector');
{
    const ini = { superficieHabitable: 264, demandaCalefaccion: 186.94, demandaACS: 18.43, demandaRefrigeracion: 12.68,
        emisionesConsumoElectrico: 8.2, emisionesConsumoOtros: 34.16, energiaFinalVectores: VECTORES };
    const fin = { superficieHabitable: 264, demandaCalefaccion: 154.23, demandaACS: 18.43, demandaRefrigeracion: 9.29,
        emisionesConsumoElectrico: 18.79, emisionesConsumoOtros: 0,
        energiaFinalVectores: { b: vec('Electricidad peninsular', 'ElectricidadPeninsular', 33.68, 18.43, 4.65) } };
    const r = calculateRes080SimplificadoFromXml({ xmlInicial: ini, xmlFinal: fin, xmlTextoInicial: XML_V20.toUpperCase(), xmlTextoFinal: null });
    bien(r.fuenteDatos === 'energia_final_declarada', 'la energía final se lee del certificado');
    bien(cerca(r.ahorroEnergiaFinalTotal / 1000, 74.10, 0.01), `ahorro ${(r.ahorroEnergiaFinalTotal / 1000).toFixed(2)} MWh/año (incluye el gas por defecto)`);
    bien(/^Biomasa densificada \(pelets\) · 40 % calef\. \+ Gas Natural · 60 % calef\. \(sistema ficticio por defecto\)$/.test(r.details.otros.fuelIni), `«${r.details.otros.fuelIni}»`);
    const emi = r.cobertura.inicial.servicios.flatMap((s) => s.filas).filter((f) => f.vector !== 'Electricidad peninsular').reduce((a, f) => a + f.emisiones, 0);
    bien(cerca(emi, 34.16, 0.01), `las emisiones de pellets + gas (${emi.toFixed(2)}) son las «otros combustibles» del certificado (34,16)`);
}

console.log('\nE) «Por uso»: la calefacción mixta y el sistema ficticio se LEEN, no se reconstruyen');
{
    const ini = { superficieHabitable: 264, demandaCalefaccion: 186.94, demandaACS: 18.43, demandaRefrigeracion: 12.68,
        emisionesACS: 6.10, emisionesCalefaccion: 34.16, emisionesRefrigeracion: 2.10, emisionesConsumoOtros: 34.16, energiaFinalVectores: VECTORES };
    const fin = { superficieHabitable: 264, demandaCalefaccion: 154.23, demandaACS: 18.43, demandaRefrigeracion: 9.29,
        emisionesACS: 6.10, emisionesCalefaccion: 11.00, emisionesRefrigeracion: 1.76, emisionesConsumoOtros: 0,
        energiaFinalVectores: { b: vec('Electricidad peninsular', 'ElectricidadPeninsular', 33.68, 18.43, 4.65) } };
    const args = { xmlInicial: ini, xmlFinal: fin, combAcsInicial: 'Electricidad peninsular', combAcsFinal: 'Electricidad peninsular',
        combCalefaccionInicial: 'Biomasa densificada (pelets)', combCalefaccionFinal: 'Electricidad peninsular' };
    const r = calculateRes080({ ...args, xmlTextoInicial: XML_V20.toUpperCase() });
    bien(cerca(r.details.cal.energyIni, 312.68, 0.01), `calefacción inicial ${r.details.cal.energyIni.toFixed(2)} kWh/m² (190,76 + 121,92), no 1.897,78`);
    bien(r.details.cal.fuelIni === 'Biomasa densificada (pelets) · 40 % + Gas Natural · 60 % (sistema ficticio por defecto)', `«${r.details.cal.fuelIni}»`);
    bien(r.details.cal.fuelIniFijo === true && r.details.acs.fuelIniFijo === false, 'la calefacción mixta va fija; el ACS de un solo equipo se sigue eligiendo');
    bien(r.details.ref.fuelIni === 'Electricidad peninsular · 100 % (sistema ficticio por defecto)', `refrigeración: «${r.details.ref.fuelIni}»`);
    bien(cerca(r.ahorroEnergiaFinalTotal / 1000, 74.04, 0.02), `ahorro ${(r.ahorroEnergiaFinalTotal / 1000).toFixed(2)} MWh/año (antes 492,51)`);
    bien(!!r.cobertura?.inicial && r.contraste?.declaradas?.otrosIni === 34.16, 'trae la cobertura y las emisiones declaradas para el cuadro');
    // Sin mezcla ni sistema ficticio, lo de siempre: emisiones ÷ factor del combustible elegido.
    const solo = calculateRes080({ ...args, xmlInicial: { ...ini, emisionesCalefaccion: 3.43, energiaFinalVectores: { b: VECTORES.b, c: VECTORES.c } }, xmlTextoInicial: XML_V20.toUpperCase() });
    bien(!solo.details.cal.fuelIniFijo && cerca(solo.details.cal.energyIni, 3.43 / 0.018, 0.01), 'sin sistema ficticio en calefacción: emisiones ÷ factor, como antes');
}

console.log(`\n${mal ? `✗ ${mal} fallo(s)` : '✓ todo correcto'}`);
process.exit(mal ? 1 : 0);
