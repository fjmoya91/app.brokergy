/**
 * ============================================================================
 * MODELO DE CÁLCULO DE DEMANDA DE CALEFACCIÓN - CALIBRADO CON CE3X
 * ============================================================================
 * 
 * Modelo calibrado contra certificados CE3X reales.
 * Objetivo: Resultados LIGERAMENTE POR DEBAJO de CE3X (~5-10% menos) 
 * para proteger márgenes en presupuestos.
 */

// ============================================================================
// GRADOS DÍA DE CALEFACCIÓN (HDD) - Base 15°C (método CTE)
// ============================================================================
export const HDD = {
    A3: 600, A4: 550,
    B3: 950, B4: 900,
    C1: 1100, C2: 1150, C3: 1330, C4: 1250,
    D1: 1400, D2: 1520, D3: 1710,
    E1: 2090,
};

// ============================================================================
// DATOS HIBRIDACIÓN (Anexo III RES093)
// ============================================================================
export const EQUIVALENT_HOURS = {
    A3: 2228, A4: 2228,
    B3: 2736, B4: 2720,
    C1: 3208, C2: 3186, C3: 3195, C4: 3192,
    D1: 3510, D2: 3500, D3: 3503,
    E1: 5335
};

export const BIVALENCE_TABLE = [
    { coverage: 0.20, cb: 0.3946 },
    { coverage: 0.25, cb: 0.4828 },
    { coverage: 0.30, cb: 0.5644 },
    { coverage: 0.35, cb: 0.6380 },
    { coverage: 0.40, cb: 0.7022 },
    { coverage: 0.45, cb: 0.7567 },
    { coverage: 0.50, cb: 0.8045 },
    { coverage: 0.55, cb: 0.8457 },
    { coverage: 0.60, cb: 0.8808 },
    { coverage: 0.65, cb: 0.9081 },
    { coverage: 0.70, cb: 0.9299 },
    { coverage: 0.75, cb: 0.9480 },
    { coverage: 0.80, cb: 0.9608 },
    { coverage: 0.85, cb: 0.9707 },
    { coverage: 0.90, cb: 0.9784 },
    { coverage: 0.95, cb: 0.9838 }
];

/**
 * Obtiene el coeficiente de bivalencia Cb mediante interpolación
 * @param {number} coverage - Porcentaje de cobertura (0 a 1)
 */
export function getCb(coverage) {
    if (coverage <= 0.15) return 0;
    if (coverage >= 0.95) return 0.984; 
    
    // Si la cobertura es exactamente uno de los puntos clave (o muy cercana), evitamos errores de redondeo excesivos
    for (let i = 0; i < BIVALENCE_TABLE.length; i++) {
        if (Math.abs(coverage - BIVALENCE_TABLE[i].coverage) < 0.001) {
            return BIVALENCE_TABLE[i].cb;
        }
    }

    for (let i = 0; i < BIVALENCE_TABLE.length - 1; i++) {
        const curr = BIVALENCE_TABLE[i];
        const next = BIVALENCE_TABLE[i+1];
        if (coverage >= curr.coverage && coverage <= next.coverage) {
            const factor = (coverage - curr.coverage) / (next.coverage - curr.coverage);
            return parseFloat((curr.cb + factor * (next.cb - curr.cb)).toFixed(4));
        }
    }
    return 0.984;
}

/**
 * Calcula los parámetros de hibridación
 */
export function calculateHybridization({ demandAnnual, zone, heatPumpPower }) {
    const th = EQUIVALENT_HOURS[zone] || EQUIVALENT_HOURS['D3'] || 3503;
    const pDesign = parseFloat(demandAnnual) / th;

    if (!pDesign || pDesign <= 0) {
        return { th, pDesign: 0, coverage: 0, cb: 1, demandAnnual: 0 };
    }

    // Redondeamos cobertura a 2 decimales para que coincida mejor con los pasos de la tabla (ej: 0.853 -> 0.85)
    let coverage = parseFloat((heatPumpPower / pDesign).toFixed(2));
    if (coverage > 1) coverage = 1;
    if (coverage < 0) coverage = 0;
    
    const cb = getCb(coverage);

    return {
        th,
        pDesign,
        coverage,
        cb,
        demandAnnual
    };
}

// ============================================================================
// PRECIOS DE COMBUSTIBLES (2026) - €/kWh
export const FUEL_PRICES = {
    electricidad: { label: 'Electricidad', price: 0.22 },
    gasoleo: { label: 'Gasóleo Calefacción', price: 0.11 },
    glp: { label: 'GLP (Propano)', price: 0.14 },
    gas_natural: { label: 'Gas Natural', price: 0.09 },
    carbon: { label: 'Carbón', price: 0.17 },
    pellets: { label: 'Biomasa (Pellets)', price: 0.08 },
    lena: { label: 'Biomasa (Leña/Hueso)', price: 0.055 }
};

// ============================================================================
// FACTORES DE PASO (kgCO2 a kWh) - MODO RES080
// ============================================================================
export const FACTORES_PASO = {
    'Electricidad peninsular': 0.331,
    'Gasoleo Calefacción': 0.311,
    'GLP': 0.254,
    'Gas Natural': 0.252,
    'Carbón': 0.472,
    'Biomasa no densificada': 0.018,
    'Biomasa densificada (pelets)': 0.018
};

// ============================================================================
// RENDIMIENTOS DE CALDERAS (Base IDAE/CTE)
// ============================================================================
export const BOILER_EFFICIENCIES = [
    { id: 'default', label: "Por defecto (0.92)", value: 0.92 },
    { id: 'gas_pre79', label: "Gas, anterior a 1979, tiro equilibrado, de pie", value: 0.55 },
    { id: 'gas_79_97', label: "Gas, de 1979 a 1997, tiro natural equilibrado, de pie", value: 0.65 },
    { id: 'gas_pre98_mural', label: "Gas, anterior a 1998, tiro natural o equilibrado, mural", value: 0.65 },
    { id: 'gas_pre98_cap_alta', label: "Gas, anterior a 1998, tiro forzado con vent. (cap. alta)", value: 0.68 },
    { id: 'gas_pre98_cap_baja', label: "Gas, anterior a 1998, tiro forzado con vent. (cap. baja)", value: 0.72 },
    { id: 'gas_pre98_cond', label: "Gas, anterior a 1998, condensación", value: 0.85 },
    { id: 'gas_post98_piloto', label: "Gas, ≥ 1998, sin condensación, piloto permanente", value: 0.69 },
    { id: 'gas_post98_auto', label: "Gas, ≥ 1998, sin condensación, encendido auto", value: 0.73 },
    { id: 'gas_post98_cond_piloto', label: "Gas, ≥ 1998, condensación, piloto permanente", value: 0.79 },
    { id: 'gas_post98_cond_auto', label: "Gas, ≥ 1998, condensación, encendido auto", value: 0.83 },
    { id: 'oil_pre85', label: "Gasóleo, anterior a 1985", value: 0.65 },
    { id: 'oil_85_97', label: "Gasóleo, de 1985 a 1997", value: 0.70 },
    { id: 'oil_post98', label: "Gasóleo, ≥ 1998, sin condensación", value: 0.79 },
    { id: 'oil_cond', label: "Gasóleo, condensación", value: 0.83 },
    { id: 'solid_man_no_cal', label: "Combustible sólido, manual, espacio no calefactado", value: 0.55 },
    { id: 'solid_man_cal', label: "Combustible sólido, manual, espacio calefactado", value: 0.60 },
    { id: 'solid_auto', label: "Combustible sólido, auto", value: 0.60 },
    { id: 'solid_auto_cal', label: "Combustible sólido, auto, espacio calefactado", value: 0.65 },
    { id: 'electric', label: "Caldera eléctrica", value: 1.00 }
];

const REFORMA_EFFICIENCIES = {
    'sin_aislamiento': 0.549,
    'antigua_mal_aislamiento': 0.618,
    'antigua_aislamiento_medio': 0.66,
    'bien_aislada': 0.66
};

// ============================================================================
// CÁLCULO DE AHORROS RES080 ESTIMADO (A PARTIR DE MEJORAS MANUALES)
// ============================================================================
export function calculateRes080Estimated(inputs) {
    const {
        superficieCalefactable,
        insulationState,
        boilerAcsType,
        boilerHeatingType,
        reformaVentanas,
        reformaCubierta,
        reformaSuelo,
        reformaParedes,
        scopHeating,
        scopAcs,
    } = inputs;

    const S = parseFloat(superficieCalefactable) || inputs.superficie || 120;
    const acsDemandM2 = 8.80; // kWh/m2 año según requerimiento
    const acsDemandTotal = acsDemandM2 * S;

    // 1. Calculemos demanda inicial teórica (Situación Actual)
    const demandIniTheor = calculateDemand(inputs);
    let Q_net_ini = demandIniTheor.Q_net;

    if (inputs.manualDemandOverride !== undefined) {
        Q_net_ini = inputs.manualDemandOverride * S;
    }

    // 2. Calculemos demanda final teórica (Tras Reforma)
    // Aplicamos las transmitancias mejoradas según lo seleccionado
    const demandFinalInputs = {
        ...inputs,
        ventanaU: reformaVentanas ? 1.3 : inputs.ventanaU,
        uCubierta: reformaCubierta ? 0.5 : inputs.uCubierta,
        uMuro: reformaParedes ? 0.5 : inputs.uMuro,
        ach: 0.53 // Requerimiento: Siempre 0.53 en reforma estimada
    };
    
    // Forzamos el cambio en el cálculo interno si reformaSuelo es true.
    if (reformaSuelo) demandFinalInputs.uSueloOverride = 0.5;

    const demandFinTheor = calculateDemand(demandFinalInputs);
    let Q_net_fin = demandFinTheor.Q_net;

    if (inputs.manualDemandOverride !== undefined) {
        // Regla de 3: el ratio de mejora teórica se aplica a la demanda manual
        const ratio = demandIniTheor.Q_net > 0 ? demandFinTheor.Q_net / demandIniTheor.Q_net : 1;
        Q_net_fin = Q_net_ini * ratio;
    }

    // 3. Rendimientos Iniciales
    const getEff = (type) => {
        if (!type || type === '') return 0.66; // Fallback para evitar errores si no hay selección
        if (type === 'Termo' || type === 'Electricidad') return 1.0;
        if (type === 'No tiene Calefacción') return 0.92;
        return REFORMA_EFFICIENCIES[insulationState] || 0.66;
    };

    const effAcsIni = getEff(boilerAcsType);
    let effCalIni = getEff(boilerHeatingType);
    
    // Si no tiene calefacción, se toma Gas Natural 92%
    if (boilerHeatingType === 'No tiene Calefacción') {
        effCalIni = 0.92;
    }

    // 4. Energía Final Inicial (kWh/año)
    const energyAcsIni = acsDemandTotal / effAcsIni;
    const energyCalIni = Q_net_ini / effCalIni;
    const energyTotalIni = energyAcsIni + energyCalIni;

    // 5. Energía Final Final (Tras Aerotermia + Reforma)
    const energyCalFin = Q_net_fin / scopHeating;
    const energyAcsFin = acsDemandTotal / (scopAcs || 3.0);
    const energyTotalFin = energyCalFin + energyAcsFin;

    const ahorroTotal = Math.max(0, energyTotalIni - energyTotalFin);

    return {
        energiaAcsInicial: energyAcsIni / S,
        energiaAcsFinal: energyAcsFin / S,
        energiaCalefInicial: energyCalIni / S,
        energiaCalefFinal: energyCalFin / S,
        energiaRefInicial: 0,
        energiaRefFinal: 0,
        totalEnergiaInicialM2: energyTotalIni / S,
        totalEnergiaFinalM2: energyTotalFin / S,
        totalEnergiaInicialAno: energyTotalIni,
        totalEnergiaFinalAno: energyTotalFin,
        ahorroEnergiaFinalTotal: ahorroTotal,
        ahorroM2: ahorroTotal / S,
        superficieAplicada: S,
        isEstimated: true,
        details: {
            acs: { energyIni: energyAcsIni / S, energyFin: energyAcsFin / S },
            cal: { energyIni: energyCalIni / S, energyFin: energyCalFin / S },
            ref: { energyIni: 0, energyFin: 0 }
        }
    };
}

// ============================================================================
// MODELOS DE AEROTERMIA (BOMBA DE CALOR)
// ============================================================================
export const AEROTHERMIA_MODELS = [
    { id: 'custom', label: 'Personalizado / Otro', scop35: null, scop55: null },
    { id: 'master_9', label: 'Monobloc MASTER 9 (SH-HPM08-Nd2)', scop35: 4.90, scop55: 3.85 },
    { id: 'master_12', label: 'Monobloc MASTER 12 (SH-HPM10-Nd2)', scop35: 4.90, scop55: 3.85 },
    { id: 'master_14', label: 'Monobloc MASTER 14 (SH-HPM12-Nd2)', scop35: 4.90, scop55: 3.85 },
    { id: 'master_17', label: 'Monobloc MASTER 17 (SH-HPM14-Nd2)', scop35: 5.20, scop55: 3.90 },
    { id: 'master_19', label: 'Monobloc MASTER 19 (SH-HPM16-Nd2)', scop35: 4.90, scop55: 3.90 }
];

// ============================================================================
// TRANSMITANCIAS TÉRMICAS POR ÉPOCA DE CONSTRUCCIÓN
// ============================================================================
const U_MAX_CTE_2006 = {
    A: { wall: 1.22, roof: 0.63, floor: 0.82, window: 5.70 },
    B: { wall: 1.07, roof: 0.59, floor: 0.65, window: 4.20 },
    C: { wall: 0.73, roof: 0.50, floor: 0.52, window: 3.80 },
    D: { wall: 0.66, roof: 0.45, floor: 0.49, window: 3.50 },
    E: { wall: 0.57, roof: 0.40, floor: 0.48, window: 3.10 }
};

const getZoneLetter = (zone) => (zone ? zone.charAt(0).toUpperCase() : 'D');

export function getUByYear(year, zone) {
    const letter = getZoneLetter(zone);

    if (year >= 2020) {
        // CTE 2019 - nZEB
        return { wall: 0.27, roof: 0.22, floor: 0.30 };
    }
    if (year >= 2014) {
        // CTE 2013
        return { wall: 0.35, roof: 0.25, floor: 0.35 };
    }
    if (year >= 2008) {
        // CTE 2006 (en vigor desde 2008 aprox.)
        const z = U_MAX_CTE_2006[letter] || U_MAX_CTE_2006.D;
        return { wall: z.wall, roof: z.roof, floor: z.floor };
    }
    if (year >= 1991) {
        // NBE-CT-79 Maduro
        return { wall: 1.69, roof: 1.69, floor: 1.00 };
    }
    if (year >= 1979) {
        // NBE-CT-79 Transición
        return { wall: 1.80, roof: 1.90, floor: 1.05 };
    }
    if (year >= 1960) {
        // 1960 - 1978 pre-normativa
        return { wall: 1.90, roof: 2.10, floor: 1.10 };
    }
    // Anterior a 1960 - Construcción tradicional
    return { wall: 2.20, roof: 2.50, floor: 1.25 };
}

export function getVentanaYACHByYear(year, zone) {
    const letter = getZoneLetter(zone);

    if (year >= 2020) {
        // CTE 2019 - nZEB
        return { ventanaU: 1.1, ach: 0.60 }; // Triple eficiente (U=1.1)
    }
    if (year >= 2014) {
        // CTE 2013
        return { ventanaU: 1.4, ach: 0.63 }; // Doble bajo emisivo (U=1.4)
    }
    if (year >= 2008) {
        // CTE 2006 (en vigor desde 2008 aprox.)
        const z = U_MAX_CTE_2006[letter] || U_MAX_CTE_2006.D;
        return { ventanaU: z.window, ach: 0.83 }; 
    }
    if (year >= 1979) {
        // NBE-CT-79
        return { ventanaU: 3.0, ach: 0.83 }; // Doble antiguo (U=3.0)
    }
    // Anterior a 1979 - Construcción tradicional
    return { ventanaU: 5.0, ach: 1.00 }; // Sencilla aluminio (U=5.0)
}

// ============================================================================
// PUENTES TÉRMICOS
// ============================================================================
export function getPTFactorByYear(year) {
    if (year >= 2020) return 0.10;
    if (year >= 2013) return 0.15;
    if (year >= 2007) return 0.20;
    if (year >= 1979) return 0.30;
    return 0.35;
}

export function getPTTypeFactor(tipo, subtipo) {
    if (tipo === 'unifamiliar') return 1.0;
    if (tipo === 'hilera') return 0.75;
    if (tipo === 'piso') {
        if (subtipo === 'intermedio') return 0.40;
        if (subtipo === 'atico') return 0.60;
        if (subtipo === 'bajo') return 0.55;
    }
    return 1.0;
}

const INTERNAL_GAINS_WM2 = 3.0;

// ============================================================================
// FACTOR DE CALIBRACIÓN GLOBAL
// ============================================================================
export function getCalibrationFactor(tipo, subtipo) {
    if (tipo === 'unifamiliar') return 0.82;
    if (tipo === 'hilera') return 0.85;
    if (tipo === 'piso') {
        if (subtipo === 'intermedio') return 0.85;
        if (subtipo === 'atico') return 0.88;
        if (subtipo === 'bajo') return 0.86;
    }
    return 0.90;
}

export const ORIENTATION_CORRECTION = {
    S: 0.94, SE: 0.96, SO: 0.96,
    E: 0.98, O: 1.00, media: 0.98,
    NE: 1.02, NO: 1.03, N: 1.05,
};

export const TYPE_DEFAULTS = {
    unifamiliar: {
        label: 'Unifamiliar',
        facadeFactor: 1.00,
        roofFactor: 1.00,
        floorFactor: 1.00,
        defaultGla: 12
    },
    piso: {
        label: 'Piso',
        facadeFactor: 0.35,
        roofFactor: 0.00,
        floorFactor: 0.00,
        defaultGla: 15
    },
    hilera: {
        label: 'Adosada en hilera',
        facadeFactor: 0.50,
        roofFactor: 1.00,
        floorFactor: 1.00,
        defaultGla: 15
    }
};

export const SUBTYPE_FACTORS = {
    intermedio: { roof: 0.00, floor: 0.00 },
    atico: { roof: 1.00, floor: 0.00 },
    bajo: { roof: 0.00, floor: 1.00 },        // Sobre local no calefactado
    bajo_terreno: { roof: 0.00, floor: 0.80 } // En contacto con terreno (menor pérdida)
};

// ============================================================================
// CÁLCULO
// ============================================================================
export function estimateAreas(inputs) {
    const { superficie: S, altura: H, plantas, tipo, fachadas, patios, subtipo, sueloTipo } = inputs;

    const S_planta = S / plantas;
    const lado = Math.sqrt(S_planta);
    const perimetro = 4 * lado;
    const facadeFactorFromWalls = Math.min(4, Math.max(0, fachadas)) / 4;

    let tf = { ...(TYPE_DEFAULTS[tipo] || TYPE_DEFAULTS.unifamiliar) };

    if (tipo === 'piso' && subtipo) {
        const sp = SUBTYPE_FACTORS[subtipo] || SUBTYPE_FACTORS.intermedio;
        tf.roofFactor = sp.roof;
        tf.floorFactor = sp.floor;
    }

    if (fachadas >= 0) {
        tf.facadeFactor = facadeFactorFromWalls;
    }

    const patioMult = 1 + 0.10 * Math.min(4, Math.max(0, patios));

    const A_fachada = perimetro * H * plantas * tf.facadeFactor * patioMult;
    let A_cubierta = S_planta * tf.roofFactor;
    let A_suelo = S_planta * tf.floorFactor;

    if (sueloTipo === 'garaje') {
        A_suelo *= 1.15;
    } else if (sueloTipo === 'vivienda') {
        A_suelo *= 0.15;
    }

    return { A_fachada, A_cubierta, A_suelo, perimetro, S_planta };
}

export function calculateDemand(inputs) {
    const {
        zona, anio, superficie: S_util, superficieCalefactable: S_cal, plantas, altura: H,
        ventanaU: Uw, ach, tipo, subtipo, gla,
        orientacion, uMuro: U_wall, uCubierta: U_roof
    } = inputs;

    // Usamos prioritariamente la superficie calefactable para el cálculo físico de la energía
    const S = (S_cal && S_cal > 0) ? Number(S_cal) : (Number(S_util) || 0);

    const Ubase = getUByYear(anio, zona);
    const U_floor = Ubase.floor;

    const areas = estimateAreas({ ...inputs, superficie: S });

    const Awin = areas.A_fachada * (gla / 100);
    const Awall = Math.max(0, areas.A_fachada - Awin);

    const UAtrans =
        (Awall * U_wall) +
        (Awin * Uw) +
        (areas.A_cubierta * (inputs.uCubiertaOverride || U_roof)) +
        (areas.A_suelo * (inputs.uSueloOverride || U_floor));

    const V = S * H;
    const UA_vent = 0.34 * ach * V;

    const ptFactor = getPTFactorByYear(anio);
    const ptTypeFactor = getPTTypeFactor(tipo, subtipo);
    const UA_pt = UAtrans * ptFactor * ptTypeFactor;

    const UA = UAtrans + UA_vent + UA_pt;

    const hdd = HDD[zona] || 1710;
    const corr = ORIENTATION_CORRECTION[orientacion] || 1.0;

    const Qgross = (UA * hdd * 24) / 1000 * corr;

    const heatingDays = estimateHeatingDays(zona);
    const Q_internal = (INTERNAL_GAINS_WM2 * S * 14 * heatingDays) / 1000;

    const kcal = getCalibrationFactor(tipo, subtipo);
    const Qnet = Math.max(0, (Qgross * kcal) - (Q_internal * 0.5));

    const q_gross = Qgross / S;
    const q_net = Qnet / S;

    return {
        q_gross,
        Q_gross: Qgross,
        q_net,
        Q_net: Qnet,
        ua_trans: UAtrans,
        ua_vent: UA_vent,
        ua_pt: UA_pt,
        ua_total: UA,
        areas: {
            fachada: areas.A_fachada,
            cubierta: areas.A_cubierta,
            suelo: areas.A_suelo,
            huecos: Awin,
            muros: Awall,
            perimetro: areas.perimetro
        },
        meta: {
            k_calibracion: kcal,
            delta_u_pt: ptFactor,
            hdd
        }
    };
}

// ============================================================================
// CÁLCULO DE AHORROS
// ============================================================================
export function calculateSavings({
    q_net_heating, // Demanda Neta de Calefacción (kWh/año)
    dacs = 2731.4, // Demanda ACS (kWh/año)
    boilerEff = 0.92, // Rendimiento caldera antigua
    scopHeating = 4.5, // SCOP Nueva Bomba de Calor
    scopAcs = 3.0, // SCOP ACS Nueva
    changeAcs = false, // ¿Se cambia también ACS?
    cb = 1.0 // Coeficiente de bivalencia (1.0 si no es híbrido)
}) {
    // 1. Energía Final Situación Actual (Old)
    // Calefacción + ACS (asumimos que la caldera antigua hacía ambas o que el rendimiento aplica a ambas si ACS se incluía, 
    // pero la User Request dice: "Si no se cambia ACS, SCOP será el mismo que el n de la caldera antigua", lo que implica
    // que estamos comparando contra una situación futura donde ACS se mantiene igual).
    // Para simplificar y seguir la instrucción: calculamos consumo final total actual.

    // Consumo Final Calefacción (Actual)
    const finalEnergyHeatingOld = q_net_heating / boilerEff;

    // Consumo Final ACS (Actual)
    // Asumimos que la caldera actual provee ACS con el mismo rendimiento
    const finalEnergyAcsOld = dacs / boilerEff;

    const totalFinalEnergyOld = finalEnergyHeatingOld + finalEnergyAcsOld;

    // 2. Energía Final Situación Propuesta (New)
    // Calefacción con Aerotermia
    const finalEnergyHeatingNew = q_net_heating / scopHeating;

    // ACS Nueva
    // Si se cambia ACS -> Usamos SCOP ACS
    // Si NO se cambia ACS -> Usamos el rendimiento de la caldera antigua (boilerEff)
    const effAcsNew = changeAcs ? scopAcs : boilerEff;
    const finalEnergyAcsNew = dacs / effAcsNew;

    const totalFinalEnergyNew = finalEnergyHeatingNew + finalEnergyAcsNew;

    // 3. Ahorros (Aplicando Cb si es híbrido)
    // El ahorro solo se produce sobre la fracción de demanda que cubre la bomba de calor
    const savingsHeatingKwh = (finalEnergyHeatingOld - finalEnergyHeatingNew) * cb;
    
    // El ahorro de ACS no se ve afectado por Cb si es independiente o si se asume cobertura total
    const savingsAcsKwh = finalEnergyAcsOld - finalEnergyAcsNew;

    const savingsKwh = savingsHeatingKwh + savingsAcsKwh;
    const savingsPercent = (savingsKwh / totalFinalEnergyOld) * 100;

    return {
        finalEnergyOld: totalFinalEnergyOld,
        finalEnergyNew: totalFinalEnergyNew,
        savingsKwh,
        savingsPercent
    };
}

// ============================================================================
// CÁLCULO DE AHORROS RES080 (ENERGÍA FINAL REAL DESDE CEE)
// ============================================================================
export function calculateRes080({
    xmlInicial,
    xmlFinal,
    combAcsInicial,
    combAcsFinal,
    combCalefaccionInicial,
    combCalefaccionFinal,
    combRefrigeracionInicial,
    combRefrigeracionFinal,
    superficieCustom
}) {
    if (!xmlInicial || !xmlFinal) return null;

    const getE = (val) => typeof val === 'number' ? val : 0;

    const fAcsIni = FACTORES_PASO[combAcsInicial] || 1;
    const fAcsFin = FACTORES_PASO[combAcsFinal] || 1;
    const fCalIni = FACTORES_PASO[combCalefaccionInicial] || 1;
    const fCalFin = FACTORES_PASO[combCalefaccionFinal] || 1;
    const fRefIni = FACTORES_PASO[combRefrigeracionInicial] || 1;
    const fRefFin = FACTORES_PASO[combRefrigeracionFinal] || 1;

    const energiaAcsInicial = getE(xmlInicial.emisionesACS) / fAcsIni;
    const energiaAcsFinal = getE(xmlFinal.emisionesACS) / fAcsFin;

    const energiaCalefInicial = getE(xmlInicial.emisionesCalefaccion) / fCalIni;
    const energiaCalefFinal = getE(xmlFinal.emisionesCalefaccion) / fCalFin;

    const energiaRefInicial = getE(xmlInicial.emisionesRefrigeracion) / fRefIni;
    const energiaRefFinal = getE(xmlFinal.emisionesRefrigeracion) / fRefFin;

    const totalEnergiaInicialM2 = energiaAcsInicial + energiaCalefInicial + energiaRefInicial;
    const totalEnergiaFinalM2 = energiaAcsFinal + energiaCalefFinal + energiaRefFinal;
    const ahorroEnergiaFinalM2 = Math.max(0, totalEnergiaInicialM2 - totalEnergiaFinalM2);

    // Usar la superficie custom provista o la del XML inicial
    const sup = parseFloat(superficieCustom) || xmlInicial.superficieHabitable || 120; 

    return {
        energiaAcsInicial,
        energiaAcsFinal,
        energiaCalefInicial,
        energiaCalefFinal,
        energiaRefInicial,
        energiaRefFinal,
        totalEnergiaInicialM2,
        totalEnergiaFinalM2,
        totalEnergiaInicialAno: totalEnergiaInicialM2 * sup,
        totalEnergiaFinalAno: totalEnergiaFinalM2 * sup,
        ahorroEnergiaFinalTotal: ahorroEnergiaFinalM2 * sup,
        ahorroM2: ahorroEnergiaFinalM2,
        superficieAplicada: sup,
        // Detalles para la tabla de eficiencia
        details: {
            acs: {
                fuelIni: combAcsInicial,
                fuelFin: combAcsFinal,
                factorIni: fAcsIni,
                factorFin: fAcsFin,
                emissionsIni: getE(xmlInicial.emisionesACS),
                emissionsFin: getE(xmlFinal.emisionesACS),
                energyIni: energiaAcsInicial,
                energyFin: energiaAcsFinal
            },
            cal: {
                fuelIni: combCalefaccionInicial,
                fuelFin: combCalefaccionFinal,
                factorIni: fCalIni,
                factorFin: fCalFin,
                emissionsIni: getE(xmlInicial.emisionesCalefaccion),
                emissionsFin: getE(xmlFinal.emisionesCalefaccion),
                energyIni: energiaCalefInicial,
                energyFin: energiaCalefFinal
            },
            ref: {
                fuelIni: combRefrigeracionInicial,
                fuelFin: combRefrigeracionFinal,
                factorIni: fRefIni,
                factorFin: fRefFin,
                emissionsIni: getE(xmlInicial.emisionesRefrigeracion),
                emissionsFin: getE(xmlFinal.emisionesRefrigeracion),
                energyIni: energiaRefInicial,
                energyFin: energiaRefFinal
            }
        }
    };
}

// ============================================================================
// CONSTANTES DE COSTES FIJOS
// ============================================================================
export const CERTIFICATE_COST = 220.00; // CEE inicial + final
export const CERTIFICATE_FEES = 32.78; // Tasas de registro
export const TOTAL_CERTIFICATE_COST = CERTIFICATE_COST + CERTIFICATE_FEES;

// ============================================================================
// CÁLCULO FINANCIERO (IRPF + CAE)
// ============================================================================

/**
 * Calcula el IRPF progresivo como ganancia patrimonial en la base del ahorro.
 * Tramos (2024/vigentes):
 * - 0 a 6.000 €: 19%
 * - 6.000 a 50.000 €: 21%
 * - 50.000 a 200.000 €: 23%
 * - > 200.000 €: 27%
 */
export function calcularIrpfGananciaPatrimonial(importeBruto) {
    if (!importeBruto || importeBruto <= 0) return 0;
    let resto = importeBruto;
    let impuestoTramos = 0;

    // Tramo 1: hasta 6.000 € al 19%
    const tramo1 = Math.min(resto, 6000);
    impuestoTramos += tramo1 * 0.19;
    resto -= tramo1;

    // Tramo 2: desde 6.000 hasta 50.000 € al 21% (hasta 44.000 adicionales)
    if (resto > 0) {
        const tramo2 = Math.min(resto, 44000);
        impuestoTramos += tramo2 * 0.21;
        resto -= tramo2;
    }

    // Tramo 3: desde 50.000 hasta 200.000 € al 23% (hasta 150.000 adicionales)
    if (resto > 0) {
        const tramo3 = Math.min(resto, 150000);
        impuestoTramos += tramo3 * 0.23;
        resto -= tramo3;
    }

    // Tramo 4: más de 200.000 € al 27%
    if (resto > 0) {
        impuestoTramos += resto * 0.27;
    }

    return impuestoTramos;
}

export function calculateFinancials({
    presupuesto = 12000,
    savingsKwh,
    caePriceClient = 95,
    caePriceSO = 160,
    caePricePrescriptor = 0,
    prescriptorMode = 'brokergy', // 'client', 'brokergy', 'both'
    tipo = 'unifamiliar',
    participation = 100, // Porcentaje de participación en la propiedad
    numOwners = 1, // Número de propietarios para dividir la deducción
    discountCertificates = false, // Si Brokergy asume el coste de los certificados
    includeLegalization = false, // Si se incluye el trámite de legalización
    legalizationMode = 'client', // 'client', 'brokergy', 'both'
    installerNoCard = false, // Si el instalador no tiene carnet (+100€)
    legalizationPrice = 200, // Precio base de la legalización
    certificatesCost = 250, // Coste de los certificados
    itpPercent = 0, // Porcentaje de ITP a deducir del beneficio de Brokergy
    includeItp = false, // Determina si se resta el ITP del beneficio de Brokergy
    includeIrpf = true, // Si se aplica la deducción al IRPF
    titularType = 'particular', // 'particular', 'autonomo', 'empresa'
    aplicarIrpfCae = true // Si se aplica tributación de ganancia patrimonial al CAE
}) {
    const savingsMwh = savingsKwh / 1000;
    const priceClientBase = parseFloat(caePriceClient) || 0;
    const priceSOBase = parseFloat(caePriceSO) || 0;
    const pricePrescriptor = parseFloat(caePricePrescriptor) || 0;

    let discountClient = 0;
    let discountBrokergy = 0;

    if (prescriptorMode === 'client') {
        discountClient = pricePrescriptor;
    } else if (prescriptorMode === 'brokergy') {
        discountBrokergy = pricePrescriptor;
    } else if (prescriptorMode === 'both') {
        discountClient = pricePrescriptor / 2;
        discountBrokergy = pricePrescriptor / 2;
    }

    // 1. Bono CAE Cliente (Ajustado)
    const priceClientDiscounted = Math.max(0, priceClientBase - discountClient);
    let caeBonus = savingsMwh * priceClientDiscounted;

    // Aplicar IVA si es Empresa o Autónomo
    const isParticular = titularType === 'particular';
    if (!isParticular) {
        caeBonus = caeBonus * 1.21;
    }

    // 2. Beneficio Brokergy (Ajustado)
    const rawSpread = priceSOBase - priceClientBase;
    const caePriceBrokergy = rawSpread - discountBrokergy;
    let profitBrokergy = savingsMwh * caePriceBrokergy;

    // Descuento del ITP (Impuesto de Transmisiones Patrimoniales) pagado por Brokergy
    const itpCost = includeItp ? (caeBonus * (itpPercent / 100)) : 0;
    profitBrokergy -= itpCost;

    // Lógica de Descuento de Certificados
    let caeMaintenanceCost = 0;
    const certCostBase = parseFloat(certificatesCost) || 250;
    if (discountCertificates) {
        // Brokergy asume el coste -> Restamos del beneficio de Brokergy
        profitBrokergy = Math.max(-certCostBase, profitBrokergy - certCostBase);
    } else {
        // El cliente asume el coste
        caeMaintenanceCost = certCostBase;
    }
    
    // Lógica de Legalización
    let internalLegalizationCost = 0;
    if (includeLegalization) {
        internalLegalizationCost = (parseFloat(legalizationPrice) || 200) + (installerNoCard ? 100 : 0);
        
        const legMode = legalizationMode || 'client';
        if (legMode === 'client') {
            caeBonus = Math.max(0, caeBonus - internalLegalizationCost);
        } else if (legMode === 'brokergy') {
            profitBrokergy = Math.max(-internalLegalizationCost, profitBrokergy - internalLegalizationCost);
        } else if (legMode === 'both') {
            const half = internalLegalizationCost / 2;
            caeBonus = Math.max(0, caeBonus - half);
            profitBrokergy = Math.max(-half, profitBrokergy - half);
        }
    }

    // 3. Pago a Prescriptor
    const totalPrescriptor = savingsMwh * pricePrescriptor;

    // 4. Deducción IRPF (Multiprobetario) - SOLO PARTICULARES
    let irpfRate = 0;
    let irpfCap = 0;
    let irpfDeductionPerOwner = 0;
    let irpfDeductionTotal = 0;

    const budgetNum = parseFloat(presupuesto) || 0;
    const ownersCount = Math.max(1, parseInt(numOwners) || 1);

    if (isParticular && includeIrpf !== false) { 
        irpfRate = 0.60;
        irpfCap = 9000;

        const participationNum = parseFloat(participation) || 100;
        if (tipo === 'piso' || participationNum < 100) {
            irpfRate = 0.40;
            irpfCap = 3000;
        }

        const budgetPerOwner = budgetNum / ownersCount;
        irpfDeductionPerOwner = Math.min(irpfCap, budgetPerOwner * irpfRate);
        irpfDeductionTotal = irpfDeductionPerOwner * ownersCount;
    }

    // 5. Impacto Fiscal del CAE (Calculado sobre el bruto del cliente)
    let caeBonusBruto = caeBonus;
    let irpfCaeAmount = 0;
    
    // Forzamos conversión a booleano por seguridad si viniera de inputs serializados
    const shouldApplyIrpf = (aplicarIrpfCae === true || aplicarIrpfCae === 'true');
    
    // La tributación de CAE solo aplica a particulares si el toggle está activo
    if (isParticular && shouldApplyIrpf) {
        irpfCaeAmount = calcularIrpfGananciaPatrimonial(caeBonusBruto);
    }
    const caeNeto = Math.max(0, caeBonusBruto - irpfCaeAmount);

    // 6. Totales
    const totalBeneficioFiscal = caeNeto + irpfDeductionTotal;
    const porcentajeCubierto = Math.min(100, (totalBeneficioFiscal / budgetNum) * 100);
    // El coste neto teórico final no incluye la legalización si ya se le restó de la subvención (lo cual sucede localmente arriba)
    const costeFinal = Math.max(0, budgetNum + caeMaintenanceCost - totalBeneficioFiscal);

    return {
        presupuesto: budgetNum,
        caeBonus: caeBonusBruto, // Bruto
        irpfCaeAmount,         // Tributación en IRPF
        caeNeto,               // Ingreso neto del CAE tras IRPF
        irpfDeduction: irpfDeductionTotal, // Deducción por rehabilitación
        irpfDeductionPerOwner,
        numOwners: ownersCount,
        totalBeneficioFiscal,  // Beneficio fiscal total (CAE Neto + Deducción)
        totalAyuda: totalBeneficioFiscal, // Legacy field for backwards compatibility
        porcentajeCubierto,
        costeFinal,
        caeMaintenanceCost,
        legalizationCost: internalLegalizationCost,
        irpfRate: irpfRate * 100,
        irpfCap,
        caePriceBrokergy,
        profitBrokergy,
        totalPrescriptor,
        prescriptorMode,
        finalPriceClient: priceClientDiscounted,
        itpCost,
        itpPercent: includeItp ? itpPercent : 0,
        includeItp,
        titularType,
        isParticular
    };
}

function estimateHeatingDays(zona) {
    const days = {
        A3: 100, A4: 100,
        B3: 130, B4: 130,
        C1: 160, C2: 160, C3: 160, C4: 160,
        D1: 180, D2: 180, D3: 190,
        E1: 220,
    };
    return days[zona] || 190;
}

// ============================================================================
// CÁLCULO DE AHORRO ANUAL (MODO TEÓRICO)
// ============================================================================
export function calculateAnnualSavingsTheoretical({
    demandaCalefaccion,     // kWh/año (demanda neta calefacción)
    demandaACS = 2731.4,    // kWh/año (demanda ACS estándar)
    boilerEff = 0.65,       // Rendimiento caldera actual
    scopCalefaccion = 4.5,  // SCOP aerotermia calefacción
    scopACS = 3.0,          // SCOP aerotermia ACS
    fuelType = 'gas_natural',
    changeACS = false,
    customPrices = null,    // Precios personalizados
    cb = 1.0                // Coeficiente de bivalencia
}) {
    const prices = customPrices || FUEL_PRICES;
    const fuelPrice = prices[fuelType]?.price || 0.09;
    const electricityPrice = prices.electricidad?.price || 0.22;

    // Consumo final actual (combustible)
    const consumoCalefActual = demandaCalefaccion / boilerEff;
    const consumoACSActual = demandaACS / boilerEff;
    const consumoTotalActual = consumoCalefActual + consumoACSActual;
    const costeAnualActual = consumoTotalActual * fuelPrice;

    // Consumo final nuevo (electricidad + aerotermia)
    // En modo híbrido, el consumo es la mezcla de HP (cb) y Boiler (1-cb)
    const consumoCalefNuevo = (demandaCalefaccion * cb / scopCalefaccion) + (demandaCalefaccion * (1 - cb) / boilerEff);
    
    const effACSNuevo = changeACS ? scopACS : boilerEff;
    const consumoACSNuevo = demandaACS / effACSNuevo;
    const consumoTotalNuevo = consumoCalefNuevo + consumoACSNuevo;
    const costeAnualNuevo = consumoTotalNuevo * electricityPrice;

    // Ahorro
    const ahorroAnual = costeAnualActual - costeAnualNuevo;

    return {
        consumoActual: consumoTotalActual,
        costeActual: costeAnualActual,
        consumoNuevo: consumoTotalNuevo,
        costeNuevo: costeAnualNuevo,
        ahorroAnual,
        fuelLabel: prices[fuelType]?.label || 'Combustible'
    };
}

// ============================================================================
// CÁLCULO DE AHORRO ANUAL (MODO GASTO REAL)
// ============================================================================
export function calculateAnnualSavingsFromSpending({
    gastoAnual,             // € gastados el año pasado
    fuelType = 'gas_natural',
    boilerEff = 0.65,       // Rendimiento caldera actual
    scopCalefaccion = 4.5,  // SCOP aerotermia
    customPrices = null,    // Precios personalizados
    cb = 1.0                // Coeficiente de bivalencia
}) {
    const prices = customPrices || FUEL_PRICES;
    const fuelPrice = prices[fuelType]?.price || 0.09;
    const electricityPrice = prices.electricidad?.price || 0.22;

    // 1. Deducir consumo final a partir del gasto
    const consumoFinalActual = gastoAnual / fuelPrice;

    // 2. Estimar demanda útil (lo que realmente calienta)
    const demandaUtil = consumoFinalActual * boilerEff;

    // 3. Calcular consumo eléctrico equivalente con aerotermia
    // En modo híbrido, el consumo eléctrico solo cubre la fracción cb. El resto sigue siendo combustible.
    const consumoElectrico = (demandaUtil * cb) / scopCalefaccion;
    const consumoCombustibleRestante = (demandaUtil * (1 - cb)) / boilerEff;
    
    const costeNuevo = (consumoElectrico * electricityPrice) + (consumoCombustibleRestante * fuelPrice);

    // 4. Ahorro
    const ahorroAnual = gastoAnual - costeNuevo;

    return {
        consumoActual: consumoFinalActual,
        costeActual: gastoAnual,
        demandaEstimada: demandaUtil,
        consumoNuevo: consumoElectrico,
        costeNuevo,
        ahorroAnual,
        fuelLabel: prices[fuelType]?.label || 'Combustible'
    };
}

/**
 * Extrae el SCOP adecuado de un modelo de la base de datos según la zona climática
 * @param {object} model - El objeto del equipo de aerotermia
 * @param {string} zone - La zona climática (A-E)
 * @param {number} temp - La temperatura de impulsión (35, 45, 55)
 * @param {string} method - Método de obtención: 'ficha' (directo) o 'eprel' (calculado por eta_s)
 */
export function getScopFromModel(model, zone, temp, method = 'ficha') {
    if (!model) return 3.2;

    const normalizedZone = zone?.toUpperCase() || 'D3';
    // Regla de negocio: Todo es clima CALIDO excepto E1 que es MEDIO
    const isWarm = normalizedZone !== 'E1';

    // CASO 1: Cálculo mediante EPREL (eficiencia estacional eta_s)
    if (method === 'eprel') {
        const eta35 = isWarm ? (model.eta_calida_35 || model.eta_media_35) : model.eta_media_35;
        const eta55 = isWarm ? (model.eta_calida_55 || model.eta_media_55) : model.eta_media_55;

        if (eta35 && eta55) {
            // Según EPREL: SCOP = 2.5 * ( (eta_s / 100) + 0.03 )  (Donde 0.03 es el factor F1 para aerotermia)
            const s35 = ((parseFloat(eta35) + 3) / 100) * 2.5;
            const s55 = ((parseFloat(eta55) + 3) / 100) * 2.5;
            if (temp <= 35) return parseFloat(s35.toFixed(2));
            if (temp >= 55) return parseFloat(s55.toFixed(2));
            // Interpolación simple para 45ºC
            return parseFloat(((s35 + s55) / 2).toFixed(2));
        }
    }
    // CASO 2: Dato directo de Ficha Técnica (comportamiento actual)
    // Intentar buscar calido si corresponde
    let scop35 = isWarm ? (model.scop_cal_calido_35 || model.scop_cal_medio_35) : model.scop_cal_medio_35;
    let scop55 = isWarm ? (model.scop_cal_calido_55 || model.scop_cal_medio_55) : model.scop_cal_medio_55;

    // Fallbacks si no hay datos específicos
    if (!scop35) scop35 = model.scop35 || 4.5;
    if (!scop55) scop55 = model.scop55 || 3.2;

    if (temp <= 35) return parseFloat(scop35);
    if (temp >= 55) return parseFloat(scop55);
    
    // Interpolación para 45ºC (Baja temperatura / Fancoils)
    return parseFloat(((parseFloat(scop35) + parseFloat(scop55)) / 2).toFixed(2));
}

/**
 * Extrae el SCOP ACS adecuado del modelo
 */
export function getScopAcsFromModel(model, zone, method = 'ficha') {
    if (!model) return 3.0;

    const normalizedZone = zone?.toUpperCase() || 'D3';
    // Regla de negocio: Todo es clima CALIDO excepto E1 que es MEDIO
    const isWarm = normalizedZone !== 'E1';
    
    // CASO 1: EPREL
    if (method === 'eprel') {
        const etaAcs = isWarm ? (model.eta_acs_calida || model.eta_acs_media) : model.eta_acs_media;
        if (etaAcs) {
            // SCOP = 2.5 * ( (eta_acs / 100) + 0.03 )
            return parseFloat((((parseFloat(etaAcs) + 3) / 100) * 2.5).toFixed(2));
        }
    }

    // CASO 2: Ficha Técnica
    let scopAcs = isWarm ? (model.scop_dhw_calido || model.scop_dhw_medio) : model.scop_dhw_medio;

    return parseFloat(scopAcs || 3.0);
}

// ============================================================================
// CÁLCULO DE AMORTIZACIÓN
// ============================================================================
export function calculatePayback({
    presupuesto,
    totalAyuda,
    ahorroAnual
}) {
    const inversionNeta = Math.max(0, presupuesto - totalAyuda);
    const paybackYears = ahorroAnual > 0 ? inversionNeta / ahorroAnual : Infinity;

    return {
        inversionNeta,
        paybackYears
    };
}

