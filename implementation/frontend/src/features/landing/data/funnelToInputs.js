/**
 * Convierte el `funnelData` (respuestas del cliente sin experiencia) en
 * `calculatorInputs` (el formato exacto que entiende CalculatorView).
 *
 * El backend (leadService.createLead) almacena AMBOS objetos en
 * datos_calculo.inputs y datos_calculo.landing_funnel respectivamente.
 * Si el técnico abre la oportunidad luego, los inputs ya están listos.
 */

import { mapBoiler, shouldWarnBiomasa } from './boilerMapping';
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

/**
 * @param {object} funnel    Respuestas raw del funnel.
 * @param {object} catastro  Datos resueltos del catastro.
 * @returns {object} calculatorInputs listo para guardar.
 */
function funnelToCalculatorInputs(funnel, catastro) {
    const { boilerHeatingType, boilerEff, fuelType } = mapBoiler(funnel);
    const emisor = mapEmisor(funnel.emisor_tipo);

    // Edad y participación llegan del catastro; el resto se completa con
    // defaults razonables que el técnico puede afinar en la calculadora.
    const inputs = {
        // Vivienda (de catastro o defaults)
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

        // Caldera + combustible (mapeo del funnel)
        boilerHeatingType,
        boilerEff,
        fuelType,

        // ACS
        changeAcs: !!funnel.incluir_acs,
        boilerAcsType: funnel.boiler_acs_type || '',
        scopAcs: 3.0,

        // Emisores → SCOP heating
        emitterType: emisor.emitterType,
        scopHeating: emisor.scopHeating,

        // Aislamiento inferido automáticamente por año de construcción
        insulationState: inferInsulationStateByYear(catastro.yearBuilt || catastro.anio),

        // Reforma (RES080) si aplica
        isReforma: !!funnel.isReforma,
        reformaType: funnel.isReforma ? 'estimated' : 'none',
        reformaVentanas: !!funnel.reforma_elementos?.ventanas,
        reformaCubierta: !!funnel.reforma_elementos?.cubierta,
        reformaSuelo: !!funnel.reforma_elementos?.suelo,
        reformaParedes: !!funnel.reforma_elementos?.paredes,

        // Gasto y modo de cálculo de ahorros
        savingsMode: funnel.gasto_anual_eur > 0 ? 'real' : 'theoretical',
        gastoAnualReal: Number(funnel.gasto_anual_eur) || 0,
        includeAnnualSavings: true,

        // Presupuesto (default 15.000 si "no_se" o "pide_instalador")
        presupuesto: funnel.presupuesto_modo === 'tengo' && funnel.presupuesto_eur > 0
            ? Number(funnel.presupuesto_eur)
            : 15000,

        // Titular y cliente
        titularType: funnel.titular_type || 'particular',
        numOwners: 1,
        includeIrpf: funnel.titular_type !== 'empresa',
        referenciaCliente: '',  // se completa en backend a partir del nombre

        // Demanda: estimada (la calculadora la computa)
        demandMode: 'estimated',
        xmlDemandData: null
    };

    return inputs;
}

export { funnelToCalculatorInputs, shouldWarnBiomasa };
