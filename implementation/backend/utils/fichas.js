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
//   · TER173 — Hibridación caldera + bomba de calor en el TERCIARIO, zona D1-D3.
//     El mismo desglose de tres servicios que la TER100, ponderado por el
//     coeficiente de cobertura por bivalencia C_b: es la RES093 del terciario.
// ============================================================================

const FICHAS = ['RES060', 'RES080', 'RES093', 'TER100', 'TER173'];

// Correlativo con el que arranca cada ficha cuando aún no hay expedientes del
// año. No es 1 en todas porque hay numeraciones heredadas del sistema anterior
// que no se pueden reutilizar: RES080 venía de 35 y TER100 tenía ya 2 expedientes
// antiguos, así que el primero de la app es el 3 (26TER100_3). TER173 nace en la
// app, así que arranca en 1 como RES060 y RES093.
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
 * Las fichas del TERCIARIO (TER100, TER173) solo pueden venir declaradas
 * explícitamente (`op.ficha`): no se deducen de los inputs, porque la calculadora
 * es residencial y nunca produce un terciario. En particular, `hibridacion` en los
 * inputs significa RES093 y no TER173: es la misma actuación en otro sector, y el
 * sector solo lo sabe quien da de alta la oportunidad.
 */
function detectPrograma(exp = {}, op = {}) {
    const porNumero = fichaFromNumero(exp.numero_expediente);
    if (porNumero) return porNumero;

    const opInputs = op.datos_calculo?.inputs || {};
    const opResult = op.datos_calculo?.result || {};

    // Una ficha del terciario ya DECLARADA manda sobre todo lo demás.
    if (op.ficha === 'TER173') return 'TER173';
    if (op.ficha === 'TER100') return 'TER100';

    const isHybrid = opInputs.hibridacion === true || op.ficha === 'RES093' || !!opResult.res093;

    // El SECTOR lo declara quien hace la simulación (`inputs.sector`), y se mira
    // ANTES que la reforma: la RES080 es "rehabilitación de edificios de VIVIENDAS"
    // y no existe en el terciario, así que un terciario nunca puede caer ahí.
    // Dentro del terciario la actuación la distingue la hibridación, igual que
    // RES060 y RES093 en el residencial.
    if (opInputs.sector === 'terciario') return isHybrid ? 'TER173' : 'TER100';

    const isReforma = opInputs.isReforma === true
        || ['onlyReforma', 'both'].includes(opInputs.reformaType)
        || op.ficha === 'RES080'
        || !!opResult.res080;
    if (isReforma) return 'RES080';
    return isHybrid ? 'RES093' : 'RES060';
}

/**
 * ¿Esta ficha actúa sobre el GENERADOR y no sobre la envolvente? Es decir, todas
 * menos la RES080. Decide, entre otras cosas, que una línea de "emisores" en una
 * factura sea incidencia (la ficha no admite tocar las unidades terminales) y que
 * no se pidan las fotos de ventanas, cubierta o fachada.
 */
function esSustitucionCaldera(ficha) {
    return ficha === 'RES060' || ficha === 'RES093' || ficha === 'TER100' || ficha === 'TER173';
}

/** ¿Es una ficha del sector TERCIARIO (tres servicios: calefacción · ACS · piscina)? */
function esTerciario(ficha) {
    return ficha === 'TER100' || ficha === 'TER173';
}

/** ¿Es una ficha de HIBRIDACIÓN en paralelo (el ahorro se pondera con el C_b)? */
function esHibridacion(ficha) {
    return ficha === 'RES093' || ficha === 'TER173';
}

module.exports = {
    FICHAS,
    CORRELATIVO_INICIAL,
    correlativoInicial,
    fichaFromNumero,
    detectPrograma,
    esSustitucionCaldera,
    esTerciario,
    esHibridacion,
};
