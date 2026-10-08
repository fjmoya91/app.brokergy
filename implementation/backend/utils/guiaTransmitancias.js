// ============================================================================
// guiaTransmitancias.js — Qué GUÍA DE TRANSMITANCIAS lleva una oportunidad.
// ----------------------------------------------------------------------------
// Desde el 08/10/2026 la Guía son los valores de CE3X 3.2 («Estimados según
// antigüedad y zona climática», `transmitanciasCe3x.js`), y la calculadora la
// usa en las simulaciones que llevan `inputs.guia_transmitancias` — se la pone el
// navegador a toda simulación NUEVA (calculation.js).
//
// REGLA — una oportunidad ANTERIOR no estrena la marca al volver a guardarse: con
// ella su demanda se recalcularía con otras U y le cambiaría el bono a una
// propuesta ya enviada. Mismo criterio que el precio CAE (`precioCae.js`): la
// condición es "no existía" o "ya la trae", jamás "existe".
// ============================================================================

/**
 * Deja `inputs.guia_transmitancias` como corresponda, EN EL SITIO (muta `inputs`).
 *
 * @param {object} inputs           `datos_calculo.inputs` que se va a guardar
 * @param {object|null} existingOp  el registro que ya había en BD, o null si es nueva
 * @returns {object} el mismo `inputs`
 */
function sellarGuiaTransmitancias(inputs, existingOp) {
    if (!inputs || typeof inputs !== 'object') return inputs;
    const yaLaTenia = existingOp?.datos_calculo?.inputs?.guia_transmitancias !== undefined;
    if (existingOp && !yaLaTenia) delete inputs.guia_transmitancias;
    return inputs;
}

module.exports = { sellarGuiaTransmitancias };
