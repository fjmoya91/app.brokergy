/**
 * Convierte el `funnelData` (respuestas del cliente sin experiencia) en
 * `calculatorInputs` (el formato exacto que entiende CalculatorView).
 *
 * Mapea AMBOS esquemas de caldera para que admin vea correctamente:
 *   - boilerId + boilerEff → desplegable RES060 (aerotermia)
 *   - boilerHeatingType + boilerAcsType (como labels) → desplegable RES080 (reforma)
 */

import { mapBoiler, mapAcsType, shouldWarnBiomasa } from './boilerMapping';
import { mapEmisor } from './emisoresMapping';

/**
 * Inferencia automática del estado de aislamiento a partir del año de
 * construcción del catastro. Coincide con la lógica de la calculadora
 * (getUByYear de calculation.js):
 *   < 1980 → sin aislamiento (NBE-CT-79 aún no vigente)
 *   1980-2006 → antigua mal aislada
 *   2007-2013 → antigua aislamiento medio (CTE 2006)
 *   2014+ → bien aislada (CTE-DB-HE 2013+)
 */
function inferInsulationStateByYear(anio) {
    const y = Number(anio) || 0;
    if (y === 0 || y < 1980) return 'sin_aislamiento';
    if (y < 2007) return 'antigua_mal_aislamiento';
    if (y < 2014) return 'antigua_aislamiento_medio';
    return 'bien_aislada';
}

function funnelToCalculatorInputs(funnel, catastro) {
    const boilerMap = mapBoiler(funnel);
    const emisor = mapEmisor(funnel.emisor_tipo);

    // Label de calefacción para RES080: si no hay caldera de calefacción, usar
    // el especial 'No tiene Calefacción'. En la landing siempre se pregunta
    // combustible, así que esto solo aplica si combustible_actual viene vacío.
    const heatingLabel = funnel.combustible_actual
        ? boilerMap.boilerHeatingTypeLabel
        : 'No tiene Calefacción';

    // Label de ACS: si el usuario no respondió, default a 'Butano' (petición usuario)
    const acsLabel = mapAcsType(funnel.boiler_acs_type, heatingLabel);

    const inputs = {
        // ---- Vivienda (de catastro) ----
        rc: catastro.ref_catastral || catastro.rc,
        zona: catastro.zona || 'D3',
        anio: Number(catastro.yearBuilt || catastro.anio || 2000),
        superficie: Number(catastro.superficie || catastro.totalSurface || 120),
        superficieCalefactable: Number(catastro.superficieCalefactable || catastro.superficie || 120),
        plantas: Number(catastro.plantas || catastro.floors?.total || 2),
        participation: Number(
            (catastro.participation && parseFloat(String(catastro.participation).replace(',', '.'))) || 100
        ),
        tipo: catastro.tipo || (Number(catastro.participation) < 100 ? 'piso' : 'unifamiliar'),

        // ---- Caldera (DOS esquemas a la vez) ----
        // Para desplegable RES060 (aerotermia):
        boilerId: boilerMap.boilerId,
        boilerEff: boilerMap.boilerEff,
        fuelType: boilerMap.fuelType,
        // Para desplegable RES080 (reforma estimada):
        boilerHeatingType: heatingLabel,
        boilerAcsType: acsLabel,

        // ---- ACS ----
        changeAcs: !!funnel.incluir_acs,
        scopAcs: 3.0,

        // ---- Emisores → SCOP heating ----
        emitterType: emisor.emitterType,
        scopHeating: emisor.scopHeating,

        // ---- Aislamiento inferido automáticamente por año ----
        insulationState: inferInsulationStateByYear(catastro.yearBuilt || catastro.anio),

        // ---- Reforma (RES080) ----
        isReforma: !!funnel.isReforma,
        reformaType: funnel.isReforma ? 'estimated' : 'none',
        reformaVentanas: !!funnel.reforma_elementos?.ventanas,
        reformaCubierta: !!funnel.reforma_elementos?.cubierta,
        reformaSuelo: !!funnel.reforma_elementos?.suelo,
        reformaParedes: !!funnel.reforma_elementos?.paredes,

        // ---- Gasto y ahorro ----
        savingsMode: funnel.gasto_anual_eur > 0 ? 'real' : 'theoretical',
        gastoAnualReal: Number(funnel.gasto_anual_eur) || 0,
        includeAnnualSavings: true,

        // ---- Presupuesto ----
        presupuesto: funnel.presupuesto_modo === 'tengo' && funnel.presupuesto_eur > 0
            ? Number(funnel.presupuesto_eur)
            : 15000,

        // ---- Titular y cliente ----
        titularType: funnel.titular_type || 'particular',
        numOwners: 1,
        includeIrpf: funnel.titular_type !== 'empresa',
        referenciaCliente: '',

        // ---- Demanda ----
        demandMode: 'estimated',
        xmlDemandData: null,

        // ---- Precios CAE (defaults — el admin afina) ----
        caePriceClient: 95,
        caePriceSO: 160
    };

    return inputs;
}

export { funnelToCalculatorInputs, shouldWarnBiomasa };
