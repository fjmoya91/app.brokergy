/**
 * Oferta de CEE directo: importes, líneas y mensaje (sin BD, sin red).
 *
 *   node implementation/backend/scripts/test_oferta_cee.mjs
 */
import assert from 'assert';
import * as m from '../../frontend/src/features/cee-directo/logic/ofertaCee.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

t('un certificado: 150 + IVA + 1 tasa de CLM = 197,89 €', () => {
    const r = m.totalesOferta({ alcance: 'UNICO' });
    assert.equal(r.neto, 166.39); assert.equal(r.iva, 31.5); assert.equal(r.total, 197.89);
    assert.equal(r.lineas.length, 2); assert.equal(r.lineas[1].uds, 1);
});

t('inicial + final: 220 + IVA + 2 tasas = 298,98 €', () => {
    const r = m.totalesOferta({ alcance: 'DOBLE' });
    assert.equal(r.total, 298.98); assert.equal(r.lineas[1].uds, 2); assert.equal(r.tasas, 32.78);
});

t('la tasa NO lleva IVA', () => {
    const r = m.totalesOferta({ alcance: 'DOBLE', precio: 0.01 });
    assert.equal(r.lineas[1].ivaPct, 0);
});

t('tasa 0 → no hay línea de tasa', () => {
    const r = m.totalesOferta({ alcance: 'UNICO', tasa: 0 });
    assert.equal(r.lineas.length, 1); assert.equal(r.total, 181.5);
});

t('precio con coma decimal', () => {
    assert.equal(m.totalesOferta({ alcance: 'UNICO', precio: '120,50', tasa: 0 }).neto, 120.5);
});

t('conceptos cortos, como los presupuestos de siempre', () => {
    const l = m.lineasOferta({ alcance: 'DOBLE', direccion: 'C/ Mayor 3' });
    assert.equal(l[0].descripcion, 'Certificado de Eficiencia Energética inicial y final, incluida su presentación en Industria');
    assert.ok(l[1].descripcion.includes('Castilla-La Mancha'));
    assert.ok(!m.lineasOferta({ alcance: 'UNICO', tasa: 10.19 })[1].descripcion.includes('Castilla'));
});

t('el mensaje lleva el enlace y el total, y no habla de tasas si no las hay', () => {
    const s = m.mensajeOferta({ nombre: 'ANA LÓPEZ', numero: '2026PCEE_1', alcance: 'UNICO', total: 181.5, tasas: 0, url: 'https://x/aceptar-cee/abc' });
    assert.ok(s.startsWith('¡Hola Ana!'));
    assert.ok(s.includes('https://x/aceptar-cee/abc'));
    assert.ok(s.includes('181,50 €'));
    assert.ok(!s.includes('tasa'));
});

t('el PDF cita el número, el total y el enlace, y no pide fuentes a Google', () => {
    const h = m.buildOfertaCeeHtml({ alcance: 'DOBLE', numero: '2026PCEE_7' }, { cliente: { nombre_razon_social: 'ANA' }, firmaUrl: 'https://x/aceptar-cee/abc', appUrl: 'https://app.brokergy.es' });
    assert.ok(h.includes('2026PCEE_7')); assert.ok(h.includes('298,98 €')); assert.ok(h.includes('https://x/aceptar-cee/abc'));
    assert.ok(!/fonts\.googleapis/.test(h));
    assert.ok(h.includes("https://app.brokergy.es/fonts/Manrope-"));
});

console.log(`\n${ok} comprobaciones OK`);

// ── Avisos al cliente del CEE directo (recordatorios + contacto) ────────────
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const rec = require('../services/recordatorios.js');

t('aviso de encargo: nombra al técnico y no habla de ayudas ni facturas', () => {
    const s = rec.encargoCeeDirectoClienteMsg({ destinatario: 'ANA LOPEZ', numExp: '2026CEE_57', fase: 'unico', tecnico: 'LUIS ALBERTO LANUZA' });
    assert.ok(s.includes('Luis Alberto Lanuza')); assert.ok(s.includes('2026CEE_57'));
    assert.ok(!/ayuda|factura|trámite/i.test(s));
});

t('registrado sin cobrar: recuerda el pago; cobrado: no', () => {
    assert.ok(rec.ceeDirectoRegistradoClienteMsg({ numExp: 'X', fase: 'unico', cobrado: false }).includes('pago'));
    assert.ok(!rec.ceeDirectoRegistradoClienteMsg({ numExp: 'X', fase: 'unico', cobrado: true }).includes('pago'));
});


t('descuento del 20 %: solo a los honorarios, no a la tasa', () => {
    const r = m.totalesOferta({ alcance: 'DOBLE', dto_pct: 20 });
    assert.equal(r.lineas[0].subtotal, 176); assert.equal(r.lineas[1].subtotal, 32.78);
    assert.equal(r.total, 245.74);   // 176 × 1,21 + 32,78
    assert.ok(m.buildOfertaCeeHtml({ alcance: 'DOBLE', dto_pct: 20 }, { appUrl: 'x' }).includes('20 %'));
});


// ── Cuestionario de climatización ───────────────────────────────────────────
const cq = await import('../../frontend/src/features/cee-directo/logic/cuestionarioCee.js');

t('cuestionario: pide el termo solo con caldera y el nº de aires solo si tiene', () => {
    assert.ok(cq.faltanCuestionario({ calefaccion: 'gas', acs: 'misma_caldera', aire_acondicionado: false, placas: 'no' }).some(x => x.includes('termo')));
    assert.equal(cq.faltanCuestionario({ calefaccion: 'gas', acs: 'termo', aire_acondicionado: false, placas: 'no' }).length, 0);
    assert.ok(cq.faltanCuestionario({ calefaccion: 'gas', acs: 'termo', aire_acondicionado: true, num_aires: '', placas: 'no' }).some(x => x.includes('cuántos')));
});

t('cuestionario: el saneado tira lo desconocido y el resumen dice lo del IRPF', () => {
    const c = cq.sanearCuestionario({ calefaccion: 'gasoleo', acs: 'misma_caldera', termo_extra: 'true', aire_acondicionado: true, num_aires: '3', placas: 'irpf', raro: 1 });
    assert.deepEqual(c, { calefaccion: 'gasoleo', acs: 'misma_caldera', termo_extra: true, aire_acondicionado: true, num_aires: 3, placas: 'irpf' });
    assert.equal(cq.sanearCuestionario({ calefaccion: 'x' }).calefaccion, null);
    const r = Object.fromEntries(cq.resumenCuestionario(c));
    assert.ok(r['Agua caliente'].includes('termo')); assert.ok(r['Aire acondicionado'].includes('3')); assert.ok(r['Placas fotovoltaicas'].includes('IRPF'));
});

console.log(`
${ok} comprobaciones OK`);
