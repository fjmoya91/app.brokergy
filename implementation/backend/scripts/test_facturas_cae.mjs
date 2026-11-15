/**
 * Qué parte de una factura de obra COMPUTA para el CAE (03/11/2026).
 * Sin BD, sin Drive y sin llamar a Gemini.
 *
 *   node implementation/backend/scripts/test_facturas_cae.mjs
 *
 * 1) La fuente (frontend/.../logic/facturasCae.js) y su espejo CJS
 *    (backend/utils/facturasCae.js) dan lo mismo.
 * 2) El OCR agrupado por partida: la fotovoltaica de un RES060 nace fuera.
 * 3) ALCANCE: en una sustitución lo separable no es incidencia; lo que no trae
 *    importe, sí; en un RES080 avisa.
 * 4) La sobrefinanciación cuenta solo lo que computa.
 * 5) Una factura que no computa no abre ni cierra la actuación.
 */
import { createRequire } from 'module';
import * as fuente from '../../frontend/src/features/expedientes/logic/facturasCae.js';
import { calcCifo } from '../../frontend/src/features/expedientes/logic/calcCifo.js';

const require = createRequire(import.meta.url);
const espejo = require('../utils/facturasCae.js');
const { detectarIncidenciasFactura, desgloseFactura } = require('../services/facturaIncidencias.js');

let fallos = 0;
const ok = (cond, titulo, detalle = '') => {
    if (cond) { console.log(`  ✓ ${titulo}`); return; }
    fallos++;
    console.log(`  ✗ ${titulo}${detalle ? `\n      ${detalle}` : ''}`);
};

// ── 1) Fuente y espejo ───────────────────────────────────────────────────────
console.log('\n1) Fuente y espejo\n');
const casos = [
    { importe_sin_iva: 7770 },                                                     // antigua, sin desglose
    { importe_sin_iva: 10000, desglose: [
        { partida: 'AEROTERMIA', importe: 6800, computa: true },
        { partida: 'FOTOVOLTAICA', importe: 3200, computa: false, kwp: 4.4 }] },   // mixta
    { importe_sin_iva: 9500, desglose: [                                           // con descuento
        { partida: 'AEROTERMIA', importe: 7000, computa: true },
        { partida: 'FOTOVOLTAICA', importe: 3000, computa: false }] },
    { importe_sin_iva: 5000, computa_cae: false },                                 // solo placas
    { importe_sin_iva: 1000, desglose: [{ partida: 'FOTOVOLTAICA', importe: 5000, computa: false, manual: true }] }, // tecleado de más
    null,
];
const esperado = [7770, 6800, 6500, 0, 0, 0];
casos.forEach((f, i) => {
    ok(fuente.importeCae(f) === esperado[i] && espejo.importeCae(f) === esperado[i],
        `caso ${i + 1}: computa ${esperado[i]} €`, `fuente ${fuente.importeCae(f)} · espejo ${espejo.importeCae(f)}`);
    ok(fuente.importeNoComputable(f) === espejo.importeNoComputable(f), `caso ${i + 1}: lo que no computa coincide`);
});
ok(fuente.inversionCae(casos) === espejo.inversionCae(casos) && fuente.inversionCae(casos) === 21070,
    'la inversión CAE es la suma de lo que computa (21.070 €)', String(fuente.inversionCae(casos)));
ok(!fuente.facturaComputa(casos[3]) && fuente.facturaComputa(casos[1]), 'la de solo placas no computa; la mixta sí');
ok(fuente.partidasNoComputables(casos[1]).map(p => p.etiqueta).join() === 'Fotovoltaica', 'se nombra lo que queda fuera');

// ── 2) Desglose del OCR ─────────────────────────────────────────────────────
console.log('\n2) Desglose del OCR\n');
const ocrMixta = {
    numero_factura: '600321', fecha_factura: '2026-10-26',
    totales: { base_imponible: 10000 },
    lineas: [
        { descripcion: 'Bomba de calor Panasonic 9 kW', importe_total: 6000, partida: 'AEROTERMIA' },
        { descripcion: 'Instalación hidráulica', importe_total: 800, partida: 'OBRA_CIVIL' },
        { descripcion: '8 módulos 550 Wp', importe_total: 2400, partida: 'FOTOVOLTAICA', potencia_kwp: 4.4 },
        { descripcion: 'Inversor 4 kW', importe_total: 800, partida: 'FOTOVOLTAICA' },
    ],
};
const res060 = { numero_expediente: '26RES060_999', instalacion: {}, documentacion: {} };
const res080 = { numero_expediente: '26RES080_999', instalacion: {}, documentacion: { envolvente: { sustituye_ventanas: true } } };

const d060 = desgloseFactura({ ocr: ocrMixta, exp: res060, op: {} });
const fv = d060.find(d => d.partida === 'FOTOVOLTAICA');
ok(d060.length === 3, 'una fila por partida', JSON.stringify(d060));
ok(fv && fv.importe === 3200 && fv.computa === false && fv.kwp === 4.4, 'RES060: la fotovoltaica suma 3.200 €, 4,4 kWp y NO computa', JSON.stringify(fv));
ok(d060.filter(d => d.partida !== 'FOTOVOLTAICA').every(d => d.computa), 'aerotermia y obra civil computan');
ok(espejo.importeCae({ importe_sin_iva: 10000, desglose: d060 }) === 6800, 'computa 6.800 € de 10.000 €');

const dEmis = desgloseFactura({ ocr: { lineas: [{ partida: 'EMISORES', importe_total: 900 }] }, exp: res060, op: {} });
ok(dEmis[0].computa === true, 'los emisores de una sustitución NO salen solos (eso es UNIDADES_TERMINALES)');

const d080fv = desgloseFactura({ ocr: ocrMixta, exp: res080, op: { datos_calculo: { inputs: { reformaPlacas: true } } } });
ok(d080fv.find(d => d.partida === 'FOTOVOLTAICA').computa === true, 'RES080 con placas declaradas: la fotovoltaica computa');

// ── 3) ALCANCE ──────────────────────────────────────────────────────────────
console.log('\n3) ALCANCE\n');
const alcance = (ocr, exp, op = {}) => detectarIncidenciasFactura({ ocr, exp, op, cliente: null, instalador: null })
    .filter(i => i.codigo === 'ALCANCE');
ok(alcance(ocrMixta, res060).length === 0, 'RES060 con placas desglosadas: se separa sola, sin incidencia');
const sinImp = alcance({ ...ocrMixta, lineas: [...ocrMixta.lineas.slice(0, 2), { descripcion: 'Placas solares', importe_total: null, partida: 'FOTOVOLTAICA' }] }, res060);
ok(sinImp.length === 1 && sinImp[0].severidad === 'GRAVE', 'RES060 con placas SIN importe: GRAVE, no se puede separar', JSON.stringify(sinImp));
const a080 = alcance(ocrMixta, res080);
ok(a080.length === 1 && a080[0].severidad === 'LEVE', 'RES080 con placas sin declarar: LEVE (puede ser la Envolvente mal rellena)', JSON.stringify(a080));

// ── 4) Sobrefinanciación ────────────────────────────────────────────────────
console.log('\n4) Sobrefinanciación\n');
const sobre = detectarIncidenciasFactura({ ocr: ocrMixta, exp: res060, op: {}, cliente: null, instalador: null, caeEstimado: 7000 })
    .filter(i => i.codigo === 'SOBREFINANCIACION');
ok(sobre.length === 1 && /6\.?800,00/.test(sobre[0].texto),
    'CAE 7.000 € > lo que computa (6.800 €) aunque la factura sume 10.000 €: se avisa', JSON.stringify(sobre));
const previa = { importe_sin_iva: 5000, computa_cae: false };
const sobre2 = detectarIncidenciasFactura({ ocr: { ...ocrMixta, lineas: [], totales: { base_imponible: 2000 } }, exp: res060, op: {}, cliente: null, instalador: null, caeEstimado: 4000, facturasExistentes: [previa] })
    .filter(i => i.codigo === 'SOBREFINANCIACION');
ok(sobre2.length === 1, 'una factura registrada que no computa no cuenta como inversión', JSON.stringify(sobre2));

// ── 5) Fechas de la actuación ───────────────────────────────────────────────
console.log('\n5) Fechas de la actuación\n');
const c = calcCifo({ facturas: [
    { fecha_factura: '2026-09-01', importe_sin_iva: 6000 },
    { fecha_factura: '2026-10-20', importe_sin_iva: 4000, computa_cae: false },
] });
ok(String(c.fin).slice(0, 10) === '2026-09-01', 'la factura de solo placas no alarga el fin de la actuación', JSON.stringify(c));

// ── 6) Estudio de precios ───────────────────────────────────────────────────
console.log('\n6) Estudio de precios (Facturación › Precios de obra)\n');
const { filasDeFactura, resumen } = require('../services/estudioPrecios.js');
const fvMixta = filasDeFactura({ importe_sin_iva: 10000, desglose: d060 }, 'FOTOVOLTAICA');
ok(fvMixta.length === 1 && fvMixta[0].importe === 3200 && fvMixta[0].kwp === 4.4 && fvMixta[0].computa === false,
    'la placa de un RES060 entra en el estudio aunque no compute', JSON.stringify(fvMixta));
const entera = filasDeFactura({ importe_sin_iva: 6018.71, partidas: ['FOTOVOLTAICA'], kwp: 5 }, 'FOTOVOLTAICA');
ok(entera.length === 1 && entera[0].origen === 'FACTURA' && entera[0].importe === 6018.71, 'sin desglose y solo placas: la factura entera', JSON.stringify(entera));
ok(filasDeFactura({ importe_sin_iva: 9000, partidas: ['AEROTERMIA', 'FOTOVOLTAICA'] }, 'FOTOVOLTAICA').length === 0,
    'sin desglose y con varias partidas: no se inventa qué parte es placa');
const res = resumen([
    { importe: 4400, kwp: 4.4, eur_kwp: 1000 },
    { importe: 6000, kwp: 5, eur_kwp: 1200 },
    { importe: 3000, kwp: null, eur_kwp: null },
]);
ok(res.n === 3 && res.n_con_kwp === 2 && res.eur_kwp_mediana === 1100 && res.eur_kwp_medio === 1106,
    'mediana 1.100 €/kWp y media ponderada 1.106 €/kWp (la de sin kWp no cuenta)', JSON.stringify(res));
const { nombreClave } = require('../services/estudioPrecios.js');
ok(nombreClave('JOSE VICENTE RUIZ S.L.') === nombreClave('Jose Vicente Ruiz SL')
    && nombreClave('J.PORRERO-HIJOS, S.L. (ISM)') === nombreClave('J.PORRERO-HIJOS, S.L.'),
    'el mismo instalador escrito de dos maneras se agrupa junto');

console.log(fallos ? `\n${fallos} comprobación(es) FALLA(N)\n` : '\nTodo correcto.\n');
process.exit(fallos ? 1 : 0);
