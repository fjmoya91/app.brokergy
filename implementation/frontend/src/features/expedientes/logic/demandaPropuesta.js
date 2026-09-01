/**
 * La demanda de calefacción y la superficie que se usaron en la SIMULACIÓN de la
 * oportunidad, para poder cruzarlas de un vistazo con las que certifica el CEE.
 *
 * Por qué existe: el bono CAE se prometió sobre esas dos cifras. Si el CEE
 * certifica menos demanda —o menos superficie—, el ahorro real baja y el bono
 * también, y eso se descubría al generar el CIFO, con el cliente ya
 * comprometido. La app solo lo avisaba en el instante de soltar el .xml
 * (`processXmlFile` en CeeModule); al reabrir el expediente el aviso ya no estaba.
 *
 * REGLA — la demanda se compara SIN multiplicar por la superficie, y la
 * superficie se compara aparte. Son dos desvíos con causas distintas: la demanda
 * habla de la envolvente y la superficie, de qué se midió. Multiplicadas, un
 * error se come al otro — una demanda un 10 % más baja sobre una superficie un
 * 10 % mayor da un total idéntico y no se ve nada.
 *
 * Fuente única: la usan el botón de info de la rejilla CEE y el aviso de subida
 * del .xml.
 */

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

// Redondeos del .cex y de la propia herramienta del certificador: por debajo de
// esto no hay nada que mirar. Es la misma holgura con la que se compara el CEE
// inicial con el final.
const HOLGURA_PCT = 2;

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

const delta = (cee, prop) => (prop > 0 ? ((cee - prop) / prop) * 100 : null);

/**
 * Cruza el CEE de una fase con la propuesta. Devuelve los dos desvíos por
 * separado; quién pinta decide el color.
 *
 * @param ceeFase  objeto parseado del .xml de esa fase (demandaCalefaccion en
 *                 kWh/m²·año + superficieHabitable en m²)
 * @param prop     lo que devuelve demandaPropuesta()
 */
export function compararDemanda(ceeFase, prop) {
    if (!prop) return null;
    const qm2 = num(ceeFase?.demandaCalefaccion);
    const sup = num(ceeFase?.superficieHabitable);
    if (!qm2 && !sup) return null;   // el CEE aún no está cargado: nada que cruzar

    const dDemanda = qm2 && prop.qm2 ? delta(qm2, prop.qm2) : null;
    const dSup = sup && prop.superficie ? delta(sup, prop.superficie) : null;

    const demandaBaja = dDemanda != null && dDemanda < -HOLGURA_PCT;
    const supBaja = dSup != null && dSup < -HOLGURA_PCT;

    return {
        demanda: { prop: prop.qm2, cee: qm2, deltaPct: dDemanda, baja: demandaBaja },
        superficie: { prop: prop.superficie, cee: sup, deltaPct: dSup, baja: supBaja },
        // El total sigue calculándose porque es lo que acaba viajando al CIFO,
        // pero es un dato secundario: no decide el aviso.
        total: { prop: prop.total, cee: qm2 && sup ? qm2 * sup : 0 },
        alerta: demandaBaja || supBaja,
    };
}

export const fmtKwh = (n) => Math.round(num(n)).toLocaleString('es-ES');
export const fmtDec = (n) => num(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Un decimal mientras el desvío es pequeño (es donde se mira el detalle) y
// entero a partir del 100 %: "+1.033,8 %" no cabe en el popover de 320 px y el
// decimal ahí no dice nada.
export const fmtPct = (n) => {
    const a = Math.abs(n);
    return `${n >= 0 ? '+' : '−'}${a.toLocaleString('es-ES', { maximumFractionDigits: a >= 100 ? 0 : 1 })} %`;
};
