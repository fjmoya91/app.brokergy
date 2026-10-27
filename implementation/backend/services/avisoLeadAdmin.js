/**
 * Aviso por WhatsApp al chat de BROKERGY cuando entra un LEAD por la web.
 *
 * Antes solo decía referencia, nombre, teléfono y el enlace de subida, y para
 * saber si el lead valía la pena había que abrir la app (2026-10-20, OP312).
 * Ahora lleva lo que se mira en la lista de oportunidades y lo que el cliente
 * contestó en el funnel: vivienda, caldera, emisor, ACS, placas, presupuesto,
 * partner, canal elegido y las cifras.
 *
 * Las cifras salen con el MISMO criterio que la columna «⚡ € ▲» de la lista
 * (AdminPanelView): RES080 → `financialsRes080` y `res080.ahorroEnergiaFinalTotal`;
 * el resto → `financials` y `savings.savingsKwh`. El margen va porque el chat
 * es el de administración (WHATSAPP_ADMIN_CHAT), nunca el de un partner.
 *
 * Función pura: no lee BD ni envía nada. Prueba: scripts/test_aviso_lead_admin.js
 */

const EDAD_CALDERA = { '<10': 'menos de 10 años', '10-20': '10-20 años', '>20': 'más de 20 años', no_se: 'edad no sabida' };
const EMISOR = {
    radiadores_convencionales: 'Radiadores tradicionales',
    radiadores_baja_temp: 'Radiadores de baja temperatura',
    suelo_radiante: 'Suelo radiante',
    fancoils: 'Fancoils / Split',
};
const ACS = {
    misma_caldera: 'la misma caldera', termo: 'termo eléctrico', butano: 'butano', gas: 'gas',
    gasoleo: 'gasóleo', solar: 'solar', no_tengo: 'no tiene',
};
const OBRA = { no_empezada: 'no empezada', a_medias: 'a medias', ejecutada: 'ya ejecutada', nueva: 'vivienda nueva' };
const TIMELINE = { urgente: 'urgente', '1_mes': 'en 1 mes', '1-3_meses': 'en 1-3 meses', '6_meses': 'en 6 meses' };
const PRESUPUESTO_MODO = { no_se: 'no lo sabe', pide_instalador: 'pide instalador', estimado: 'estimado' };
const CANAL = { whatsapp: 'WhatsApp', email: 'email', tecnico: 'que le llame un técnico' };
const ELEMENTOS = {
    caldera: 'caldera', ventanas: 'ventanas', cubierta: 'cubierta', suelo: 'suelo',
    paredes: 'paredes', placas: 'placas', aires: 'aires',
};

const eur = (n) => `${Math.round(Number(n)).toLocaleString('es-ES')} €`;
const mwh = (kwh) => `${(Number(kwh) / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`;
const etiqueta = (mapa, v) => (v == null || v === '' ? null : (mapa[v] || String(v).replace(/_/g, ' ')));

function buildAvisoLeadAdmin({
    result = {}, contacto = {}, catastro = {}, funnel = {}, inputs = {}, calc = null,
    geoContext = {}, partner = null, canales = [], uploadLink = null,
}) {
    const ficha = result.ficha || null;
    const esRes080 = ficha === 'RES080';
    const L = [];

    L.push(`🆕 *LEAD WEB*${ficha ? ` · ${ficha}` : ''}${result.updated ? ' · re-envío' : ''}${result.lead_caliente ? ' · 🔥 CALIENTE' : ''}`);
    L.push(`Ref *${result.id_oportunidad}*`);

    // Quién
    L.push('');
    const nombre = [contacto.nombre, contacto.apellidos].filter(Boolean).join(' ') || 'cliente';
    L.push(`👤 ${nombre}${(funnel.titular_type || contacto.titular_type) === 'empresa' ? ' (empresa)' : ''}`);
    if (contacto.tlf) L.push(`📞 ${contacto.tlf}`);
    if (contacto.email) L.push(`✉ ${contacto.email}`);
    if (partner?.nombre) L.push(`🤝 Partner: ${partner.nombre}`);

    // La vivienda
    const dir = catastro.address || inputs.direccion || null;
    const ccaa = geoContext.ccaa || null;
    const vivienda = [
        inputs.tipo ? inputs.tipo.charAt(0).toUpperCase() + inputs.tipo.slice(1) : null,
        inputs.superficie ? `${Math.round(inputs.superficie)} m²` : null,
        inputs.anio ? String(inputs.anio) : null,
        inputs.zona ? `zona ${inputs.zona}` : null,
    ].filter(Boolean).join(' · ');
    if (dir || vivienda || catastro.ref_catastral) {
        L.push('');
        if (dir) L.push(`🏠 ${dir}${ccaa ? ` · ${ccaa}` : ''}`);
        if (vivienda) L.push(vivienda);
        if (catastro.ref_catastral) L.push(`RC ${catastro.ref_catastral}`);
    }

    // Lo que contestó
    const datos = [];
    if (funnel.reforma_sin_caldera) {
        datos.push('🔥 Sin caldera de calefacción');
    } else if (funnel.combustible_actual || inputs.boilerHeatingType) {
        const comb = inputs.boilerHeatingType && inputs.boilerHeatingType !== 'No tiene Calefacción'
            ? inputs.boilerHeatingType : funnel.combustible_actual;
        const edad = etiqueta(EDAD_CALDERA, funnel.edad_caldera);
        datos.push(`🔥 Caldera de ${comb}${edad ? `, ${edad}` : ''}${funnel.condensacion === 'si' ? ', de condensación' : ''}`);
    }
    const emisor = etiqueta(EMISOR, funnel.emisor_tipo || inputs.emitterType);
    if (emisor) datos.push(`♨️ ${emisor}`);
    const acs = etiqueta(ACS, funnel.boiler_acs_type);
    if (acs || funnel.incluir_acs != null) {
        datos.push(`💧 ACS: ${acs || '—'}${funnel.incluir_acs ? ' · se incluye' : funnel.incluir_acs === false ? ' · no se incluye' : ''}`);
    }
    if (funnel.placas_estado === 'si') {
        datos.push(`☀️ Ya tiene placas${funnel.placas_kwp ? `: ${String(funnel.placas_kwp).replace('.', ',')} kWp` : ''}`);
    } else if (funnel.placas_estado === 'futuro') {
        datos.push('☀️ Placas: le interesan');
    }
    if (funnel.isReforma) {
        const el = Object.entries(funnel.reforma_elementos || {}).filter(([, v]) => v).map(([k]) => ELEMENTOS[k] || k);
        if (el.length) datos.push(`🧱 Reforma: ${el.join(', ')}`);
    }
    const obra = etiqueta(OBRA, funnel.obra_estado);
    if (obra) datos.push(`🚧 Obra ${obra}`);
    const dinero = [];
    if (Number(funnel.gasto_anual_eur) > 0) dinero.push(`gasto ${eur(funnel.gasto_anual_eur)}/año`);
    if (['tengo', 'documento'].includes(funnel.presupuesto_modo) && Number(funnel.presupuesto_eur) > 0) {
        dinero.push(`presupuesto ${eur(funnel.presupuesto_eur)}`);
    } else if (funnel.presupuesto_modo) {
        dinero.push(`presupuesto: ${etiqueta(PRESUPUESTO_MODO, funnel.presupuesto_modo)}`);
    }
    if (dinero.length) datos.push(`💶 ${dinero.join(' · ')}`);
    if (datos.length) { L.push(''); L.push(...datos); }

    // Cifras (criterio de la lista de oportunidades)
    const fin = (esRes080 && calc?.financialsRes080) ? calc.financialsRes080 : calc?.financials;
    const kwh = esRes080 ? calc?.res080?.ahorroEnergiaFinalTotal : calc?.savings?.savingsKwh;
    const cifras = [
        Number(kwh) > 0 ? mwh(kwh) : null,
        Number(fin?.caeBonus) > 0 ? `bono ${eur(fin.caeBonus)}` : null,
        Number(fin?.profitBrokergy) > 0 ? `margen ${eur(fin.profitBrokergy)}` : null,
    ].filter(Boolean);
    if (cifras.length) { L.push(''); L.push(`📊 *${cifras.join(' · ')}*`); }

    // Intención
    const intencion = [];
    const canalTxt = (canales || []).map(c => CANAL[c] || c).join(', ');
    if (canalTxt) intencion.push(`📨 Propuesta por: ${canalTxt}`);
    const plazo = etiqueta(TIMELINE, funnel.timeline);
    if (plazo) intencion.push(`⏱ Plazo: ${plazo}`);
    if (funnel.motivacion) intencion.push(`🎯 ${String(funnel.motivacion).replace(/_/g, ' ')}`);
    if (result.lead_score != null) intencion.push(`Score ${result.lead_score}`);
    if (intencion.length) { L.push(''); L.push(...intencion); }

    if (uploadLink) { L.push(''); L.push(`📎 Enlace subida: ${uploadLink}`); }

    return L.join('\n');
}

module.exports = { buildAvisoLeadAdmin };
