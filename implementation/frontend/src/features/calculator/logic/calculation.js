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
// PRECIOS DE COMBUSTIBLES (2026) - €/kWh
// ============================================================================
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
export function getUByYear(year) {
    if (year >= 2020) {
        // CTE 2019 - nZEB
        return { wall: 0.27, roof: 0.22, floor: 0.30 };
    }
    if (year >= 2013) {
        // CTE 2013
        return { wall: 0.35, roof: 0.25, floor: 0.35 };
    }
    if (year >= 2008) {
        // CTE 2006 (en vigor desde 2008 aprox.)
        return { wall: 0.82, roof: 0.50, floor: 0.65 };
    }
    if (year >= 1979) {
        // NBE-CT-79 - Valores del XML real: U~1.69
        return { wall: 1.69, roof: 1.69, floor: 1.00 };
    }
    if (year >= 1960) {
        // Mejorado para edificios antiguos (muros de carga etc funcionan mejor que teórica)
        return { wall: 1.80, roof: 2.00, floor: 1.00 };
    }
    // Anterior a 1960 - Construcción tradicional
    return { wall: 2.00, roof: 2.20, floor: 1.10 };
}

export function getVentanaYACHByYear(year) {
    if (year >= 2020) {
        // CTE 2019 - nZEB
        return { ventanaU: 1.1, ach: 0.60 }; // Triple eficiente (U=1.1)
    }
    if (year >= 2013) {
        // CTE 2013
        return { ventanaU: 1.4, ach: 0.63 }; // Doble bajo emisivo (U=1.4)
    }
    if (year >= 2008) {
        // CTE 2006 (en vigor desde 2008 aprox.)
        return { ventanaU: 2.0, ach: 0.83 }; // Doble con RPT (U=2.0)
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

    let tf = { ...TYPE_DEFAULTS[tipo] };

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

    // Siempre se coge la mayor de las dos para el cálculo de la demanda
    const S = Math.max(S_util || 0, S_cal || 0);

    const Ubase = getUByYear(anio);
    const U_floor = Ubase.floor;

    const areas = estimateAreas({ ...inputs, superficie: S });

    const Awin = areas.A_fachada * (gla / 100);
    const Awall = Math.max(0, areas.A_fachada - Awin);

    const UAtrans =
        (Awall * U_wall) +
        (Awin * Uw) +
        (areas.A_cubierta * U_roof) +
        (areas.A_suelo * U_floor);

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
    changeAcs = false // ¿Se cambia también ACS?
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

    // 3. Ahorros
    const savingsKwh = totalFinalEnergyOld - totalFinalEnergyNew;
    const savingsPercent = (savingsKwh / totalFinalEnergyOld) * 100;

    return {
        finalEnergyOld: totalFinalEnergyOld,
        finalEnergyNew: totalFinalEnergyNew,
        savingsKwh,
        savingsPercent
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
    installerNoCard = false, // Si el instalador no tiene carnet (+100€)
    legalizationPrice = 200 // Precio base de la legalización
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

    // 2. Beneficio Brokergy (Ajustado)
    const rawSpread = priceSOBase - priceClientBase;
    const caePriceBrokergy = rawSpread - discountBrokergy;
    let profitBrokergy = savingsMwh * caePriceBrokergy;

    // Lógica de Descuento de Certificados
    let caeMaintenanceCost = 0;
    if (discountCertificates) {
        // Brokergy asume el coste -> Restamos del beneficio de Brokergy
        profitBrokergy = Math.max(-TOTAL_CERTIFICATE_COST, profitBrokergy - TOTAL_CERTIFICATE_COST);
        // El cliente recibe el bono íntegro (ya descontado el prescriptor si corresponde)
    } else {
        // El cliente asume el coste -> Reportamos como coste aparte en lugar de restar del bono
        caeMaintenanceCost = TOTAL_CERTIFICATE_COST;
    }
    
    // Lógica de Legalización
    let legalizationCost = 0;
    if (includeLegalization) {
        // El coste es el precio base + recargo si el instalador no tiene carnet
        legalizationCost = legalizationPrice + (installerNoCard ? 100 : 0);
    }

    // 3. Pago a Prescriptor
    const totalPrescriptor = savingsMwh * pricePrescriptor;

    // 4. Deducción IRPF (Multiprobetario)
    // REGLA: Si participación < 100% o tipo es 'piso', se aplica 40% (máx 3.000€)
    // De lo contrario, se aplica 60% (máx 9.000€) para unifamiliares/hilera
    let irpfRate = 0.60;
    let irpfCap = 9000;

    const participationNum = parseFloat(participation) || 100;
    if (tipo === 'piso' || participationNum < 100) {
        irpfRate = 0.40;
        irpfCap = 3000;
    }

    const budgetNum = parseFloat(presupuesto) || 0;
    const ownersCount = Math.max(1, parseInt(numOwners) || 1);

    // El presupuesto se divide entre los propietarios (usando el número parseado)
    const budgetPerOwner = budgetNum / ownersCount;

    // La deducción se calcula por propietario con su propio límite
    const irpfDeductionPerOwner = Math.min(irpfCap, budgetPerOwner * irpfRate);

    // Deducción total es la suma de todos
    const irpfDeductionTotal = irpfDeductionPerOwner * ownersCount;

    // 5. Totales
    const totalAyuda = caeBonus + irpfDeductionTotal;
    const porcentajeCubierto = Math.min(100, (totalAyuda / budgetNum) * 100);
    // El coste final ahora incluye el coste de tramitación y de legalización si el cliente los paga
    const costeFinal = Math.max(0, budgetNum + caeMaintenanceCost + legalizationCost - totalAyuda);

    return {
        presupuesto: budgetNum,
        caeBonus,
        irpfDeduction: irpfDeductionTotal, // Total para mostrar en resumen simple si fuera necesario
        irpfDeductionPerOwner,     // Para desglosar en tabla
        numOwners: ownersCount,    // Para iterar en tabla
        totalAyuda,
        porcentajeCubierto,
        costeFinal,
        caeMaintenanceCost,
        legalizationCost,
        irpfRate: irpfRate * 100,
        irpfCap,
        caePriceBrokergy,
        profitBrokergy,
        totalPrescriptor,
        prescriptorMode,
        finalPriceClient: priceClientDiscounted
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
    customPrices = null     // Precios personalizados
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
    const consumoCalefNuevo = demandaCalefaccion / scopCalefaccion;
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
    customPrices = null     // Precios personalizados
}) {
    const prices = customPrices || FUEL_PRICES;
    const fuelPrice = prices[fuelType]?.price || 0.09;
    const electricityPrice = prices.electricidad?.price || 0.22;

    // 1. Deducir consumo final a partir del gasto
    const consumoFinalActual = gastoAnual / fuelPrice;

    // 2. Estimar demanda útil (lo que realmente calienta)
    const demandaUtil = consumoFinalActual * boilerEff;

    // 3. Calcular consumo eléctrico equivalente con aerotermia
    const consumoElectrico = demandaUtil / scopCalefaccion;
    const costeNuevo = consumoElectrico * electricityPrice;

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

