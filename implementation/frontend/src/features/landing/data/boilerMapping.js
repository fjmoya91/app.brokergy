/**
 * Mapeo de las respuestas del funnel (combustible + edad caldera) al esquema
 * interno de la calculadora (boilerHeatingType + boilerEff + fuelType).
 *
 * Los IDs de boilerHeatingType deben coincidir EXACTAMENTE con los que existen
 * en BOILER_EFFICIENCIES de calculation.js, para que el técnico al abrir la
 * oportunidad vea la opción ya seleccionada en el desplegable.
 */

// Matriz combustible × edad → { boilerHeatingType, boilerEff, fuelType }
// Para 'electrica' la edad no aplica (rendimiento siempre 1.0).
// Para 'solido', el fuelType final se afina con sub_solido (pellets/lena/carbon).
const BOILER_MATRIX = {
    gas: {
        '<10':    { boilerHeatingType: 'gas_post98_cond_auto', boilerEff: 0.83 },
        '10-20':  { boilerHeatingType: 'gas_post98_auto',      boilerEff: 0.73 },
        '>20':    { boilerHeatingType: 'gas_pre98_mural',      boilerEff: 0.65 },
        'no_se':  { boilerHeatingType: 'gas_post98_auto',      boilerEff: 0.73 }
    },
    gasoleo: {
        '<10':    { boilerHeatingType: 'oil_cond',     boilerEff: 0.83 },
        '10-20':  { boilerHeatingType: 'oil_post98',   boilerEff: 0.79 },
        '>20':    { boilerHeatingType: 'oil_pre85',    boilerEff: 0.65 },
        'no_se':  { boilerHeatingType: 'oil_post98',   boilerEff: 0.79 }
    },
    electrica: {
        '<10':    { boilerHeatingType: 'electric', boilerEff: 1.0 },
        '10-20':  { boilerHeatingType: 'electric', boilerEff: 1.0 },
        '>20':    { boilerHeatingType: 'electric', boilerEff: 1.0 },
        'no_se':  { boilerHeatingType: 'electric', boilerEff: 1.0 }
    },
    solido: {
        '<10':    { boilerHeatingType: 'solid_auto_cal', boilerEff: 0.65 },
        '10-20':  { boilerHeatingType: 'solid_auto',     boilerEff: 0.60 },
        '>20':    { boilerHeatingType: 'solid_man_cal',  boilerEff: 0.60 },
        'no_se':  { boilerHeatingType: 'solid_auto',     boilerEff: 0.60 }
    }
};

// Combustible del funnel → fuelType interno (claves de FUEL_PRICES en calculation.js)
const FUEL_TYPE_BY_COMBUSTIBLE = {
    gas: 'gas_natural',
    gasoleo: 'gasoleo',
    electrica: 'electricidad',
    solido: 'pellets' // por defecto; se sobreescribe con sub_solido si aplica
};

const FUEL_TYPE_BY_SUB_SOLIDO = {
    pellets: 'pellets',
    lena: 'lena',
    carbon: 'carbon',
    biomasa: 'pellets' // biomasa densificada = pellets
};

/**
 * Devuelve { boilerHeatingType, boilerEff, fuelType } a partir de las
 * respuestas del funnel.
 */
function mapBoiler({ combustible_actual, edad_caldera, sub_solido }) {
    const matrix = BOILER_MATRIX[combustible_actual];
    if (!matrix) {
        // Sin combustible declarado → default conservador
        return { boilerHeatingType: 'default', boilerEff: 0.92, fuelType: 'gas_natural' };
    }

    const edad = edad_caldera || 'no_se';
    const { boilerHeatingType, boilerEff } = matrix[edad] || matrix['no_se'];

    let fuelType = FUEL_TYPE_BY_COMBUSTIBLE[combustible_actual] || 'gas_natural';
    if (combustible_actual === 'solido' && sub_solido && FUEL_TYPE_BY_SUB_SOLIDO[sub_solido]) {
        fuelType = FUEL_TYPE_BY_SUB_SOLIDO[sub_solido];
    }

    return { boilerHeatingType, boilerEff, fuelType };
}

/**
 * ¿Aplica el warning del Ministerio (pellet/biomasa densificada → aerotermia)?
 */
function shouldWarnBiomasa({ combustible_actual, sub_solido }) {
    return combustible_actual === 'solido' && (sub_solido === 'pellets' || sub_solido === 'biomasa');
}

export { mapBoiler, shouldWarnBiomasa, BOILER_MATRIX };
