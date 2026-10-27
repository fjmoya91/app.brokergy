/**
 * Prueba del aviso al chat de administración cuando entra un lead por la web
 * (services/avisoLeadAdmin.js). No lee BD ni envía nada.
 *
 *   node implementation/backend/scripts/test_aviso_lead_admin.js
 */
const assert = require('assert');
const { buildAvisoLeadAdmin } = require('../services/avisoLeadAdmin');

// Caso real: 26RES060_OP312 (20/10/2026), datos de la BD con el contacto ficticio.
const base = {
    result: { id_oportunidad: '26RES060_OP312', ficha: 'RES060', lead_score: 55, lead_caliente: false, updated: false },
    contacto: { nombre: 'Pilar', apellidos: 'Costa', tlf: '600000000', email: null },
    catastro: { ref_catastral: '8091211VH1989S0001XF', address: 'CL COLEGIO 6 13432 BALLESTEROS DE CALATRAVA (CIUDAD REAL)' },
    funnel: {
        isReforma: false, combustible_actual: 'gas', edad_caldera: '10-20', condensacion: 'no_se',
        emisor_tipo: 'radiadores_convencionales', boiler_acs_type: 'misma_caldera', incluir_acs: true,
        placas_estado: 'si', placas_kwp: 5, obra_estado: 'no_empezada', gasto_anual_eur: 3500,
        presupuesto_modo: 'tengo', presupuesto_eur: 7000, titular_type: 'particular',
        reforma_elementos: { caldera: true },
    },
    inputs: { tipo: 'unifamiliar', superficie: 126, anio: 2006, zona: 'D3', boilerHeatingType: 'Gas' },
    calc: {
        savings: { savingsKwh: 24665.567 },
        financials: { caeBonus: 2466.56, profitBrokergy: 1479.93 },
    },
    geoContext: { ccaa: 'Castilla-La Mancha' },
    partner: { nombre: 'INSTALACIONES MIGUELTURRA, SL' },
    canales: ['tecnico'],
    uploadLink: 'https://app.brokergy.es/subir-docs/x?token=y',
};

const msg = buildAvisoLeadAdmin(base);
console.log(msg + '\n');

// Lo que se pedía: más datos que ref + nombre + teléfono.
for (const trozo of [
    '*LEAD WEB* · RES060', 'Ref *26RES060_OP312*', '👤 Pilar Costa', '📞 600000000',
    '🤝 Partner: INSTALACIONES MIGUELTURRA, SL',
    'BALLESTEROS DE CALATRAVA (CIUDAD REAL) · Castilla-La Mancha', 'Unifamiliar · 126 m² · 2006 · zona D3',
    'RC 8091211VH1989S0001XF', 'Caldera de Gas, 10-20 años', 'Radiadores tradicionales',
    'ACS: la misma caldera · se incluye', 'Ya tiene placas: 5 kWp', 'Obra no empezada',
    'presupuesto 7000 €', '24,7 MWh', 'bono 2467 €', 'margen 1480 €',
    'Propuesta por: que le llame un técnico', 'Score 55', '📎 Enlace subida:',
]) assert.ok(msg.includes(trozo), `falta «${trozo}»`);
assert.ok(!msg.includes('undefined') && !msg.includes('null') && !msg.includes('NaN'), 'sale un valor vacío');
assert.ok(!msg.includes('✉'), 'sin email no se pinta la línea');

// RES080: las cifras salen de financialsRes080 / res080, como la lista.
const r080 = buildAvisoLeadAdmin({
    ...base,
    result: { ...base.result, id_oportunidad: '26RES080_OP1', ficha: 'RES080', lead_caliente: true },
    funnel: { ...base.funnel, isReforma: true, reforma_elementos: { ventanas: true, cubierta: true } },
    calc: {
        savings: { savingsKwh: 1 }, financials: { caeBonus: 1, profitBrokergy: 1 },
        res080: { ahorroEnergiaFinalTotal: 40000 }, financialsRes080: { caeBonus: 4000, profitBrokergy: 2400 },
    },
});
assert.ok(r080.includes('· RES080 · 🔥 CALIENTE'));
assert.ok(r080.includes('40,0 MWh · bono 4000 € · margen 2400 €'));
assert.ok(r080.includes('Reforma: ventanas, cubierta'));

// Lo mínimo (sin cálculo ni funnel) no rompe ni pinta huecos.
const min = buildAvisoLeadAdmin({ result: { id_oportunidad: '26RES060_OP9' }, contacto: { nombre: 'Ana' } });
assert.ok(min.startsWith('🆕 *LEAD WEB*\nRef *26RES060_OP9*'));
assert.ok(!/undefined|null|NaN/.test(min));

console.log('OK test_aviso_lead_admin');
