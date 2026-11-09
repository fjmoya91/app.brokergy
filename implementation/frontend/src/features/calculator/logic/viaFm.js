/**
 * La VÍA DEL FACTOR MULTIPLICADOR frente a la VIGENTE, en escalares.
 *
 * Es lo que se guarda con la oportunidad (`datos_calculo.via_fm`) para que la tabla
 * de Oportunidades enseñe cuánto sale por cada vía sin traer el `datos_calculo`
 * entero (regla 22): unos 300 bytes por fila.
 *
 * Lo escribe `payloadOportunidad` al guardar (con el `result` de la calculadora,
 * que ya trae `res060fc` y `financialsRes060FC`) y el relleno de las antiguas
 * (`scripts/backfill_via_fm.mjs`), que recalcula el motor publicado con lo guardado.
 *
 * REGLA — es de ADMIN. Lleva importes del bono por las dos vías y la elegibilidad
 * del FM; el backend lo quita a todo el que no es ADMIN junto con el margen
 * (`utils/financialScrub.js`).
 *
 * REGLA — el € de la vía FM sale con las MISMAS reglas que el de la vigente: es
 * `calculateFinancials` con los kWh del FM. Al rellenar las antiguas no se rehace
 * ese cálculo: el bono es lineal en los MWh (MWh × precio al cliente × IVA −
 * legalización, `calculateFinancials`), y esos tres datos van guardados en
 * `result.financials`.
 *
 * REGLA — la vía FM tiene SU precio, como la opción RES080 (Fran, 7/11/2026: «mismo
 * precio para ambos, pero dar la posibilidad de elegir precio por formato de
 * ficha»). Es `caePriceClientFm` (`precioCaeFm`, calculation.js): sin teclear, el
 * general. La calculadora ya trae `financialsRes060FC` hecho con él; al rellenar,
 * se desplaza el precio final guardado (`precioFinalFm`). Si difiere del general,
 * el resumen lo dice (`precio_fm` / `precio_vigente`).
 *
 * REGLA — sin ACS en la simulación, la cifra FM lo SUMA como si se añadiera y el
 * resumen lo marca (`acs: 'supuesto'`; sin SCOP_dhw, `acs: 'sin_scop'` y la cifra
 * es solo la calefacción). Es un aviso, no un bloqueo (Fran, 07/11/2026).
 */
import { calculateRes060FM, contextoCalderaFc, FM_NORMATIVA } from './res060fc.js';
import { calculateRes080FM } from './res080fm.js';
import { redondeaScop, precioCaeFm } from './calculation.js';
import { esBloque } from './tipoInmueble.js';

/**
 * Versión del resumen: sube si cambia su forma o el criterio con el que se calcula.
 * 2 (07/11/2026): sin ACS, la vía FM lo suma como si se añadiera (`acs`).
 * 3 (09/11/2026): una oportunidad SOLO de rehabilitación compara la RES080_FM con la
 *   RES080 vigente (`ficha: 'RES080_FM'`, `estimada` si faltan los CEE simulados).
 */
export const VIA_FM_VERSION = 3;

const soloReforma = (inputs = {}) => cierto(inputs.isReforma) && inputs.comparativaReforma === false;

/**
 * Resumen RES080_FM frente a la RES080 vigente (oportunidad solo de rehabilitación):
 * `result.res080fm` y `result.financialsRes080FM` (o el bono lineal con el precio
 * final de la RES080, que es el mismo: la RES080_FM va al precio de la opción RES080).
 */
function resumenViaFm080(result, { hoy = null } = {}) {
    const fm = result?.res080fm;
    if (!fm || fm.normativa !== FM_NORMATIVA) return null;
    const kwhVig = Number(result?.res080?.ahorroEnergiaFinalTotal) || 0;
    const eurVig = Number(result?.financialsRes080?.caeBonus) || 0;
    const kwhFm = Number(fm.cae) || 0;
    const bloquea = (fm.avisos || []).find((a) => a.tono === 'bloquea');
    // Sin CEE simulados y sin datos para estimarlos no hay cifra: «sin calcular», no
    // un FM de 0 € que la columna leería como pérdida (26RES080_OP93, 09/11/2026).
    if (!(kwhFm > 0) && !bloquea) return null;
    const eurFm = result?.financialsRes080FM
        ? Number(result.financialsRes080FM.caeBonus) || 0
        : bonoConKwh(result?.financialsRes080, kwhFm);
    return {
        v: VIA_FM_VERSION,
        normativa: FM_NORMATIVA,
        ficha: fm.ficha,
        aplica: true,
        mwh_vigente: r2(kwhVig / 1000),
        mwh_fm: r2(kwhFm / 1000),
        eur_vigente: r0(eurVig),
        eur_fm: r0(eurFm),
        elegible: fm.elegible !== false,
        ...(bloquea ? { motivo: String(bloquea.texto).slice(0, 220) } : {}),
        // Sin los dos CEE simulados la cifra es una estimación.
        ...(fm.estimada ? { estimada: true } : {}),
        n_avisos: (fm.avisos || []).filter((a) => a.tono === 'aviso').length,
        calculado: String(hoy || new Date().toISOString()).slice(0, 10),
    };
}

const cierto = (v) => v === true || v === 'true' || v === 1 || v === '1';
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r0 = (v) => Math.round(Number(v) || 0);

/**
 * El bono del cliente con OTROS kWh y las reglas guardadas en `financials`
 * (la misma cuenta que `calculateFinancials`): MWh × precio × IVA − legalización.
 */
export function bonoConKwh(financials = {}, kwh = 0, precio = null) {
    const p = Number(precio ?? financials.finalPriceClient) || 0;
    const conIva = financials.isParticular === false && cierto(financials.includeIVA);
    const legal = Number(financials.legalizationCost) || 0;
    return Math.max(0, (Number(kwh) || 0) / 1000 * p * (conIva ? 1.21 : 1) - legal);
}

/**
 * El €/MWh que le queda al CLIENTE por la vía FM (ya restado su descuento, p. ej. la
 * comisión que se le resta a él), desde lo guardado de la vigente. El descuento es
 * por MWh y no depende del precio, así que basta con desplazar `finalPriceClient`
 * lo que el precio FM difiere del general. `precioFm` (opcional) manda sobre el
 * tecleado en la oportunidad.
 */
export function precioFinalFm(financials = {}, inputs = {}, precioFm = null) {
    const final = Number(financials?.finalPriceClient) || 0;
    const general = parseFloat(inputs?.caePriceClient) || 0;
    const fm = Number(precioFm ?? precioCaeFm(inputs)) || 0;
    if (!fm || fm === general) return final;
    if (!general) return fm; // sin precio general guardado no se sabe el descuento
    return Math.max(0, final + (fm - general));
}

/** Por qué la comparativa no aplica a esta oportunidad, o null si aplica. */
function noAplica(inputs = {}) {
    if (String(inputs.sector || '').toLowerCase() === 'terciario') return 'terciario: no hay ficha FM';
    if (cierto(inputs.isReforma) && inputs.comparativaReforma === false) return 'solo rehabilitación (RES080)';
    return null;
}

/**
 * Resumen de las dos vías a partir del `result` de la calculadora.
 * Devuelve null si no hay cálculo FM (o si es del BORRADOR, sin `normativa`).
 */
export function resumenViaFm(result, inputs = {}, { precioFm = null, hoy = null } = {}) {
    if (soloReforma(inputs) && result?.res080fm) return resumenViaFm080(result, { hoy });
    const fm = result?.res060fc;
    if (!fm || fm.normativa !== FM_NORMATIVA) return null;
    const kwhVig = Number(result?.savings?.savingsKwh) || 0;
    const eurVig = Number(result?.financials?.caeBonus) || 0;
    const kwhFm = Number(fm.cae) || 0;
    // La calculadora ya hizo `financialsRes060FC` con el precio FM; si no está (relleno)
    // o se pide otro precio, el bono lineal con el precio final desplazado.
    const eurFm = precioFm == null && result?.financialsRes060FC
        ? Number(result.financialsRes060FC.caeBonus) || 0
        : bonoConKwh(result?.financials, kwhFm, precioFinalFm(result?.financials, inputs, precioFm));
    const precioGeneral = parseFloat(inputs?.caePriceClient) || 0;
    const precioFmBase = Number(precioFm ?? precioCaeFm(inputs)) || 0;
    const precioPropio = precioGeneral > 0 && precioFmBase > 0 && precioFmBase !== precioGeneral;
    const bloquea = (fm.avisos || []).find((a) => a.tono === 'bloquea');
    const motivoNoAplica = noAplica(inputs);
    return {
        v: VIA_FM_VERSION,
        normativa: FM_NORMATIVA,
        ficha: fm.ficha,
        aplica: !motivoNoAplica,
        ...(motivoNoAplica ? { no_aplica: motivoNoAplica } : {}),
        mwh_vigente: r2(kwhVig / 1000),
        mwh_fm: r2(kwhFm / 1000),
        eur_vigente: r0(eurVig),
        eur_fm: r0(eurFm),
        // Solo si la vía FM va a otro €/MWh que la vigente (precio del cliente, antes de comisión).
        ...(precioPropio ? { precio_vigente: r2(precioGeneral), precio_fm: r2(precioFmBase) } : {}),
        elegible: fm.elegible !== false,
        ...(bloquea ? { motivo: String(bloquea.texto).slice(0, 220) } : {}),
        // Sin ACS en la simulación: la cifra FM lo supone añadido, o (sin SCOP_dhw) no lo lleva.
        ...(fm.acsSupuesto ? { acs: 'supuesto' } : fm.acsSinScop ? { acs: 'sin_scop' } : {}),
        n_avisos: (fm.avisos || []).filter((a) => a.tono === 'aviso').length,
        dcal: fm.dcalFuente || null,
        calculado: String(hoy || new Date().toISOString()).slice(0, 10),
    };
}

/**
 * Recalcula la vía FM con el motor PUBLICADO desde un `datos_calculo` guardado, con
 * los mismos valores por defecto que la calculadora (`sanitizedInputs`). Para el
 * relleno de las oportunidades antiguas. Devuelve el resumen o null.
 */
export function viaFmDesdeDatosCalculo(dc = {}, opciones = {}) {
    const inputs = dc?.inputs || {};
    const result = dc?.result || {};
    const num = (v) => parseFloat(v) || 0;
    // Solo rehabilitación: la RES080_FM con los CEE de la oportunidad y el RES080 guardado.
    if (soloReforma(inputs) && result.res080 && result.financialsRes080) {
        const fm080 = calculateRes080FM({
            res080: result.res080,
            ceeInicial: inputs.xmlDemandData || null,
            ceeFinal: inputs.xmlDemandDataFinal || null,
            efSimBC: num(inputs.efSimBC) || null,
            efSimRest: num(inputs.efSimRest) || null,
            tipo: inputs.tipo,
            bloque: esBloque(inputs),
            contexto: contextoCalderaFc(inputs),
        });
        if (!fm080) return null;
        return resumenViaFm080({ ...result, res080fm: fm080, financialsRes080FM: null }, opciones);
    }
    if (!result.savings || !result.financials) return null;
    const superficie = num(inputs.manualSuperficie) > 0
        ? num(inputs.manualSuperficie)
        : (num(inputs.superficieCalefactable) || num(inputs.superficie) || num(result.res060fc?.superficie) || num(dc.surface));
    const hyb = result.hybridization;
    const fm = calculateRes060FM({
        provinciaCode: inputs.provincia || inputs.provinceCode,
        anio: inputs.anio || dc.anio,
        tipo: inputs.tipo,
        bloque: esBloque(inputs),
        zona: inputs.zona || dc.zona,
        superficie,
        boilerEff: num(inputs.boilerEff) || 0.92,
        boilerId: inputs.boilerId,
        scopHeating: redondeaScop(inputs.scopHeating) || 3.2,
        scopAcs: redondeaScop(inputs.scopAcs) || 3.0,
        changeAcs: cierto(inputs.changeAcs),
        // Como la calculadora: el alcance de la calefacción solo cuenta en un bloque.
        changeHeating: esBloque(inputs) ? !(inputs.changeHeating === false || inputs.changeHeating === 'false') : true,
        qCalefaccion: num(result.Q_net),
        ceeInicial: inputs.xmlDemandData || null,
        ceeFinal: inputs.xmlDemandDataFinal || null,
        hibridacion: hyb ? { coverage: hyb.coverage, refPower: hyb.refPower, cb: hyb.cb } : null,
        contexto: { ...contextoCalderaFc(inputs), ceeFinal: inputs.xmlDemandDataFinal || null },
    });
    if (!fm) return null;
    return resumenViaFm({ res060fc: fm, savings: result.savings, financials: result.financials }, inputs, opciones);
}
