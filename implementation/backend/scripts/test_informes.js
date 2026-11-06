#!/usr/bin/env node
/**
 * Pruebas PURAS de los INFORMES técnicos ({AAAA}INF_{n}): tipo por el concepto,
 * nombres de los ficheros, clase por el nombre y el circuito (estado y pasos).
 * No toca la BD ni el Drive.
 *
 *   node implementation/backend/scripts/test_informes.js
 */
const assert = require('assert');
const E = require('../utils/informeEstados');

let n = 0;
const ok = (t, fn) => { fn(); n++; console.log(`  ✓ ${t}`); };

ok('el tipo sale del concepto, sin confundir «posibilidad» o «servicio» con IBI/ICIO', () => {
    assert.strictEqual(E.tipoDeConcepto('Memoria técnica para la bonificación del IBI'), 'MEMORIA_AYUNTAMIENTO');
    assert.strictEqual(E.tipoDeConcepto('Memoria para el Ayuntamiento de Toledo'), 'MEMORIA_AYUNTAMIENTO');
    assert.strictEqual(E.tipoDeConcepto('Licencia de obra: memoria'), 'MEMORIA_AYUNTAMIENTO');
    assert.strictEqual(E.tipoDeConcepto('Legalización de la instalación fotovoltaica'), 'LEGALIZACION');
    assert.notStrictEqual(E.tipoDeConcepto('Estudio de posibilidad de servicio'), 'MEMORIA_AYUNTAMIENTO');
    assert.strictEqual(E.tipoValido('nada'), E.TIPO_DEFECTO);
});

const row = { numero: '2026INF_7', tipo: 'MEMORIA_AYUNTAMIENTO', titulo: 'Memoria técnica: Ayuntamiento' };

ok('los nombres de las clases fijas no dependen de cómo se llamó el fichero', () => {
    assert.strictEqual(E.nombreCanonico(row, 'FINAL_PDF', 'loquesea.pdf'), '2026INF_7 - MEMORIA TECNICA AYUNTAMIENTO.pdf');
    assert.strictEqual(E.nombreCanonico(row, 'FIRMADO'), '2026INF_7 - MEMORIA TECNICA AYUNTAMIENTO_fdo.pdf');
    assert.strictEqual(E.nombreCanonico(row, 'BORRADOR_WORD'), '2026INF_7 - MEMORIA TECNICA AYUNTAMIENTO (BORRADOR).docx');
    assert.strictEqual(E.nombreCanonico(row, 'JUSTIFICANTE', 'Transferencia.PNG'), '2026INF_7 - JUSTIFICANTE DE PAGO.png');
    assert.strictEqual(E.nombreCanonico(row, 'DOCUMENTACION', 'presupuesto.pdf'), '2026INF_7 - presupuesto.pdf');
    assert.strictEqual(E.nombreCanonico(row, 'DOCUMENTACION', '2026INF_7 - presupuesto.pdf'), '2026INF_7 - presupuesto.pdf');
    assert.throws(() => E.nombreCanonico(row, 'NADA'));
});

ok('la clase se lee del nombre, con «_fdo» y «(BORRADOR)» antes que «.pdf»', () => {
    for (const c of ['FIRMADO', 'BORRADOR_PDF', 'BORRADOR_WORD', 'FINAL_PDF', 'FINAL_WORD']) {
        assert.strictEqual(E.claseDeNombre(E.nombreCanonico(row, c)), c);
    }
    assert.strictEqual(E.claseDeNombre('foto.jpg'), null);
});

ok('el circuito avanza por los SELLOS, nunca por lo que diga el navegador', () => {
    const base = { ...row, created_at: '2026-11-01' };
    const est = (extra, fac) => E.deriveEstado({ ...base, ...extra }, fac);
    assert.strictEqual(est({}), 'PTE. REDACCIÓN');
    assert.strictEqual(est({ borrador_at: 'x' }), 'EN REVISIÓN');
    assert.strictEqual(est({ final_at: 'x' }), 'PTE. FIRMA');
    assert.strictEqual(est({ final_at: 'x', firmado_at: 'x' }), 'PTE. FACTURA');
    assert.strictEqual(est({ firmado_at: 'x', factura_numero: 'ING-1' }), 'FACTURA SIN ENVIAR');
    assert.strictEqual(est({ firmado_at: 'x', factura_numero: 'ING-1', factura_enviada_at: 'x' }), 'PTE. PAGO');
    assert.strictEqual(est({ firmado_at: 'x', factura_numero: 'ING-1', factura_enviada_at: 'x', justificante_at: 'x' }), 'PAGO RECIBIDO');
    assert.strictEqual(est({ cobrado: true }), 'COBRADO · PTE. ENTREGA');
    assert.strictEqual(est({ cobrado: true, entregado_at: 'x' }), 'ENTREGADO');
    assert.strictEqual(est({ cobrado: true, entregado_at: 'x', anulado_at: 'x' }), 'ANULADO');
});

ok('el justificante SOLO no cobra ni sirve sin factura', () => {
    const d = E.derivar({ ...row, firmado_at: 'x', justificante_at: 'x' });
    assert.strictEqual(d.estado, 'PTE. FACTURA');
    assert.strictEqual(d.pelota, 'NUESTRA');
});

ok('con las facturas a mano, cuentan solo las F1 EMITIDA/PAGADA', () => {
    const fac = [
        { tipo: 'F1', estado: 'BORRADOR', numero: null },
        { tipo: 'F1', estado: 'RECTIFICADA', numero: 'ING-1', enviada_at: 'x' },
        { tipo: 'R1', estado: 'EMITIDA', numero: 'R-1', enviada_at: 'x' },
    ];
    assert.strictEqual(E.facturasVivas(fac).length, 0);
    assert.strictEqual(E.deriveEstado({ ...row, firmado_at: 'x' }, fac), 'PTE. FACTURA');
    fac.push({ tipo: 'F1', estado: 'EMITIDA', numero: 'ING-2' });
    assert.strictEqual(E.deriveEstado({ ...row, firmado_at: 'x' }, fac), 'FACTURA SIN ENVIAR');
});

ok('los pasos marcan UNO como actual y dicen el número de la factura', () => {
    const p = E.pasos({ ...row, created_at: 'a', final_at: 'b', firmado_at: 'c' }, [{ tipo: 'F1', estado: 'EMITIDA', numero: 'ING-9', enviada_at: 'd' }]);
    assert.deepStrictEqual(p.map(x => x.id), ['aceptacion', 'redaccion', 'firma', 'factura', 'pago', 'entrega']);
    assert.strictEqual(p.filter(x => x.actual).length, 1);
    assert.strictEqual(p.find(x => x.actual).id, 'pago');
    assert.strictEqual(p.find(x => x.id === 'factura').detalle, 'ING-9');
});

ok('la documentación que se le pide al cliente depende del tipo', () => {
    assert.ok(E.docsCliente('MEMORIA_AYUNTAMIENTO').some(d => d.id === 'PRESUPUESTO_INSTALADOR'));
    assert.deepStrictEqual(E.docsCliente('CONSULTORIA'), E.DOCS_GENERICOS);
});

// ── La línea CIT: certificado de instalación térmica (el RITE suelto) ──────
const cit = { numero: '2026CIT_3', linea: 'CIT', tipo: 'INSTALACION_TERMICA', titulo: 'MEMORIA TECNICA RITE' };

ok('la LÍNEA sale del número, del artículo y nunca es otra que INF o CIT', () => {
    assert.strictEqual(E.lineaDeNumero('2026CIT_3'), 'CIT');
    assert.strictEqual(E.lineaDeNumero('2026inf_12'), 'INF');
    assert.strictEqual(E.lineaDeNumero('2026CEE_4'), null);
    assert.strictEqual(E.lineaDeGenera('CIT'), 'CIT');
    assert.strictEqual(E.lineaDeGenera('INFORME'), 'INF');
    assert.strictEqual(E.lineaDeGenera('CEE_UNICO'), null);
    assert.strictEqual(E.lineaValida('xx'), 'INF');
    assert.strictEqual(E.lineaDe({}), 'INF');
});

ok('el tipo se queda dentro de su línea', () => {
    assert.strictEqual(E.tipoValido('INSTALACION_TERMICA', 'CIT'), 'INSTALACION_TERMICA');
    assert.strictEqual(E.tipoValido('MEMORIA_AYUNTAMIENTO', 'CIT'), 'INSTALACION_TERMICA');
    assert.notStrictEqual(E.tipoValido('INSTALACION_TERMICA', 'INF'), 'INSTALACION_TERMICA');
    assert.ok(E.docsCliente('INSTALACION_TERMICA', 'CIT').some(d => d.id === 'FOTOS_PLACAS'));
});

ok('el CERTIFICADO OFICIAL es solo del CIT y se reconoce por su nombre', () => {
    assert.strictEqual(E.claseDeLinea('CERTIFICADO_OFICIAL', 'CIT'), true);
    assert.strictEqual(E.claseDeLinea('CERTIFICADO_OFICIAL', 'INF'), false);
    assert.strictEqual(E.claseDeLinea('FIRMADO', 'CIT'), true);
    const nom = E.nombreCanonico(cit, 'CERTIFICADO_OFICIAL', 'GenerarPdf.pdf');
    assert.strictEqual(nom, '2026CIT_3 - MEMORIA TECNICA RITE (CERTIFICADO OFICIAL).pdf');
    assert.strictEqual(E.claseDeNombre(nom), 'CERTIFICADO_OFICIAL');
    assert.strictEqual(E.claseDeNombre(E.nombreCanonico(cit, 'FIRMADO')), 'FIRMADO');
});

ok('un CIT firmado espera a la PRESENTACIÓN antes de facturar', () => {
    const est = (extra) => E.deriveEstado({ ...cit, created_at: 'a', final_at: 'b', ...extra });
    assert.strictEqual(est({ firmado_at: 'c' }), 'PTE. PRESENTACIÓN');
    assert.strictEqual(est({ firmado_at: 'c', registrado_at: 'd' }), 'PTE. FACTURA');
    // un INF firmado no pasa por ahí
    assert.strictEqual(E.deriveEstado({ ...row, final_at: 'b', firmado_at: 'c' }), 'PTE. FACTURA');
});

ok('los pasos del CIT llevan la presentación en eDICE y entregan el certificado', () => {
    const p = E.pasos({ ...cit, created_at: 'a', final_at: 'b', firmado_at: 'c' });
    assert.deepStrictEqual(p.map(x => x.id), ['aceptacion', 'redaccion', 'firma', 'presentacion', 'factura', 'pago', 'entrega']);
    assert.strictEqual(p.find(x => x.actual).id, 'presentacion');
    assert.strictEqual(E.LINEAS.CIT.entrega, 'CERTIFICADO_OFICIAL');
    assert.strictEqual(E.LINEAS.INF.entrega, 'FIRMADO');
});

console.log(`\n${n} comprobaciones de informes OK`);
