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
//  10. Su cuenta en el Registro Nacional de CAE: cruce con nuestros lotes.
//  11. La TABLA: la situación de cada lote, en orden, y su liquidación.
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
    costeDelLoteParaSo, precioCaeParaSo, cruzarRegistro, normalizarRegistro, venceDeCodigo, tablaDelSo,
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

console.log('\n10. Su cuenta en el Registro Nacional de CAE (certificado del MITECO, 19/11/2026)');
{
    const certL = (total, ref, ini) => ({ key: 'certificado_cae', link: 'x', cae: { total, referencia: ref, cae_inicial: ini, fecha_resolucion: '04/11/2026' } });
    const lotesR = [
        { id: 'a', codigo: 'L-A', sujeto_obligado_id: SO, estado: 'FINALIZADO', documentos_so: [certL(300000, 'E_CAE_2026_00001', 'CAE_000000000001_311228')], created_at: '2026-01-01' },
        // Emitido sin certificado leído: se casa por la cifra exacta (la factura).
        { id: 'b', codigo: 'L-B', sujeto_obligado_id: SO, estado: 'PTE. PAGO BROKERGY A CLIENTE', factura_so: { unidades_kwh: 200000 }, created_at: '2026-01-01' },
        { id: 'c', codigo: 'L-C', sujeto_obligado_id: SO, estado: 'SUBIDO A MITECO', registro_miteco: 'REGAGE26e00000000001', factura_so: { unidades_kwh: 150000 }, created_at: '2026-06-01' },
        { id: 'd', codigo: 'L-D', sujeto_obligado_id: SO, estado: 'SUBIDO A MITECO', registro_miteco: 'REGAGE26e00000000002', factura_so: { unidades_kwh: 120000 }, created_at: '2026-06-01' },
        // Emitido que NO está en su cuenta.
        { id: 'e', codigo: 'L-E', sujeto_obligado_id: SO, estado: 'FINALIZADO', documentos_so: [certL(90000, 'E_CAE_2026_00009', 'CAE_000000000009_311228')], created_at: '2026-01-01' },
    ];
    const registro = {
        fecha_certificado: '2026-11-18', fecha_datos: '2026-11-03', fecha_pendientes: '2026-11-16',
        liquidado: { anio: 2026, kwh: 0 },
        tramos: [
            { vence: '2026-12-31', inicial: 'CAE_X1', final: 'CAE_X2', total: 1582000, expediente: 'E_CAE_2025_00132' },
            { vence: '2028-12-31', inicial: 'CAE_000000000001_311228', final: 'CAE_Z', total: 300000, expediente: 'e_cae_2026_00001' },
            { vence: '2029-12-31', inicial: 'CAE_Y1', final: 'CAE_Y2', total: 200000, expediente: 'E_CAE_2026_00002' },
        ],
        pendientes: [{ expediente: 'E_CAE_2026_07452', registro: 'REGAGE26E00000000001' }],
    };
    const cfg = { anios: { 2026: { obligacion_gwh: 20.03, pct_fondo: 8, otros_gwh: 1.582 } } };
    const v = computeVistaSo({ lotes: lotesR, soId: SO, anio: 2026, config: cfg, registro, hoy: HOY });
    const r = v.registro;
    const sit = (cod) => v.etapas.flatMap(e => e.lotes).find(l => l.codigo === cod)?.registro?.situacion;
    ok('un tramo es nuestro por el expediente de emisión (sin mayúsculas)', r.tramos.find(t => t.total === 300000).lote === 'L-A');
    ok('a falta de expediente, por la cifra EXACTA de un lote emitido', r.tramos.find(t => t.total === 200000).lote === 'L-B');
    ok('lo de otros es el resto', r.otrosKwh === 1582000 && r.nOtros === 1 && r.brokergyKwh === 500000);
    ok('cuadra con lo que dijo que compró a otros', Math.abs(r.otrosKwh - r.otrosDeclaradoKwh) < 1000);
    ok('la solicitud pendiente se casa por el REGAGE, sin mayúsculas', r.pendientes[0].lote === 'L-C' && sit('L-C') === 'PTE_RESOLUCION');
    ok('presentado y aún no figuraba', sit('L-D') === 'PRESENTADO' && r.presentados.map(x => x.codigo).join() === 'L-D');
    ok('emitido que no está en su cuenta: NO_CONSTA y se avisa', sit('L-E') === 'NO_CONSTA' && r.noConstan.map(x => x.codigo).join() === 'L-E');
    ok('emitido en su cuenta, con su vencimiento', sit('L-A') === 'EN_SU_CUENTA' && v.etapas[0].lotes.find(l => l.codigo === 'L-A').registro.vence === '2028-12-31');
    ok('lo que vence este año, aparte', r.venceKwh === 1582000 && r.venceBrokergyKwh === 0 && r.nVence === 1);
    ok('liquidado contra el año: 0 (lo dice el certificado)', r.liquidadoKwh === 0);
    ok('liquidado de otro año: sin dato', computeVistaSo({ lotes: lotesR, soId: SO, anio: 2027, config: cfg, registro, hoy: HOY }).registro.liquidadoKwh === null);
    ok('el certificado es del año de sus datos', r.anioRegistro === 2026);
    ok('un tramo sin total o sin vencimiento no entra', normalizarRegistro({ tramos: [{ vence: '2028-12-31', total: 0 }, { total: 5 }] }) === null);
    ok('sin certificado, la vista no cambia', computeVistaSo({ lotes: lotesR, soId: SO, anio: 2026, config: cfg, hoy: HOY }).registro === null);
    ok('sin certificado, cruzarRegistro no da nada', cruzarRegistro(null, []) === null);

    // Una resolución subida DESPUÉS del certificado (Fran, 19/11/2026).
    const certN = (total, ref, ini, fin, fecha) => ({ key: 'certificado_cae', link: 'x', uploaded_at: '2026-11-20T10:00:00Z',
        cae: { total, referencia: ref, cae_inicial: ini, cae_final: fin, fecha_resolucion: fecha } });
    const lotesN = [
        ...lotesR.filter(l => l.id !== 'c'),
        // L-C, que estaba pendiente, ya tiene su resolución: del 20/11, después del certificado.
        { id: 'c', codigo: 'L-C', sujeto_obligado_id: SO, estado: 'CAE EMITIDO – PTE PAGO BROKERGY', registro_miteco: 'REGAGE26e00000000001',
            documentos_so: [certN(150000, 'E_CAE_2026_07452', 'CAE_000000000100_311229', 'CAE_000000150099_311229', '20/11/2026 18:20')], created_at: '2026-06-01' },
    ];
    const vn = computeVistaSo({ lotes: lotesN, soId: SO, anio: 2026, config: cfg, registro, hoy: HOY });
    const rn = vn.registro;
    const filaC = vn.etapas.flatMap(e => e.lotes).find(l => l.codigo === 'L-C');
    ok('resuelto después del certificado: EN_SU_CUENTA y marcado nuevo', filaC.registro.situacion === 'EN_SU_CUENTA' && filaC.registro.nuevo === true);
    ok('su vencimiento sale del propio código (_311229)', filaC.registro.vence === '2029-12-31');
    ok('entra en su cuenta y en lo nuestro', rn.totalKwh === r.totalKwh + 150000 && rn.brokergyKwh === r.brokergyKwh + 150000 && rn.nTramos === 4);
    ok('se dice aparte lo resuelto después', rn.nuevosKwh === 150000 && rn.nuevos[0].codigo === 'L-C' && rn.nuevos[0].fechaResolucion === '2026-11-20');
    ok('y deja de estar pendiente de resolución', rn.pendientes.length === 0 && rn.pendientesKwh === 0);
    ok('un emitido ANTES del certificado que no figura sigue NO_CONSTA', rn.noConstan.map(x => x.codigo).join() === 'L-E');
    ok('el vencimiento del código: 31/12/2028', venceDeCodigo('CAE_008657599241_311228') === '2028-12-31' && venceDeCodigo('CAE_X') === null);

    console.log('\n11. La TABLA: dónde está cada lote, y su liquidación (20/11/2026)');
    const lotesT = [
        ...lotesR.map(l => ({ ...l, num_expedientes: 5 })),
        { id: 'f', codigo: 'L-F', sujeto_obligado_id: SO, estado: 'REQUERIMIENTO VERIFICADOR', factura_so: { unidades_kwh: 50000 }, created_at: '2026-06-01', num_expedientes: 3 },
        { id: 'g', codigo: 'L-G', sujeto_obligado_id: SO, estado: 'VERIFICADO', factura_so: { unidades_kwh: 60000 }, created_at: '2026-06-01', num_expedientes: 2 },
        { id: 'h', codigo: 'L-H', sujeto_obligado_id: SO, estado: 'PTE. FIRMA S.O.', factura_so: { unidades_kwh: 70000 }, created_at: '2026-06-01', num_expedientes: 5 },
        { id: 'i', codigo: 'L-I', sujeto_obligado_id: SO, estado: 'REQUERIMIENTO G.A.', registro_miteco: 'REGAGE26e00000000009', factura_so: { unidades_kwh: 80000 }, created_at: '2026-06-01', num_expedientes: 5,
            documentos_so: [{ key: 'justificante_miteco', link: 'j', uploaded_at: '2026-10-29T09:00:00Z' }] },
        { id: 'k', codigo: 'L-K', sujeto_obligado_id: SO, estado: 'PTE. SUBIDA MITECO', factura_so: { unidades_kwh: 90000 }, created_at: '2026-06-01', num_expedientes: 5 },
        { id: 'v', codigo: 'VACIO', sujeto_obligado_id: SO, estado: 'BORRADOR', created_at: '2026-06-01', num_expedientes: 0 },
    ];
    const cfgL = normalizarObligacion({
        ...cfg,
        liquidacion: { a: { estado: 'solicitada', fecha: '2026-11-20' }, e: { estado: 'LIQUIDADA', fecha: '20/11/2026' }, b: { estado: 'basura' } },
    });
    ok('la liquidación se normaliza: estados válidos, fecha ISO, lo demás fuera',
        cfgL.liquidacion.a.estado === 'SOLICITADA' && cfgL.liquidacion.e.fecha === '2026-11-20' && !cfgL.liquidacion.b);
    const vt = computeVistaSo({ lotes: lotesT, soId: SO, anio: 2026, config: cfgL, registro, hoy: HOY });
    const s = (cod) => vt.etapas.flatMap(e => e.lotes).find(l => l.codigo === cod)?.situacion;
    ok('emitido con la liquidación SOLICITADA', s('L-A') === 'LIQ_SOLICITADA');
    ok('emitido en su cuenta sin marcar: pendiente de liquidar', s('L-B') === 'PTE_LIQUIDAR');
    ok('emitido que no figura pero nos dijo que LIQUIDÓ: liquidado y sin aviso', s('L-E') === 'LIQUIDADO' && vt.registro.noConstan.length === 0);
    ok('con REGAGE (figure o no en el certificado): pendiente de resolución', s('L-C') === 'PTE_RESOLUCION' && s('L-D') === 'PTE_RESOLUCION');
    ok('requerimiento del Gestor, aparte', s('L-I') === 'REQ_GESTOR');
    ok('verificado o PTE. SUBIDA: por presentar al MITECO', s('L-G') === 'POR_PRESENTAR' && s('L-K') === 'POR_PRESENTAR');
    ok('en el verificador con requerimiento', s('L-F') === 'REQ_VERIFICADOR');
    ok('firmas del S.O.: en preparación', s('L-H') === 'PREPARACION');
    ok('la presentación lleva la fecha del justificante', vt.etapas.flatMap(e => e.lotes).find(l => l.codigo === 'L-I').fechaPresentacion === '2026-10-29');
    const t = tablaDelSo(vt.etapas);
    ok('la tabla va en el orden del camino, sin el lote vacío',
        t.filas.map(f => f.codigo).join() === 'L-H,L-F,L-G,L-K,L-C,L-D,L-I,L-B,L-A,L-E', t.filas.map(f => f.codigo).join());
    ok('el resumen cuenta lotes y kWh por situación', t.resumen.find(x => x.id === 'PTE_RESOLUCION').n === 2
        && t.resumen.find(x => x.id === 'PTE_RESOLUCION').kwh === 270000 && t.totalKwh === t.resumen.reduce((a, x) => a + x.kwh, 0));
    ok('sin certificado, la situación sale igual (la cuenta del Registro es un añadido)',
        computeVistaSo({ lotes: lotesT, soId: SO, anio: 2026, config: cfgL, hoy: HOY }).etapas.flatMap(e => e.lotes).find(l => l.codigo === 'L-B').situacion === 'PTE_LIQUIDAR');

    // Lo que le llega al S.O. lleva la situación y su liquidación, y nada nuestro.
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    let vistaParaElSo = null;
    try { ({ vistaParaElSo } = req('../services/obligacionSo.js')); } catch { /* sin .env: se salta */ }
    if (vistaParaElSo) {
        const pub = vistaParaElSo({ ...vt, anios: [2026] });
        const la = pub.etapas.flatMap(e => e.lotes).find(l => l.codigo === 'L-A');
        ok('al S.O. le llega la situación y la liquidación (sin quién la marcó)', la.situacion === 'LIQ_SOLICITADA'
            && la.liquidacion.estado === 'SOLICITADA' && la.liquidacion.fecha === '2026-11-20' && !('por' in la.liquidacion));
        ok('y la tabla del S.O. sale igual que la nuestra', tablaDelSo(pub.etapas).filas.map(f => f.codigo).join() === t.filas.map(f => f.codigo).join());
        ok('sin id ni oferta ni coste por lote', !('id' in la) && !('oferta' in la) && !('coste' in la));
    } else console.log('  · vistaParaElSo no se ha podido cargar (sin .env): se salta');
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
