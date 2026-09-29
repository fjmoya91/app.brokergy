/**
 * Los presupuestos adjuntados a la propuesta rellenan su campo de Datos Económicos
 * (logic/presupuestoLeido.js): Aerotermia → P. Aerotermia, Placas solares →
 * P. Fotovoltaica, los de la reforma → P. Reforma SUMADOS. Sin llamar al OCR: se
 * le pasan respuestas con la forma de `/api/factura-ocr/extract`.
 *
 *   node implementation/backend/scripts/test_presupuesto_leido.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../frontend/src/features/calculator/logic');
const { ivaDeLaSimulacion, repartoPresupuestoLeido, lecturaAPresupuesto, HUECOS_PRESUPUESTO } =
    await import(pathToFileURL(path.join(raiz, 'presupuestoLeido.js')).href);
const { payloadOportunidad } = await import(pathToFileURL(path.join(raiz, 'guardarOportunidad.js')).href);

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log(`✓ ${nombre}`); };

// Documento con la forma de la respuesta del lector. `lineas`: [[partida, importe sin IVA]].
const doc = (base, lineas = [], extra = {}) => ({
    doc: { importe_sin_iva: base, importe_total: Math.round(base * 121) / 100, iva_pct: 21, iva_estimado: false, ...extra },
    ocr: { lineas: lineas.map(([partida, importe_total]) => ({ partida, importe_total })) },
});

// 12.000 € de base (14.520 con IVA), solo aerotermia.
const soloAero = doc(12000, [['AEROTERMIA', 9500], ['MANO_OBRA', 2500]], { numero_factura: 'P-26/118', emisor_nombre: 'INSTOTERMA SL' });
// El mismo con 3.000 € de placas (base 15.000 → total 18.150).
const conPlacas = doc(15000, [['AEROTERMIA', 9500], ['MANO_OBRA', 2500], ['FOTOVOLTAICA', 3000]]);

const REFORMA = { isReforma: true, reformaVentanas: true, reformaCubierta: true };

// ── IVA ─────────────────────────────────────────────────────────────────────
t('particular → con IVA, pase lo que pase con el conmutador', () => {
    assert.equal(ivaDeLaSimulacion({ titularType: 'particular', includeIVA: false }).conIva, true);
    assert.equal(ivaDeLaSimulacion({}).conIva, true);
});

t('empresa / autónomo → según el conmutador; terciario es empresa', () => {
    assert.equal(ivaDeLaSimulacion({ titularType: 'empresa', includeIVA: false }).conIva, false);
    assert.equal(ivaDeLaSimulacion({ titularType: 'autonomo', includeIVA: true }).conIva, true);
    assert.equal(ivaDeLaSimulacion({ sector: 'terciario', includeIVA: false }).conIva, false);
});

// ── Hueco Aerotermia ────────────────────────────────────────────────────────
t('aerotermia: P. Aerotermia = total CON IVA (particular) y quita el estimado', () => {
    const r = lecturaAPresupuesto(soloAero, { presupuesto: 15000, presupuestoEstimado: true });
    assert.equal(r.patch.presupuesto, 14520);
    assert.equal(r.patch.presupuestoEstimado, false);
    assert.equal(r.patch.presupuestoFotovoltaica, undefined);
    assert.equal(r.antes.presupuesto, 15000);
    assert.equal(r.antes.presupuestoEstimado, true);
    assert.match(r.titular, /P\. Aerotermia: 14\.520 € \(IVA incl\.\).*antes 15\.000 €, estimado/);
    assert.match(r.nota, /P\. Aerotermia 15\.000 € → 14\.520 €/);
});

t('aerotermia, empresa "Sin IVA": P. Aerotermia = BASE imponible', () => {
    const r = lecturaAPresupuesto(soloAero, { titularType: 'empresa', includeIVA: false });
    assert.equal(r.patch.presupuesto, 12000);
    assert.match(r.titular, /sin IVA/);
});

t('aerotermia con placas dentro: las placas a P. Fotovoltaica si está vacío', () => {
    const r = lecturaAPresupuesto(conPlacas, { presupuestoFotovoltaica: 0 });
    assert.equal(r.patch.presupuestoFotovoltaica, 3630);   // 3.000/15.000 de 18.150
    assert.equal(r.patch.presupuesto, 14520);
    assert.equal(r.patch.presupuesto + r.patch.presupuestoFotovoltaica, 18150);
});

t('P. Fotovoltaica ya puesto y distinto → no se toca, se dice, y las placas siguen fuera', () => {
    const r = lecturaAPresupuesto(conPlacas, { presupuestoFotovoltaica: 5000 });
    assert.equal(r.patch.presupuestoFotovoltaica, undefined);
    assert.equal(r.patch.presupuesto, 14520);
    assert.ok(r.avisos.some(a => /P\. Fotovoltaica/.test(a) && /no se ha tocado/.test(a)));
});

t('envolvente dentro del de aerotermia en una ficha de sustitución → se queda y se avisa', () => {
    const r = lecturaAPresupuesto(doc(20000, [['AEROTERMIA', 12000], ['VENTANAS', 8000]]), { isReforma: false });
    assert.equal(r.patch.presupuesto, 24200);
    assert.equal(r.patch.presupuestoEnvolvente, undefined);
    assert.ok(r.avisos.some(a => /envolvente/.test(a)));
});

// ── Hueco Placas solares ────────────────────────────────────────────────────
t('el hueco de Placas solares existe y va a P. Fotovoltaica', () => {
    const h = HUECOS_PRESUPUESTO.find(x => x.key === 'FOTOVOLTAICA');
    assert.equal(h.campo, 'fotovoltaica');
    assert.equal(h.input, null);   // siempre visible
});

t('placas: P. Fotovoltaica = el total del documento, SUSTITUYE lo que hubiera', () => {
    const r = lecturaAPresupuesto(doc(5000, [['FOTOVOLTAICA', 4200], ['MANO_OBRA', 800]]),
        { presupuesto: 15000, presupuestoEstimado: true, presupuestoFotovoltaica: 4000 }, { hueco: 'FOTOVOLTAICA' });
    assert.equal(r.patch.presupuestoFotovoltaica, 6050);   // mano de obra incluida: es de su documento
    assert.equal(r.patch.presupuesto, undefined);          // la aerotermia no se toca…
    assert.equal(r.patch.presupuestoEstimado, undefined);  // …ni deja de ser estimada
    assert.match(r.titular, /^P\. Fotovoltaica: 6\.050 €.*antes 4\.000 €/);
    assert.ok(r.patch.presupuestos_leidos.FOTOVOLTAICA);
});

t('placas con aerotermia dentro: la aerotermia va a P. Aerotermia si es la ESTIMADA', () => {
    const lec = doc(10000, [['FOTOVOLTAICA', 5000], ['AEROTERMIA', 5000]]);
    const r = lecturaAPresupuesto(lec, { presupuesto: 15000, presupuestoEstimado: true }, { hueco: 'FOTOVOLTAICA' });
    assert.equal(r.patch.presupuestoFotovoltaica, 6050);
    assert.equal(r.patch.presupuesto, 6050);
    assert.equal(r.patch.presupuestoEstimado, false);
    const r2 = lecturaAPresupuesto(lec, { presupuesto: 15000, presupuestoEstimado: false }, { hueco: 'FOTOVOLTAICA' });
    assert.equal(r2.patch.presupuesto, undefined);          // tecleada: no se pisa
    assert.ok(r2.avisos.some(a => /P\. Aerotermia ya tenía 15\.000 €/.test(a)));
});

// ── Huecos de la reforma → P. Reforma sumado ────────────────────────────────
t('reforma: un solo presupuesto (ventanas) → P. Reforma = su total', () => {
    const r = lecturaAPresupuesto(doc(8000, [['VENTANAS', 7000], ['MANO_OBRA', 1000]]),
        { ...REFORMA, reformaCubierta: false, presupuestoEnvolvente: 0 }, { hueco: 'VENTANAS', huecosConAdjunto: ['VENTANAS'] });
    assert.equal(r.patch.presupuestoEnvolvente, 9680);
    assert.equal(r.patch.presupuestos_leidos.VENTANAS.importe, 9680);
    assert.match(r.titular, /^P\. Reforma: 9\.680 €/);
});

t('reforma: el segundo presupuesto (cubierta) SE SUMA al leído antes', () => {
    const memoria = { VENTANAS: { importe: 9680 } };
    const r = lecturaAPresupuesto(doc(6000, [['CUBIERTA', 6000]]),
        { ...REFORMA, presupuestoEnvolvente: 9680, presupuestos_leidos: memoria },
        { hueco: 'CUBIERTA', huecosConAdjunto: ['AEROTERMIA', 'VENTANAS', 'CUBIERTA'] });
    assert.equal(r.patch.presupuestoEnvolvente, 9680 + 7260);
    assert.ok(r.extras.some(e => /Ventanas 9\.680 € \+ Cubierta 7\.260 €/.test(e)));
    assert.equal(r.patch.presupuestos_leidos.VENTANAS.importe, 9680);   // no se pierde
});

t('reforma: sustituir el de ventanas cambia SU sumando y deja los demás', () => {
    const memoria = { VENTANAS: { importe: 9680 }, CUBIERTA: { importe: 7260 } };
    const r = lecturaAPresupuesto(doc(9000, [['VENTANAS', 9000]]),
        { ...REFORMA, presupuestoEnvolvente: 16940, presupuestos_leidos: memoria },
        { hueco: 'VENTANAS', huecosConAdjunto: ['VENTANAS', 'CUBIERTA'] });
    assert.equal(r.patch.presupuestoEnvolvente, 10890 + 7260);
});

t('reforma: un hueco activo SIN presupuesto adjunto no suma y se dice', () => {
    const r = lecturaAPresupuesto(doc(8000, [['VENTANAS', 8000]]), { ...REFORMA },
        { hueco: 'VENTANAS', huecosConAdjunto: ['VENTANAS'] });
    assert.equal(r.patch.presupuestoEnvolvente, 9680);
    assert.ok(r.avisos.some(a => /Cubierta sin presupuesto adjunto/.test(a)));
});

t('reforma: un presupuesto QUITADO (sin adjunto) sale de la suma aunque se recuerde', () => {
    const memoria = { VENTANAS: { importe: 9680 } };
    const r = lecturaAPresupuesto(doc(6000, [['CUBIERTA', 6000]]),
        { ...REFORMA, presupuestos_leidos: memoria },
        { hueco: 'CUBIERTA', huecosConAdjunto: ['CUBIERTA'] });
    assert.equal(r.patch.presupuestoEnvolvente, 7260);
});

t('reforma: un hueco de mejora DESMARCADA no suma aunque tenga documento', () => {
    const memoria = { VENTANAS: { importe: 9680 } };
    const r = lecturaAPresupuesto(doc(6000, [['CUBIERTA', 6000]]),
        { isReforma: true, reformaVentanas: false, reformaCubierta: true, presupuestos_leidos: memoria },
        { hueco: 'CUBIERTA', huecosConAdjunto: ['VENTANAS', 'CUBIERTA'] });
    assert.equal(r.patch.presupuestoEnvolvente, 7260);
});

t('reforma: los ya adjuntos y nunca leídos entran por `otras`', () => {
    const r = lecturaAPresupuesto(doc(6000, [['CUBIERTA', 6000]]), { ...REFORMA },
        { hueco: 'CUBIERTA', huecosConAdjunto: ['VENTANAS', 'CUBIERTA'], otras: { VENTANAS: doc(8000, [['VENTANAS', 8000]]) } });
    assert.equal(r.patch.presupuestoEnvolvente, 9680 + 7260);
    assert.equal(r.patch.presupuestos_leidos.VENTANAS.importe, 9680);
});

t('reforma: uno adjunto que no se ha podido leer queda fuera y se dice', () => {
    const r = lecturaAPresupuesto(doc(6000, [['CUBIERTA', 6000]]), { ...REFORMA },
        { hueco: 'CUBIERTA', huecosConAdjunto: ['VENTANAS', 'CUBIERTA'] });
    assert.equal(r.patch.presupuestoEnvolvente, 7260);
    assert.ok(r.avisos.some(a => /No se ha podido leer el presupuesto de ventanas/.test(a)));
});

t('reforma: la envolvente dentro del de aerotermia va a P. Reforma solo si está vacío', () => {
    const lec = doc(20000, [['AEROTERMIA', 12000], ['VENTANAS', 8000]]);
    const r = lecturaAPresupuesto(lec, { isReforma: true, presupuestoEnvolvente: 0 });
    assert.equal(r.patch.presupuestoEnvolvente, 9680);
    assert.equal(r.patch.presupuesto, 14520);
    const r2 = lecturaAPresupuesto(lec, { isReforma: true, presupuestoEnvolvente: 20000 });
    assert.equal(r2.patch.presupuestoEnvolvente, undefined);
    assert.equal(r2.patch.presupuesto, 14520);   // pero sigue fuera de la aerotermia
});

// ── Casos límite ────────────────────────────────────────────────────────────
t('sin desglose de líneas → todo al campo del hueco', () => {
    const r = repartoPresupuestoLeido({ doc: { importe_sin_iva: 10000, importe_total: 12100 }, ocr: { lineas: [] } }, {});
    assert.equal(r.partes.aerotermia, 12100);
    assert.equal(r.partes.fotovoltaica, 0);
});

t('IVA no desglosado → se dice que se ha supuesto el 21 %', () => {
    const r = lecturaAPresupuesto({ doc: { importe_sin_iva: 10000, importe_total: 12100, iva_estimado: true }, ocr: {} }, {});
    assert.ok(r.avisos.some(a => /21 %/.test(a)));
});

t('sin importe legible → no se escribe nada', () => {
    const r = lecturaAPresupuesto({ doc: { importe_sin_iva: 0, importe_total: 0 }, ocr: {} }, { presupuesto: 15000 });
    assert.equal(r.patch, null);
});

t('un "presupuesto de aerotermia" que solo trae placas no deja la aerotermia a 0', () => {
    const r = lecturaAPresupuesto(doc(5000, [['FOTOVOLTAICA', 5000]]), { presupuesto: 15000 });
    assert.equal(r.patch, null);
    assert.match(r.titular, /no trae importe de aerotermia/);
});

t('mismo importe → "igual": solo la huella, sin reescribir cifras ni historial', () => {
    const r = lecturaAPresupuesto(soloAero, { presupuesto: 14520, presupuestoEstimado: false });
    assert.equal(r.igual, true);
    assert.equal(r.nota, null);
    assert.deepEqual(Object.keys(r.patch), ['presupuestos_leidos']);
    assert.equal(lecturaAPresupuesto(soloAero, { presupuesto: 14520, presupuestoEstimado: true }).igual, false);
});

t('céntimos de diferencia son la misma cifra (26RES060_OP228: 17.530 vs 17.530,84)', () => {
    const lec = { doc: { importe_sin_iva: 14488.3, importe_total: 17530.84, iva_pct: 21 }, ocr: {} };
    const r = lecturaAPresupuesto(lec, { presupuesto: 17530 });
    assert.equal(r.igual, true);
    assert.match(r.titular, /17\.530 €.*coincide/);
    assert.equal(r.patch.presupuesto, undefined);   // no se escriben los céntimos encima
    assert.equal(lecturaAPresupuesto(lec, { presupuesto: 17520 }).igual, false);
});

t('la huella queda por hueco en inputs.presupuestos_leidos (solo metadatos)', () => {
    const r = lecturaAPresupuesto(soloAero, { presupuestos_leidos: { VENTANAS: { importe: 1 } } }, { ahora: '2026-09-29T10:00:00.000Z' });
    assert.deepEqual(r.patch.presupuestos_leidos.AEROTERMIA, {
        importe: 14520, partes: { aerotermia: 14520, fotovoltaica: 0, envolvente: 0 },
        total_documento: 14520, con_iva: true, iva_pct: 21, iva_estimado: false,
        numero: 'P-26/118', fecha: null, emisor: 'INSTOTERMA SL', at: '2026-09-29T10:00:00.000Z',
    });
    assert.equal(r.patch.presupuestos_leidos.VENTANAS.importe, 1);   // las de otros huecos se conservan
    assert.equal(r.antes.presupuestos_leidos.VENTANAS.importe, 1);   // y Deshacer las devuelve
});

t('payloadOportunidad: el mismo cuerpo que armaba el popup de guardar', () => {
    const inputs = { id_oportunidad: '26RES060_OP9', rc: 'ABC', anio: 1990, zona: 'D3', cliente_id: 'c1', presupuesto: 14520, result: { viejo: 1 }, inputs: { anidado: 1 } };
    const p = payloadOportunidad({ inputs, result: { q_net: 80 }, prescriptorId: 'p1', instaladorId: null, referenciaCliente: 'X', codClienteInterno: '', nota: '  hola ' });
    assert.equal(p.id_oportunidad, '26RES060_OP9');
    assert.equal(p.ref_catastral, 'ABC');
    assert.equal(p.prescriptor_id, 'p1');
    assert.equal(p.instalador_asociado_id, null);
    assert.equal(p.demanda_calefaccion, 80);
    assert.equal(p.nota, 'hola');
    assert.equal(p.datos_calculo.inputs.presupuesto, 14520);
    assert.equal(p.datos_calculo.presupuesto, 14520);
    assert.equal(p.datos_calculo.inputs.result, undefined);   // sin residuos anidados
    assert.equal(p.datos_calculo.inputs.inputs, undefined);
    assert.deepEqual(p.datos_calculo.result, { q_net: 80 });
    assert.equal(payloadOportunidad({ inputs: { rc: '' }, result: null, nota: '' }).ref_catastral, 'MANUAL');
});

console.log(`\n${ok} comprobaciones OK`);
