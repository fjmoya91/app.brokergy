// ============================================================================
// fichas.js — FUENTE ÚNICA (backend) de las tipologías de ficha CAE.
// ----------------------------------------------------------------------------
// El número de expediente es `{YY}{FICHA}_{correlativo}` (p. ej. 26RES060_118,
// 26TER100_3) y de ese código cuelgan la numeración, el cálculo del ahorro, los
// documentos y las carpetas de Drive. Antes cada sitio repetía su propia cadena
// de `includes('RES080') ? … : includes('RES093') ? …`, y añadir una ficha
// obligaba a encontrar todas esas cadenas. Aquí viven la lista, el correlativo
// inicial y la detección; el espejo en el frontend es
// features/expedientes/logic/expedienteTaxonomia.js (getFicha / FICHAS).
//
// Fichas soportadas:
//   · RES060 — Sustitución de caldera por bomba de calor (residencial).
//   · RES080 — Mejora de eficiencia energética / reforma (residencial).
//   · RES093 — Hibridación caldera + bomba de calor (residencial, zona D).
//   · TER100 — Sustitución de caldera por bomba de calor (TERCIARIO): hoteles,
//     residencias, gimnasios, centros educativos… Desglosa el ahorro en
//     calefacción / ACS / calentamiento de piscina.
// ============================================================================

const FICHAS = ['RES060', 'RES080', 'RES093', 'TER100'];

// Correlativo con el que arranca cada ficha cuando aún no hay expedientes del
// año. No es 1 en todas porque hay numeraciones heredadas del sistema anterior
// que no se pueden reutilizar: RES080 venía de 35 y TER100 tenía ya 2 expedientes
// antiguos, así que el primero de la app es el 3 (26TER100_3).
const CORRELATIVO_INICIAL = { RES080: 36, TER100: 3 };

function correlativoInicial(ficha) {
    return CORRELATIVO_INICIAL[ficha] || 1;
}

/** Ficha declarada en el número de expediente ('26TER100_3' → 'TER100'), o null. */
function fichaFromNumero(numeroExpediente) {
    const num = String(numeroExpediente || '').toUpperCase();
    return FICHAS.find(f => num.includes(f)) || null;
}

/**
 * Programa de un expediente/oportunidad. El número de expediente MANDA (es lo
 * que ya está emitido y en Drive); si no lo hay, se deduce de la oportunidad.
 * TER100 solo puede venir declarada explícitamente (`op.ficha`): no se deduce de
 * los inputs, porque la calculadora residencial nunca produce un terciario.
 */
function detectPrograma(exp = {}, op = {}) {
    const porNumero = fichaFromNumero(exp.numero_expediente);
    if (porNumero) return porNumero;

    const opInputs = op.datos_calculo?.inputs || {};
    const opResult = op.datos_calculo?.result || {};

    if (op.ficha === 'TER100') return 'TER100';
    const isReforma = opInputs.isReforma === true
        || ['onlyReforma', 'both'].includes(opInputs.reformaType)
        || op.ficha === 'RES080'
        || !!opResult.res080;
    if (isReforma) return 'RES080';
    const isHybrid = opInputs.hibridacion === true || op.ficha === 'RES093' || !!opResult.res093;
    return isHybrid ? 'RES093' : 'RES060';
}

/** ¿Esta ficha usa la fórmula de sustitución de caldera (RES060 / RES093 / TER100)? */
function esSustitucionCaldera(ficha) {
    return ficha === 'RES060' || ficha === 'RES093' || ficha === 'TER100';
}

module.exports = {
    FICHAS,
    CORRELATIVO_INICIAL,
    correlativoInicial,
    fichaFromNumero,
    detectPrograma,
    esSustitucionCaldera,
};
