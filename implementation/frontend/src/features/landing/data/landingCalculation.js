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
    calculateTerciario,
    calculateFinancials,
    calculateAnnualSavingsTheoretical,
    calculateAnnualSavingsFromSpending,
    calculateRes080Estimated,
    calculateRes080FromEmissions,
    calculatePayback,
    FACTORES_PASO,
    CAE_PRECIO_CLIENTE_NUEVAS,
    precioCaeRes080,
    precioCaeFm,
    calculateHybridization,
    normalizeHybridMethod,
    resolveClimateSeason,
    zoneClimateSeason,
    CLIMA_SCOP,
    scopsParaClima,
    redondeaScop,
} from '../../calculator/logic/calculation';
import { calculateRes060FC, contextoCalderaFc } from '../../calculator/logic/res060fc.js';
import { entradasFmClima } from '../../calculator/logic/climaFm.js';
import { esSectorTerciario } from '../../expedientes/logic/expedienteTaxonomia.js';
import { esBloque } from '../../calculator/logic/tipoInmueble.js';
import { resolveDacs, ACS_METHOD } from '../../expedientes/logic/demandaAcs.js';

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
        caePriceClient: inputs.caePriceClient || CAE_PRECIO_CLIENTE_NUEVAS,
        caePriceSO: inputs.caePriceSO || 160,
        caePricePrescriptor: 0,
        prescriptorMode: 'brokergy',
        tipo: inputs.tipo,
        participation: inputs.participation,
        numOwners: inputs.numOwners || 1,
        titularType: inputs.titularType || 'particular',
        includeIrpf: inputs.includeIrpf !== false,
        aplicarIrpfCae: inputs.aplicarIrpfCae !== false
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
                caePriceClient: inputs.caePriceClient || CAE_PRECIO_CLIENTE_NUEVAS,
                caePriceSO: inputs.caePriceSO || 160,
                caePricePrescriptor: 0,
                prescriptorMode: 'brokergy',
                tipo: inputs.tipo,
                participation: inputs.participation,
                numOwners: inputs.numOwners || 1,
                titularType: inputs.titularType || 'particular',
                includeIrpf: inputs.includeIrpf !== false,
                aplicarIrpfCae: inputs.aplicarIrpfCae !== false
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
    const irpfDeduction = Math.max(0, Math.round(financials.irpfDeduction || 0));    // Deducción IRPF rehab (total)
    const irpfDeductionPerOwner = Math.max(0, Math.round(financials.irpfDeductionPerOwner || 0));
    const numOwners = Math.max(1, Number(financials.numOwners) || 1);
    const irpfRate = Math.round(financials.irpfRate || 0);   // 60 o 40
    const irpfCap = Math.round(financials.irpfCap || 0);     // 9000 o 3000
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
        irpfDeductionPerOwner,
        numOwners,
        irpfRate,
        irpfCap,
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
export function computeFullCalculatorResult(inputs, { modelos = null } = {}) {
    if (!inputs) return null;

    // 1. Demanda: si viene de "Cálculo Real" (CEE aportado), usar la demanda y la superficie
    // REALES del CEE en vez de la estimada — mismo criterio que CalculatorView.handleCalculate(),
    // para que este resultado precalculado (guardado al crear la oportunidad) ya sea el correcto
    // desde el primer render y no solo tras un recálculo manual del admin.
    const manualDemandVal = parseFloat(inputs.manualDemand) || 0;
    let demandRes;
    if (inputs.demandMode === 'manual' && manualDemandVal > 0) {
        const supAplicada = (parseFloat(inputs.manualSuperficie) || 0) > 0
            ? parseFloat(inputs.manualSuperficie)
            : (parseFloat(inputs.superficieCalefactable) || parseFloat(inputs.superficie) || 0);
        demandRes = {
            Q_net: manualDemandVal * supAplicada,
            q_net: manualDemandVal,
            superficieAplicada: supAplicada,
            fromManual: true,
            fromXml: false,
        };
    } else {
        demandRes = calculateDemand(inputs);
        demandRes.fromXml = false;
    }

    // 2. Hibridación. La landing pública no la ofrece (`hibridacion: false` en
    // funnelToInputs) y sigue con C_b = 1. La activan el alta desde WhatsApp y el
    // recálculo por script (`alta_oportunidad.js`, plan `hibridacion` / orden
    // `recalcular`): mismo cálculo que `CalculatorView.handleCalculate` (1.5).
    const esHibrida = inputs.hibridacion === true || inputs.hibridacion === 'true';
    const potenciaBomba = parseFloat(inputs.potenciaBomba) || 12;
    const potenciaCaldera = parseFloat(inputs.potenciaCaldera) || 0;
    const metodoHib = normalizeHybridMethod(inputs.hibridacionMetodo);
    const temporada = resolveClimateSeason({}, inputs, inputs.zona);
    const hybridizationRes = esHibrida ? calculateHybridization({
        demandAnnual: demandRes.Q_net,
        heatPumpPower: potenciaBomba,
        method: metodoHib,
        boilerPower: potenciaCaldera,
        climateSeason: temporada,
    }) : null;
    const cb = hybridizationRes?.cb ?? 1.0;

    // 3. Ahorro energético (con otro C_b u otros SCOP para las comparativas).
    //
    // En el TERCIARIO (y la D_ACS de un BLOQUE), lo MISMO que CalculatorView
    // (handleCalculate, «D_ACS» y punto 2): la D_ACS sale del certificado con
    // `resolveDacs` (no el 2.731,4 de una vivienda de cuatro dormitorios) y el
    // ahorro con `calculateTerciario`, que respeta el alcance de cada servicio.
    // Sin esta rama, el alta, `recalcular` y la carga del XML guardaban un
    // terciario calculado como una vivienda (2026-11-10, 26RES060_OP389).
    const esTerciarioCalc = esSectorTerciario(inputs);
    const esBloqueCalc = esBloque(inputs);
    const ceeBaseCalc = inputs.xmlDemandDataFinal?.demandaCalefaccion
        ? inputs.xmlDemandDataFinal
        : (inputs.xmlDemandData || null);
    const superficieCee = parseFloat(ceeBaseCalc?.superficieHabitable)
        || parseFloat(inputs.manualSuperficie)
        || parseFloat(inputs.superficieCalefactable)
        || parseFloat(inputs.superficie) || 0;
    const dacsCalc = (esTerciarioCalc || esBloqueCalc)
        ? resolveDacs(
            {
                acs_method: (esBloqueCalc && inputs.acsMethod === ACS_METHOD.CTE) ? ACS_METHOD.XML : inputs.acsMethod,
                num_rooms: inputs.numRooms, dacs_manual: inputs.dacsManual,
                cee_inicial: inputs.xmlDemandData || null,
                cee_final: inputs.xmlDemandDataFinal || null,
            },
            { demandaACS: ceeBaseCalc?.demandaACS, superficieHabitable: superficieCee },
        ).value
        : 2731.4;
    const ahorroCon = (c, sc = {}) => esTerciarioCalc
        ? calculateTerciario({
            q_net_heating: demandRes.Q_net,
            dacs: dacsCalc,
            dcap: parseFloat(inputs.dcap) || 0,
            boilerEff: parseFloat(inputs.boilerEff) || 0.92,
            scopHeating: sc.scopHeating ?? (redondeaScop(inputs.scopHeating) || 3.2),
            scopAcs: sc.scopAcs ?? (redondeaScop(inputs.scopAcs) || 3.0),
            scopPool: parseFloat(inputs.scopPool) || 0,
            changeHeating: inputs.changeHeating !== false,
            changeAcs: inputs.changeAcs === true || inputs.changeAcs === 'true',
            changePool: inputs.piscinaActiva === true,
            cb: c,
        })
        : calculateSavings({
            q_net_heating: demandRes.Q_net,
            dacs: dacsCalc,
            boilerEff: inputs.boilerEff,
            scopHeating: sc.scopHeating ?? inputs.scopHeating,
            scopAcs: sc.scopAcs ?? inputs.scopAcs,
            changeAcs: inputs.changeAcs,
            cb: c
        });
    const savingsRes = ahorroCon(cb);

    // 4. Financieros base. La FOTOVOLTAICA de la obra (P. Fotovoltaica) suma a la
    // inversión y a la base de la deducción del IRPF, como en CalculatorView. El
    // funnel público no la pregunta (no llega `presupuestoFotovoltaica`: 0); la
    // usan el alta desde WhatsApp/email y las oportunidades que se recalculan.
    const financierosDe = (savingsKwh, caePriceClient = inputs.caePriceClient || CAE_PRECIO_CLIENTE_NUEVAS) => calculateFinancials({
        presupuesto: inputs.presupuesto,
        presupuestoFotovoltaica: inputs.presupuestoFotovoltaica,
        savingsKwh,
        caePriceClient,
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
        // En el TERCIARIO el titular es una empresa o un autónomo: ni deducción de
        // IRPF por obras en vivienda ni tributación del bono como ganancia
        // patrimonial. La calculadora lo FUERZA por el sector (CalculatorView, 3).
        includeIrpf: esTerciarioCalc ? false : inputs.includeIrpf !== false,
        titularType: esTerciarioCalc ? 'empresa' : (inputs.titularType || 'particular'),
        aplicarIrpfCae: esTerciarioCalc ? false : inputs.aplicarIrpfCae !== false
    });
    const financialRes = financierosDe(savingsRes.savingsKwh);

    // 4.b Con hibridación, lo que la calculadora guarda además (CalculatorView 3.1,
    // 3.1.b y 3.2): el bono RETIRANDO la caldera, las DOS hipótesis de cobertura
    // (demanda y potencia de la caldera, tecleada o de la PLACA) y, en zona cálida
    // y con el modelo del catálogo (`modelos`), el bono con el SCOP de cada clima.
    // Lo usan la propuesta y su mensaje aparte (logic/hibridacionPropuesta.js).
    const financialsSinCaldera = hybridizationRes ? financierosDe(ahorroCon(1).savingsKwh) : null;
    const hipotesisHibridacion = (() => {
        if (!hybridizationRes) return null;
        const pCaldera = potenciaCaldera || parseFloat(inputs.placa_caldera?.potencia_kw) || 0;
        const conMetodo = (method) => {
            const hyb = calculateHybridization({ demandAnnual: demandRes.Q_net, heatPumpPower: potenciaBomba,
                                                 method, boilerPower: pCaldera, climateSeason: temporada });
            const sav = ahorroCon(hyb.cb);
            return { cb: hyb.cb, coverage: hyb.coverage, savingsKwh: sav.savingsKwh,
                     caeBonus: financierosDe(sav.savingsKwh).caeBonus };
        };
        return {
            demanda: conMetodo('demanda'),
            caldera: pCaldera > 0 ? { ...conMetodo('caldera'), potenciaCaldera: pCaldera } : null,
        };
    })();
    const comparativaClima = (() => {
        if (!hybridizationRes || !Array.isArray(modelos) || zoneClimateSeason(inputs.zona) !== CLIMA_SCOP.CALIDO) return null;
        const modelo = modelos.find(m => String(m.id) === String(inputs.aerothermiaModel));
        if (!modelo) return null;
        const idAcs = inputs.changeAcs ? inputs.aerothermiaModelAcs : inputs.aerothermiaModel;
        const modeloAcs = modelos.find(m => String(m.id) === String(idAcs)) || null;
        const temp = inputs.emitterType === 'radiadores_convencionales' ? 55 : (inputs.emitterType === 'radiadores_baja_temp' ? 45 : 35);
        const out = {};
        for (const clima of [CLIMA_SCOP.CALIDO, CLIMA_SCOP.MEDIO]) {
            const s = scopsParaClima({ modelo, modeloAcs, zona: inputs.zona, temp,
                                       clima: clima === CLIMA_SCOP.MEDIO ? CLIMA_SCOP.MEDIO : null });
            const hyb = calculateHybridization({ demandAnnual: demandRes.Q_net, heatPumpPower: potenciaBomba,
                                                 method: metodoHib, boilerPower: potenciaCaldera, climateSeason: s.scopTemporada });
            const sav = ahorroCon(hyb.cb, { scopHeating: s.scopHeating, scopAcs: s.scopAcs ?? undefined });
            out[clima] = { scopHeating: s.scopHeating, scopAcs: s.scopAcs, cb: hyb.cb,
                           savingsKwh: sav.savingsKwh, caeBonus: financierosDe(sav.savingsKwh).caeBonus };
        }
        return out;
    })();

    // 4.c La vía del FACTOR MULTIPLICADOR (CalculatorView 3.5): RES060_FM, o la
    // RES09x_FM de la zona con hibridación. Con ella el resultado guardado es el
    // MISMO que el de la calculadora y `resumenViaFm` (logic/viaFm.js) lo resume.
    // Un fallo aquí no puede tumbar el alta de un lead: sin FM, como antes.
    let res060fcData = null;
    let financialsRes060FC = null;
    if (!(inputs.isReforma && inputs.reformaType !== 'none')) {
        try {
            const supFm = (parseFloat(inputs.manualSuperficie) || 0) > 0
                ? parseFloat(inputs.manualSuperficie)
                : (parseFloat(inputs.superficieCalefactable) || parseFloat(inputs.superficie) || 0);
            const scopRed = redondeaScop(inputs.scopHeating) || 3.2;
            const fmClima = entradasFmClima({
                src: { ...inputs, scopHeating: scopRed },
                zona: inputs.zona,
                scopHeating: scopRed,
                hibridacion: hybridizationRes
                    ? { coverage: hybridizationRes.coverage, refPower: hybridizationRes.refPower, cb: hybridizationRes.cb }
                    : null,
                hybridInputs: { method: metodoHib, heatPumpPower: potenciaBomba, boilerPower: potenciaCaldera },
                demandAnnual: demandRes.Q_net,
                scopCalido: comparativaClima?.[CLIMA_SCOP.CALIDO]?.scopHeating ?? null,
            });
            res060fcData = calculateRes060FC({
                provinciaCode: inputs.provincia || inputs.provinceCode,
                anio: inputs.anio,
                tipo: inputs.tipo,
                bloque: false,
                zona: inputs.zona,
                superficie: supFm,
                boilerEff: parseFloat(inputs.boilerEff) || 0.92,
                boilerId: inputs.boilerId,
                scopHeating: fmClima.scopHeating,
                scopAcs: redondeaScop(inputs.scopAcs) || 3.0,
                changeAcs: inputs.changeAcs === true || inputs.changeAcs === 'true',
                changeHeating: true,
                qCalefaccion: demandRes.Q_net,
                ceeInicial: inputs.xmlDemandData || null,
                ceeFinal: inputs.xmlDemandDataFinal || null,
                hibridacion: fmClima.hibridacion,
                contexto: { ...contextoCalderaFc(inputs), ceeFinal: inputs.xmlDemandDataFinal || null, climaFm: fmClima.clima },
            });
            if (res060fcData && res060fcData.cae > 0) {
                financialsRes060FC = financierosDe(res060fcData.cae, precioCaeFm(inputs) || CAE_PRECIO_CLIENTE_NUEVAS);
            }
        } catch (e) {
            res060fcData = null;
            financialsRes060FC = null;
        }
    }

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
            demandaACS: dacsCalc,
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
        presupuesto: (parseFloat(inputs.presupuesto) || 0) + (parseFloat(inputs.presupuestoFotovoltaica) || 0),
        totalAyuda: financialRes.totalAyuda,
        ahorroAnual: annualSavingsRes.ahorroAnual
    });

    // 7. RES080 si aplica
    let res080Data = null;
    let financialsRes080 = null;
    if (inputs.isReforma && inputs.reformaType !== 'none') {
        if (inputs.demandMode === 'manual') {
            // CEE aportado (por emisiones) — mismo motor que CalculatorView para reforma+manual.
            res080Data = calculateRes080FromEmissions({
                emiAcsIni: parseFloat(inputs.manualEmisionesAcsInicial) || 0,
                emiAcsFin: parseFloat(inputs.manualEmisionesAcsFinal) || 0,
                emiCalIni: parseFloat(inputs.manualEmisionesCalefaccionInicial) || 0,
                emiCalFin: parseFloat(inputs.manualEmisionesCalefaccionFinal) || 0,
                emiRefIni: parseFloat(inputs.manualEmisionesRefrigeracionInicial) || 0,
                emiRefFin: parseFloat(inputs.manualEmisionesRefrigeracionFinal) || 0,
                combAcsInicial: inputs.combustibleAcsInicial,
                combAcsFinal: inputs.combustibleAcsFinal,
                combCalefaccionInicial: inputs.combustibleCalefaccionInicial,
                combCalefaccionFinal: inputs.combustibleCalefaccionFinal,
                combRefrigeracionInicial: inputs.combustibleRefrigeracionInicial,
                combRefrigeracionFinal: inputs.combustibleRefrigeracionFinal,
                superficieInicial: parseFloat(inputs.manualSupInicial) || parseFloat(inputs.superficieCalefactable) || 0,
                superficieFinal: parseFloat(inputs.manualSupFinal) || parseFloat(inputs.manualSupInicial) || parseFloat(inputs.superficieCalefactable) || 0,
            });
        } else {
            res080Data = calculateRes080Estimated(inputs);
        }
        if (res080Data) {
            financialsRes080 = calculateFinancials({
                presupuesto: (inputs.presupuesto || 0) + (inputs.presupuestoEnvolvente || 0),
                presupuestoFotovoltaica: inputs.presupuestoFotovoltaica,
                savingsKwh: res080Data.ahorroEnergiaFinalTotal,
                caePriceClient: precioCaeRes080(inputs) || CAE_PRECIO_CLIENTE_NUEVAS,
                caePriceSO: inputs.caePriceSO || 160,
                caePricePrescriptor: inputs.includeCommission ? (inputs.caePricePrescriptor || 0) : 0,
                prescriptorMode: inputs.prescriptorMode || 'brokergy',
                tipo: inputs.tipo,
                participation: inputs.participation,
                numOwners: inputs.numOwners || 1,
                titularType: inputs.titularType || 'particular',
                includeIrpf: inputs.includeIrpf !== false,
                aplicarIrpfCae: inputs.aplicarIrpfCae !== false
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
        financialsSinCaldera,
        hipotesisHibridacion,
        comparativaClima,
        res060fc: res060fcData,
        financialsRes060FC,
        includeAnnualSavings: !!inputs.includeAnnualSavings,
        discountCertificates: !!inputs.discountCertificates,
        selectedModel: null,
        hybridization: hybridizationRes
    };
}
