/**
 * CUADRO DE MANDO y CIERRE TRIMESTRAL (pestaña Facturación): los modelos 303
 * (con la ISP), 111, 349 y 130, los criterios fiscales de un gasto, el trimestre
 * al que va cada justificante, lo que se guarda en las appProperties de Drive, y
 * el PAQUETE para la gestoría (nombres, carpetas y el libro Excel) con un T3 de
 * prueba que reproduce las cifras del de 2026. Sin BD ni red.
 *
 *   node implementation/backend/scripts/test_contabilidad.mjs
 *
 * Cifras del T3 de 2026 (libro hecho a mano para OTS): ventas SL al 21 % base
 * 4.740 € e IVA 995,40 €; FML base 6.750 €, IVA 1.417,50 €, retención 1.012,50 €;
 * ISP 515,27 € (cuota 108,21 €); 111 = 1.576,50 €; 303 del autónomo 1.399,20 €.
 * Los proveedores y NIF son de PRUEBA (el repositorio es público).
 */
import assert from 'assert';
import { createRequire } from 'module';
import * as L from '../../frontend/src/features/facturacion/logic/factura.js';

const require = createRequire(import.meta.url);
const C = require('../services/contabilidadService.js');
const G = require('../services/gastosDrive.js');
const ExcelJS = require('exceljs');

let ok = 0;
const pendientes = [];
const t = (nombre, fn) => {
    const r = fn();
    if (r && typeof r.then === 'function') { pendientes.push(r.then(() => { ok++; console.log('  ✓', nombre); })); return; }
    ok++; console.log('  ✓', nombre);
};
const r2 = (n) => Math.round(n * 100) / 100;

// ── Trimestres y plazos ─────────────────────────────────────────────────────

t('2026-T3 → jul-sep, del 1/7 al 30/9, y su etiqueta de carpeta', () => {
    const T = C.parseTrimestre('2026-T3');
    assert.deepEqual([T.anio, T.n, T.desde, T.hasta, T.corto, T.etiqueta], [2026, 3, '2026-07-01', '2026-09-30', 'jul-sep', '2026-T3 (jul-sep)']);
    assert.deepEqual(C.parseTrimestre('2026T1').meses, [1, 2, 3]);
    assert.equal(C.parseTrimestre('2024-T1').hasta, '2024-03-31');
    assert.throws(() => C.parseTrimestre('2026-T5'));
});

t('plazos: T1-T3 el 20 del mes siguiente; T4, 111 el 20 de enero y 303/130/349 el 30', () => {
    assert.deepEqual(C.plazos(C.parseTrimestre('2026-T3')), { m303: '2026-10-20', m111: '2026-10-20', m130: '2026-10-20', m349: '2026-10-20' });
    assert.deepEqual(C.plazos(C.parseTrimestre('2026-T4')), { m303: '2027-01-30', m111: '2027-01-20', m130: '2027-01-30', m349: '2027-01-30' });
});

// ── Ventas: base, cuota y suplidos ──────────────────────────────────────────

t('sin líneas, la base sale de la cuota y lo que sobra son suplidos (26ING_66: 150 + 16,39 de tasa)', () => {
    const d = C.desgloseVenta({ neto: 166.39, iva: 31.5 });
    assert.deepEqual([d.base, d.cuota, d.suplidos, d.metodo], [150, 31.5, 16.39, 'estimado']);
    const s = C.desgloseVenta({ neto: 2250, iva: 472.5 });
    assert.deepEqual([s.base, s.suplidos], [2250, 0]);
    const rect = C.desgloseVenta({ neto: -166.39, iva: -31.5 });
    assert.deepEqual([rect.base, rect.cuota, rect.suplidos], [-150, -31.5, -16.39]);
});

t('con líneas, exacto (logic/factura.js)', () => {
    const lineas = [
        { descripcion: 'CEE', uds: 1, precio: 150, ivaPct: 21, dtoPct: 0 },
        { descripcion: 'Tasa', uds: 1, precio: 16.39, ivaPct: 0, dtoPct: 0, suplido: true },
    ];
    const d = C.desgloseVenta({ neto: 166.39, iva: 31.5, lineas }, L);
    assert.deepEqual([d.base, d.suplidos, d.metodo], [150, 16.39, 'lineas']);
});

// ── Criterios fiscales de un gasto ──────────────────────────────────────────

const SL = 'B19350222';
const AUT = '00000000T';
const ctx = { nifSl: SL, nifAutonomo: AUT };
const fg = (contribuyente, datos, ajustes = {}) => C.fiscalGasto({ contribuyente, datos, ajustes }, ctx);

t('combustible del autónomo: IVA al 50 % (por línea, 5,21 → 2,61 como Excel) y nada en IRPF', () => {
    // La de PLENERGY 032D2600006845 leída del PDF real: 24,79 + 5,21 = 30,00.
    const f = fg('AUTONOMO', { documento: 'FACTURA', naturaleza: 'COMBUSTIBLE', base: 24.79, cuota: 5.21, total: 30, nif_destinatario: AUT });
    assert.deepEqual([f.tipo, f.deducible_pct, f.iva_deducible, f.irpf_deducible_pct, f.gasto_irpf], ['COMBUSTIBLE', 50, 2.61, 0, 0]);
});

t('una factura de 0 € no es un gasto; en dólares sin cambio, sí lo es (falta el importe)', () => {
    assert.equal(fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'IE', base: 0, cuota: 0, total: 0 }).tipo, 'NO_GASTO');
    assert.equal(fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD' }).tipo, 'ISP');
});

t('en dólares: al cambio del BCE del día de la factura (art. 79.Once LIVA); el sábado vale el del viernes; lo cargado de más es comisión', () => {
    const TC = require('../services/tipoCambio.js');
    TC._sembrar('USD', { '2026-07-03': 1.1448, '2026-07-06': 1.1415 });
    const ctxTc = { ...ctx, cambio: TC.cambio };
    // OpenAI del sábado 04/07: 20 USD sin IVA → 20 / 1,1448 = 17,47 € de base ISP.
    const f = C.fiscalGasto({ contribuyente: 'SL', datos: { fecha: '2026-07-04', documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD' }, ajustes: {} }, ctxTc);
    assert.deepEqual([f.tipo, f.base, f.isp_base, f.isp_cuota, f.cambio.fecha, f.cambio.valor, f.dif_cambio], ['ISP', 17.47, 17.47, 3.67, '2026-07-03', 1.1448, 0]);
    // Con lo cargado en la tarjeta (17,98 €): la base sigue siendo la del BCE; 0,51 € de comisión.
    const a = C.fiscalGasto({ contribuyente: 'AUTONOMO', datos: { fecha: '2026-07-06', documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD', total_eur: 18 }, ajustes: {} }, ctxTc);
    assert.deepEqual([a.base, a.cargado_eur, a.dif_cambio, a.gasto_irpf], [17.52, 18, 0.48, 18]);
    // Sin cambio (sin red) pero con lo cargado: se usa lo cargado, avisando.
    const b = C.fiscalGasto({ contribuyente: 'SL', datos: { fecha: '2026-01-10', documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD', total_eur: 18 }, ajustes: {} }, ctxTc);
    assert.deepEqual([b.base, b.cambio, b.avisos.some(x => /cargado en la tarjeta/.test(x))], [18, null, true]);
});

t('la FML como gasto de la SL va al mes que FACTURA (26FML_16 «julio», del 29/09 → 7. JULIO)', () => {
    const { mesQueFactura } = require('../services/facturaContabilidad.js');
    assert.deepEqual([
        mesQueFactura('Servicios profesionales – julio 2026', 9),
        mesQueFactura('Servicios de ingeniería AGOSTO', 9),
        mesQueFactura('Servicios profesionales', 9),
        mesQueFactura('Servicios de diciembre 2025', 1),    // un mes POSTERIOR a la fecha no vale: el de la factura
    ], [7, 8, 9, 1]);
});

t('una factura cuyo nombre dice ANULADA no cuenta (la sustituye otra)', () => {
    const f = C.fiscalGasto({ contribuyente: 'SL', nombre: '2026-08-24 - OPENAI - 6C62BA10-0017 (ANULADA por IVA erroneo).pdf', datos: { documento: 'FACTURA', naturaleza: 'SOFTWARE', base: 20, cuota: 4.2, total: 24.2 }, ajustes: {} }, ctx);
    assert.deepEqual([f.tipo, f.destino, f.iva_deducible], ['NO_GASTO', null, 0]);
});

t('el profesional con TASAS suplidas (Lanuza AP232026, leído del PDF): 540 + 113,40 + 278,63 − 81 = 851,03', () => {
    const f = fg('SL', { documento: 'FACTURA', naturaleza: 'PROFESIONAL', base: 540, iva_pct: 21, cuota: 113.4, irpf: 81, suplidos: 278.63, total: 851.03, nif_destinatario: SL });
    assert.deepEqual([f.retencion, f.suplidos, f.iva_deducible, f.avisos.length], [81, 278.63, 113.4, 0]);
});

t('ticket sin NIF y restauración: IVA no deducible', () => {
    assert.equal(fg('SL', { documento: 'SIMPLIFICADA', naturaleza: 'GENERAL', base: 10, cuota: 2.1, total: 12.1 }).iva_deducible, 0);
    const r = fg('SL', { documento: 'FACTURA', naturaleza: 'RESTAURACION', base: 40, cuota: 4, total: 44, nif_destinatario: SL });
    assert.equal(r.iva_deducible, 0); assert.ok(r.avisos.some(a => /Restauraci/.test(a)));
});

t('software extranjero sin IVA: ISP; con NIF-IVA de la UE, además, al 349 (EU… no)', () => {
    const ms = fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', nif: 'IE8256796U', base: 15.27, cuota: 0, total: 15.27 });
    assert.deepEqual([ms.tipo, ms.isp_base, ms.isp_cuota, ms.es_349, ms.nif_ue], ['ISP', 15.27, 3.21, true, 'IE']);
    const oa = fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', nif: 'EU372041333', base: 100, cuota: 0, total: 100 });
    assert.deepEqual([oa.tipo, oa.es_349], ['ISP', false]);
    const us = fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 200, cuota: 0, total: 200 });
    assert.deepEqual([us.tipo, us.es_349], ['ISP', false]);
});

t('en dólares: con lo cargado en euros se convierte; sin ello, se avisa', () => {
    const a = fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD', total_eur: 18.5 });
    assert.deepEqual([a.base, a.isp_base], [18.5, 18.5]);
    const b = fg('SL', { documento: 'FACTURA', naturaleza: 'SOFTWARE', pais: 'US', base: 20, cuota: 0, total: 20, moneda: 'USD' });
    assert.equal(b.base, null); assert.ok(b.avisos.some(x => /USD/.test(x)));
});

t('factura a nombre de otro NIF: su IVA no se deduce (y se dice)', () => {
    const f = fg('SL', { documento: 'FACTURA', naturaleza: 'GENERAL', base: 100, cuota: 21, total: 121, nif_destinatario: 'ESB12345678' });
    assert.equal(f.iva_deducible, 0); assert.ok(f.avisos.some(a => /no está a nombre/.test(a)));
    assert.equal(fg('SL', { documento: 'FACTURA', naturaleza: 'GENERAL', base: 100, cuota: 21, total: 121, nif_destinatario: `ES${SL}` }).iva_deducible, 21);
});

t('un equipo de 300 € o más es inversión; un anexo de cesión, bono CAE; lo corregido a mano manda', () => {
    assert.equal(fg('SL', { documento: 'FACTURA', naturaleza: 'EQUIPO', base: 899, cuota: 188.79, total: 1087.79 }).tipo, 'INVERSION');
    assert.equal(fg('SL', { documento: 'FACTURA', naturaleza: 'EQUIPO', base: 120, cuota: 25.2, total: 145.2 }).tipo, 'GASTO_CORRIENTE');
    assert.equal(fg('SL', { documento: 'RECIBO', naturaleza: 'CESION_AHORRO', total: 1200 }).tipo, 'BONO_CAE');
    const forzado = fg('SL', { documento: 'FACTURA', naturaleza: 'GENERAL', base: 100, cuota: 21, total: 121 }, { tipo: 'RESTAURACION', deducible_pct: 100 });
    assert.deepEqual([forzado.tipo, forzado.iva_deducible], ['RESTAURACION', 21]);
});

t('la retención de un profesional va al 111 de la SL', () => {
    const f = fg('SL', { documento: 'FACTURA', naturaleza: 'PROFESIONAL', base: 540, cuota: 113.4, irpf: 81, total: 572.4 });
    assert.deepEqual([f.retencion, f.iva_deducible], [81, 113.4]);
});

// ── Un T3 de prueba con las cifras del de 2026 ──────────────────────────────

const venta = (numero, fecha, neto, iva, extra = {}) => {
    const d = C.desgloseVenta({ neto, iva });
    return {
        linea: numero.includes('FML') ? 'FML' : 'ING', contribuyente: numero.includes('FML') ? 'AUTONOMO' : 'SL', tipo: 'F1',
        numero, fecha, vencimiento: fecha, cliente: extra.cliente || `CLIENTE ${numero.slice(-2)}`, nif: '', concepto: 'Servicios',
        estado: 'PAGADA', cobro: { estado: 'COBRADA', fecha }, base: d.base, cuota: d.cuota, suplidos: d.suplidos,
        irpf: extra.irpf || 0, total: r2(d.base + d.cuota + d.suplidos - (extra.irpf || 0)), tipos: d.tipos, metodo: d.metodo, pdf: null,
    };
};
const ventasSl = [venta('26ING_66', '2026-07-02', 166.39, 31.5)];
for (let i = 67; i <= 78; i++) ventasSl.push(venta(`26ING_${i}`, `2026-0${7 + Math.floor((i - 67) / 5)}-1${i % 10}`, 300, 63));
ventasSl.push(venta('26ING_79', '2026-09-29', 990, 207.9));
const CLI_FML = 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL';
const ventasAut = [['26FML_16', '2026-07-31'], ['26FML_17', '2026-08-31'], ['26FML_18', '2026-09-30']]
    .map(([n, f]) => ({ ...venta(n, f, 2250, 472.5, { irpf: 337.5, cliente: CLI_FML }), nif: SL, concepto: `Servicios de ingeniería – ${['julio', 'agosto', 'septiembre'][Number(f.slice(5, 7)) - 7]} 2026` }));

let id = 0;
const gasto = (linea, nombre, mes, datos, extra = {}) => ({
    fileId: `f${++id}`, nombre, mime: 'application/pdf', linea, contribuyente: linea === 'FML' ? 'AUTONOMO' : 'SL',
    estado: 'REVISADO', fml: null, carpeta: `${G.RUTA.GASTOS[linea]} / 2026 / ${mes}. X`, mes_carpeta: mes,
    datos: { moneda: 'EUR', documento: 'FACTURA', nif_destinatario: linea === 'FML' ? AUT : SL, ...datos }, ajustes: {}, ...extra,
});
const prof = (prov, nif, fecha, base) => ({ proveedor: prov, nif, fecha, numero: `AP${fecha.slice(5, 7)}`, naturaleza: 'PROFESIONAL', base, iva_pct: 21, cuota: r2(base * 0.21), irpf: r2(base * 0.15), total: r2(base * 1.06) });
const isp = (prov, nif, pais, fecha, base) => ({ proveedor: prov, nif, pais, fecha, numero: 'INV', naturaleza: 'SOFTWARE', base, iva_pct: 0, cuota: 0, total: base, nif_destinatario: null });
const filasSl = [
    gasto('CAE', 'lanuza jul.pdf', 7, prof('CERTIFICADOR LANUZA', '11111111H', '2026-07-31', 540)),
    gasto('CAE', 'lanuza ago.pdf', 8, prof('CERTIFICADOR LANUZA', '11111111H', '2026-08-31', 300)),
    gasto('CAE', 'lanuza sep.pdf', 9, prof('CERTIFICADOR LANUZA', '11111111H', '2026-09-30', 840)),
    gasto('CAE', 'cert b 1.pdf', 7, prof('CERTIFICADORA B', '22222222J', '2026-07-15', 340)),
    gasto('CAE', 'cert b 2.pdf', 8, prof('CERTIFICADORA B', '22222222J', '2026-08-15', 840)),
    gasto('CAE', 'cert b 3.pdf', 9, prof('CERTIFICADORA B', '22222222J', '2026-09-15', 900)),
    ...[7, 8, 9].map(m => gasto('ING', `pepephone ${m}.pdf`, m, { proveedor: 'Pepemobile, S.L.', nif: 'B00000000', fecha: `2026-0${m}-01`, numero: `PP${m}`, naturaleza: 'TELEFONIA', base: 20.66, iva_pct: 21, cuota: 4.34, total: 25 })),
    gasto('ING', '2026-08-20 - PROVEEDOR GENERAL - 77.pdf', 8, { proveedor: 'PROVEEDOR GENERAL SL', nif: 'B99999999', fecha: '2026-08-20', numero: '77', naturaleza: 'GENERAL', base: 1867.76, iva_pct: 21, cuota: 392.23, total: 2259.99 }),
    gasto('ING', 'openai.pdf', 7, isp('OpenAI, LLC', 'EU372041333', null, '2026-06-24', 100), { fecha_fuera: true }),
    gasto('ING', 'anthropic.pdf', 8, isp('Anthropic, PBC', null, 'US', '2026-08-03', 200)),
    gasto('ING', 'microsoft.pdf', 8, isp('Microsoft Ireland Operations Ltd', 'IE8256796U', 'IE', '2026-08-05', 15.27)),
    gasto('ING', 'supabase.pdf', 9, isp('Supabase Pte. Ltd.', null, 'SG', '2026-09-02', 200)),
    gasto('CAE', 'ticket.pdf', 9, { proveedor: 'PAPELERIA', fecha: '2026-09-10', documento: 'SIMPLIFICADA', nif_destinatario: null, naturaleza: 'SUMINISTRO', base: 10, iva_pct: 21, cuota: 2.1, total: 12.1 }),
    gasto('CAE', 'tasa.pdf', 9, { proveedor: 'JCCM', fecha: '2026-09-11', documento: 'RECIBO', naturaleza: 'TASA', base: 16.39, cuota: 0, total: 16.39 }),
];
// 26FML_16 está en ING / FACTURAS GASTOS / 7. JULIO (como en Drive); las otras dos, no.
const fml16Drive = gasto('ING', '2026-09-29 - AUTONOMO - 26FML_16 (julio).pdf', 7, {}, { estado: 'APP', fml: '26FML_16' });
const filasAut = [
    gasto('FML', '2026-07-07 - PLENERGY - 032D2600006845.pdf', 7, { proveedor: 'PLENERGY', fecha: '2026-07-07', numero: '032D2600006845', naturaleza: 'COMBUSTIBLE', base: 24.79, iva_pct: 21, cuota: 5.21, total: 30 }),
    ...[[42, 8.82], [41.33, 8.68], [33.05, 6.94], [33.05, 6.94]].map(([b, c], k) => gasto('FML', `gasoleo ${k}.pdf`, 8, { proveedor: 'GASOLINERA', fecha: `2026-08-1${k}`, numero: `G${k}`, naturaleza: 'COMBUSTIBLE', base: b, iva_pct: 21, cuota: c, total: r2(b + c) })),
    gasto('FML', 'seguro.pdf', 9, { proveedor: 'ASEGURADORA', fecha: '2026-09-01', documento: 'RECIBO', naturaleza: 'SEGURO', base: 691, cuota: 0, total: 691 }),
    gasto('FML', 'colegio.pdf', 9, { proveedor: 'COLEGIO PROFESIONAL', fecha: '2026-09-05', naturaleza: 'CUOTA_ASOCIACION', base: 300, cuota: 0, total: 300 }),
];

const quien = { sl: { nombre: 'BROKERGY SL', nif: SL }, autonomo: { nombre: 'AUTÓNOMO DE PRUEBA', nif: AUT } };
const ordenar = (a, b) => String(a.datos?.fecha || '9999').localeCompare(String(b.datos?.fecha || '9999')) || String(a.nombre || '').localeCompare(String(b.nombre || ''));
const gastosSl = [
    ...filasSl.map(g => C.conFiscal({ ...g, origen: 'DRIVE' }, ctx)),
    ...ventasAut.map(v => C.conFiscal(C.gastoDeFml(v, quien.autonomo, v.numero === '26FML_16' ? fml16Drive : null), ctx)),
].sort(ordenar);
const gastosAut = filasAut.map(g => C.conFiscal({ ...g, origen: 'DRIVE' }, ctx)).sort(ordenar);

const m303 = { sl: C.calcular303(ventasSl, gastosSl), autonomo: C.calcular303(ventasAut, gastosAut) };
const m111 = C.calcular111(gastosSl);
const m349 = C.calcular349(gastosSl);

t('ventas del T3: SL base 4.740 € e IVA 995,40 € (16,39 de suplidos aparte); FML 6.750 / 1.417,50 / 1.012,50', () => {
    const s = C.totalesVentas(ventasSl);
    assert.deepEqual([s.base, s.cuota, s.suplidos], [4740, 995.4, 16.39]);
    const a = C.totalesVentas(ventasAut);
    assert.deepEqual([a.base, a.cuota, a.irpf], [6750, 1417.5, 1012.5]);
});

t('303 de la SL: ISP 515,27 → 108,21 devengado y deducido UNA vez; resultado −1.616,95 €', () => {
    const s = m303.sl;
    assert.deepEqual([s.devengado.cuota, s.isp.base, s.isp.cuota], [995.4, 515.27, 108.21]);
    assert.equal(s.deducible.interior, 2612.35);
    // El libro del T3 hecho a mano daba −1.721,30: contaba dos veces el IVA de la ISP.
    assert.equal(s.resultado, -1616.95);
});

t('303 del autónomo: 1.417,50 − 18,30 (gasóleo al 50 %, por línea) = 1.399,20 €', () => {
    assert.deepEqual([m303.autonomo.deducible.interior, m303.autonomo.resultado], [18.3, 1399.2]);
});

t('111: certificadores 252 + 312 y la FML 1.012,50 = 1.576,50 € sobre 10.510 €', () => {
    assert.deepEqual([m111.base, m111.retencion], [10510, 1576.5]);
    assert.deepEqual(m111.perceptores.map(p => [p.retencion, p.origen]), [[1012.5, 'FML'], [312, 'PROFESIONAL'], [252, 'PROFESIONAL']]);
});

t('349: solo Microsoft Ireland (IE), 15,27 €', () => {
    assert.deepEqual(m349.candidatos.map(c => [c.nif, c.pais, c.base]), [['IE8256796U', 'IE', 15.27]]);
});

t('gastos del autónomo deducibles en IRPF: 991 € (el gasóleo no)', () => {
    assert.equal(C.totalesGastos(gastosAut).gasto_irpf, 991);
});

t('130 acumulado: 20 % del rendimiento − retenciones − lo ya ingresado, nunca negativo', () => {
    const r = C.calcular130([
        { t: '2026-T1', ingresos: 6750, gastos: 900, retenciones: 1012.5 },
        { t: '2026-T2', ingresos: 6750, gastos: 900, retenciones: 1012.5 },
        { t: '2026-T3', ingresos: 6750, gastos: 991, retenciones: 1012.5 },
    ]);
    assert.deepEqual(r.por_trimestre.map(q => q.resultado), [157.5, 157.5, 139.3]);
    assert.deepEqual([r.acumulado.rendimiento, r.acumulado.cuota, r.acumulado.pagos_anteriores], [17459, 3491.8, 315]);
    assert.equal(C.calcular130([{ t: 'T1', ingresos: 1000, gastos: 2000, retenciones: 150 }]).acumulado.resultado, 0);
});

t('serie ING: huecos y repetidos; meses que cubre una FML', () => {
    assert.deepEqual(C.huecosSerie(['26ING_38', '26ING_40', '26ING_40', '26ING_41'], '26ING'), { desde: '26ING_38', hasta: '26ING_41', huecos: ['26ING_39'], repetidos: ['26ING_40'] });
    assert.deepEqual([...C.mesesDeFml({ fecha: '2026-09-29', concepto: 'Servicios – julio 2026' })].sort(), [7, 9]);
});

// ── Trimestre de un gasto y appProperties (gastosDrive) ─────────────────────

const fichero = (nombre, props) => ({ id: 'x', name: nombre, mimeType: 'application/pdf', md5Checksum: 'm1', appProperties: G.codificar({ v: '1', md5: 'm1', ...props }) });

t('trimestre de un gasto: el MÁS TARDÍO entre el de su carpeta y el de su fecha', () => {
    // OpenAI del 24/06 archivada en julio → T3 (llegó tarde)
    assert.equal(G.filaGasto(fichero('o.pdf', { fecha: '2026-06-24' }), { linea: 'ING', anio: 2026, mes: 7 }).trimestre_fiscal, '2026-T3');
    // Pepephone del 01/07 archivada en junio → T3 (no se deduce antes de existir)
    const pp = G.filaGasto(fichero('p.pdf', { fecha: '2026-07-01' }), { linea: 'ING', anio: 2026, mes: 6, vecino: true });
    assert.equal(pp.trimestre_fiscal, '2026-T3'); assert.equal(pp.fecha_fuera, true);
    // Una de junio en junio, T2; una sin leer, la de su carpeta
    assert.equal(G.filaGasto(fichero('j.pdf', { fecha: '2026-06-10' }), { linea: 'ING', anio: 2026, mes: 6 }).trimestre_fiscal, '2026-T2');
    assert.equal(G.filaGasto({ id: 'y', name: 'n.pdf', mimeType: 'application/pdf' }, { linea: 'CAE', anio: 2026, mes: 9 }).trimestre_fiscal, '2026-T3');
});

t('estados: una FML en las carpetas de la SL no se lee (APP); otra md5 → CAMBIADO; un .xls no es legible', () => {
    assert.equal(G.filaGasto({ id: 'a', name: '2026-09-29 - X - 26FML_16 (julio).pdf', mimeType: 'application/pdf' }, { linea: 'ING', anio: 2026, mes: 7 }).estado, 'APP');
    assert.equal(G.filaGasto({ ...fichero('c.pdf', { fecha: '2026-07-10' }), md5Checksum: 'otra' }, { linea: 'ING', anio: 2026, mes: 7 }).estado, 'CAMBIADO');
    assert.equal(G.filaGasto(fichero('r.pdf', { fecha: '2026-07-10', rev: '1' }), { linea: 'ING', anio: 2026, mes: 7 }).estado, 'REVISADO');
    assert.equal(G.filaGasto({ id: 'b', name: 'a.xls', mimeType: 'application/vnd.ms-excel' }, { linea: 'ING', anio: 2026, mes: 7 }).estado, 'NO_LEGIBLE');
});

t('appProperties: claves brk_*, cada par cabe en 124 bytes y vuelve igual', () => {
    const largo = 'ÁÉÍÓÚ proveedor con un nombre larguísimo '.repeat(6);
    const p = G.codificar({ v: '1', md5: 'abc', proveedor: largo, base: 1867.756, fecha: '2026-08-20', tipo: 'ISP', nif: null });
    for (const [k, v] of Object.entries(p)) {
        assert.ok(k.startsWith('brk_'));
        if (v != null) assert.ok(Buffer.byteLength(k) + Buffer.byteLength(v) <= 124, k);
    }
    assert.equal(p.brk_nif, null);
    const d = G.decodificar(p);
    assert.deepEqual([d.leido, d.datos.base, d.datos.fecha, d.ajustes.tipo], [true, 1867.76, '2026-08-20', 'ISP']);
    assert.ok(largo.startsWith(d.datos.proveedor));
});

t('lo que devuelve el modelo se normaliza aquí (fecha española, números en texto, moneda)', () => {
    const d = G.normalizarLectura({
        proveedor: ' Supabase  Pte. Ltd. ', proveedor_nif: 'sg-201.234', proveedor_pais: 'sg', fecha_texto: '06/09/26', documento: 'FACTURA', naturaleza: 'SOFTWARE',
        base_imponible: '1.234,56', iva_pct: '21%', iva_importe: '259,26', retencion_irpf: '-15,00', total: '1.478,82', moneda: 'usd', total_eur_indicado: '1.270,10',
    });
    assert.deepEqual([d.fecha, d.proveedor, d.nif, d.pais, d.base, d.iva_pct, d.cuota, d.irpf, d.total, d.moneda, d.total_eur],
        ['2026-09-06', 'Supabase Pte. Ltd.', 'SG201234', null, 1234.56, 21, 259.26, 15, 1478.82, 'USD', 1270.1]);
    assert.equal(G.normalizarLectura({ naturaleza: 'INVENTADA' }).naturaleza, 'OTRO');
});

// ── La cuota de autónomos y el colegio (del extracto del banco) ─────────────

const Q = require('../services/cuotasAutonomo.js');
const CAIXA = ['Concepto;Fecha;Importe;Saldo', 'TGSS.COTIZACI.;30/09/2026;-315,00EUR;102.594,55EUR', 'NATURGY CLIENT;29/09/2026;-46,05EUR;102.909,55EUR',
    'TGSS.COTIZACI.;31/08/2026;-315,00EUR;103.255,08EUR', 'TGSS.COTIZACI.;31/07/2026;-315,00EUR;105.298,09EUR', 'I.V.A. MOD.303;20/07/2026;-1353,17EUR;106.149,06EUR',
    'COITI ALBACETE;08/07/2026;-46,00EUR;108.401,71EUR', 'TRANSF. A SU FAVOR;04/07/2026;+2385,00EUR;108.647,71EUR'].join('\r\n');
const extractos = [{ fileId: 'cx', nombre: 'CaixaBank_digital_CaixaBankNow_20261007.csv', texto: CAIXA }];

t('el CSV de CaixaBank y el de Revolut se leen; TGSS es la RETA y COITI el colegio', () => {
    const m = Q.movimientosDeCsv(CAIXA);
    assert.equal(m.length, 7);
    assert.deepEqual(m[1], { fecha: '2026-09-29', concepto: 'NATURGY CLIENT', importe: -46.05 });
    assert.equal(m.find(x => /MOD.303/.test(x.concepto)).importe, -1353.17);
    const rev = Q.movimientosDeCsv('Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Divisa,State,Saldo\n'
        + 'Transferir,Actual,2026-07-01 09:09:07,2026-07-01 09:09:07,"Pago, con coma",-298.40,0.00,EUR,COMPLETADO,31.80\n'
        + 'Pago con tarjeta,Actual,2026-07-02 10:00:00,,X,-5.00,0.00,EUR,REVERTIDO,26.80');
    assert.deepEqual(rev, [{ fecha: '2026-07-01', concepto: 'Pago, con coma', importe: -298.4 }]);
    assert.deepEqual(['TGSS.COTIZACI.', 'TGSS COTIZACION 005 R.E.AUTONOMOS', 'COITI ALBACETE', 'NATURGY CLIENT'].map(Q.clase), ['RETA', 'RETA', 'COLEGIO', null]);
    assert.deepEqual(Q.mesDeRecibo('PERIODO LIQUIDACION  01 2026-01 2026.pdf'), { anio: 2026, mes: 1 });
});

t('T3 de 2026: las tres cuotas y el colegio del banco (991 €, lo del libro del T3), sin avisos', () => {
    const r = Q.cuotasDe({ anio: 2026, meses: [7, 8, 9], hoy: '2026-10-24', extractos });
    assert.deepEqual(r.filas.map(f => [f.clase, f.fecha, f.importe, f.origen]), [
        ['COLEGIO', '2026-07-08', 46, 'BANCO'], ['RETA', '2026-07-31', 315, 'BANCO'], ['RETA', '2026-08-31', 315, 'BANCO'], ['RETA', '2026-09-30', 315, 'BANCO']]);
    assert.equal(r2(r.filas.reduce((s, f) => s + f.importe, 0)), 991);
    assert.equal(r.avisos.length, 0);
});

t('sin extracto: el mes cargado se ESTIMA con la cuota del cargo más cercano del año; el recibo de la TGSS cuenta; lo no cargado no', () => {
    const t2 = Q.cuotasDe({ anio: 2026, meses: [4, 5, 6], hoy: '2026-10-24', extractos });
    assert.deepEqual(t2.filas.map(f => [f.clase, f.fecha, f.importe, f.origen]), [['RETA', '2026-04-30', 315, 'ESTIMADA'], ['RETA', '2026-05-31', 315, 'ESTIMADA'], ['RETA', '2026-06-30', 315, 'ESTIMADA']]);
    assert.equal(t2.avisos.length, 3);
    const recibos = [1, 2, 3].map(m => ({ fileId: `r${m}`, nombre: `PERIODO LIQUIDACION  0${m} 2026-0${m} 2026.pdf` }));
    const t1 = Q.cuotasDe({ anio: 2026, meses: [1, 2, 3], hoy: '2026-10-24', extractos, recibos });
    assert.deepEqual(t1.filas.map(f => [f.clase, f.mes, f.importe, f.origen]), [['RETA', 1, 315, 'RECIBO'], ['COLEGIO', 2, 46, 'ESTIMADA'], ['RETA', 2, 315, 'RECIBO'], ['RETA', 3, 315, 'RECIBO']]);
    assert.equal(t1.filas[0].fuente.fileId, 'r1');
    assert.equal(Q.cuotasDe({ anio: 2026, meses: [10, 11, 12], hoy: '2026-10-24', extractos }).filas.length, 0, 'octubre aún no se ha cargado');
    // Sin ningún cargo de 2025, la RETA de 2025 no se estima (la cuota cambia cada año): se avisa.
    const a25 = Q.cuotasDe({ anio: 2025, meses: [4, 5, 6], hoy: '2026-10-24', extractos });
    assert.equal(a25.filas.length, 0);
    assert.ok(a25.avisos.every(a => /Sin dato de la cuota de autónomos/.test(a.texto)));
});

t('la cuota como gasto del autónomo: 100 % en el IRPF, sin IVA, a «otros», justificante el extracto', () => {
    const [c] = Q.cuotasDe({ anio: 2026, meses: [7], hoy: '2026-10-24', extractos }).filas.filter(f => f.clase === 'RETA');
    const g = C.conFiscal(C.gastoDeCuota(c), ctx);
    assert.deepEqual([g.fileId, g.origen, g.estado, g.fiscal.tipo, g.fiscal.iva_deducible, g.fiscal.gasto_irpf, g.fiscal.irpf_deducible_pct, g.fiscal.destino, g.actividad],
        [null, 'BANCO', 'BANCO', 'CUOTA_AUTONOMO', 0, 315, 100, 'OTROS', null]);
    assert.equal(g.justificante.tipo, 'EXTRACTO');
    assert.equal(C.calcular303([], [g]).resultado, 0);
});

// ── La actividad de un gasto de la SL (como el T3 a mano) ───────────────────

t('actividad: lo específico de CAE en CAE; el teléfono, el material, lo de ING y las FML, COMÚN; «B - ING» solo a mano', () => {
    const a = (linea, naturaleza, extra = {}) => C.actividadDe({ contribuyente: 'SL', linea, datos: { naturaleza }, ajustes: {}, ...extra });
    assert.deepEqual([a('CAE', 'PROFESIONAL'), a('CAE', 'SOFTWARE'), a('CAE', 'TASA'), a('CAE', 'TELEFONIA'), a('CAE', 'SUMINISTRO'), a('ING', 'GENERAL'), a('ING', 'PROFESIONAL', { fml: '26FML_16' })],
        ['CAE', 'CAE', 'CAE', 'COMUN', 'COMUN', 'COMUN', 'COMUN']);
    assert.equal(a('CAE', 'TELEFONIA', { ajustes: { actividad: 'ING' } }), 'ING');
    assert.equal(C.actividadDe({ contribuyente: 'AUTONOMO', linea: 'FML', datos: {} }), null);
});

// ── Ventas CAE que solo están en Drive (autofacturas de Iberdrola) ──────────

t('ventas CAE de Drive: las que no son de la app, leídas, cuentan como venta de la SL; un justificante de pago no', () => {
    const fila = (nombre, estado, datos = {}) => ({ fileId: nombre, nombre, estado, carpeta: G.RUTA.VENTAS.CAE, datos });
    const ficheros = [
        fila('F-2026CAE_7 - LOTE-2025-002 - INTERALCO.pdf', 'SIN_LEER'),
        fila('F-2026CAE_6 - NATURGY.pdf', 'SIN_LEER'),
        fila('FACTP_11504000252966 IBERDROLA.pdf', 'LEIDO', { documento: 'FACTURA', autofactura: true, cliente: 'IBERDROLA CLIENTES SAU', nif: 'A00000000', numero: '175608115000001', fecha: '2026-04-28', base: 1000, iva_pct: 21, cuota: 210, total: 1210 }),
        fila('JUSTIFICANTE PAGO IBERDROLA.pdf', 'SIN_LEER'),
        fila('FACTP_2.pdf', 'REVISADO', { documento: 'JUSTIFICANTE_PAGO', fecha: '2026-04-30', total: 1210 }),
    ];
    const sin = C.ventasCaeSinRegistrar(ficheros, new Set(['F-2026CAE_7', 'F-2026CAE_60']));
    assert.deepEqual(sin.map(f => f.nombre), ['F-2026CAE_6 - NATURGY.pdf', 'FACTP_11504000252966 IBERDROLA.pdf', 'FACTP_2.pdf']);
    const v = C.ventaDeDrive(sin[1]);
    assert.deepEqual([v.linea, v.contribuyente, v.origen, v.numero, v.fecha, v.base, v.cuota, v.total, v.cobro.estado, v.autofactura, v.revisada],
        ['CAE', 'SL', 'DRIVE', '175608115000001', '2026-04-28', 1000, 210, 1210, 'PENDIENTE', true, false]);
    assert.equal(C.ventaDeDrive(sin[0]), null, 'sin leer no cuenta');
    assert.equal(C.ventaDeDrive(sin[2]), null, 'un justificante de pago no es una venta');
    assert.equal(C.calcular303([v], []).devengado.cuota, 210);
});

t('lo leído de una venta se normaliza y viaja en las appProperties (cliente, autofactura)', () => {
    const d = G.normalizarVenta({ cliente: ' Iberdrola  Clientes ', cliente_nif: 'a-000.000', autofactura: true, documento: 'FACTURA', numero_factura: '175608115000001', fecha_texto: '28/04/2026', base_imponible: '223.437,99', iva_pct: '21 %', iva_importe: '46.921,98', total: '270.359,97' });
    assert.deepEqual([d.cliente, d.nif, d.autofactura, d.fecha, d.base, d.iva_pct, d.cuota, d.total], ['Iberdrola Clientes', 'A000000', true, '2026-04-28', 223437.99, 21, 46921.98, 270359.97]);
    const p = G.codificar({ v: '1', md5: 'm', ...d });
    assert.equal(p.brk_auto, '1');
    const f = G.filaVenta({ id: 'x', name: 'FACTP.pdf', mimeType: 'application/pdf', md5Checksum: 'm', appProperties: p }, { linea: 'CAE', anio: 2026, mes: 4 });
    assert.deepEqual([f.estado, f.datos.cliente, f.datos.autofactura, f.datos.base], ['LEIDO', 'Iberdrola Clientes', true, 223437.99]);
    assert.equal(G.normalizarVenta({ documento: 'INVENTADO' }).documento, 'OTRO');
});

// ── El cobro de una venta CAE de Drive (25/10/2026) ─────────────────────────

const ventaIber = (extra = {}) => ({
    fileId: 'iber1', nombre: 'FACTP_11504000252966 IBERDROLA.pdf', estado: 'LEIDO', carpeta: G.RUTA.VENTAS.CAE, mes: 4,
    datos: { documento: 'FACTURA', autofactura: true, cliente: 'CLIENTE DE PRUEBA SA', numero: '175608115000001', fecha: '2026-04-28', base: 1000, iva_pct: 21, cuota: 210, total: 1210 },
    ...extra,
});

t('venta de Drive SIN cobro: PENDIENTE (cuenta en «Te deben»), nunca vencida (no tiene vencimiento)', () => {
    const v = C.ventaDeDrive(ventaIber(), '2026-10-25');
    assert.deepEqual([v.estado, v.cobro.estado, v.cobro.fecha, v.vencimiento], ['EMITIDA', 'PENDIENTE', null, null]);
    const c = C.cobrosDrive([v], 2026);
    assert.deepEqual([c.pendiente, c.n_pendientes, c.cobrado, c.n_cobradas], [1210, 1, 0, 0]);
    assert.deepEqual(c.pendientes.map(p => [p.fileId, p.numero, p.total, p.autofactura]), [['iber1', '175608115000001', 1210, true]]);
});

t('venta de Drive CON cobro: PAGADA, cuenta en «Cobrado» del año DEL COBRO (no del de la factura)', () => {
    const v = C.ventaDeDrive(ventaIber({ cobro_fecha: '2026-06-26' }), '2026-10-25');
    assert.deepEqual([v.estado, v.cobro.estado, v.cobro.fecha], ['PAGADA', 'COBRADA', '2026-06-26']);
    assert.deepEqual([C.cobrosDrive([v], 2026).cobrado, C.cobrosDrive([v], 2026).n_pendientes], [1210, 0]);
    // Factura de diciembre cobrada en enero: «Cobrado» del año siguiente.
    const dic = C.ventaDeDrive(ventaIber({ cobro_fecha: '2027-01-15', datos: { ...ventaIber().datos, fecha: '2026-12-20' } }), '2027-02-01');
    assert.deepEqual([C.cobrosDrive([dic], 2026).cobrado, C.cobrosDrive([dic], 2027).cobrado], [0, 1210]);
    // Una fecha que no es AAAA-MM-DD no es un cobro.
    assert.equal(C.ventaDeDrive(ventaIber({ cobro_fecha: '26/06/2026' })).cobro.estado, 'PENDIENTE');
});

t('el cobro viaja en brk_cobro_fecha y LEER OTRA VEZ el PDF no lo borra (Drive funde las claves)', () => {
    const lectura = G.codificar({ v: '1', md5: 'm1', ...G.normalizarVenta({ documento: 'FACTURA', numero_factura: '1', fecha_texto: '28/04/2026', base_imponible: '1.000,00', iva_importe: '210,00', total: '1.210,00' }) });
    const cobro = G.codificar({ cobro_fecha: '2026-06-26' });
    assert.deepEqual(cobro, { brk_cobro_fecha: '2026-06-26' });
    assert.deepEqual(G.codificar({ cobro_fecha: null }), { brk_cobro_fecha: null }, 'desmarcar borra la clave');
    // Drive: update de appProperties = las claves nuevas sobre las que había (null borra).
    const funde = (ap, props) => { const o = { ...ap }; for (const [k, x] of Object.entries(props)) { if (x === null) delete o[k]; else o[k] = x; } return o; };
    let ap = funde(lectura, cobro);
    // El PDF cambia (otra md5) y se vuelve a leer: la relectura no lleva la clave del cobro.
    const relectura = G.propsLecturaVenta('m2', G.normalizarVenta({ documento: 'FACTURA', numero_factura: '1', fecha_texto: '28/04/2026', base_imponible: '1.000,00', iva_importe: '210,00', total: '1.210,00' }));
    assert.ok(!('brk_cobro_fecha' in relectura), 'la relectura no toca el cobro');
    ap = funde(ap, relectura);
    const f = G.filaVenta({ id: 'x', name: 'FACTP.pdf', mimeType: 'application/pdf', md5Checksum: 'm2', appProperties: ap }, { linea: 'CAE', anio: 2026, mes: 4 });
    assert.deepEqual([f.estado, f.cobro_fecha], ['LEIDO', '2026-06-26']);
    assert.equal(C.ventaDeDrive(f).cobro.estado, 'COBRADA');
    // Corregir lo leído (PUT /gastos/:fileId) tampoco: solo manda los campos de la venta.
    assert.ok(!('brk_cobro_fecha' in G.codificar({ base: 1000, cliente: 'X' })));
});

t('la fecha del cobro: dd/mm/aaaa o AAAA-MM-DD; lo que no existe, no', () => {
    assert.deepEqual([C.fechaIsoDe('26/06/2026'), C.fechaIsoDe('2026-06-26'), C.fechaIsoDe('1/7/2026')], ['2026-06-26', '2026-06-26', '2026-07-01']);
    assert.deepEqual([C.fechaIsoDe('30/02/2026'), C.fechaIsoDe('2026-13-01'), C.fechaIsoDe(''), C.fechaIsoDe(null)], [null, null, null, null]);
});

// ── Lotes que ya pasaron de «CAE EMITIDO» con la factura sin cobrar ─────────

t('aviso ámbar por cada lote en PTE. PAGO A CLIENTE o FINALIZADO con su factura sin cobrar (F-2026CAE_8/9/10)', () => {
    const lotes = [
        { id: 'l4', codigo: 'LOTE-2026-004', estado: 'PTE. PAGO BROKERGY A CLIENTE' },
        { id: 'l3', codigo: 'LOTE-2025-003', estado: 'FINALIZADO' },
        { id: 'l1', codigo: 'LOTE-2025-001', estado: 'PTE. PAGO BROKERGY A CLIENTE' },
        { id: 'l2', codigo: 'LOTE-2025-002', estado: 'FINALIZADO' },
        { id: 'l9', codigo: 'LOTE-2026-009', estado: 'CAE EMITIDO – PTE PAGO BROKERGY' },
    ];
    const f = (id, lote, numero, cobrada) => ({ id, lote_id: lote, numero, origen: 'LOTE', total: 1000, cobro: { estado: cobrada ? 'COBRADA' : 'VENCIDA', fecha: cobrada ? '2026-06-26' : null } });
    const facturas = [f('f8', 'l4', 'F-2026CAE_8'), f('f9', 'l3', 'F-2026CAE_9'), f('f10', 'l1', 'F-2026CAE_10'), f('f7', 'l2', 'F-2026CAE_7', true), f('f11', 'l9', 'F-2026CAE_11')];
    const av = C.avisosLotesSinCobro(lotes, facturas);
    assert.deepEqual(av.map(a => a.texto), [
        'LOTE-2026-004 ya está en PTE. PAGO A CLIENTE y su F-2026CAE_8 sigue sin cobrar',
        'LOTE-2025-003 ya está en FINALIZADO y su F-2026CAE_9 sigue sin cobrar',
        'LOTE-2025-001 ya está en PTE. PAGO A CLIENTE y su F-2026CAE_10 sigue sin cobrar',
    ]);
    assert.ok(av.every(a => a.tono === 'ambar'), 'ámbar, no rojo');
    assert.deepEqual([av[0].filtro.vista, av[0].filtro.motivo, av[0].filtro.lote_id, av[0].filtro.factura_id, av[0].filtro.factura], ['lotes', 'COBRO_SIN_MARCAR', 'l4', 'f8', 'F-2026CAE_8']);
    // Ni el cobrado (LOTE-2025-002) ni el que aún espera el pago del S.O. (CAE EMITIDO).
    assert.deepEqual(C.avisosLotesSinCobro([], facturas), []);
    assert.deepEqual(C.LOTE_YA_COBRADO, ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO']);
});

// ── La comparación con el año anterior, si ese año tiene ventas sin leer ────

t('con ventas CAE de Drive del año anterior SIN LEER, la comparación no vale: nota y aviso ámbar', () => {
    const sin = [{ nombre: 'FACTP_1 IBERDROLA.pdf', mes: 5 }, { nombre: 'F-2025CAE_3 - AXOIL.pdf', mes: 9 }];
    const c = C.comparacionAnterior(2026, { sinLeerAnterior: sin });
    assert.equal(c.comparable, false);
    assert.match(c.nota, /2025 tiene 2 ventas CAE de Drive sin leer/);
    assert.deepEqual([c.aviso.tono, c.aviso.filtro.vista, c.aviso.filtro.t], ['ambar', 'gastos', '2025-T2']);
    assert.equal(c.aviso.texto, '2 ventas CAE de Drive de 2025 sin leer (FACTP_1 IBERDROLA · F-2025CAE_3 - AXOIL): la comparación con 2025 no vale hasta leerlas');
    assert.deepEqual(C.comparacionAnterior(2026, {}), { comparable: true, nota: null, aviso: null });
    const caido = C.comparacionAnterior(2026, { driveOk: false });
    assert.deepEqual([caido.comparable, caido.aviso], [false, null]);
});

// ── El paquete: nombres, carpetas y el libro ────────────────────────────────

t('nomenclatura del paquete (la del T3 hecho a mano)', () => {
    const T = C.parseTrimestre('2026-T3');
    assert.equal(C.nombreCarpetaPaquete(T), '2026-T3 (jul-sep)');
    assert.equal(C.nombreLibro(T), 'BROKERGY 2026-T3 - Paquete para OTS.xlsx');
    assert.deepEqual(Object.values(C.SUB), ['01 SL - FACTURAS EMITIDAS', '02 SL - FACTURAS RECIBIDAS', '03 SL - TICKETS, TASAS Y OTROS', '04 AUTONOMO - FACTURAS EMITIDAS', '05 AUTONOMO - GASTOS', '06 EXTRACTOS BANCARIOS']);
    assert.equal(C.proveedorCorto('Supabase Pte. Ltd.'), 'SUPABASE');
    assert.equal(C.proveedorCorto('Pepemobile, S.L.'), 'PEPEMOBILE');
    assert.equal(C.nombreRecibida({ nombre: '2026-07-07 - PLENERGY - 032D2600006845.pdf', datos: {} }), '2026-07-07 - PLENERGY - 032D2600006845.pdf');
    assert.equal(C.nombreRecibida({ nombre: 'Invoice-ABC.pdf', datos: { fecha: '2026-09-02', proveedor: 'Supabase Pte. Ltd.', numero: 'ABC/1' } }), '2026-09-02 - SUPABASE - ABC-1.pdf');
    // Lo ya puesto a mano con otra numeración cuenta como puesto (no se duplica).
    assert.equal(C.sinPrefijoRegistro('R-26 - 2026-09-29 - X - 26FML_16 (julio).pdf'), C.sinPrefijoRegistro('R-01 - 2026-09-29 - X - 26FML_16 (julio).pdf'));
    assert.equal(C.sinPrefijoRegistro('AG-01 - 2026-07-07 - PLENERGY - 1.pdf'), '2026-07-07 - PLENERGY - 1.pdf');
});

t('el plan del paquete y el libro Excel (sin Drive): E-, R-, O-, AE-, AG- y el RESUMEN con sus fórmulas', async () => {
    // Lo que listaría Drive, de mentira:
    G.listarExtractos = async () => [
        { fileId: 'x1', nombre: 'BBVA Extracto mensual_BROKERGY •1234_julio26-septiembre26.xlsx', contribuyente: 'SL', carpeta: '01. EMPRESA S2E2' },
        { fileId: 'x2', nombre: 'CaixaBank_digital_CaixaBankNow_20261007.csv', contribuyente: 'AUTONOMO', carpeta: '02. AUTÓNOMO' },
    ];
    const ventasDrive = {
        ING: ventasSl.map((v, k) => ({ fileId: `v${k}`, nombre: `${v.numero} - ${v.cliente}.pdf`, carpeta: G.RUTA.VENTAS.ING })),
        CAE: [{ fileId: 'iber', nombre: 'FACTP_123 - IBERDROLA.pdf', carpeta: G.RUTA.VENTAS.CAE }],
        FML: ventasAut.map((v, k) => ({ fileId: `fv${k}`, nombre: `${v.numero} - ${CLI_FML}.pdf`, carpeta: G.RUTA.VENTAS.FML })),
    };
    const det = {
        t: '2026-T3', contribuyentes: quien, plazo: { fecha: '2026-10-20' }, avisos: [], checklist: [],
        ventas: { sl: { facturas: ventasSl }, autonomo: { facturas: ventasAut } },
        gastos: { sl: { filas: gastosSl, totales: C.totalesGastos(gastosSl) }, autonomo: { filas: gastosAut, totales: C.totalesGastos(gastosAut) } },
        ventas_drive: ventasDrive, m303, m111, m349, m130: null,
        ventas_cae_drive: { leidas: 0, sin_leer: [ventasDrive.CAE[0]] },
    };
    const plan = await C.planPaquete(det);
    const en = (c) => plan.ficheros.filter(f => f.carpeta === c).map(f => f.nombre);
    const em = en(C.SUB.EMITIDAS_SL);
    assert.equal(em.length, 15);
    assert.equal(em[0], 'E-01 - 26ING_66 - CLIENTE 66.pdf');
    assert.equal(em[14], 'E-15 - FACTP_123 - IBERDROLA.pdf');
    assert.ok(plan.faltan.some(f => /FACTP_123/.test(f.texto)));

    const comunes = en(`${C.SUB.RECIBIDAS_SL}/${C.ACT.COMUN}`);
    // La FML que ya está en Drive se copia con SU nombre; las otras, desde VENTAS FML, con el compuesto.
    assert.ok(comunes.some(n => /^R-\d\d - 2026-09-29 - AUTONOMO - 26FML_16 \(julio\)\.pdf$/.test(n)), comunes.join(' | '));
    assert.ok(comunes.some(n => /^R-\d\d - 2026-09-30 - AUTONOMO DE PRUEBA - 26FML_18\.pdf$/.test(n)), comunes.join(' | '));
    assert.ok(en(`${C.SUB.RECIBIDAS_SL}/${C.ACT.CAE}`).every(n => /^R-\d\d - /.test(n)));
    // Como en el T3: la tasa (específica de CAE) en CAE; el ticket de papelería, en COMUNES.
    assert.deepEqual(en(`${C.SUB.OTROS_SL}/${C.ACT.CAE}`).map(n => n.slice(0, 4)), ['O-02']);
    assert.deepEqual(en(`${C.SUB.OTROS_SL}/${C.ACT.COMUN}`).map(n => n.slice(0, 4)), ['O-01']);
    assert.ok(!plan.ficheros.some(f => f.carpeta.includes(C.ACT.ING)), 'sin «B - ING» si nadie la elige');
    assert.deepEqual(en(C.SUB.EMITIDAS_AUT), ['AE-01 - 26FML_16 - SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL.pdf', 'AE-02 - 26FML_17 - SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL.pdf', 'AE-03 - 26FML_18 - SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL.pdf']);
    assert.equal(en(C.SUB.GASTOS_AUT)[0], 'AG-01 - 2026-07-07 - PLENERGY - 032D2600006845.pdf');
    assert.deepEqual(en(C.SUB.EXTRACTOS), ['SL - BBVA cuenta 1234 - jul-sep 2026.xlsx', 'AUTONOMO - CaixaBank - jul-sep 2026.csv']);
    assert.ok(plan.ficheros.every(f => f.origen?.fileId), 'todo lo que se copia tiene su fichero de origen');

    const { buffer, hojas } = await C.libroPaquete(det, plan, { hoy: '2026-10-07' });
    assert.deepEqual(hojas.map(h => h.nombre), ['RESUMEN 3T', 'SL EMITIDAS', 'SL RECIBIDAS', 'SL OTROS GASTOS', 'AUT EMITIDAS', 'AUT GASTOS', '111 RETENCIONES', 'PENDIENTES']);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const res = wb.getWorksheet('RESUMEN 3T');
    const v = (c) => { const x = res.getCell(c).value; return x && typeof x === 'object' && 'result' in x ? x.result : x; };
    assert.deepEqual([v('B5'), v('B6'), v('B7'), v('B8'), v('B9'), v('B11'), v('B12')], [4740, 995.4, 515.27, 108.21, 2612.35, -1616.95, 1576.5]);
    assert.deepEqual([v('B17'), v('B18'), v('B19'), v('B20'), v('B21'), v('B22')], [6750, 1417.5, 18.3, 1399.2, 1012.5, 991]);
    assert.match(res.getCell('B9').value.formula, /SUMIFS\('SL RECIBIDAS'!J:J,'SL RECIBIDAS'!F:F,"Servicio extranjero ISP"\)/);
    const emi = wb.getWorksheet('SL EMITIDAS');
    assert.deepEqual(emi.getRow(4).values.slice(1), ['Nº reg.', 'Fecha', 'Nº factura', 'Cliente', 'NIF', 'Concepto', 'Base 21%', 'Cuota IVA', 'Exento (tasas suplidas)', 'Total', 'Cobro', 'Archivo en el paquete']);
    assert.equal(emi.getCell('A5').value, 'E-01');
    assert.equal(wb.getWorksheet('SL RECIBIDAS').getRow(4).values.length - 1, 17);
});

await Promise.all(pendientes);
console.log(`\n${ok} pruebas OK`);
