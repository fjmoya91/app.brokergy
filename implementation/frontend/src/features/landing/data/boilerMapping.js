/**
 * Mapeo del funnel a los DOS esquemas de caldera que la calculadora usa:
 *
 *   1. Aerotermia (RES060) → `boilerId` (ID de BOILER_EFFICIENCIES) + `boilerEff` (numérico)
 *   2. Reforma estimada (RES080) → `boilerHeatingType` y `boilerAcsType` como
 *      LABELS literales ('Gas', 'Gasoil', 'Termo', 'Butano', 'Carbon', 'BIOMASA',
 *      'No tiene Calefacción')
 *
 * Combustibles aceptados del funnel:
 *   gas | gasoleo | electrica | carbon | biomasa
 *
 * Soporte condensación: solo aplica a gas y gasóleo.
 */

const BOILER_LABEL_RES080 = {
    gas: 'Gas',
    gasoleo: 'Gasoil',
    electrica: 'Termo',
    carbon: 'Carbon',
    biomasa: 'BIOMASA'
};

const FUEL_TYPE_BY_COMBUSTIBLE = {
    gas: 'gas_natural',
    gasoleo: 'gasoleo',
    electrica: 'electricidad',
    carbon: 'carbon',
    biomasa: 'pellets'  // representante de biomasa densificada
};

/**
 * ID de BOILER_EFFICIENCIES + eficiencia numérica según combustible,
 * edad y (opcionalmente) si es de condensación.
 */
function mapBoilerIdAndEff(combustible, edad, condensacion) {
    const c = condensacion || 'no_se';

    if (combustible === 'gas') {
        if (edad === '<10') {
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

    // Carbón y biomasa usan los mismos IDs de combustible sólido. La diferencia
    // está en fuelType (afecta a precios €/kWh y a CO2) y en boilerHeatingType
    // RES080 ('Carbon' vs 'BIOMASA').
    if (combustible === 'carbon' || combustible === 'biomasa') {
        if (edad === '<10') return { boilerId: 'solid_auto_cal', boilerEff: 0.65 };
        if (edad === '10-20') return { boilerId: 'solid_auto', boilerEff: 0.60 };
        if (edad === '>20') return { boilerId: 'solid_man_cal', boilerEff: 0.60 };
        return { boilerId: 'solid_auto', boilerEff: 0.60 };
    }

    return { boilerId: 'default', boilerEff: 0.92 };
}

/**
 * Mapeo principal: devuelve TODO lo que la calculadora necesita pre-rellenado.
 */
function mapBoiler({ combustible_actual, edad_caldera, condensacion }) {
    if (!combustible_actual) {
        return {
            boilerId: 'default',
            boilerEff: 0.92,
            fuelType: 'gas_natural',
            boilerHeatingTypeLabel: 'Gas'
        };
    }

    const { boilerId, boilerEff } = mapBoilerIdAndEff(combustible_actual, edad_caldera, condensacion);
    const fuelType = FUEL_TYPE_BY_COMBUSTIBLE[combustible_actual] || 'gas_natural';
    const boilerHeatingTypeLabel = BOILER_LABEL_RES080[combustible_actual] || 'Gas';

    return {
        boilerId,
        boilerEff,
        fuelType,
        boilerHeatingTypeLabel
    };
}

/**
 * Map de tipo de ACS (paso 5) al label RES080 boilerAcsType.
 * Default 'Butano' si el cliente no responde o no tiene (criterio negocio).
 */
function mapAcsType(boilerAcsAnswer, heatingLabel) {
    if (!boilerAcsAnswer || boilerAcsAnswer === 'no_tengo' || boilerAcsAnswer === 'no_se') {
        return 'Butano';
    }
    if (boilerAcsAnswer === 'misma_caldera') {
        return heatingLabel === 'No tiene Calefacción' ? 'Butano' : (heatingLabel || 'Butano');
    }
    if (boilerAcsAnswer === 'termo') return 'Termo';
    if (boilerAcsAnswer === 'butano') return 'Butano';
    if (boilerAcsAnswer === 'gas') return 'Gas';
    if (boilerAcsAnswer === 'gasoleo') return 'Gasoil';
    if (boilerAcsAnswer === 'solar') return 'Termo';
    return 'Butano';
}

function shouldWarnBiomasa({ combustible_actual }) {
    return combustible_actual === 'biomasa';
}

export { mapBoiler, mapAcsType, shouldWarnBiomasa };
