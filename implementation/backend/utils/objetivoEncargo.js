// ============================================================================
// objetivoEncargo.js — lo que el CEE tiene que alcanzar para que el ahorro que
// se le presupuestó al cliente se pueda CERTIFICAR.
//
// De la demanda de calefacción y de la superficie útil sale el ahorro en MWh
// del expediente (RES060 / RES093 / TER): si el certificado da menos, se
// certifica menos. En un RES080 lo que manda es el ahorro de energía final.
//
// Fuente ÚNICA de esas cifras para las dos superficies que se las enseñan al
// técnico: el email del encargo (`notify-certificador`) y la página del encargo
// (`encargoTecnico`). Si cada una las calculara por su cuenta, el técnico
// podría leer una demanda objetivo en el correo y otra en su página.
// ============================================================================

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * @param {object|null} op  la oportunidad (con `ficha` y `datos_calculo`)
 * @returns {{ficha: string, esReforma: boolean, superficieRef: number|null,
 *            demandaPerM2: number|null, demandaObjetivoTotal: number|null,
 *            ahorroObjetivo: number|null}}
 */
function objetivosEncargo(op) {
    const ficha = op?.ficha || 'RES060';
    const dc = op?.datos_calculo || {};
    const result = dc.result || {};
    const inputs = dc.inputs || {};

    // Demanda objetivo: se prioriza kWh/m²·año (q_net) sobre el total (Q_net).
    const superficieRef = num(inputs.superficieCalefactable) || num(inputs.surface);
    const demandaPerM2 =
        num(result.q_net) ||
        num(inputs.demand_per_m2) ||
        num(inputs.demandaCalefaccion) ||
        (superficieRef && num(result.Q_net) ? num(result.Q_net) / superficieRef : null);
    const demandaObjetivoTotal =
        num(result.Q_net) ||
        num(dc.Q_net) ||
        (superficieRef && demandaPerM2 ? superficieRef * demandaPerM2 : null);
    const ahorroObjetivo = num(result.res080?.ahorroEnergiaFinalTotal);

    return { ficha, esReforma: ficha === 'RES080', superficieRef, demandaPerM2, demandaObjetivoTotal, ahorroObjetivo };
}

module.exports = { objetivosEncargo };
