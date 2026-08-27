/**
 * La demanda de calefacción que se SIMULÓ en la oportunidad, para poder
 * compararla de un vistazo con la que certifica el CEE.
 *
 * Por qué existe: el bono CAE se prometió sobre la demanda de la propuesta.
 * Si el CEE certifica MENOS demanda, el ahorro real baja y el bono también —
 * y eso se descubría al generar el CIFO, con el cliente ya comprometido. La
 * app solo lo avisaba en el instante de soltar el .xml (`processXmlFile` en
 * CeeModule); al volver a abrir el expediente ese aviso ya no estaba.
 *
 * REGLA — se compara en kWh/AÑO, no en kWh/m²·año. La superficie del CEE y la
 * de la simulación no tienen por qué coincidir (medido: 26RES080_72, 95 m²
 * simulados frente a 127 m² certificados): comparar los valores por metro
 * cuadrado daría un déficit que no existe, o lo escondería.
 *
 * Fuente única: la usan la rejilla del módulo CEE y el aviso de subida de .xml.
 */

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Superficie sobre la que se calculó la propuesta. En modo MANUAL/cálculo real
 * manda la del CEE que se tecleó (`manualSuperficie`); si no, la estimada.
 */
function superficiePropuesta(dc, result) {
    return num(result?.superficieAplicada)
        || (String(dc?.demandMode) === 'manual' ? num(dc?.manualSuperficie) : 0)
        || num(dc?.superficieCalefactable)
        || num(dc?.manualSuperficie);
}

/**
 * @returns {{ qm2:number, total:number, superficie:number, modo:string }|null}
 *          null si la oportunidad no llegó a calcular demanda (p. ej. un CEE
 *          directo, que no tiene oportunidad detrás).
 */
export function demandaPropuesta(expediente) {
    const op = expediente?.oportunidades;
    if (!op) return null;
    const dc = op.datos_calculo || {};
    const result = dc.result || {};
    const superficie = superficiePropuesta(dc, result);

    // `result` es el resultado canónico; los expedientes viejos guardaron el
    // total en la raíz de datos_calculo, y la columna `demanda_calefaccion`
    // es el respaldo del valor por m² (lo escribe SaveOpportunityModal).
    let qm2 = num(result.q_net) || num(op.demanda_calefaccion) || num(dc.q_net);
    let total = num(result.Q_net) || num(dc.Q_net);

    if (!total && qm2 && superficie) total = qm2 * superficie;
    if (!qm2 && total && superficie) qm2 = total / superficie;
    if (!total && !qm2) return null;

    return { qm2, total, superficie, modo: dc.demandMode || 'estimated' };
}

/**
 * Cruza el CEE de una fase con la propuesta.
 *
 * @param ceeFase  el objeto parseado del .xml de esa fase (demandaCalefaccion
 *                 en kWh/m²·año + superficieHabitable)
 * @param prop     lo que devuelve demandaPropuesta()
 * @returns {{ totalCee:number, deltaPct:number, deficit:boolean }|null}
 */
export function compararDemanda(ceeFase, prop, { juzgaDeficit = true } = {}) {
    if (!prop || !prop.total) return null;
    const qm2 = num(ceeFase?.demandaCalefaccion);
    const sup = num(ceeFase?.superficieHabitable);
    if (!qm2 || !sup) return null;

    const totalCee = qm2 * sup;
    const deltaPct = ((totalCee - prop.total) / prop.total) * 100;
    // Mismo criterio que el aviso al subir el .xml: la demanda certificada debe
    // IGUALAR O SUPERAR la propuesta. Se deja un 2 % de holgura, el mismo que
    // se aplica al comparar el CEE inicial con el final (redondeos del .cex).
    // En un RES080 el ahorro NO sale de la demanda (se calcula por emisiones o por
    // energía final), así que ahí una demanda certificada menor no significa que el
    // bono se caiga: se enseña la diferencia, pero sin pintarla como problema.
    return { totalCee, deltaPct, deficit: juzgaDeficit && deltaPct < -2 };
}

export const fmtKwh = (n) => Math.round(num(n)).toLocaleString('es-ES');
export const fmtM2 = (n) => num(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
