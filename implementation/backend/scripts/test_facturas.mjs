/**
 * FACTURAS propias (pestaña Facturación, fase 2): cálculo con IRPF (la FML),
 * suplidos fuera del ImporteTotal de VERI*FACTU, numeración de rectificativas,
 * duplicar la del mes, NIF, estado visible, huellas oficiales de la AEAT, URL del
 * QR y XML del registro. Sin BD ni red.
 *
 *   node implementation/backend/scripts/test_facturas.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
import * as L from '../../frontend/src/features/facturacion/logic/factura.js';
import * as C from '../../frontend/src/features/cee-directo/logic/facturaCee.js';

const require = createRequire(import.meta.url);
const vf = require('../services/verifactuService.js');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

const ING = { descripcion: 'Prestación de servicios de ingeniería – septiembre 2026', uds: 1, precio: 2250, ivaPct: 21, dtoPct: 0 };
const CEE = { descripcion: 'Certificado de Eficiencia Energética', uds: 1, precio: 150, ivaPct: 21, dtoPct: 0 };
const TASA = { descripcion: 'Tasa CEE Castilla-La Mancha', uds: 1, precio: 16.39, ivaPct: 0, dtoPct: 0, suplido: true };

t('la FML: 2.250 € + 21 % de IVA − 15 % de IRPF = 2.385 € (como 26FML_18)', () => {
    const c = L.calcularFactura({ lineas: [ING], irpfPct: 15 });
    assert.equal(c.neto, 2250); assert.equal(c.iva, 472.5); assert.equal(c.irpf, 337.5); assert.equal(c.total, 2385);
    // VERI*FACTU no lleva la retención: ImporteTotal = base + cuota.
    assert.equal(c.importeTotal, 2722.5);
});

t('un suplido no va ni en la base sujeta ni en el ImporteTotal', () => {
    const c = L.calcularFactura({ lineas: [CEE, TASA] });
    assert.equal(c.total, 197.89);
    assert.equal(c.baseSujeta, 150);
    assert.equal(c.importeTotal, 181.5);
    const d = vf.desglose([CEE, TASA].map(C.calcularLinea));
    assert.equal(d.importeTotal, 181.5); assert.equal(d.cuotaTotal, 31.5);
    assert.deepEqual(d.sinCausa, []);
});

t('una partida al 0 % que no es suplido se avisa (exención sin causa)', () => {
    const d = vf.desglose([{ ...CEE, ivaPct: 0 }].map(C.calcularLinea));
    assert.equal(d.sinCausa.length, 1);
    const r = L.revisarParaEmitir({ cliente: { razon_social: 'X', cif: 'B19350222', direccion: 'c', municipio: 'm' }, lineas: [{ ...CEE, ivaPct: 0 }], fecha: '2026-10-24', tipo: 'F1' });
    assert.ok(r.avisos.some(a => /0 %/.test(a)));
});

t('rectificativa: R-{YY}{SERIE}_{n} y las líneas en negativo', () => {
    assert.equal(L.numeroRectificativa('ING', 1, '2026-10-24'), 'R-26ING_1');
    assert.equal(L.numeroRectificativa('FML', 3, '2027-01-02'), 'R-27FML_3');
    assert.ok(L.RE_RECTIFICATIVA.test('R-26ING_1') && !L.RE_ORDINARIA.test('R-26ING_1'));
    const ls = L.lineasRectificativa([CEE, TASA]);
    assert.deepEqual(ls.map(l => l.uds), [-1, -1]);
    assert.equal(L.calcularFactura({ lineas: ls }).total, -197.89);
});

t('una rectificativa sin motivo no se emite; una factura sin NIF tampoco', () => {
    const base = { cliente: { razon_social: 'ACME SL', cif: 'B19350222', direccion: 'C/ Mayor 1', municipio: 'Toledo' }, lineas: [CEE], fecha: '2026-10-24' };
    assert.deepEqual(L.revisarParaEmitir({ ...base, tipo: 'F1' }).errores, []);
    assert.ok(L.revisarParaEmitir({ ...base, tipo: 'R4', lineas: L.lineasRectificativa([CEE]) }).errores.some(e => /rectifica/.test(e)));
    assert.ok(L.revisarParaEmitir({ ...base, cliente: { razon_social: 'ACME SL' } }).errores.some(e => /NIF/.test(e)));
    assert.ok(L.revisarParaEmitir({ ...base, lineas: [TASA] }).errores.some(e => /suplidos/.test(e)));
});

t('duplicar la del mes avanza el mes (y el año en diciembre)', () => {
    assert.equal(L.avanzarMes('Prestación de servicios – septiembre 2026'), 'Prestación de servicios – octubre 2026');
    assert.equal(L.avanzarMes('Servicios de Diciembre de 2026'), 'Servicios de Enero de 2027');
    assert.equal(L.avanzarMes('Sin mes'), 'Sin mes');
});

t('NIF: DNI, NIE y CIF con su control', () => {
    assert.equal(L.validarNif('12345678Z').valido, true);
    assert.equal(L.validarNif('12345678A').valido, false);
    assert.equal(L.validarNif('X1234567L').valido, true);
    assert.equal(L.validarNif('B19350222').valido, true);
    assert.equal(L.validarNif('B19350223').valido, false);
});

t('estado visible: pendiente, vencida, cobrada, borrador', () => {
    const hoy = '2026-10-24';
    assert.equal(L.estadoVisible({ estado: 'EMITIDA', total: 100, vencimiento: '2026-11-01' }, hoy).clave, 'PENDIENTE');
    assert.equal(L.estadoVisible({ estado: 'EMITIDA', total: 100, vencimiento: '2026-10-01' }, hoy).clave, 'VENCIDA');
    assert.equal(L.estadoVisible({ estado: 'PAGADA', total: 100 }, hoy).texto, 'Cobrada');
    assert.equal(L.estadoVisible({ estado: 'EMITIDA', total: -50 }, hoy).clave, 'EMITIDA');
    assert.equal(L.estadoVisible({ estado: 'BORRADOR' }, hoy).clave, 'BORRADOR');
});

// Los tres ejemplos del documento de la AEAT «Detalle de las especificaciones
// técnicas para generación de la huella o hash de los registros».
t('huellas oficiales de VERI*FACTU (alta, alta encadenada y anulación)', () => {
    const h1 = vf.huellaAlta({ nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024', tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: '', fechaHora: '2024-01-01T19:20:30+01:00' });
    assert.equal(h1, '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
    const h2 = vf.huellaAlta({ nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024', tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: h1, fechaHora: '2024-01-01T19:20:35+01:00' });
    assert.equal(h2, 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
    const h3 = vf.huellaAnulacion({ nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024', huellaAnterior: h2, fechaHora: '2024-01-01T19:20:40+01:00' });
    assert.equal(h3, '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
});

t('la hora del registro lleva el huso de Madrid (invierno +01:00, verano +02:00)', () => {
    assert.match(vf.fechaHoraHuso(new Date('2026-01-15T10:00:00Z')), /^2026-01-15T11:00:00\+01:00$/);
    assert.match(vf.fechaHoraHuso(new Date('2026-07-15T10:00:00Z')), /^2026-07-15T12:00:00\+02:00$/);
});

t('el registro de alta encadena, excluye suplidos y su XML cierra', () => {
    const emisor = { nif: 'B19350222', razon_social: 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL' };
    const factura = { numero: '26ING_88', fecha: '2026-10-24', tipo: 'F1', concepto: 'CEE', cliente: { razon_social: 'ACME SL', cif: 'b-19350222' } };
    const anterior = { nif: 'B19350222', numSerie: '26ING_87', fecha: '24-10-2026', huella: 'A'.repeat(64) };
    const r = vf.registroAlta({ emisor, factura, lineasCalculadas: [CEE, TASA].map(C.calcularLinea), anterior, ahora: new Date('2026-10-24T10:00:00Z') });
    assert.equal(r.registro.ImporteTotal, '181.50'); assert.equal(r.registro.CuotaTotal, '31.50');
    assert.equal(r.registro.RegistroAnterior.Huella, 'A'.repeat(64));
    assert.equal(r.registro.Destinatario.NIF, 'B19350222');
    assert.match(r.huella, /^[0-9A-F]{64}$/);
    const xml = vf.xmlRegistroAlta(r.registro);
    assert.ok(xml.startsWith('<sum1:RegistroAlta>') && xml.endsWith('</sum1:RegistroAlta>'));
    assert.ok(xml.includes('<sum1:RegistroAnterior>') && !xml.includes('PrimerRegistro'));
    assert.ok(xml.includes('SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERG'));
    // El primero de la cadena no tiene anterior.
    const p = vf.registroAlta({ emisor, factura, lineasCalculadas: [C.calcularLinea(CEE)], anterior: null });
    assert.ok(vf.xmlRegistroAlta(p.registro).includes('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>'));
});

t('una rectificativa lleva TipoRectificativa I y la factura que rectifica', () => {
    const r = vf.registroAlta({
        emisor: { nif: 'B19350222', razon_social: 'X' },
        factura: { numero: 'R-26ING_1', fecha: '2026-10-24', tipo: 'R4', rectifica_numero: '26ING_80', rectifica_fecha: '2026-10-01', cliente: {} },
        lineasCalculadas: L.lineasRectificativa([CEE]).map(C.calcularLinea),
    });
    assert.equal(r.registro.TipoRectificativa, 'I');
    assert.equal(r.registro.FacturaRectificada.NumSerieFactura, '26ING_80');
    assert.equal(r.registro.FacturaRectificada.FechaExpedicionFactura, '01-10-2026');
    assert.equal(r.registro.ImporteTotal, '-181.50');
});

t('la URL del QR: nif, numserie, fecha dd-mm-aaaa e importe con dos decimales', () => {
    const u = vf.urlQr({ nif: 'B19350222', numSerie: '26ING_88', fecha: '24-10-2026', importe: 181.5, entorno: 'pruebas' });
    assert.match(u, /^https:\/\/prewww2\.aeat\.es\/wlpl\/TIKE-CONT\/ValidarQR\?nif=B19350222&numserie=26ING_88&fecha=24-10-2026&importe=181\.50$/);
});

t('el PDF de la FML lleva la retención y el «Total a pagar»', () => {
    const f = { serie: 'FML', numero: '26FML_19', fecha: '2026-10-31', vencimiento: '2026-11-30', fecha_operacion: 'octubre 2026', irpf_pct: 15, lineas: [ING], cliente: { razon_social: 'ACME SL', cif: 'B19350222' } };
    const html = L.buildFacturaHtml(L.payloadPdf(f, { razon_social: 'EMISOR', nif: '12345678Z', direccion: 'C/ Uno 1', cp: '45000', municipio: 'Toledo', provincia: 'Toledo', iban: 'ES00 0000' }));
    assert.ok(/Retención IRPF \(15/.test(html));
    assert.ok(/Total a pagar/.test(html));
    assert.ok(html.includes(L.fmtEur(2385)));
});

console.log(`\n${ok} comprobaciones de facturas OK`);
