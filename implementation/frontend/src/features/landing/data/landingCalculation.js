/**
 * Ejecuta el motor real de la calculadora (calculation.js) con los inputs
 * mapeados desde el funnel, para que la cifra mostrada al cliente en la
 * pantalla final COINCIDA exactamente con la que verá el admin al abrir
 * la oportunidad en la calculadora interna.
 *
 * No duplicamos lógica de negocio — reutilizamos las mismas funciones que
 * usa CalculatorView. Si la calculadora cambia, el cálculo del cliente
 * cambia automáticamente.
 */

import {
    calculateDemand,
    calculateSavings,
    calculateFinancials,
    calculateAnnualSavingsTheoretical,
    calculateAnnualSavingsFromSpending,
    calculateRes080Estimated,
    calculatePayback,
    FACTORES_PASO
} from '../../calculator/logic/calculation';

/**
 * @param {object} inputs   calculatorInputs ya mapeados por funnelToCalculatorInputs
 * @returns {{
 *   caeBonus: number,           // Bono CAE final que recibe el cliente (€)
 *   savingsKwh: number,         // Ahorro energético anual (kWh)
 *   ahorroAnualEur: number,     // Ahorro económico anual (€)
 *   co2TonsAvoided: number,     // CO2 evitado (toneladas/año)
 *   payback: number|null,       // Años de retorno
 *   isReformaResult: boolean    // true si la cifra es del RES080 (reforma)
 * }}
 */
export function computeLandingResult(inputs) {
    if (!inputs) return null;

    // 1. Demanda (modo estimated — el funnel no aporta XML)
    const demandRes = calculateDemand(inputs);
    const Q_net = demandRes.Q_net;

    // 2. Ahorro energético
    const savingsRes = calculateSavings({
        q_net_heating: Q_net,
        dacs: 2731.4,
        boilerEff: inputs.boilerEff,
        scopHeating: inputs.scopHeating,
        scopAcs: inputs.scopAcs,
        changeAcs: inputs.changeAcs,
        cb: 1.0
    });

    // 3. Bono CAE base (aerotermia)
    const finRes = calculateFinancials({
        presupuesto: inputs.presupuesto,
        savingsKwh: savingsRes.savingsKwh,
        caePriceClient: inputs.caePriceClient || 95,
        caePriceSO: inputs.caePriceSO || 160,
        caePricePrescriptor: 0,
        prescriptorMode: 'brokergy',
        tipo: inputs.tipo,
        participation: inputs.participation,
        numOwners: inputs.numOwners || 1,
        titularType: inputs.titularType || 'particular',
        includeIrpf: inputs.includeIrpf !== false,
        aplicarIrpfCae: true
    });

    // 4. Si es reforma integral, recalcular con RES080
    let res080 = null;
    let finRes080 = null;
    let isReformaResult = false;
    if (inputs.isReforma && inputs.reformaType !== 'none') {
        res080 = calculateRes080Estimated(inputs);
        if (res080) {
            finRes080 = calculateFinancials({
                presupuesto: (inputs.presupuesto || 0) + (inputs.presupuestoEnvolvente || 0),
                savingsKwh: res080.ahorroEnergiaFinalTotal,
                caePriceClient: inputs.caePriceClient || 95,
                caePriceSO: inputs.caePriceSO || 160,
                caePricePrescriptor: 0,
                prescriptorMode: 'brokergy',
                tipo: inputs.tipo,
                participation: inputs.participation,
                numOwners: inputs.numOwners || 1,
                titularType: inputs.titularType || 'particular',
                includeIrpf: inputs.includeIrpf !== false,
                aplicarIrpfCae: true
            });
            isReformaResult = true;
        }
    }

    // 5. Ahorro económico anual (€/año)
    let annualRes;
    if (inputs.savingsMode === 'real' && inputs.gastoAnualReal > 0) {
        annualRes = calculateAnnualSavingsFromSpending({
            gastoAnual: inputs.gastoAnualReal,
            fuelType: inputs.fuelType,
            boilerEff: inputs.boilerEff,
            scopCalefaccion: inputs.scopHeating
        });
    } else {
        annualRes = calculateAnnualSavingsTheoretical({
            demandaCalefaccion: Q_net,
            demandaACS: 2731.4,
            boilerEff: inputs.boilerEff,
            scopCalefaccion: inputs.scopHeating,
            scopACS: inputs.scopAcs,
            fuelType: inputs.fuelType,
            changeACS: inputs.changeAcs,
            cb: 1.0
        });
    }

    // 6. CO2 evitado: savingsKwh * factor de paso (kgCO2/kWh) → toneladas
    const FUEL_TO_FACTOR_KEY = {
        gas_natural: 'Gas Natural',
        gasoleo: 'Gasoleo Calefacción',
        glp: 'GLP',
        electricidad: 'Electricidad peninsular',
        carbon: 'Carbón',
        pellets: 'Biomasa densificada (pelets)',
        lena: 'Biomasa no densificada'
    };
    const factorKey = FUEL_TO_FACTOR_KEY[inputs.fuelType] || 'Gas Natural';
    const factor = FACTORES_PASO[factorKey] || 0.252;
    const savings = isReformaResult ? res080.ahorroEnergiaFinalTotal : savingsRes.savingsKwh;
    const co2TonsAvoided = (savings * factor) / 1000;

    const financials = isReformaResult ? finRes080 : finRes;

    // Desglose financiero (nombres EXACTOS de calculateFinancials)
    const presupuesto = (inputs.presupuesto || 0) + (isReformaResult ? (inputs.presupuestoEnvolvente || 0) : 0);
    const caeBonus = Math.max(0, Math.round(financials.caeBonus || 0));
    const irpfCaeAmount = Math.max(0, Math.round(financials.irpfCaeAmount || 0));    // Impuestos por cobro CAE
    const irpfDeduction = Math.max(0, Math.round(financials.irpfDeduction || 0));    // Deducción IRPF rehab
    const gestionCAE = Math.max(0, Math.round(financials.caeMaintenanceCost || 250));

    // Bono CAE "neto cliente" — el que se muestra al cliente final en la
    // pantalla pública: SOLO se le descuenta el coste de gestión/tramitación
    // (~250€). Los impuestos por cobro CAE no se restan aquí — son un dato
    // técnico que solo ve el admin. El cliente ve "el bono que recibo, neto
    // de costes operativos".
    const caeBonusNetoCliente = Math.max(0, caeBonus - gestionCAE);

    const totalAyuda = Math.max(0, Math.round(financials.totalBeneficioFiscal || (caeBonus - irpfCaeAmount + irpfDeduction)));
    const inversionNeta = Math.max(0, Math.round(financials.costeFinal || (presupuesto + gestionCAE - totalAyuda)));
    const porcentajeCubierto = presupuesto > 0
        ? Math.min(100, Math.round((totalAyuda / presupuesto) * 100))
        : 0;

    // Versión "cliente": como el bono CAE ya está neto (descontados impuestos
    // y gestión), la ayuda total es solo bono_neto + deducción IRPF, y la
    // inversión neta es presupuesto − ayuda.
    const totalAyudaCliente = Math.max(0, caeBonusNetoCliente + irpfDeduction);
    const inversionNetaCliente = Math.max(0, presupuesto - totalAyudaCliente);
    const porcentajeCubiertoCliente = presupuesto > 0
        ? Math.min(100, Math.round((totalAyudaCliente / presupuesto) * 100))
        : 0;

    // Gastos comparativos (€/año actual vs aerotermia)
    const gastoActualEur = Math.max(0, Math.round(annualRes?.costeActual || (inputs.gastoAnualReal || 0)));
    const gastoNuevoEur = Math.max(0, Math.round(annualRes?.costeNuevo || 0));
    const ahorroAnualEur = Math.max(0, Math.round(annualRes?.ahorroAnual || 0));

    // Amortización (años) — solo si hay ahorro positivo
    const paybackYears = ahorroAnualEur > 0 && inversionNeta > 0
        ? Math.max(0, Number((inversionNeta / ahorroAnualEur).toFixed(1)))
        : 0;

    return {
        // Cifras principales
        caeBonus,                  // bruto (admin lo ve así)
        caeBonusNetoCliente,       // bruto − impuestos − gestión (lo que se muestra en landing)
        irpfDeduction,
        irpfCaeAmount,
        ahorroAnualEur,
        savingsKwh: Math.round(savings),

        // Desglose financiero (tabla tipo PDF)
        presupuesto: Math.round(presupuesto),
        gestionCAE,
        // Versión completa (admin)
        totalAyuda,
        inversionNeta,
        porcentajeCubierto,
        // Versión cliente (con gestión + impuestos ya descontados del bono)
        totalAyudaCliente,
        inversionNetaCliente,
        porcentajeCubiertoCliente,

        // Análisis de ahorro
        gastoActualEur,
        gastoNuevoEur,
        paybackYears,

        // Meta
        isReformaResult,
        fuelLabel: annualRes?.fuelLabel || 'tu sistema actual',
        co2TonsAvoided: Math.max(0, Number(co2TonsAvoided.toFixed(2))) // queda disponible, ya no se muestra
    };
}

/**
 * Computa el `result` completo que la calculadora interna guarda en
 * `datos_calculo.result`. Replica exactamente CalculatorView.handleCalculate
 * para que cuando admin abra la oportunidad LEAD, vea el mismo bono CAE,
 * ahorros, y el panel de oportunidades muestre datos pre-calculados (no 0).
 *
 * Forma de salida idéntica a setResult({...}) en CalculatorView.
 */
export function computeFullCalculatorResult(inputs) {
    if (!inputs) return null;

    // 1. Demanda (modo estimated por defecto en landing)
    const demandRes = calculateDemand(inputs);
    demandRes.fromXml = false;

    // 2. Hibridación: la landing no la ofrece, cb = 1.0
    const cb = 1.0;

    // 3. Ahorro energético
    const savingsRes = calculateSavings({
        q_net_heating: demandRes.Q_net,
        dacs: 2731.4,
        boilerEff: inputs.boilerEff,
        scopHeating: inputs.scopHeating,
        scopAcs: inputs.scopAcs,
        changeAcs: inputs.changeAcs,
        cb
    });

    // 4. Financieros base
    const financialRes = calculateFinancials({
        presupuesto: inputs.presupuesto,
        savingsKwh: savingsRes.savingsKwh,
        caePriceClient: inputs.caePriceClient || 95,
        caePriceSO: inputs.caePriceSO || 160,
        caePricePrescriptor: inputs.includeCommission ? (inputs.caePricePrescriptor || 0) : 0,
        prescriptorMode: inputs.prescriptorMode || 'brokergy',
        tipo: inputs.tipo,
        participation: inputs.participation,
        numOwners: inputs.numOwners || 1,
        discountCertificates: inputs.discountCertificates,
        includeLegalization: inputs.includeLegalization,
        installerNoCard: inputs.installerNoCard,
        legalizationPrice: inputs.legalizationPrice,
        itpPercent: inputs.itpPercent,
        includeIrpf: inputs.includeIrpf !== false,
        titularType: inputs.titularType || 'particular',
        aplicarIrpfCae: true
    });

    // 5. Ahorro económico anual
    let annualSavingsRes;
    if (inputs.savingsMode === 'real' && inputs.gastoAnualReal > 0) {
        annualSavingsRes = calculateAnnualSavingsFromSpending({
            gastoAnual: inputs.gastoAnualReal,
            fuelType: inputs.fuelType,
            boilerEff: inputs.boilerEff,
            scopCalefaccion: inputs.scopHeating
        });
    } else {
        annualSavingsRes = calculateAnnualSavingsTheoretical({
            demandaCalefaccion: demandRes.Q_net,
            demandaACS: 2731.4,
            boilerEff: inputs.boilerEff,
            scopCalefaccion: inputs.scopHeating,
            scopACS: inputs.scopAcs,
            fuelType: inputs.fuelType,
            changeACS: inputs.changeAcs,
            cb
        });
    }

    // 6. Payback
    const paybackRes = calculatePayback({
        presupuesto: inputs.presupuesto,
        totalAyuda: financialRes.totalAyuda,
        ahorroAnual: annualSavingsRes.ahorroAnual
    });

    // 7. RES080 si aplica
    let res080Data = null;
    let financialsRes080 = null;
    if (inputs.isReforma && inputs.reformaType !== 'none') {
        res080Data = calculateRes080Estimated(inputs);
        if (res080Data) {
            financialsRes080 = calculateFinancials({
                presupuesto: (inputs.presupuesto || 0) + (inputs.presupuestoEnvolvente || 0),
                savingsKwh: res080Data.ahorroEnergiaFinalTotal,
                caePriceClient: inputs.caePriceClient || 95,
                caePriceSO: inputs.caePriceSO || 160,
                caePricePrescriptor: inputs.includeCommission ? (inputs.caePricePrescriptor || 0) : 0,
                prescriptorMode: inputs.prescriptorMode || 'brokergy',
                tipo: inputs.tipo,
                participation: inputs.participation,
                numOwners: inputs.numOwners || 1,
                titularType: inputs.titularType || 'particular',
                includeIrpf: inputs.includeIrpf !== false,
                aplicarIrpfCae: true
            });
        }
    }

    return {
        ...demandRes,
        savings: savingsRes,
        financials: financialRes,
        annualSavings: annualSavingsRes,
        payback: paybackRes,
        res080: res080Data,
        financialsRes080,
        includeAnnualSavings: !!inputs.includeAnnualSavings,
        discountCertificates: !!inputs.discountCertificates,
        selectedModel: null,
        hybridization: null
    };
}
