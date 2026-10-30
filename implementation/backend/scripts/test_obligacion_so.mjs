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
//   7. Los GWh tecleados con coma se leen bien («20,03»), y una obligación sin
//      cuota no se guarda.
//
//   node implementation/backend/scripts/test_obligacion_so.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const {
    computeVistaSo, kwhDelLote, etapaDelLote, anioDelLote, normalizarObligacion,
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

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
