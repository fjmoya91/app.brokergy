// ============================================================================
// guiaTransmitancias.js — Qué GUÍA DE TRANSMITANCIAS (y qué CALIBRACIÓN de la
// demanda) lleva una oportunidad.
// ----------------------------------------------------------------------------
// Desde el 08/10/2026 la Guía son los valores de CE3X 3.2 («Estimados según
// antigüedad y zona climática», `transmitanciasCe3x.js`), y la calculadora la
// usa en las simulaciones que llevan `inputs.guia_transmitancias` — se la pone el
// navegador a toda simulación NUEVA (calculation.js). Desde el 26/10/2026, igual
// con `inputs.calibracion_demanda` (la casa unifamiliar de 2008+, `getFactorEpoca`).
//
// REGLA — una oportunidad ANTERIOR no estrena la marca al volver a guardarse: con
// ella su demanda se recalcularía y le cambiaría el bono a una propuesta ya
// enviada. Mismo criterio que el precio CAE (`precioCae.js`): la condición es
// "no existía" o "ya la trae", jamás "existe". Cada marca, por su cuenta.
// ============================================================================

const MARCAS = ['guia_transmitancias', 'calibracion_demanda'];

/**
 * Deja las marcas de simulación nueva como correspondan, EN EL SITIO (muta `inputs`).
 *
 * @param {object} inputs           `datos_calculo.inputs` que se va a guardar
 * @param {object|null} existingOp  el registro que ya había en BD, o null si es nueva
 * @returns {object} el mismo `inputs`
 */
function sellarGuiaTransmitancias(inputs, existingOp) {
    if (!inputs || typeof inputs !== 'object') return inputs;
    for (const marca of MARCAS) {
        const yaLaTenia = existingOp?.datos_calculo?.inputs?.[marca] !== undefined;
        if (existingOp && !yaLaTenia) delete inputs[marca];
    }
    return inputs;
}

module.exports = { sellarGuiaTransmitancias };
