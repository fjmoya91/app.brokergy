import { FACTORES_PASO } from '../../calculator/logic/calculation.js';

// ─── autoconsumoMaximo.js ────────────────────────────────────────────────────
// Cuánta energía de AUTOCONSUMO se puede declarar como máximo en un CEE.
//
// El certificado no declara el consumo eléctrico en kWh: declara las emisiones.
// El consumo real se recupera deshaciendo el factor de paso —el mismo número que
// usa el método simplificado del RES080— sobre el TOTAL del edificio:
//
//     consumo eléctrico (kWh/año) = TotalConsumoElectrico (kgCO2/año) / 0,331
//
// Y ese es el techo: no se puede declarar más autoconsumo que consumo eléctrico
// tiene el edificio. Medido contra un CEE real: 1.840,79 / 0,331 = 5.561,30.
//
// REGLA — se usa el TOTAL del edificio (`TotalConsumoElectrico`, kgCO2/AÑO), no
// `ConsumoElectrico`, que va por m² y año. Confundirlos da un techo del orden de
// la superficie: en el CEE medido, 7,30 en vez de 1.840,79.
//
// REGLA — el factor sale de FACTORES_PASO, no escrito a mano. Es el mismo 0,331
// con el que se calcula el ahorro del RES080; si algún día cambia el mix
// eléctrico oficial, no puede cambiar en un sitio y no en el otro.

export const FACTOR_ELECTRICIDAD = FACTORES_PASO['Electricidad peninsular'];

/**
 * @param {object|null} cee  CEE parseado (`parseCeeXml`) o rescatado del XML
 * @returns {{kwhAnio:number, emisiones:number, factor:number}|null}
 *          null si el certificado no declara el total eléctrico — pasa con los
 *          cargados por OCR de un PDF, que no trae esa tabla.
 */
export function autoconsumoMaximo(cee) {
    const emisiones = Number(cee?.emisionesTotalElectrico);
    if (!isFinite(emisiones) || emisiones <= 0) return null;
    const factor = FACTOR_ELECTRICIDAD;
    if (!isFinite(factor) || factor <= 0) return null;
    return { kwhAnio: emisiones / factor, emisiones, factor };
}
