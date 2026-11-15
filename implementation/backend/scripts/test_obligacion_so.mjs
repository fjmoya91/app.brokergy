// ============================================================================
// test_obligacion_so.mjs — la «Vista S.O.»: obligación, etapas y lo que falta.
// ----------------------------------------------------------------------------
//   1. INTERALCO 2026 (Anexo II): 20,03 GWh, 8 % al Fondo → 18,43 cubrible.
//   2. Cada lote cuenta con su cifra más firme: CAE emitidos → factura →
//      verificado → estimado.
//   3. Un lote con la resolución de emisión subida está EMITIDO aunque su
//      estado no se haya movido.
//   4. Un CAE emitido cuenta para el año de su resolución; uno sin emitir, para
//      el año en curso; la asignación a mano manda («NO» lo saca).
//   5. Lo que falta = cubrible − otros − lo nuestro, nunca negativo (sobra).
//   6. Lo disponible se acumula por cercanía al CAE frente a lo que falta.
//   7. Con qué se cubre lo que le falta (planParaCubrir).
//   8. Lo que sale por el enlace del S.O.: estados y fuente en su idioma.
//   9. A cuánto le sale el CAE al S.O. (€/MWh) y su ahorro frente al Fondo.
//   (y) Los GWh tecleados con coma se leen bien («20,03»), y una obligación sin
//      cuota no se guarda.
//
//   node implementation/backend/scripts/test_obligacion_so.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const {
    computeVistaSo, kwhDelLote, etapaDelLote, anioDelLote, normalizarObligacion, planParaCubrir,
    costeDelLoteParaSo, precioCaeParaSo,
} = await import(pathToFileURL(path.join(raiz, 'lotes/logic/obligacionSo.js')).href);

let fallos = 0;
const cerca = (a, b, tol = 0.001) => a != null && Math.abs(a - b) <= tol;
function ok(nombre, cond, detalle = '') {
    if (cond) { console.log(`  ✓ ${nombre}`); return; }
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

const SO = 'so-1';
const HOY = new Date('2026-10-28T10:00:00Z');
const cert = (total, fecha) => ({ key: 'certificado_cae', link: 'x', cae: { total, fecha_resolucion: fecha } });
// Un expediente estimado de `kwh` (sin oportunidad: la economía saldría a 0, así
// que los estimados se prueban con verificado/factura y uno sin cifra).
const lotes = [
    { id: 'L1', codigo: 'LOTE-2025-001', sujeto_obligado_id: SO, estado: 'PTE. PAGO BROKERGY A CLIENTE', created_at: '2026-06-22', documentos_so: [cert(216800, '02/10/2026')] },
    { id: 'L2', codigo: 'LOTE-2025-002', sujeto_obligado_id: SO, estado: 'SUBIDO A MITECO', created_at: '2026-07-08', factura_so: { unidades_kwh: '500000.00' } },
    { id: 'L3', codigo: 'LOTE-2026-004', sujeto_obligado_id: SO, estado: 'SUBIDO A MITECO', created_at: '2026-07-31', documentos_so: [{ key: 'certificado_cae', link: 'y' }], factura_so: { unidades_kwh: 300000, fecha: '2026-10-05' } },
    { id: 'L4', codigo: 'LOTE-2026-013', sujeto_obligado_id: SO, estado: 'PTE. FIRMA S.O.', created_at: '2026-10-27' },
    { id: 'L5', codigo: 'LOTE-2025-010', sujeto_obligado_id: SO, estado: 'REQUERIMIENTO VERIFICADOR', created_at: '2026-10-13', factura_so: { unidades_kwh: 1000000 } },
    { id: 'L6', codigo: 'VIEJO', sujeto_obligado_id: SO, estado: 'FINALIZADO', created_at: '2025-03-01', documentos_so: [cert(400000, '15/05/2025')] },
    { id: 'L7', codigo: 'DE OTRO', sujeto_obligado_id: 'so-2', estado: 'SUBIDO A MITECO', factura_so: { unidades_kwh: 999999 } },
];

console.log('\n1. Normalizar');
const cfg = normalizarObligacion({
    anios: { 2026: { obligacion_gwh: '20,03', pct_fondo: '8', otros_gwh: '9' }, 2027: { obligacion_gwh: '' }, xx: { obligacion_gwh: 5 } },
    asignacion: { L5: 'no', L4: '2027', L2: 'basura' },
});
ok('20,03 se lee como 20,03 GWh', cerca(cfg.anios['2026'].obligacion_gwh, 20.03));
ok('«1.496,94» y «20.03» también', cerca(normalizarObligacion({ anios: { 2026: { obligacion_gwh: '20.03', ventas_gwh: '1.496,94' } } }).anios['2026'].ventas_gwh, 1496.94)
    && cerca(normalizarObligacion({ anios: { 2026: { obligacion_gwh: '20.03' } } }).anios['2026'].obligacion_gwh, 20.03));
ok('un año sin cuota no se guarda', !cfg.anios['2027']);
ok('una clave que no es un año no se guarda', !cfg.anios.xx);
ok('equivalencia por defecto 198,62', cerca(cfg.anios['2026'].equivalencia_mwh, 198.62));
ok('asignación: NO y año valen; basura no', cfg.asignacion.L5 === 'NO' && cfg.asignacion.L4 === '2027' && !cfg.asignacion.L2);

console.log('\n2. La cifra de cada lote');
ok('CAE de la resolución', kwhDelLote(lotes[0]).kwh === 216800 && kwhDelLote(lotes[0]).fuente === 'EMITIDO');
ok('factura con decimales en texto', kwhDelLote(lotes[1]).kwh === 500000 && kwhDelLote(lotes[1]).fuente === 'FACTURA');
ok('sin cifra → 0 estimado', kwhDelLote(lotes[3]).kwh === 0 && kwhDelLote(lotes[3]).fuente === 'ESTIMADO');

console.log('\n3. Etapa');
ok('certificado subido = EMITIDO aunque el estado diga MITECO', etapaDelLote(lotes[2]) === 'EMITIDO');
ok('SUBIDO A MITECO = MINISTERIO', etapaDelLote(lotes[1]) === 'MINISTERIO');
ok('REQUERIMIENTO VERIFICADOR = VERIFICACION', etapaDelLote(lotes[4]) === 'VERIFICACION');
ok('PTE. FIRMA S.O. = PREPARACION', etapaDelLote(lotes[3]) === 'PREPARACION');

console.log('\n4. Año de la obligación');
ok('emitido: año de la resolución', anioDelLote(lotes[0], HOY) === 2026 && anioDelLote(lotes[5], HOY) === 2025);
ok('emitido sin fecha de resolución: la de la factura', anioDelLote(lotes[2], HOY) === 2026);
ok('sin emitir: el año en curso', anioDelLote(lotes[1], HOY) === 2026);

console.log('\n5. La cuenta de 2026');
const v = computeVistaSo({ lotes, soId: SO, anio: 2026, config: { anios: { 2026: { obligacion_gwh: 20.03, pct_fondo: 8, otros_gwh: 9 } }, asignacion: { L5: 'NO', L4: '2027' } }, hoy: HOY });
const ob = v.obligacion;
ok('cubrible 18,4276', cerca(ob.cubribleGwh, 18.4276));
ok('fondo 1,6024 GWh ≈ 318.276 €', cerca(ob.fondoGwh, 1.6024) && Math.abs(ob.fondoEur - 318268.7) < 50, `${ob.fondoEur}`);
ok('lo nuestro: L1 + L2 + L3 = 1,0168 GWh (L5 «NO», L4 a 2027, L6 de 2025, L7 de otro S.O.)', cerca(ob.brokergyGwh, 1.0168), `${ob.brokergyGwh}`);
ok('emitido: L1 + L3', cerca(ob.emitidoGwh, 0.5168));
ok('falta = 18,4276 − 9 − 1,0168', cerca(ob.faltaGwh, 8.4108));
ok('fuera: L4, L5 y L6', v.fuera.map(l => l.id).sort().join() === 'L4,L5,L6');
const sobra = computeVistaSo({ lotes, soId: SO, anio: 2026, config: { anios: { 2026: { obligacion_gwh: 10, pct_fondo: 8, otros_gwh: 9 } } }, hoy: HOY });
ok('si se pasa, falta 0 y sobra', sobra.obligacion.faltaGwh === 0 && sobra.obligacion.sobraGwh > 0);
ok('sin obligación del año: sin cuenta, pero con lotes', computeVistaSo({ lotes, soId: SO, anio: 2026, config: {}, hoy: HOY }).obligacion === null);

console.log('\n6. Lo disponible frente a lo que falta');
const d = computeVistaSo({
    lotes, soId: SO, anio: 2026, hoy: HOY,
    config: { anios: { 2026: { obligacion_gwh: 20.03, pct_fondo: 8, otros_gwh: 9 } }, asignacion: { L5: 'NO', L4: '2027' } },
    disponible: { etapas: { LISTO: { n: 3, kwh: 2e6 }, CERRANDO: { n: 2, kwh: 3e6 }, OBRA: { n: 10, kwh: 6e6 } } },
});
const [listo, cerrando, obra, antes] = d.oferta.filas;
ok('se acumula por cercanía', cerca(listo.acumGwh, 2) && cerca(cerrando.acumGwh, 5) && cerca(obra.acumGwh, 11) && cerca(antes.acumGwh, 11));
ok('% de lo que falta, con tope 100', cerca(listo.pctDeLoQueFalta, 2 / 8.4108 * 100, 0.01) && obra.pctDeLoQueFalta === 100);

console.log('\n7. Con qué se cubre lo que le falta');
const x = (numero, mwh, graves = 0, leves = 0) => ({ numero, kwh: mwh * 1000, incidencias: { graves, leves } });
const oferta = { filas: [
    { id: 'LISTO', expedientes: [x('L1', 300), x('L2', 200, 0, 3), x('L3', 500, 2)] },
    { id: 'CERRANDO', expedientes: [x('C1', 100), x('C2', 400), x('C3', 250, 1), x('C4', 300)] },
] };
const plan = planParaCubrir(oferta, 1.5); // 1.500 MWh
ok('en DOC. COMPLETA manda el estado: lo listo cuenta entero, también con graves', plan.kwhListos === 1000e3 && plan.listos.map(e => e.numero).join() === 'L3,L1,L2');
ok('y la grave de lo listo solo se avisa', plan.listosConGraves.map(e => e.numero).join() === 'L3');
ok('se cierran los de más MWh hasta cubrirlo', [...plan.aCerrar].join() === 'C2,C4' && plan.kwhAlcanzado === 1700e3);
ok('lo que se está cerrando con graves no cuenta', plan.conGraves.map(e => e.numero).join() === 'C3');
ok('alcanza', plan.alcanza && !plan.bastaConLoListo);
ok('si con lo listo basta, no hay que cerrar nada', planParaCubrir(oferta, 0.9).nACerrar === 0 && planParaCubrir(oferta, 0.9).bastaConLoListo);
ok('si no llega ni cerrándolo todo, se dice', !planParaCubrir(oferta, 5).alcanza && planParaCubrir(oferta, 5).nACerrar === 3);

console.log('\n8. Lo que sale por el enlace del S.O.');
const { createRequire } = await import('module');
const { vistaParaElSo } = createRequire(import.meta.url)('../services/obligacionSo.js');
const vp = vistaParaElSo({ anio: 2026, obligacion: { faltaGwh: 1.9, notas: 'interno' }, brokergyGwh: 5,
    etapas: [{ id: 'EMITIDO', titulo: 'CAE emitidos', kwh: 1, lotes: [
        { codigo: 'PAQUETE 1 - 2025 (PRE APP)', estado: 'PTE. PAGO BROKERGY A CLIENTE', etapa: 'EMITIDO', kwh: 1, fuente: 'FACTURA', nExpedientes: 5 },
        { codigo: 'LOTE-2026-015', estado: 'PTE. FIRMA S.O.', etapa: 'PREPARACION', kwh: 1, fuente: 'ESTIMADO', nExpedientes: 11 },
        { codigo: 'LOTE-X', estado: 'ESTADO NUEVO', etapa: 'EMITIDO', kwh: 1, fuente: 'ESTIMADO', nExpedientes: 1 },
        { codigo: null, estado: 'BORRADOR', etapa: 'PREPARACION', kwh: 0, fuente: 'ESTIMADO', nExpedientes: 0 } ] }] });
const [lp1, lp2, lp3] = vp.etapas[0].lotes;
ok('nuestros pasos internos no salen: el pago al cliente es «CAE emitidos»', lp1.estado === 'CAE emitidos');
ok('a él no se le llama S.O.', lp2.estado === 'Pendiente de vuestra firma');
ok('un estado sin traducir sale con el título de su etapa, nunca en crudo', lp3.estado === 'CAE emitidos');
ok('la fuente, en su texto: «facturado»', lp1.fuente === 'facturado');
ok('lo de entre paréntesis del código es nuestro', lp1.codigo === 'PAQUETE 1 - 2025');
ok('el lote vacío no sale', vp.etapas[0].lotes.length === 3);
ok('ni las notas de la obligación', !('notas' in vp.obligacion));

console.log('\n9. A cuánto le sale el CAE al S.O. (factura + verificación, en €/MWh)');
{
    // Con factura manda su BASE; sin ella, la oferta × MWh.
    const conFac = costeDelLoteParaSo({ factura_so: { numero: 'F-1', base: '170000' }, oferta_lote: 999, coste_verificacion: 1564 }, 1000e3);
    ok('con factura manda su base', conFac.brokergy === 170000 && conFac.verif === 1564);
    const sinFac = costeDelLoteParaSo({ oferta_lote: 170, coste_verificacion: null }, 500e3);
    ok('sin factura, oferta × MWh', sinFac.brokergy === 85000 && sinFac.verif === 0);
    ok('sin oferta ni factura, no hay coste', costeDelLoteParaSo({}, 500e3) === null);
    const filas = [
        { kwh: 1000e3, coste: { brokergy: 170000, verif: 2000 } },
        { kwh: 500e3, coste: { brokergy: 85000, verif: 1000 } },
        { kwh: 400e3, coste: { brokergy: 60000, verif: 0 } }, // verificación sin facturar: fuera
    ];
    const p = precioCaeParaSo(filas, 198.624);
    ok('solo cuentan los lotes con la verificación facturada', p.costeCaeLotes === 2 && cerca(p.costeCaeGwh, 1.5));
    ok('€/MWh = (factura + verificación) / MWh', cerca(p.costeCaeMwh, 258000 / 1500));
    ok('ahorro = (equivalencia − €/MWh) × MWh', cerca(p.ahorroCaeEur, (198.624 - 172) * 1500, 0.01));
    ok('sin ninguno verificado no se da cifra', precioCaeParaSo([filas[2]], 198.624) === null);
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
