// ============================================================================
// climaFm.js — Por la vía del FACTOR MULTIPLICADOR el SCOP de CALEFACCIÓN es el
// del clima de la ZONA. El medio, elegido a mano para la vigente, aquí no vale.
//
// Las fichas FM (BOE-A-2026-23367, Anexo I de cada una) quitan el «al menos, el
// de clima medio» de la vigente (Anexo III de la RES060). Dicen que «se
// considerarán, en calefacción […], las zonas climáticas A, B, C y D como cálidas
// (warm) y la zona E como media». El «al menos medio» queda solo para el ACS.
//
// Una hibridación puede declarar la VIGENTE en medio (botón «Clima del SCOP»,
// `inputs.scopClima` / `instalacion.scop_clima`) porque le da más ahorro. Su
// cifra FM, en cambio, se calcula con el SCOP cálido y con el C_b de las horas
// cálidas (1.336 h). La vigente no se toca: la subsidiaria del Convenio FM sigue
// en medio.
// Caso: 26RES093_8 (D3, PANASONIC T-CAP 12 kW). Vigente en medio 32,75 MWh;
// la FM en medio daba 63,92 MWh y en cálido da 56,22.
//
// Detalle: docs/conocimiento/calculo/factor-multiplicador-la-resolucion-publicada-res060-fm.md
// ============================================================================

import {
    CLIMA_SCOP,
    calculateHybridization,
    climaScopForzado,
    redondeaScop,
    scopsParaClima,
    zoneClimateSeason,
} from './calculation.js';

/**
 * El SCOP de calefacción y la hibridación con los que se calcula la vía FM.
 *
 * @param {object} p
 * @param {object} p.src           inputs de la calculadora o `instalacion` del expediente
 *                                 (de ahí sale si se eligió el medio)
 * @param {string} p.zona          zona climática CTE ('D3'…)
 * @param {number} p.scopHeating   SCOP de la vigente
 * @param {object|null} p.hibridacion  { coverage, refPower, cb } de la vigente, o null
 * @param {object} p.hybridInputs  { method, heatPumpPower, boilerPower } para rehacer el C_b
 * @param {number} p.demandAnnual  demanda de calefacción (kWh/año) del C_b
 * @param {object|null} p.modelo   modelo del CATÁLOGO de la bomba (si se tiene)
 * @param {number} p.temp          temperatura de impulsión (35/45/55)
 * @param {string} [p.metodoCal]   método del SCOP ('ficha'…)
 * @param {number|null} [p.scopCalido]  SCOP cálido ya calculado (sin catálogo a mano:
 *                                 la `comparativaClima` guardada de la calculadora)
 * @returns {{ scopHeating:number, hibridacion:object|null, clima:object|null }}
 *   `clima`: null si no cambia nada. Si cambia, `{ ajustado:true, de, a, cbDe, cbA }`.
 *   Si no hay SCOP cálido, `{ sinCalido:true }`.
 */
export function entradasFmClima({
    src = {}, zona, scopHeating, hibridacion = null, hybridInputs = {}, demandAnnual = 0,
    modelo = null, temp = 55, metodoCal = 'ficha', scopCalido = null,
}) {
    const sinCambio = { scopHeating, hibridacion, clima: null };
    if (climaScopForzado(src) !== CLIMA_SCOP.MEDIO) return sinCambio;
    if (zoneClimateSeason(zona) !== CLIMA_SCOP.CALIDO) return sinCambio;

    let calido = Number.isFinite(parseFloat(scopCalido)) && parseFloat(scopCalido) > 0
        ? redondeaScop(scopCalido) : null;
    if (calido == null && modelo) {
        const s = scopsParaClima({ modelo, zona, temp, metodoCal, clima: null });
        // Solo si el catálogo trae de verdad la columna cálida: si cae al medio,
        // no se afirma un SCOP cálido que el fabricante no publica.
        if (s.scopTemporada === CLIMA_SCOP.CALIDO && s.scopHeating > 0) calido = redondeaScop(s.scopHeating);
    }
    if (!(calido > 0)) return { ...sinCambio, clima: { sinCalido: true } };

    let hib = hibridacion;
    if (hibridacion) {
        const h = calculateHybridization({
            demandAnnual,
            zone: zona,
            method: hybridInputs.method,
            heatPumpPower: hybridInputs.heatPumpPower,
            boilerPower: hybridInputs.boilerPower,
            climateSeason: CLIMA_SCOP.CALIDO,
        });
        hib = { coverage: h.coverage, refPower: h.refPower, cb: h.cb };
    }
    return {
        scopHeating: calido,
        hibridacion: hib,
        clima: { ajustado: true, de: redondeaScop(scopHeating), a: calido, cbDe: hibridacion?.cb ?? null, cbA: hib?.cb ?? null },
    };
}
