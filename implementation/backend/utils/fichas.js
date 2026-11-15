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

// ── Vía del FACTOR MULTIPLICADOR (BOE-A-2026-23367, en vigor el 08/11/2026) ──────
// Un expediente que va por la vía FM lleva «FM» PEGADO a su ficha: 26RES060FM_12,
// 26RES093FM_3 (la hibridación, cuya ficha oficial depende de la zona: RES090_FM…
// RES094_FM). El CONTADOR es el de su ficha (Fran, 09/11/2026, en lugar de la serie
// propia del 07/11): 26RES060_N y 26RES060FM_N comparten correlativo, así que pasar
// de una vía a la otra CONSERVA el número y solo pone o quita el «FM»
// (26RES060_227 ⇄ 26RES060FM_227), y una obra que nace FM coge el siguiente de su
// ficha. Ver `correlativoEnContador` y `numeroEnOtraVia`.
//
// REGLA — el «FM» va pegado a la ficha y no como segmento aparte: así `RES060` y
// `RES093` siguen dentro del número y todos los `includes('RES093')` de la app
// (cálculo, CIFO, Anexo Fotográfico, lotes…) lo siguen tratando como lo que es.
// `fichaFromNumero('26RES060FM_12')` es RES060 a propósito; la VÍA se pregunta aparte
// con `esNumeroFm`.
// Solo residencial: la Resolución no trae fichas FM para el terciario. La RES080_FM
// (rehabilitación profunda, cuatro CEE: calculator/logic/res080fm.js) entra el
// 09/11/2026 con su serie 26RES080FM_N.
const FICHAS_CON_FM = ['RES060', 'RES080', 'RES093'];
const SUFIJO_FM = 'FM';

/** ¿El número es de la vía FM? ('26RES060FM_12' → true, '26RES060_12' → false). */
function esNumeroFm(numeroExpediente) {
    return /^\d{2}(RES060|RES080|RES093)FM_\d+$/i.test(String(numeroExpediente || '').trim());
}

/** ¿Esta ficha admite la vía FM? */
function admiteViaFm(ficha) {
    return FICHAS_CON_FM.includes(ficha);
}

/**
 * Prefijo con el que se ESCRIBE el número: el programa, con «FM» si va por esa vía y
 * la ficha la admite ('RES060', true → 'RES060FM'). El correlativo NO sale de aquí
 * sino del contador de la ficha (`serieBase`): las dos vías comparten número.
 */
function serieNumeracion(programa, viaFm = false) {
    return viaFm && admiteViaFm(programa) ? `${programa}${SUFIJO_FM}` : programa;
}

/** Ficha cuyo contador usa una serie: 'RES060FM' → 'RES060'; 'RES060' → 'RES060'. */
function serieBase(serie) {
    const s = String(serie || '').toUpperCase();
    const base = s.endsWith(SUFIJO_FM) ? s.slice(0, -SUFIJO_FM.length) : s;
    return admiteViaFm(base) ? base : s;
}

/**
 * Correlativo de un número dentro del CONTADOR de su ficha, con o sin «FM», o null
 * si es de otro. '26RES060_12' y '26RES060FM_12' en el contador 26RES060 (o
 * 26RES060FM) → 12; '26RES060FC_3' → null. El `LIKE '26RES060%'` casa más cosas
 * (`_` es un comodín), así que se filtra con esta regex exacta.
 */
function correlativoEnContador(numeroExpediente, prefijoAnioSerie) {
    const p = String(prefijoAnioSerie || '').toUpperCase();
    const m2 = p.match(/^(\d{2})(.+)$/);
    const prefijo = m2 ? `${m2[1]}${serieBase(m2[2])}` : p;
    const m = String(numeroExpediente || '').trim().toUpperCase()
        .match(new RegExp(`^${prefijo}(?:${SUFIJO_FM})?_(\\d+)$`));
    return m ? parseInt(m[1], 10) : null;
}

/**
 * El mismo número en la OTRA vía: pone o quita el «FM» y conserva año y correlativo
 * ('26RES060_227', true → '26RES060FM_227'; y al revés). Null si el número no tiene
 * la forma de una ficha con FM (un número manual raro): entonces el que llama decide.
 */
function numeroEnOtraVia(numeroExpediente, activar) {
    const m = String(numeroExpediente || '').trim().toUpperCase()
        .match(/^(\d{2})(RES060|RES080|RES093)(FM)?_(\d+)$/);
    if (!m) return null;
    const correlativo = parseInt(m[4], 10);
    return { numero: `${m[1]}${m[2]}${activar ? SUFIJO_FM : ''}_${correlativo}`, correlativo };
}

/**
 * ¿La oportunidad se aceptó por la vía FM? (`inputs.ruta_fm`, lo marca la calculadora
 * al aceptar y `cambiarViaFm` al cambiar de vía en el expediente).
 *
 * ⚠️ NO se llama `via_fm`: esa clave es el resumen de las dos vías de
 * `datos_calculo.via_fm` (calculator/logic/viaFm.js), y `financialScrub` borra
 * TODA clave `via_fm` del árbol a quien no es ADMIN — también dentro de `inputs`.
 * Un TRABAJADOR que abriera la calculadora y guardara se la habría llevado por delante.
 */
function oportunidadViaFm(op = {}) {
    return op?.datos_calculo?.inputs?.ruta_fm === true;
}

/**
 * Correlativo de un número DENTRO de su serie EXACTA, o null si el número es de otra.
 * '26RES060_12' en la serie 26RES060 → 12; '26RES060FM_12' en esa misma serie →
 * null. La numeración ya no la usa (cuenta con `correlativoEnContador`, que junta
 * las dos vías); queda para quien necesite distinguir la serie escrita.
 */
function correlativoEnSerie(numeroExpediente, prefijoAnioSerie) {
    const m = String(numeroExpediente || '').trim().toUpperCase()
        .match(new RegExp(`^${prefijoAnioSerie.toUpperCase()}_(\\d+)$`));
    return m ? parseInt(m[1], 10) : null;
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
    FICHAS_CON_FM,
    esNumeroFm,
    admiteViaFm,
    serieNumeracion,
    serieBase,
    oportunidadViaFm,
    correlativoEnSerie,
    correlativoEnContador,
    numeroEnOtraVia,
};
