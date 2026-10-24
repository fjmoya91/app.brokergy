// Generar el CEE con IA desde el botón CE3X: lo que se decide (sin BD ni red).
//   node implementation/backend/scripts/test_cee_ia.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ceeIa = require('../services/ceeIa.js');
const front = await import('../../frontend/src/features/cee-ia/logic/ceeIa.js');

let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log(`✓ ${nombre}`); };
const AHORA = Date.parse('2026-10-19T20:00:00Z');

caso('el .cex de la IA, calificado, lleva PDF', () => {
    const r = ceeIa.generadoPorIa({ autor: ceeIa.AUTOR_IA, at: '2026-10-19T18:49:59Z', por_calificar: false,
        calificacion: { emisiones: 141.7, emisiones_letra: 'G' }, medidas: [{ nombre: 'AEROTERMIA' }] });
    assert.equal(r.hecho, true); assert.equal(r.pdf, true); assert.deepEqual(r.medidas, ['AEROTERMIA']);
});
caso('por calificar = hecho por la IA pero SIN PDF', () => {
    const r = ceeIa.generadoPorIa({ autor: ceeIa.AUTOR_IA, por_calificar: true, calificacion: null });
    assert.equal(r.hecho, true); assert.equal(r.pdf, false);
});
caso('regenerado desde la ventana ya NO es de la IA', () => {
    assert.equal(ceeIa.generadoPorIa({ autor: 'FRANCISCO JAVIER', por: 'ventana' }).hecho, false);
    assert.equal(ceeIa.generadoPorIa(null).hecho, false);
});
caso('vigilante: vivo con latido reciente, apagado sin él', () => {
    assert.equal(ceeIa.estadoVigilante({ equipo: 'PC', visto_at: new Date(AHORA - 30_000).toISOString(), listo: true }, AHORA).listo, true);
    assert.equal(ceeIa.estadoVigilante({ equipo: 'PC', visto_at: new Date(AHORA - 5 * 60_000).toISOString(), listo: true }, AHORA).vivo, false);
    const noListo = ceeIa.estadoVigilante({ equipo: 'PC', visto_at: new Date(AHORA).toISOString(), listo: false, motivo: 'sin CE3X' }, AHORA);
    assert.equal(noListo.listo, false); assert.equal(noListo.motivo, 'sin CE3X');
    assert.equal(ceeIa.estadoVigilante(null, AHORA).vivo, false);
});
caso('atascado: EN_CURSO sin latido en 10 min', () => {
    assert.equal(ceeIa.atascado({ estado: 'EN_CURSO', latido_at: new Date(AHORA - 11 * 60_000).toISOString() }, AHORA), true);
    assert.equal(ceeIa.atascado({ estado: 'EN_CURSO', latido_at: new Date(AHORA - 60_000).toISOString() }, AHORA), false);
    assert.equal(ceeIa.atascado({ estado: 'EN_COLA', pedido_at: '2020-01-01' }, AHORA), false);
});
caso('botón: hecho por la IA → abre la envolvente', () => {
    assert.equal(front.alPulsarCe3x({ ia: { hecho: true }, trabajo: { estado: 'HECHO' } }), 'abrir');
});
caso('botón: la IA trabajando → popup (aunque ya lo hubiera hecho antes)', () => {
    assert.equal(front.alPulsarCe3x({ ia: { hecho: true }, trabajo: { estado: 'EN_CURSO' } }), 'popup');
    assert.equal(front.alPulsarCe3x({ ia: { hecho: false }, trabajo: { estado: 'EN_COLA' } }), 'popup');
});
caso('botón: sin IA, oportunidad aceptada o sin estado → popup', () => {
    assert.equal(front.alPulsarCe3x({ ia: { hecho: false }, trabajo: null }), 'popup');
    assert.equal(front.alPulsarCe3x({ ia: { hecho: true }, expediente: { numero_expediente: 'X' } }), 'popup');
    assert.equal(front.alPulsarCe3x(null), 'popup');
});
caso('un trabajo atascado no cuenta como vivo', () => {
    assert.equal(front.esVivo({ estado: 'EN_CURSO', atascado: true }), false);
    assert.equal(front.alPulsarCe3x({ ia: { hecho: true }, trabajo: { estado: 'EN_CURSO', atascado: true } }), 'abrir');
});
caso('la línea de progreso dice qué hace y cuánto lleva', () => {
    const l = front.lineaTrabajo({ estado: 'EN_CURSO', progreso: { ultima: 'aplicar', vueltas: 12, coste_usd: 1.234 } });
    assert.match(l, /escribiendo y calificando/); assert.match(l, /12 vueltas/); assert.match(l, /1,23 \$/);
});
caso('por la suscripción: el encargo al Claude del WhatsApp se da por perdido a las 3 h, no a los 10 min', () => {
    const t = (min) => ({ estado: 'EN_CURSO', equipo: ceeIa.EQUIPO_WA, tomado_at: new Date(AHORA - min * 60_000).toISOString() });
    assert.equal(ceeIa.atascado(t(60), AHORA), false);
    assert.equal(ceeIa.atascado(t(181), AHORA), true);
    assert.equal(front.EQUIPO_WA, ceeIa.EQUIPO_WA);
    assert.match(front.lineaTrabajo({ ...t(5), atascado: false }), /Claude del WhatsApp/);
    assert.doesNotMatch(front.lineaTrabajo({ estado: 'HECHO', terminado_at: new Date(AHORA).toISOString(), resultado: { via: 'whatsapp' } }), /\$/);
});
caso('el texto del encargo lo compone el servidor con la skill del CEE inicial', () => {
    const s = ceeIa.textoEncargo({ clave: '26RES060_OP279', usuario: 'Fran', rehacer: true });
    assert.match(s, /botón CE3X/i); assert.match(s, /generar-cee-inicial/); assert.match(s, /26RES060_OP279/);
    assert.match(s, /REHACERLO/); assert.match(s, /sin el «sí» de Fran/);
});

console.log(`\n${ok} casos OK`);
