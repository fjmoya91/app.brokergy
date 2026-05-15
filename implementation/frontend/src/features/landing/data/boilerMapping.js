/**
 * Mapeo del funnel a los DOS esquemas de caldera que la calculadora usa:
 *
 *   1. Aerotermia (RES060) → `boilerId` (ID de BOILER_EFFICIENCIES) + `boilerEff` (numérico)
 *      Ej: 'gas_post98_cond_auto', 0.83
 *
 *   2. Reforma estimada (RES080) → `boilerHeatingType` y `boilerAcsType` como
 *      LABELS literales que reconoce calculateRes080Estimated:
 *      'Gas', 'Gasoil', 'Termo', 'Butano', 'Propano', 'Carbon', 'BIOMASA',
 *      'No tiene Calefacción'
 *
 * Setear ambos a la vez garantiza que el admin vea el desplegable correcto
 * pre-seleccionado en ambos modos, y que los cálculos den el mismo número
 * tanto al cliente (landing) como al admin al abrir.
 *
 * Además, soporte de "condensación":
 *   - Si el cliente sabe que es de condensación → seleccionamos el ID que
 *     corresponda exactamente.
 *   - Si no lo sabe o no aplica (eléctrica/sólido) → asumimos por edad.
 */

// Combustible del funnel → label literal para RES080 (boilerHeatingType / boilerAcsType)
const BOILER_LABEL_RES080 = {
    gas: 'Gas',
    gasoleo: 'Gasoil',
    electrica: 'Termo',
    solido_pellets: 'BIOMASA',
    solido_biomasa: 'BIOMASA',
    solido_lena: 'BIOMASA',
    solido_carbon: 'Carbon'
};

// Sub-sólido → fuelType (calculation.js)
const FUEL_TYPE_BY_SUB_SOLIDO = {
    pellets: 'pellets',
    lena: 'lena',
    carbon: 'carbon',
    biomasa: 'pellets'
};

// Combustible base → fuelType por defecto
const FUEL_TYPE_BY_COMBUSTIBLE = {
    gas: 'gas_natural',
    gasoleo: 'gasoleo',
    electrica: 'electricidad',
    solido: 'pellets'
};

/**
 * Devuelve el ID de BOILER_EFFICIENCIES + eficiencia numérica según combustible,
 * edad y (opcionalmente) si el cliente sabe que es de condensación.
 *
 * @param {string} combustible 'gas' | 'gasoleo' | 'electrica' | 'solido'
 * @param {string} edad        '<10' | '10-20' | '>20' | 'no_se'
 * @param {string|null} condensacion 'si' | 'no' | 'no_se' | null
 */
function mapBoilerIdAndEff(combustible, edad, condensacion) {
    const c = condensacion || 'no_se';

    if (combustible === 'gas') {
        if (edad === '<10') {
            // Caldera < 10 años casi siempre es de condensación moderna
            if (c === 'no') return { boilerId: 'gas_post98_auto', boilerEff: 0.73 };
            return { boilerId: 'gas_post98_cond_auto', boilerEff: 0.83 };
        }
        if (edad === '10-20') {
            if (c === 'si') return { boilerId: 'gas_post98_cond_auto', boilerEff: 0.83 };
            return { boilerId: 'gas_post98_auto', boilerEff: 0.73 };
        }
        if (edad === '>20') {
            if (c === 'si') return { boilerId: 'gas_pre98_cond', boilerEff: 0.85 };
            return { boilerId: 'gas_pre98_mural', boilerEff: 0.65 };
        }
        // No sabe la edad → asumir intermedia conservadora
        return { boilerId: 'gas_post98_auto', boilerEff: 0.73 };
    }

    if (combustible === 'gasoleo') {
        if (edad === '<10') {
            if (c === 'no') return { boilerId: 'oil_post98', boilerEff: 0.79 };
            return { boilerId: 'oil_cond', boilerEff: 0.83 };
        }
        if (edad === '10-20') {
            if (c === 'si') return { boilerId: 'oil_cond', boilerEff: 0.83 };
            return { boilerId: 'oil_post98', boilerEff: 0.79 };
        }
        if (edad === '>20') {
            return { boilerId: 'oil_pre85', boilerEff: 0.65 };
        }
        return { boilerId: 'oil_post98', boilerEff: 0.79 };
    }

    if (combustible === 'electrica') {
        return { boilerId: 'electric', boilerEff: 1.0 };
    }

    if (combustible === 'solido') {
        if (edad === '<10') return { boilerId: 'solid_auto_cal', boilerEff: 0.65 };
        if (edad === '10-20') return { boilerId: 'solid_auto', boilerEff: 0.60 };
        if (edad === '>20') return { boilerId: 'solid_man_cal', boilerEff: 0.60 };
        return { boilerId: 'solid_auto', boilerEff: 0.60 };
    }

    // Fallback conservador
    return { boilerId: 'default', boilerEff: 0.92 };
}

/**
 * Mapeo principal: devuelve TODO lo que la calculadora necesita pre-rellenado.
 *
 * @returns {{
 *   boilerId: string,                  // RES060 desplegable
 *   boilerEff: number,                 // Eficiencia numérica
 *   fuelType: string,                  // Precio de combustible y CO2
 *   boilerHeatingTypeLabel: string,    // RES080 desplegable calefacción
 * }}
 */
function mapBoiler({ combustible_actual, edad_caldera, sub_solido, condensacion }) {
    if (!combustible_actual) {
        return {
            boilerId: 'default',
            boilerEff: 0.92,
            fuelType: 'gas_natural',
            boilerHeatingTypeLabel: 'Gas'
        };
    }

    const { boilerId, boilerEff } = mapBoilerIdAndEff(combustible_actual, edad_caldera, condensacion);

    let fuelType = FUEL_TYPE_BY_COMBUSTIBLE[combustible_actual] || 'gas_natural';
    let labelKey = combustible_actual;

    if (combustible_actual === 'solido' && sub_solido) {
        fuelType = FUEL_TYPE_BY_SUB_SOLIDO[sub_solido] || fuelType;
        labelKey = `solido_${sub_solido}`;
    }

    const boilerHeatingTypeLabel = BOILER_LABEL_RES080[labelKey] || BOILER_LABEL_RES080[combustible_actual] || 'Gas';

    return {
        boilerId,
        boilerEff,
        fuelType,
        boilerHeatingTypeLabel
    };
}

/**
 * Map de tipo de ACS (paso 5 del funnel) al label RES080 boilerAcsType.
 * Si el usuario dice "no tengo" o "no lo sé", default 'Butano' (petición usuario).
 */
function mapAcsType(boilerAcsAnswer, heatingLabel) {
    if (!boilerAcsAnswer || boilerAcsAnswer === 'no_tengo' || boilerAcsAnswer === 'no_se') {
        return 'Butano';
    }
    if (boilerAcsAnswer === 'misma_caldera') {
        // Usa la misma caldera que la calefacción
        return heatingLabel === 'No tiene Calefacción' ? 'Butano' : (heatingLabel || 'Butano');
    }
    if (boilerAcsAnswer === 'termo') return 'Termo';
    if (boilerAcsAnswer === 'butano') return 'Butano';
    if (boilerAcsAnswer === 'gas') return 'Gas';
    if (boilerAcsAnswer === 'gasoleo') return 'Gasoil';
    if (boilerAcsAnswer === 'solar') return 'Termo'; // solar térmica → asimila a eléctrico (apoyo)
    return 'Butano';
}

function shouldWarnBiomasa({ combustible_actual, sub_solido }) {
    return combustible_actual === 'solido' && (sub_solido === 'pellets' || sub_solido === 'biomasa');
}

export { mapBoiler, mapAcsType, shouldWarnBiomasa };
